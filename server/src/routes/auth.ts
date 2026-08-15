import { Router } from 'express';
import type { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../utils/prisma.js';
import { PermissionAction, RoleType } from '../constants/enums.js';
import { ensureLedgerSetup } from '../services/ledger.js';

export const authRouter = Router();

const RESET_TOKENS = new Map<string, { userId: string; expiresAt: number }>();

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
  // Create a minimal-but-useful default RBAC setup for a brand-new company.
  // Permissions are global rows; Role/RolePermission/Assignment are org-scoped.
  const permissionSpecs: Array<{ module: string; subModule: string; actions: string[] }> = [
    { module: 'MASTERS', subModule: 'Company/Branch setup', actions: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT, PermissionAction.DELETE] },
    { module: 'SETTINGS', subModule: 'Users', actions: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT, PermissionAction.DELETE] },
    { module: 'SETTINGS', subModule: 'Roles', actions: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT, PermissionAction.DELETE] },
    { module: 'INVENTORY', subModule: 'Inter-branch transfer', actions: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.APPROVE] },
    { module: 'INVENTORY', subModule: 'Stock Adjustment', actions: [PermissionAction.VIEW, PermissionAction.CREATE] },
    { module: 'SALES', subModule: 'Invoices', actions: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT, PermissionAction.DELETE] },
    { module: 'ACCOUNTING', subModule: 'Ledger', actions: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT, PermissionAction.APPROVE] },
  ];

  const permissions: Array<{ id: string }> = [];
  for (const spec of permissionSpecs) {
    for (const action of spec.actions) {
      const existing = await prisma.permission.findFirst({
        where: { module: spec.module, subModule: spec.subModule, action },
        select: { id: true },
      });
      if (existing) {
        permissions.push(existing);
        continue;
      }

      const created = await prisma.permission.create({
        data: { module: spec.module, subModule: spec.subModule, action },
        select: { id: true },
      });
      permissions.push(created);
    }
  }

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
        description: 'Default owner role (auto-created)',
        roleType: RoleType.ADMIN,
        createdByUserId: userId,
      },
      select: { id: true },
    }));

  for (const p of permissions) {
    try {
      await prisma.rolePermission.create({
        data: {
          accountId,
          orgId,
          roleId: role.id,
          permissionId: p.id,
          allowed: true,
        },
        select: { id: true },
      });
    } catch (err: any) {
      // Ignore unique constraint violations (roleId+permissionId)
      if (String(err?.name || '') === 'PrismaClientKnownRequestError' && String(err?.code || '') === 'P2002') continue;
      throw err;
    }
  }

  try {
    await prisma.userRoleAssignment.create({
      data: {
        accountId,
        orgId,
        branchId: null,
        userId,
        roleId: role.id,
        createdByUserId: userId,
      },
      select: { id: true },
    });
  } catch (err: any) {
    // Ignore unique constraint violations
    if (!(String(err?.name || '') === 'PrismaClientKnownRequestError' && String(err?.code || '') === 'P2002')) {
      throw err;
    }
  }
}

authRouter.post('/login', async (req: Request, res: Response) => {
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

  const user = await prisma.user.findFirst({
    where: {
      OR: [{ email: identity }, { username: rawIdentity.trim() }],
    },
    select: { id: true, accountId: true, passwordHash: true, isActive: true, fullName: true, email: true },
  });

  if (!user || !user.isActive) {
    const msg = process.env.NODE_ENV === 'production' ? 'Invalid credentials' : 'User not found. Please sign up first.';
    return res.status(401).json({ error: msg });
  }

  const ok = await bcrypt.compare(body.password, user.passwordHash);
  if (!ok) {
    const msg = process.env.NODE_ENV === 'production' ? 'Invalid credentials' : 'Wrong password. Please re-check and try again.';
    return res.status(401).json({ error: msg });
  }

  const token = signToken({ userId: user.id, accountId: user.accountId });

  // The client needs an active org immediately after login: apiFetch sends
  // x-org-id on every protected call. Returning memberships here means a
  // returning user on a fresh browser can work without re-running setup.
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
    user: { id: user.id, email: user.email, fullName: user.fullName, accountId: user.accountId },
    companies,
    activeOrgId: firstOrgId,
    activeBranchId: branches[0]?.branchId ?? null,
  });
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

authRouter.post('/signup', async (req: Request, res: Response) => {
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

  const token = signToken({ userId: user.id, accountId: user.accountId });
  return res.json({ token, user });
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

authRouter.post('/forgot-password', async (req: Request, res: Response) => {
  const body = z.object({ email: z.string().email() }).parse(req.body);
  const email = body.email.trim().toLowerCase();

  const user = await prisma.user.findFirst({ where: { email }, select: { id: true, isActive: true } });
  // Always respond OK to avoid user enumeration.
  if (!user || !user.isActive) {
    return res.json({ message: 'If an account exists, a reset link has been sent to your email.' });
  }

  const token = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  const ttlMs = 15 * 60 * 1000;
  RESET_TOKENS.set(token, { userId: user.id, expiresAt: Date.now() + ttlMs });

  // Dev-only: return token so you can test the reset flow without SMTP.
  return res.json({
    message: 'If an account exists, a reset link has been sent to your email.',
    devToken: process.env.NODE_ENV === 'production' ? undefined : token,
  });
});

authRouter.post('/reset-password', async (req: Request, res: Response) => {
  const body = z.object({ token: z.string().min(10), password: z.string().min(8) }).parse(req.body);
  const record = RESET_TOKENS.get(body.token);
  if (!record || record.expiresAt < Date.now()) {
    return res.status(400).json({ error: 'Invalid or expired reset token' });
  }

  const rounds = Number(process.env.BCRYPT_ROUNDS || 12);
  const passwordHash = await bcrypt.hash(body.password, rounds);
  await prisma.user.update({ where: { id: record.userId }, data: { passwordHash } });
  RESET_TOKENS.delete(body.token);

  return res.json({ message: 'Password reset successfully' });
});
