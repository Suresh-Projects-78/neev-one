import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { prisma } from '../utils/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { requireTenantContext } from '../middleware/tenantContext.js';
import { requirePermission } from '../middleware/rbac.js';
import { PermissionAction } from '../constants/enums.js';
import { sendTemplate } from '../services/mailer.js';

export const usersRouter = Router();
usersRouter.use(requireAuth, requireTenantContext);

const updateUserSchema = z
  .object({
    email: z.string().email().optional(),
    fullName: z.string().min(1).max(120).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });

const setPrimaryRoleSchema = z.object({
  roleId: z.string().min(1).optional().nullable(),
});

const changePasswordSchema = z.object({
  password: z.string().min(8).max(200),
});

usersRouter.get('/orgs/:orgId/users', requirePermission('SETTINGS', PermissionAction.VIEW, 'Users'), async (req, res) => {
  const accountId = req.tenant!.accountId;
  const orgId = String(req.params.orgId);
  if (orgId !== req.tenant!.orgId) return res.status(403).json({ error: 'orgId mismatch' });

  const memberships = await prisma.userOrgMembership.findMany({
    where: { accountId, orgId },
    include: {
      user: { select: { id: true, email: true, fullName: true, isActive: true } },
    },
    orderBy: [{ createdAt: 'asc' }],
  });

  const userIds = memberships.map((m) => m.userId);
  const assignments = userIds.length
    ? await prisma.userRoleAssignment.findMany({
        where: { accountId, orgId, userId: { in: userIds }, branchId: null },
        select: { userId: true, roleId: true, createdAt: true },
        orderBy: [{ createdAt: 'desc' }],
      })
    : [];

  const roleIdByUserId = new Map<string, string>();
  for (const a of assignments) {
    if (!roleIdByUserId.has(a.userId)) roleIdByUserId.set(a.userId, a.roleId);
  }

  const users = memberships.map((m) => ({
    id: m.user.id,
    email: m.user.email,
    fullName: m.user.fullName,
    // legacy compatibility for older UI code
    name: m.user.fullName,
    isActive: m.user.isActive,
    roleId: roleIdByUserId.get(m.user.id) || null,
  }));

  res.json({ users });
});

usersRouter.patch('/orgs/:orgId/users/:userId', requirePermission('SETTINGS', PermissionAction.EDIT, 'Users'), async (req, res) => {
  const accountId = req.tenant!.accountId;
  const orgId = String(req.params.orgId);
  const userId = String(req.params.userId);
  const createdByUserId = req.auth!.userId;

  if (orgId !== req.tenant!.orgId) return res.status(403).json({ error: 'orgId mismatch' });

  const body = updateUserSchema.parse(req.body);

  // Ensure target user is a member of this org.
  const member = await prisma.userOrgMembership.findFirst({ where: { accountId, orgId, userId }, select: { id: true } });
  if (!member) return res.status(404).json({ error: 'User not found in org' });

  // Same global-uniqueness rule as user creation: login resolves by email
  // across every account, so an email may not be moved onto a taken address.
  if ('email' in body && body.email) {
    const nextEmail = body.email.toLowerCase();
    const clash = await prisma.user.findFirst({
      where: { email: nextEmail, NOT: { id: userId } },
      select: { id: true },
    });
    if (clash) return res.status(409).json({ error: 'That email address is already registered' });
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      ...('email' in body ? { email: body.email!.toLowerCase() } : {}),
      ...('fullName' in body ? { fullName: body.fullName! } : {}),
      ...('isActive' in body ? { isActive: Boolean(body.isActive) } : {}),
    },
    select: { id: true, email: true, fullName: true, isActive: true },
  });

  await prisma.auditLog.create({
    data: {
      accountId,
      orgId: req.tenant!.orgId,
      branchId: req.tenant!.branchId,
      entity: 'User',
      entityId: updated.id,
      action: 'EDIT',
      message: `User updated: ${updated.email}`,
      createdByUserId,
    },
  });

  res.json({ user: updated });
});

