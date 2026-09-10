import { Router } from 'express';
import type { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../utils/prisma.js';
import { companyLimitReason } from '../services/entitlements.js';
import { suggestSlug } from '../services/slug.js';
import { PermissionAction, RoleType } from '../constants/enums.js';
import { ensureLedgerSetup } from '../services/ledger.js';
import { ensurePermissionCatalog } from './permissions.js';
import { clearRefreshCookie, refreshTokenFrom, setRefreshCookie } from '../utils/refreshCookie.js';
import { loginLimiter, resetLimiter, signupLimiter } from '../middleware/rateLimit.js';
import {
  AuthError,
  clearFailedLogins,
  clientIp,
  consumePasswordResetToken,
  createSession,
  issuePasswordResetToken,
  listSessions,
  lockoutRemainingMs,
  recordAuthEvent,
  registerFailedLogin,
  revokeAllSessions,
  revokeSession,
  rotateSession,
  signAccessToken,
  issueEmailVerificationToken,
  consumeEmailVerificationToken,
} from '../services/auth.js';
import { sendTemplate } from '../services/mailer.js';
import { policyForUser, validatePassword, getAuthPolicy } from '../services/policy.js';
import { expandPreset, permKey } from '../constants/permissionCatalog.js';
import { validateGstinOrThrow, deriveStateCodeFromInput } from '../utils/gstin.js';

export const authRouter = Router();

const LOCKOUT_NOTICE = Number(process.env.LOCKOUT_MINUTES || 15);

function getJwtSecret() {
  return process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? '' : 'dev-secret');
}

function signToken(payload: { userId: string; accountId: string }) {
  const secret = getJwtSecret();
  if (!secret) throw new Error('Server misconfigured: JWT_SECRET missing');
  return jwt.sign(payload, secret, {
    // jsonwebtoken types require a strict ms-string type; env is a plain string.
    expiresIn: (process.env.JWT_EXPIRES_IN || '8h') as any,
    issuer: process.env.JWT_ISSUER || 'accounting',
    audience: process.env.JWT_AUDIENCE || 'accounting-web',
  });
}

function requireAuth(req: any) {
  const hdr = String(req.headers?.authorization || '').trim();
  const token = hdr.startsWith('Bearer ') ? hdr.slice('Bearer '.length).trim() : '';
  if (!token) throw new Error('Unauthorized');

  const secret = getJwtSecret();
  if (!secret) throw new Error('Server misconfigured: JWT_SECRET missing');

  const decoded: any = jwt.verify(token, secret, {
    issuer: process.env.JWT_ISSUER || 'accounting',
    audience: process.env.JWT_AUDIENCE || 'accounting-web',
  });
  if (!decoded?.userId || !decoded?.accountId) throw new Error('Unauthorized');
  return { userId: String(decoded.userId), accountId: String(decoded.accountId) };
}

async function bootstrapOwnerRole(accountId: string, orgId: string, userId: string) {
  // Seed every catalog permission once, then grant the whole Administrator
  // preset to the org creator's Owner role.
  await ensurePermissionCatalog();

  const roleName = 'Owner';
  const role =
    (await prisma.role.findFirst({
      where: { accountId, orgId, branchId: null, name: roleName },
      select: { id: true },
    })) ||
    (await prisma.role.create({
      data: {
        accountId,
        orgId,
        branchId: null,
        name: roleName,
        description: 'Full access. Created automatically for the account owner.',
        roleType: RoleType.ADMIN,
        createdByUserId: userId,
      },
      select: { id: true },
    }));

  const wanted = new Set(expandPreset('ADMIN').map((r) => permKey(r.module, r.subModule, r.action)));
  const permissions = await prisma.permission.findMany({
    select: { id: true, module: true, subModule: true, action: true },
  });

  for (const p of permissions) {
    if (!wanted.has(permKey(p.module, p.subModule, p.action))) continue;
    try {
      await prisma.rolePermission.create({
        data: { accountId, orgId, roleId: role.id, permissionId: p.id, allowed: true },
        select: { id: true },
      });
    } catch (err: any) {
      if (String(err?.code || '') !== 'P2002') throw err;
    }
  }

  try {
    await prisma.userRoleAssignment.create({
      data: { accountId, orgId, branchId: null, userId, roleId: role.id, createdByUserId: userId },
      select: { id: true },
    });
  } catch (err: any) {
    if (String(err?.code || '') !== 'P2002') throw err;
  }
}

