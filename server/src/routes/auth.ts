import { Router } from 'express';
import type { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../utils/prisma.js';
import { PermissionAction, RoleType } from '../constants/enums.js';
import { ensureLedgerSetup } from '../services/ledger.js';
import { ensurePermissionCatalog } from './permissions.js';
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
import { expandPreset, permKey } from '../constants/permissionCatalog.js';

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
    issuer: process.env.JWT_ISSUER,
    audience: process.env.JWT_AUDIENCE,
  });
}

function requireAuth(req: any) {
  const hdr = String(req.headers?.authorization || '').trim();
  const token = hdr.startsWith('Bearer ') ? hdr.slice('Bearer '.length).trim() : '';
  if (!token) throw new Error('Unauthorized');

  const secret = getJwtSecret();
  if (!secret) throw new Error('Server misconfigured: JWT_SECRET missing');

  const decoded: any = jwt.verify(token, secret, {
    issuer: process.env.JWT_ISSUER,
    audience: process.env.JWT_AUDIENCE,
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

  const ok = await bcrypt.compare(body.password, user.passwordHash);
  if (!ok) {
    const result = await registerFailedLogin(user.id);
    await recordAuthEvent({
      accountId: user.accountId,
      userId: user.id,
      email: identity,
      eventType: result.locked ? 'LOCKED_OUT' : 'LOGIN_FAILED',
      ip,
      userAgent,
    });
    if (result.locked) {
      return res.status(429).json({ error: `Too many failed attempts. Try again in ${LOCKOUT_NOTICE} minute(s).` });
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

  const memberships = await prisma.userOrgMembership.findMany({
    where: { accountId: user.accountId, userId: user.id },
    select: { orgId: true, org: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'asc' },
  });

  const companies = memberships.map((m) => ({
    orgId: m.orgId,
    id: m.org?.id ?? m.orgId,
    name: m.org?.name ?? '',
  }));

  const firstOrgId = companies[0]?.orgId ?? null;

  const branches = firstOrgId
    ? await prisma.userBranchMembership.findMany({
        where: { accountId: user.accountId, orgId: firstOrgId, userId: user.id },
        select: { branchId: true },
        orderBy: { createdAt: 'asc' },
      })
    : [];

  return res.json({
    token,
    refreshToken,
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
    user: { id: user.id, email: user.email, fullName: user.fullName, accountId: user.accountId },
    companies,
    activeOrgId: firstOrgId,
    activeBranchId: branches[0]?.branchId ?? null,
  });
});

/** Exchange a refresh token for a new pair. The old one is retired. */
authRouter.post('/refresh', async (req: Request, res: Response) => {
  const body = z.object({ refreshToken: z.string().min(10) }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: 'Missing refresh token' });

  try {
    const rotated = await rotateSession(body.data.refreshToken, {
      ip: clientIp(req),
      userAgent: req.headers['user-agent'] as string | undefined,
    });
    await recordAuthEvent({
      accountId: rotated.session.accountId,
      userId: rotated.session.userId,
      eventType: 'TOKEN_REFRESHED',
      ip: clientIp(req),
    });
    return res.json({ token: rotated.accessToken, refreshToken: rotated.refreshToken });
  } catch (e: any) {
    if (e instanceof AuthError) return res.status(e.status).json({ error: e.message });
    throw e;
  }
});

/** Real logout: the session is revoked server-side, not just forgotten locally. */
authRouter.post('/logout', async (req: Request, res: Response) => {
  const body = z.object({ refreshToken: z.string().optional() }).safeParse(req.body);
  const refreshToken = body.success ? body.data.refreshToken : undefined;

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
    select: { id: true, email: true, fullName: true, accountId: true },
  });
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const orgMemberships = await prisma.userOrgMembership.findMany({
    where: { accountId: auth.accountId, userId: auth.userId },
    select: {
      orgId: true,
      org: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  let isOrgAdmin = false;
  let allowedBranchIds: string[] = [];

  if (activeOrgId) {
    const assignments = await prisma.userRoleAssignment.findMany({
      where: { accountId: auth.accountId, orgId: activeOrgId, userId: auth.userId },
      select: { role: { select: { roleType: true, name: true } } },
    });
    isOrgAdmin = assignments.some((a) => String(a?.role?.roleType || '') === RoleType.ADMIN);

    if (isOrgAdmin) {
      const branches = await prisma.branch.findMany({
        where: { accountId: auth.accountId, orgId: activeOrgId },
        select: { id: true },
        orderBy: { branchName: 'asc' },
      });
      allowedBranchIds = branches.map((b) => b.id);
    } else {
      const memberships = await prisma.userBranchMembership.findMany({
        where: { accountId: auth.accountId, orgId: activeOrgId, userId: auth.userId },
        select: { branchId: true },
        orderBy: { createdAt: 'asc' },
      });
      allowedBranchIds = memberships.map((m) => m.branchId);
    }
  }

  return res.json({
    user,
    orgs: orgMemberships.map((m) => ({ orgId: m.orgId, org: m.org })),
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

  return res.json({
    token,
    refreshToken,
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

  const body = z.object({ companyName: z.string().min(1) }).parse(req.body);
  const now = new Date();

  // Create org + head-office branch, assign memberships
  const org = await prisma.org.create({
    data: {
      accountId: auth.accountId,
      name: body.companyName.trim(),
      legalName: body.companyName.trim(),
      createdByUserId: auth.userId,
    },
    select: { id: true, name: true },
  });

  const branch = await prisma.branch.create({
    data: {
      accountId: auth.accountId,
      orgId: org.id,
      branchCode: 'HO',
      branchName: 'Head Office',
      addressLine1: '',
      city: '',
      state: 'Karnataka',
      country: 'India',
      gstRegistrationType: 'UNREGISTERED',
      gstin: null,
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

  // Ensure the creator can manage setup screens immediately.
  await bootstrapOwnerRole(auth.accountId, org.id, auth.userId);

  // Every org gets a chart of accounts and journals up front, so the first
  // invoice has somewhere to post.
  await ensureLedgerSetup(auth.accountId, org.id, auth.userId);

  // Frontend expects { company: { id, name, orgId }, branch: { id } }
  return res.json({
    company: { id: org.id, name: org.name, orgId: org.id },
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