// Replace the user's org-wide (branchId null) role assignment.
usersRouter.put('/orgs/:orgId/users/:userId/role', requirePermission('SETTINGS', PermissionAction.EDIT, 'Users'), async (req, res) => {
  const accountId = req.tenant!.accountId;
  const orgId = String(req.params.orgId);
  const userId = String(req.params.userId);
  const createdByUserId = req.auth!.userId;

  if (orgId !== req.tenant!.orgId) return res.status(403).json({ error: 'orgId mismatch' });

  const body = setPrimaryRoleSchema.parse(req.body);

  // org membership required
  await prisma.userOrgMembership.upsert({
    where: { accountId_orgId_userId: { accountId, orgId, userId } },
    update: {},
    create: { accountId, orgId, userId },
  });

  // Clear org-wide roles
  await prisma.userRoleAssignment.deleteMany({ where: { accountId, orgId, userId, branchId: null } });

  if (body.roleId) {
    const role = await prisma.role.findFirst({ where: { id: body.roleId, accountId, orgId } });
    if (!role) return res.status(404).json({ error: 'Role not found' });

    await prisma.userRoleAssignment.create({
      data: {
        accountId,
        orgId,
        branchId: null,
        userId,
        roleId: role.id,
        createdByUserId,
      },
    });
  }

  res.json({ ok: true });
});

usersRouter.post('/orgs/:orgId/users/:userId/password', requirePermission('SETTINGS', PermissionAction.EDIT, 'Users'), async (req, res) => {
  const accountId = req.tenant!.accountId;
  const orgId = String(req.params.orgId);
  const userId = String(req.params.userId);
  const createdByUserId = req.auth!.userId;

  if (orgId !== req.tenant!.orgId) return res.status(403).json({ error: 'orgId mismatch' });

  const body = changePasswordSchema.parse(req.body);

  // Ensure target user is a member of this org.
  const member = await prisma.userOrgMembership.findFirst({ where: { accountId, orgId, userId }, select: { id: true } });
  if (!member) return res.status(404).json({ error: 'User not found in org' });

  const rounds = Number(process.env.BCRYPT_ROUNDS || 12);
  const passwordHash = await bcrypt.hash(body.password, rounds);

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash },
    select: { id: true },
  });

  await prisma.auditLog.create({
    data: {
      accountId,
      orgId: req.tenant!.orgId,
      branchId: req.tenant!.branchId,
      entity: 'User',
      entityId: userId,
      action: 'PASSWORD',
      message: `Password changed for user: ${userId}`,
      createdByUserId,
    },
  });

  res.json({ ok: true });
});

const createUserSchema = z.object({
  email: z.string().email(),
  username: z.string().max(80).optional().nullable(),
  fullName: z.string().min(1).max(120),
  password: z.string().min(8).max(200),
  // allow initial memberships
  orgIds: z.array(z.string()).default([]),
  branchIdsByOrg: z.record(z.array(z.string())).default({}),
});