authRouter.post('/login', loginLimiter, async (req: Request, res: Response) => {
  const parsed = z
    .union([
      z.object({ emailOrUsername: z.string().min(1), password: z.string().min(1) }),
      z.object({ email: z.string().min(1), password: z.string().min(1) }),
    ])
    .safeParse(req.body);

  if (!parsed.success) return res.status(400).json({ error: 'Invalid login payload' });

  const body = parsed.data;
  const rawIdentity = 'emailOrUsername' in body ? body.emailOrUsername : body.email;
  const identity = rawIdentity.trim().toLowerCase();
  const ip = clientIp(req);
  const userAgent = req.headers['user-agent'] as string | undefined;

  const user = await prisma.user.findFirst({
    where: { OR: [{ email: identity }, { username: rawIdentity.trim() }] },
    select: {
      id: true,
      accountId: true,
      passwordHash: true,
      isActive: true,
      fullName: true,
      email: true,
      lockedUntil: true,
    },
  });

  // One message for "no such user" and "wrong password": distinguishing them
  // turns the login form into an account-existence oracle.
  const invalid = () => res.status(401).json({ error: 'Invalid credentials' });

  if (!user || !user.isActive) {
    await recordAuthEvent({ email: identity, eventType: 'LOGIN_FAILED', ip, userAgent, detail: 'No such active user' });
    return invalid();
  }

  const lockedFor = lockoutRemainingMs(user.lockedUntil);
  if (lockedFor > 0) {
    await recordAuthEvent({ accountId: user.accountId, userId: user.id, email: identity, eventType: 'LOCKED_OUT', ip, userAgent });
    return res.status(429).json({
      error: `Too many failed attempts. Try again in ${Math.ceil(lockedFor / 60000)} minute(s).`,
    });
  }

  const policy = await policyForUser(user.accountId, user.id);

  const ok = await bcrypt.compare(body.password, user.passwordHash);
  if (!ok) {
    const result = await registerFailedLogin(user.id, policy.maxFailedLogins, policy.lockoutMinutes);
    await recordAuthEvent({
      accountId: user.accountId,
      userId: user.id,
      email: identity,
      eventType: result.locked ? 'LOCKED_OUT' : 'LOGIN_FAILED',
      ip,
      userAgent,
    });
    if (result.locked) {
      return res.status(429).json({ error: `Too many failed attempts. Try again in ${policy.lockoutMinutes} minute(s).` });
    }
    return invalid();
  }

  await clearFailedLogins(user.id);
  const { session, refreshToken } = await createSession({
    accountId: user.accountId,
    userId: user.id,
    ip,
    userAgent,
  });
  await recordAuthEvent({ accountId: user.accountId, userId: user.id, email: identity, eventType: 'LOGIN_SUCCESS', ip, userAgent });

  const token = signAccessToken({ userId: user.id, accountId: user.accountId, sid: session.id });

  /*
   * Every company this person can open, not only the ones their own account
   * owns.
   *
   * A membership row carries the accountId of the company it grants — which is
   * the INVITING account when somebody is invited into a company they do not
   * own. Filtering by the signed-in user's own accountId therefore hid exactly
   * the case the product is sold on: a CA firm inviting an accountant who
   * already has a login of their own. The membership existed, the middleware
   * would have authorised it, and the company simply never appeared in their
   * switcher.
   *
   * A membership is already unique per (account, org, user), so org + user
   * identifies it without the account. The owning account goes out with each
   * company because the client needs to know which account a company belongs
   * to once they are not all the same.
   */
  const memberships = await prisma.userOrgMembership.findMany({
    where: { userId: user.id },
    select: { orgId: true, accountId: true, org: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'asc' },
  });

  const companies = memberships.map((m) => ({
    orgId: m.orgId,
    id: m.org?.id ?? m.orgId,
    name: m.org?.name ?? '',
    accountId: m.accountId,
  }));

  const firstOrgId = companies[0]?.orgId ?? null;
  // The account that owns the company being opened, which is not necessarily
  // the account that owns the person.
  const firstAccountId = companies[0]?.accountId ?? user.accountId;

  const branches = firstOrgId
    ? await prisma.userBranchMembership.findMany({
        where: { accountId: firstAccountId, orgId: firstOrgId, userId: user.id },
        select: { branchId: true },
        orderBy: { createdAt: 'asc' },
      })
    : [];

  /*
   * The refresh token goes in an HttpOnly cookie and NOT in this response.
   *
   * Returning it as well would leave it readable by any script on the page,
   * which is the thing the cookie exists to prevent — the browser can hold a
   * credential the page itself cannot see, and that is the whole point.
   */
  setRefreshCookie(res, refreshToken);

  return res.json({
    token,
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
    user: { id: user.id, email: user.email, fullName: user.fullName, accountId: user.accountId },
    companies,
    activeOrgId: firstOrgId,
    activeBranchId: branches[0]?.branchId ?? null,
  });
});

/** Exchange a refresh token for a new pair. The old one is retired. */
authRouter.post('/refresh', async (req: Request, res: Response) => {
  const presented = refreshTokenFrom(req);
  if (presented.length < 10) return res.status(400).json({ error: 'Missing refresh token' });

  try {
    const rotated = await rotateSession(presented, {
      ip: clientIp(req),
      userAgent: req.headers['user-agent'] as string | undefined,
    });
    await recordAuthEvent({
      accountId: rotated.session.accountId,
      userId: rotated.session.userId,
      eventType: 'TOKEN_REFRESHED',
      ip: clientIp(req),
    });
    // The rotated token replaces the cookie and, again, is not in the body.
    setRefreshCookie(res, rotated.refreshToken);
    return res.json({ token: rotated.accessToken });
  } catch (e: any) {
    /*
     * A refused refresh means this browser's session is over, so the cookie
     * should go with it — otherwise a stale or replayed token sits there being
     * re-sent on every attempt.
     */
    clearRefreshCookie(res);
    if (e instanceof AuthError) return res.status(e.status).json({ error: e.message });
    throw e;
  }
});

/** Real logout: the session is revoked server-side, not just forgotten locally. */
authRouter.post('/logout', async (req: Request, res: Response) => {
  const refreshToken = refreshTokenFrom(req) || undefined;
  // Cleared whatever happens next: a logout that leaves the credential in the
  // browser is not a logout.
  clearRefreshCookie(res);

  if (refreshToken) {
    const revoked = await revokeSession(refreshToken, 'LOGOUT');
    if (revoked) {
      await recordAuthEvent({
        accountId: revoked.accountId,
        userId: revoked.userId,
        eventType: 'LOGOUT',
        ip: clientIp(req),
      });
    }
  }
  return res.json({ ok: true });
});

/** Devices currently signed in, and a way to end them. */
authRouter.get('/sessions', async (req: Request, res: Response) => {
  let auth;
  try {
    auth = requireAuth(req);
  } catch (e: any) {
    return res.status(401).json({ error: String(e?.message || 'Unauthorized') });
  }
  const sessions = await listSessions(auth.accountId, auth.userId);
  return res.json({ sessions });
});

authRouter.post('/sessions/revoke-all', async (req: Request, res: Response) => {
  let auth;
  try {
    auth = requireAuth(req);
  } catch (e: any) {
    return res.status(401).json({ error: String(e?.message || 'Unauthorized') });
  }
  const result = await revokeAllSessions(auth.userId, 'USER_REVOKED_ALL');
  await recordAuthEvent({ accountId: auth.accountId, userId: auth.userId, eventType: 'SESSION_REVOKED', detail: 'User revoked all sessions' });
  return res.json({ ok: true, revoked: result.count });
});