usersRouter.post('/users', requirePermission('SETTINGS', PermissionAction.CREATE, 'Users'), async (req, res) => {
  const accountId = req.tenant!.accountId;
  const createdByUserId = req.auth!.userId;

  const body = createUserSchema.parse(req.body);
  const email = body.email.toLowerCase();

  // Email must be unique GLOBALLY, not per account: /api/auth/login resolves a
  // user by email across all accounts, so two accounts sharing an email would
  // make login non-deterministic. Only expose the existing row when it belongs
  // to the caller's own account, otherwise this leaks other tenants' users.
  const existing = await prisma.user.findFirst({
    where: { email },
    select: { id: true, email: true, fullName: true, accountId: true },
  });
  if (existing) {
    if (existing.accountId === accountId) {
      return res.status(409).json({ error: 'User already exists (email must be unique)', user: existing });
    }
    return res.status(409).json({ error: 'That email address is already registered' });
  }

  if (body.username) {
    const usernameTaken = await prisma.user.findFirst({
      where: { username: body.username.trim() },
      select: { id: true },
    });
    if (usernameTaken) return res.status(409).json({ error: 'That username is already taken' });
  }

  const rounds = Number(process.env.BCRYPT_ROUNDS || 12);
  const passwordHash = await bcrypt.hash(body.password, rounds);

  const user = await prisma.user.create({
    data: {
      accountId,
      email,
      username: body.username ? body.username.trim() : null,
      fullName: body.fullName,
      passwordHash,
    },
    select: { id: true, email: true, fullName: true, accountId: true },
  });

  // memberships
  const orgIds = body.orgIds.length ? Array.from(new Set(body.orgIds)) : [req.tenant!.orgId];
  for (const orgId of orgIds) {
    await prisma.userOrgMembership.upsert({
      where: { accountId_orgId_userId: { accountId, orgId, userId: user.id } },
      update: {},
      create: { accountId, orgId, userId: user.id },
    });

    let branchIds = body.branchIdsByOrg[orgId] || [];
    if (!branchIds.length && orgId === req.tenant!.orgId) branchIds = [req.tenant!.branchId];
    branchIds = Array.from(new Set(branchIds));

    for (const branchId of branchIds) {
      await prisma.userBranchMembership.upsert({
        where: { accountId_orgId_branchId_userId: { accountId, orgId, branchId, userId: user.id } },
        update: {},
        create: { accountId, orgId, branchId, userId: user.id },
      });
    }
  }

  await prisma.auditLog.create({
    data: {
      accountId,
      orgId: req.tenant!.orgId,
      branchId: req.tenant!.branchId,
      entity: 'User',
      entityId: user.id,
      action: 'CREATE',
      message: `User created: ${user.email}`,
      createdByUserId,
    },
  });

  const [inviter, org] = await Promise.all([
    prisma.user.findUnique({ where: { id: createdByUserId }, select: { fullName: true } }),
    prisma.org.findUnique({ where: { id: req.tenant!.orgId }, select: { name: true } }),
  ]);

  await sendTemplate({
    templateKey: 'auth.user_invited',
    to: user.email,
    toName: user.fullName,
    accountId,
    orgId: req.tenant!.orgId,
    transactional: true,
    relatedType: 'User',
    relatedId: user.id,
    data: {
      userName: user.fullName,
      email: user.email,
      orgName: org?.name || '',
      inviterName: inviter?.fullName || 'An administrator',
    },
  });

  res.status(201).json({ user });
});

usersRouter.delete('/orgs/:orgId/users/:userId', requirePermission('SETTINGS', PermissionAction.DELETE, 'Users'), async (req, res) => {
  const accountId = req.tenant!.accountId;
  const orgId = String(req.params.orgId);
  const userId = String(req.params.userId);
  const createdByUserId = req.auth!.userId;

  if (orgId !== req.tenant!.orgId) return res.status(403).json({ error: 'orgId mismatch' });

  // Remove user from this org (do not delete the global user record)
  await prisma.userRoleAssignment.deleteMany({ where: { accountId, orgId, userId } });
  await prisma.userWarehouseAccess.deleteMany({ where: { accountId, orgId, userId } });
  await prisma.userBranchMembership.deleteMany({ where: { accountId, orgId, userId } });
  await prisma.userOrgMembership.deleteMany({ where: { accountId, orgId, userId } });

  await prisma.auditLog.create({
    data: {
      accountId,
      orgId: req.tenant!.orgId,
      branchId: req.tenant!.branchId,
      entity: 'User',
      entityId: userId,
      action: 'REMOVE',
      message: `User removed from org: ${userId}`,
      createdByUserId,
    },
  });

  res.json({ ok: true });
});

const assignBranchesSchema = z.object({
  branchIds: z.array(z.string()).min(1),
});

usersRouter.get('/orgs/:orgId/users/:userId/branches', requirePermission('SETTINGS', PermissionAction.VIEW, 'Users'), async (req, res) => {
  const accountId = req.tenant!.accountId;
  const orgId = String(req.params.orgId);
  const userId = String(req.params.userId);
  if (orgId !== req.tenant!.orgId) return res.status(403).json({ error: 'orgId mismatch' });

  // Ensure target user is a member of this org.
  const member = await prisma.userOrgMembership.findFirst({ where: { accountId, orgId, userId }, select: { id: true } });
  if (!member) return res.status(404).json({ error: 'User not found in org' });

  const rows = await prisma.userBranchMembership.findMany({
    where: { accountId, orgId, userId },
    select: { branchId: true },
    orderBy: [{ createdAt: 'asc' }],
  });

  res.json({ branchIds: rows.map((r) => r.branchId) });
});

usersRouter.post('/orgs/:orgId/users/:userId/branches', requirePermission('SETTINGS', PermissionAction.EDIT, 'Users'), async (req, res) => {
  const accountId = req.tenant!.accountId;
  const orgId = String(req.params.orgId);
  const userId = String(req.params.userId);
  if (orgId !== req.tenant!.orgId) return res.status(403).json({ error: 'orgId mismatch' });

  const body = assignBranchesSchema.parse(req.body);
  const branchIds = Array.from(new Set(body.branchIds));

  // ensure org membership exists
  await prisma.userOrgMembership.upsert({
    where: { accountId_orgId_userId: { accountId, orgId, userId } },
    update: {},
    create: { accountId, orgId, userId },
  });

  // replace branch membership for this org
  await prisma.userBranchMembership.deleteMany({ where: { accountId, orgId, userId } });
  for (const branchId of branchIds) {
    await prisma.userBranchMembership.create({ data: { accountId, orgId, branchId, userId } });
  }

  res.json({ ok: true });
});

const assignRoleSchema = z.object({
  roleId: z.string().min(1),
  branchId: z.string().optional().nullable(),
});

usersRouter.post('/orgs/:orgId/users/:userId/roles', requirePermission('SETTINGS', PermissionAction.EDIT, 'Users'), async (req, res) => {
  const accountId = req.tenant!.accountId;
  const orgId = String(req.params.orgId);
  const userId = String(req.params.userId);
  const createdByUserId = req.auth!.userId;

  if (orgId !== req.tenant!.orgId) return res.status(403).json({ error: 'orgId mismatch' });

  const body = assignRoleSchema.parse(req.body);

  // org membership required
  await prisma.userOrgMembership.upsert({
    where: { accountId_orgId_userId: { accountId, orgId, userId } },
    update: {},
    create: { accountId, orgId, userId },
  });

  const role = await prisma.role.findFirst({ where: { id: body.roleId, accountId, orgId } });
  if (!role) return res.status(404).json({ error: 'Role not found' });

  const scopeBranchId = body.branchId ?? null;

  // Enforce a single role per scope (org-wide when branchId=null, or per-branch when provided)
  await prisma.userRoleAssignment.deleteMany({ where: { accountId, orgId, userId, branchId: scopeBranchId } });

  try {
    await prisma.userRoleAssignment.create({
      data: {
        accountId,
        orgId,
        branchId: scopeBranchId,
        userId,
        roleId: role.id,
        createdByUserId,
      },
    });
  } catch (err: any) {
    // If the client sent duplicates or raced, keep endpoint idempotent.
    if (!(String(err?.name || '') === 'PrismaClientKnownRequestError' && String(err?.code || '') === 'P2002')) throw err;
  }

  res.status(201).json({ ok: true });
});

const assignWarehousesSchema = z.object({
  warehouseIds: z.array(z.string()).min(1),
});

usersRouter.post('/orgs/:orgId/users/:userId/warehouses', requirePermission('SETTINGS', PermissionAction.EDIT, 'Users'), async (req, res) => {
  const accountId = req.tenant!.accountId;
  const orgId = String(req.params.orgId);
  const userId = String(req.params.userId);
  if (orgId !== req.tenant!.orgId) return res.status(403).json({ error: 'orgId mismatch' });

  const body = assignWarehousesSchema.parse(req.body);
  const warehouseIds = Array.from(new Set(body.warehouseIds));

  // clear then assign
  await prisma.userWarehouseAccess.deleteMany({ where: { accountId, orgId, userId } });

  for (const warehouseId of warehouseIds) {
    const wh = await prisma.warehouse.findFirst({ where: { accountId, orgId, id: warehouseId } });
    if (!wh) return res.status(400).json({ error: `Invalid warehouse ${warehouseId}` });
    await prisma.userWarehouseAccess.create({
      data: {
        accountId,
        orgId,
        branchId: wh.branchId,
        warehouseId,
        userId,
      },
    });
  }

  res.json({ ok: true });
});