authRouter.get('/me', async (req: Request, res: Response) => {
  let auth;
  try {
    auth = requireAuth(req);
  } catch (e: any) {
    return res.status(401).json({ error: String(e?.message || 'Unauthorized') });
  }

  const activeOrgId = String(req.headers['x-org-id'] || '').trim();

  const user = await prisma.user.findFirst({
    where: { id: auth.userId, accountId: auth.accountId, isActive: true },
    select: {
      id: true,
      email: true,
      username: true,
      fullName: true,
      firstName: true,
      lastName: true,
      phone: true,
      avatarUrl: true,
      accountId: true,
      emailVerifiedAt: true,
      lastLoginAt: true,
    },
  });
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  /* Same rule as login: every company this person can open. */
  const orgMemberships = await prisma.userOrgMembership.findMany({
    where: { userId: auth.userId },
    select: {
      orgId: true,
      accountId: true,
      org: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  let isOrgAdmin = false;
  let allowedBranchIds: string[] = [];

  /*
   * The account is taken from the membership for the company being opened, not
   * from the token.
   *
   * The token says which account owns the PERSON. Roles and branches belong to
   * the account that owns the COMPANY, and for an invited user those differ —
   * so reading them from the token returned no roles and no branches, which
   * reads as a user with no permissions rather than as a lookup against the
   * wrong account. This is the same correction already made in the tenant
   * middleware.
   */
  const activeMembership = activeOrgId
    ? orgMemberships.find((m) => m.orgId === activeOrgId) || null
    : null;
  const activeAccountId = activeMembership?.accountId || auth.accountId;

  if (activeOrgId) {
    const assignments = await prisma.userRoleAssignment.findMany({
      where: { accountId: activeAccountId, orgId: activeOrgId, userId: auth.userId },
      select: { role: { select: { roleType: true, name: true } } },
    });
    isOrgAdmin = assignments.some((a) => String(a?.role?.roleType || '') === RoleType.ADMIN);

    if (isOrgAdmin) {
      const branches = await prisma.branch.findMany({
        where: { accountId: activeAccountId, orgId: activeOrgId },
        select: { id: true },
        orderBy: { branchName: 'asc' },
      });
      allowedBranchIds = branches.map((b) => b.id);
    } else {
      const memberships = await prisma.userBranchMembership.findMany({
        where: { accountId: activeAccountId, orgId: activeOrgId, userId: auth.userId },
        select: { branchId: true },
        orderBy: { createdAt: 'asc' },
      });
      allowedBranchIds = memberships.map((m) => m.branchId);
    }
  }

  return res.json({
    user,
    orgs: orgMemberships.map((m) => ({ orgId: m.orgId, org: m.org, accountId: m.accountId })),
    activeOrgId: activeOrgId || null,
    isOrgAdmin,
    allowedBranchIds,
  });
});

authRouter.post('/signup', signupLimiter, async (req: Request, res: Response) => {
  const body = z
    .object({
      email: z.string().email(),
      password: z.string().min(8),
      name: z.string().min(1),
      mobile: z.string().optional(),
    })
    .parse(req.body);

  const email = body.email.trim().toLowerCase();
  const existing = await prisma.user.findFirst({ where: { email }, select: { id: true } });
  if (existing) return res.status(409).json({ error: 'User already exists. Please login.' });

  const rounds = Number(process.env.BCRYPT_ROUNDS || 12);
  const passwordHash = await bcrypt.hash(body.password, rounds);

  const account = await prisma.account.create({
    data: { name: body.name.trim() || email },
    select: { id: true, name: true },
  });

  const user = await prisma.user.create({
    data: {
      accountId: account.id,
      email,
      username: null,
      fullName: body.name.trim(),
      passwordHash,
      isActive: true,
    },
    select: { id: true, accountId: true, email: true, fullName: true },
  });

  const { session, refreshToken } = await createSession({
    accountId: user.accountId,
    userId: user.id,
    ip: clientIp(req),
    userAgent: req.headers['user-agent'] as string | undefined,
  });
  await recordAuthEvent({ accountId: user.accountId, userId: user.id, email, eventType: 'LOGIN_SUCCESS', ip: clientIp(req), detail: 'Signup' });

  const token = signAccessToken({ userId: user.id, accountId: user.accountId, sid: session.id });

  // Verification is sent but does not block sign-in: a new user should be able
  // to look around while the message is in flight.
  const verifyToken = await issueEmailVerificationToken({ id: user.id, accountId: user.accountId, email: user.email });
  await sendTemplate({
    templateKey: 'auth.verify_email',
    to: user.email,
    toName: user.fullName,
    accountId: user.accountId,
    data: {
      userName: user.fullName,
      email: user.email,
      verifyUrl: `${process.env.APP_URL || 'http://localhost:5173'}/verify-email?token=${verifyToken}`,
    },
    relatedType: 'User',
    relatedId: user.id,
    transactional: true,
  });

  setRefreshCookie(res, refreshToken);

  return res.json({
    token,
    user,
    emailVerificationSent: true,
    ...(process.env.NODE_ENV === 'production' ? {} : { devVerifyToken: verifyToken }),
  });
});

authRouter.post('/setup-company', async (req: Request, res: Response) => {
  let auth;
  try {
    auth = requireAuth(req);
  } catch (e: any) {
    return res.status(401).json({ error: String(e?.message || 'Unauthorized') });
  }

  const body = z
    .object({
      companyName: z.string().min(1),
      /*
       * The state of the head office, and the single most consequential thing
       * asked at signup. It decides whether every invoice this business ever
       * raises splits into CGST + SGST or lands as IGST, and it used to be
       * hard-coded to Karnataka for every tenant on earth — so a business in
       * Maharashtra billing a customer in Maharashtra was charged IGST, and
       * nothing on the screen said why.
       */
      state: z.string().min(1),
      gstin: z.string().trim().toUpperCase().optional().nullable(),
      /*
       * The rest of the company master. Optional so an older client that sends
       * only a name and a state still works, and unvalidated beyond its shape
       * because nothing branches on it — it is read back onto one screen.
       */
      profile: z.record(z.any()).optional(),
    })
    .parse(req.body);

  const stateName = String(body.state || '').trim();
  if (!deriveStateCodeFromInput(stateName)) {
    return res.status(400).json({ error: `Unknown state: ${stateName}` });
  }

  const gstin = String(body.gstin || '').trim().toUpperCase();
  // Throws a 400 on a bad format, a bad checksum, or a GSTIN whose own state
  // code disagrees with the state that was chosen.
  validateGstinOrThrow(gstin, stateName);

  const now = new Date();

  // Create org + head-office branch, assign memberships
  /*
   * The plan's company allowance, checked before anything is created.
   *
   * An account with no entitlement row is on the default plan, which is
   * unlimited — so this refuses nobody until a plan is deliberately assigned.
   */
  const overLimit = await companyLimitReason(auth.accountId);
  if (overLimit) {
    return res.status(403).json({ error: overLimit, code: 'COMPANY_LIMIT' });
  }

  /*
   * The public handle, derived from the name and free at the moment of
   * creation. Offered for editing later rather than fixed here: `agc-traders-2`
   * is a URL somebody has to live with, and only they can say whether it is the
   * one they want.
   */
  const slug = await suggestSlug(body.companyName);

  const org = await prisma.org.create({
    data: {
      accountId: auth.accountId,
      name: body.companyName.trim(),
      legalName: body.companyName.trim(),
      slug,
      createdByUserId: auth.userId,
    },
    select: { id: true, name: true, slug: true },
  });

  const branch = await prisma.branch.create({
    data: {
      accountId: auth.accountId,
      orgId: org.id,
      branchCode: 'HO',
      branchName: 'Head Office',
      addressLine1: '',
      city: '',
      state: stateName,
      country: 'India',
      // A business that gives a GSTIN is registered by definition; one that
      // does not is composition-or-unregistered and can say so later.
      gstRegistrationType: gstin ? 'REGULAR' : 'UNREGISTERED',
      gstin: gstin || null,
      parentBranchId: null,
      shareHeadOfficeSettings: false,
      createdByUserId: auth.userId,
      createdAt: now,
    },
    select: { id: true },
  });

  await prisma.userOrgMembership.create({
    data: { accountId: auth.accountId, orgId: org.id, userId: auth.userId },
  });

  await prisma.userBranchMembership.create({
    data: { accountId: auth.accountId, orgId: org.id, branchId: branch.id, userId: auth.userId },
  });

  /*
   * Every org gets a warehouse, for the same reason it gets a branch.
   *
   * Warehouse is a required field on an invoice, a bill and a stock transfer.
   * A tenant created with a branch and no warehouse could not raise its first
   * invoice at all: the form demanded a warehouse and the dropdown held only
   * "Select Warehouse". The first thing a new customer tried to do was the one
   * thing they could not.
   *
   * Named "Main Store" rather than after the branch, because a business with
   * one location still calls it the store, not the head office.
   */
  const mainWarehouse = await prisma.warehouse.create({
    data: {
      accountId: auth.accountId,
      orgId: org.id,
      branchId: branch.id,
      name: 'Main Store',
      createdByUserId: auth.userId,
    },
  });

  await prisma.userWarehouseAccess.create({
    data: {
      accountId: auth.accountId,
      orgId: org.id,
      branchId: branch.id,
      warehouseId: mainWarehouse.id,
      userId: auth.userId,
    },
  });

  // Ensure the creator can manage setup screens immediately.
  await bootstrapOwnerRole(auth.accountId, org.id, auth.userId);

  // Every org gets a chart of accounts and journals up front, so the first
  // invoice has somewhere to post.
  await ensureLedgerSetup(auth.accountId, org.id, auth.userId);

  // Frontend expects { company: { id, name, orgId }, branch: { id } }
  return res.json({
    company: { id: org.id, name: org.name, orgId: org.id, slug: org.slug },
    branch: { id: branch.id },
  });
});

authRouter.post('/forgot-password', resetLimiter, async (req: Request, res: Response) => {
  const body = z.object({ email: z.string().email() }).parse(req.body);
  const email = body.email.trim().toLowerCase();
  const ip = clientIp(req);

  const user = await prisma.user.findFirst({
    where: { email },
    select: { id: true, accountId: true, isActive: true },
  });

  // Always the same answer, so this endpoint cannot be used to discover which
  // addresses have accounts.
  const generic = { message: 'If an account exists, a reset link has been sent to your email.' };

  if (!user || !user.isActive) {
    await recordAuthEvent({ email, eventType: 'PASSWORD_RESET_REQUESTED', ip, detail: 'No such active user' });
    return res.json(generic);
  }

  const token = await issuePasswordResetToken({ id: user.id, accountId: user.accountId }, ip);
  await recordAuthEvent({ accountId: user.accountId, userId: user.id, email, eventType: 'PASSWORD_RESET_REQUESTED', ip });

  await sendTemplate({
    templateKey: 'auth.password_reset',
    to: email,
    accountId: user.accountId,
    data: {
      userName: email,
      resetUrl: `${process.env.APP_URL || 'http://localhost:5173'}/?token=${token}`,
    },
    relatedType: 'User',
    relatedId: user.id,
    transactional: true,
  });

  // Until SMTP is wired the token is returned outside production so the flow is
  // testable. It is a cryptographically random, single-use, 30-minute token
  // stored only as a hash.
  return res.json({
    ...generic,
    devToken: process.env.NODE_ENV === 'production' ? undefined : token,
  });
});

authRouter.post('/reset-password', resetLimiter, async (req: Request, res: Response) => {
  const body = z.object({ token: z.string().min(10), password: z.string().min(8) }).parse(req.body);

  let record;
  try {
    record = await consumePasswordResetToken(body.token);
  } catch (e: any) {
    if (e instanceof AuthError) return res.status(e.status).json({ error: e.message });
    throw e;
  }

  const rounds = Number(process.env.BCRYPT_ROUNDS || 12);
  const passwordHash = await bcrypt.hash(body.password, rounds);

  await prisma.user.update({
    where: { id: record.userId },
    data: { passwordHash, failedLoginCount: 0, lockedUntil: null },
  });

  // Changing the password ends every existing session: if the reset was because
  // the account was compromised, leaving the attacker signed in defeats it.
  await revokeAllSessions(record.userId, 'PASSWORD_RESET');
  await recordAuthEvent({
    accountId: record.accountId,
    userId: record.userId,
    eventType: 'PASSWORD_RESET',
    ip: clientIp(req),
    detail: 'All sessions revoked',
  });

  return res.json({ message: 'Password reset successfully. Please sign in again.' });
});

/** Confirms an address from the emailed link. */
authRouter.post('/verify-email', async (req: Request, res: Response) => {
  const body = z.object({ token: z.string().min(10) }).parse(req.body);
  try {
    const row = await consumeEmailVerificationToken(body.token);
    await recordAuthEvent({
      accountId: row.accountId,
      userId: row.userId,
      email: row.email,
      eventType: 'EMAIL_VERIFIED',
      ip: clientIp(req),
    });
    return res.json({ ok: true, email: row.email });
  } catch (e: any) {
    if (e instanceof AuthError) return res.status(e.status).json({ error: e.message });
    throw e;
  }
});

/** Sends a fresh link. Rate limited, and silent about whether it applied. */
authRouter.post('/resend-verification', resetLimiter, async (req: Request, res: Response) => {
  let auth;
  try {
    auth = requireAuth(req);
  } catch (e: any) {
    return res.status(401).json({ error: String(e?.message || 'Unauthorized') });
  }

  const user = await prisma.user.findFirst({
    where: { id: auth.userId, accountId: auth.accountId },
    select: { id: true, accountId: true, email: true, fullName: true, emailVerifiedAt: true },
  });
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  if (user.emailVerifiedAt) return res.json({ ok: true, alreadyVerified: true });

  const token = await issueEmailVerificationToken(user);
  await sendTemplate({
    templateKey: 'auth.verify_email',
    to: user.email,
    toName: user.fullName,
    accountId: user.accountId,
    data: {
      userName: user.fullName,
      email: user.email,
      verifyUrl: `${process.env.APP_URL || 'http://localhost:5173'}/verify-email?token=${token}`,
    },
    relatedType: 'User',
    relatedId: user.id,
    transactional: true,
  });

  return res.json({
    ok: true,
    ...(process.env.NODE_ENV === 'production' ? {} : { devVerifyToken: token }),
  });
});

/** Update your own name. Email changes go through verification separately. */
authRouter.patch('/me', async (req: Request, res: Response) => {
  let auth;
  try {
    auth = requireAuth(req);
  } catch (e: any) {
    return res.status(401).json({ error: String(e?.message || 'Unauthorized') });
  }

  /**
   * Everything here is optional, so a caller that only sends one field does not
   * blank the others. `fullName` stays the display source: when first or last
   * name is sent it is recomposed from them, because two writers for one
   * displayed string is how they end up disagreeing.
   *
   * The avatar is a data URL the client has already resized. The cap is on the
   * encoded string rather than the decoded image: it is the thing actually
   * being stored, and a row is cheap to read only while it stays small.
   */
  const AVATAR_MAX = 96 * 1024;

  const body = z
    .object({
      fullName: z.string().min(1).max(120).optional(),
      firstName: z.string().max(60).optional(),
      lastName: z.string().max(60).optional(),
      username: z.string().min(3).max(40).regex(/^[a-zA-Z0-9._-]+$/).optional().or(z.literal('')),
      phone: z.string().max(20).optional().or(z.literal('')),
      avatarUrl: z
        .string()
        .max(AVATAR_MAX, 'That image is too large. Pick one under about 70 KB.')
        .refine((v) => v === '' || /^data:image\/(png|jpeg|webp);base64,/.test(v), 'Unsupported image format.')
        .optional(),
    })
    .parse(req.body);

  const data: Record<string, string | null> = {};

  if (body.firstName !== undefined) data.firstName = body.firstName.trim() || null;
  if (body.lastName !== undefined) data.lastName = body.lastName.trim() || null;
  if (body.phone !== undefined) data.phone = body.phone.trim() || null;
  if (body.avatarUrl !== undefined) data.avatarUrl = body.avatarUrl || null;

  if (body.username !== undefined) {
    const next = body.username.trim();
    if (next) {
      // Usernames are a login credential, so a collision has to be refused
      // rather than left for the unique index to turn into a 500.
      const taken = await prisma.user.findFirst({
        where: { username: next, NOT: { id: auth.userId } },
        select: { id: true },
      });
      if (taken) return res.status(409).json({ error: 'That username is already taken.' });
      data.username = next;
    } else {
      data.username = null;
    }
  }

  const composed = [
    body.firstName !== undefined ? body.firstName.trim() : undefined,
    body.lastName !== undefined ? body.lastName.trim() : undefined,
  ];
  if (composed.some((v) => v !== undefined)) {
    const existing = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: { firstName: true, lastName: true, fullName: true },
    });
    const first = composed[0] !== undefined ? composed[0] : existing?.firstName || '';
    const last = composed[1] !== undefined ? composed[1] : existing?.lastName || '';
    const joined = [first, last].filter(Boolean).join(' ').trim();
    if (joined) data.fullName = joined;
  }
  if (body.fullName !== undefined) data.fullName = body.fullName.trim();

  if (!Object.keys(data).length) return res.status(400).json({ error: 'Nothing to update.' });

  const user = await prisma.user.update({
    where: { id: auth.userId },
    data,
    select: {
      id: true,
      email: true,
      username: true,
      fullName: true,
      firstName: true,
      lastName: true,
      phone: true,
      avatarUrl: true,
      accountId: true,
      emailVerifiedAt: true,
      lastLoginAt: true,
    },
  });

  return res.json({ user });
});
