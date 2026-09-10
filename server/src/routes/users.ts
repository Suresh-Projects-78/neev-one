import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { prisma } from '../utils/prisma.js';
import { userLimitReason } from '../services/entitlements.js';
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
/* ------------------------------------------------- a person's companies */

/**
 * Which companies one person can work in, seen and set in one place.
 *
 * Access was granted a company at a time: switch to that company, invite the
 * same email again, pick a role. It worked, and it made the answer to "what can
 * this person see?" a thing you could only find by visiting every company and
 * looking. For a CA firm assigning ten clients to an intern that is ten trips
 * and no way to check the result.
 *
 * Scoped to the caller's own account throughout. A membership is a key to a
 * company's books, and the one thing this must never do is hand out a key to a
 * company the caller does not own.
 */
usersRouter.get('/users/:userId/companies', requirePermission('SETTINGS', PermissionAction.VIEW, 'Users'), async (req, res) => {
  const accountId = req.tenant!.accountId;
  const userId = String(req.params.userId);

  const target = await prisma.user.findFirst({ where: { id: userId, accountId }, select: { id: true } });
  if (!target) return res.status(404).json({ error: 'User not found' });

  const [orgs, memberships, assignments] = await Promise.all([
    prisma.org.findMany({ where: { accountId }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.userOrgMembership.findMany({ where: { accountId, userId }, select: { orgId: true } }),
    prisma.userRoleAssignment.findMany({
      where: { accountId, userId, branchId: null },
      select: { orgId: true, roleId: true, role: { select: { id: true, name: true } } },
    }),
  ]);

  const member = new Set(memberships.map((m) => m.orgId));
  const roleByOrg = new Map(assignments.map((a) => [a.orgId, a.role]));

  res.json({
    companies: orgs.map((o) => ({
      orgId: o.id,
      name: o.name,
      hasAccess: member.has(o.id),
      role: roleByOrg.get(o.id) || null,
    })),
  });
});

const companyAccessSchema = z.object({
  /** The complete set. A company left out is access taken away. */
  orgIds: z.array(z.string().min(1)).max(500),
});

usersRouter.put('/users/:userId/companies', requirePermission('SETTINGS', PermissionAction.EDIT, 'Users'), async (req, res) => {
  const accountId = req.tenant!.accountId;
  const userId = String(req.params.userId);
  const body = companyAccessSchema.parse(req.body);

  const target = await prisma.user.findFirst({ where: { id: userId, accountId }, select: { id: true } });
  if (!target) return res.status(404).json({ error: 'User not found' });

  // Only companies in this account, and only ones that exist. Anything else in
  // the request is dropped rather than trusted.
  const owned = await prisma.org.findMany({ where: { accountId, id: { in: body.orgIds } }, select: { id: true } });
  const wanted = new Set(owned.map((o) => o.id));

  const current = await prisma.userOrgMembership.findMany({ where: { accountId, userId }, select: { orgId: true } });
  const have = new Set(current.map((m) => m.orgId));

  const toAdd = [...wanted].filter((id) => !have.has(id));
  const toRemove = [...have].filter((id) => !wanted.has(id));

  /*
   * Removing access removes the role with it.
   *
   * A role assignment left behind on a company the person can no longer open is
   * a permission waiting to come back the moment anybody re-adds them, silently
   * and at whatever level they had before.
   */
  await prisma.$transaction([
    ...(toRemove.length
      ? [
          prisma.userRoleAssignment.deleteMany({ where: { accountId, userId, orgId: { in: toRemove } } }),
          prisma.userOrgMembership.deleteMany({ where: { accountId, userId, orgId: { in: toRemove } } }),
        ]
      : []),
    ...toAdd.map((orgId) =>
      prisma.userOrgMembership.create({ data: { accountId, orgId, userId } })
    ),
  ]);

  res.json({ ok: true, added: toAdd.length, removed: toRemove.length });
});

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

  /*
   * The plan's seat allowance. Checked before anything is written, and before
   * the invitation branch below, so an account at its limit is told so rather
   * than being allowed to add a person and discover it later.
   *
   * An account with no entitlement row is on the default plan, which is
   * unlimited, so this refuses nobody until a plan is deliberately assigned.
   */
  const seatsFull = await userLimitReason(accountId);
  if (seatsFull) return res.status(403).json({ error: seatsFull, code: 'USER_LIMIT' });

  /*
   * An email is one person, everywhere.
   *
   * A person already registered is INVITED into this company rather than
   * refused: the accountant a client brings in, or a colleague who already has
   * a login from another business, should not need a second identity with the
   * same address. Their existing login is given a membership here.
   *
   * This used to answer 409 for an email registered under another account, so
   * the only person who could ever be added to a company was somebody who had
   * never used the product before.
   *
   * The reply deliberately does NOT echo the existing user's details when they
   * come from elsewhere. Confirming that an address is registered is a small
   * leak, and returning the name attached to it is a larger one.
   */
  const existing = await prisma.user.findFirst({
    where: { email },
    select: { id: true, email: true, fullName: true, accountId: true, isActive: true },
  });

  let invited: { id: string; email: string; fullName: string | null; accountId: string } | null = null;
  if (existing) {
    if (!existing.isActive) {
      return res.status(409).json({ error: 'That email address belongs to a deactivated user.' });
    }
    const already = await prisma.userOrgMembership.findFirst({
      where: { orgId: req.tenant!.orgId, userId: existing.id },
      select: { id: true },
    });
    if (already) {
      return res.status(409).json({ error: 'That person already has access to this company.' });
    }
    invited = {
      id: existing.id,
      email: existing.email,
      fullName: existing.accountId === accountId ? existing.fullName : null,
      accountId: existing.accountId,
    };
  }

  if (!invited && body.username) {
    const usernameTaken = await prisma.user.findFirst({
      where: { username: body.username.trim() },
      select: { id: true },
    });
    if (usernameTaken) return res.status(409).json({ error: 'That username is already taken' });
  }

  /*
   * An invited person keeps the login they already have. Setting a password for
   * somebody else's existing identity would be an account takeover dressed as
   * an invitation.
   */
  const user =
    invited ??
    (await prisma.user.create({
      data: {
        accountId,
        email,
        username: body.username ? body.username.trim() : null,
        fullName: body.fullName,
        passwordHash: await bcrypt.hash(body.password, Number(process.env.BCRYPT_ROUNDS || 12)),
      },
      select: { id: true, email: true, fullName: true, accountId: true },
    }));

  // memberships
  const orgIds = body.orgIds.length ? Array.from(new Set(body.orgIds)) : [req.tenant!.orgId];

  // C-8: body-supplied org/branch ids must belong to the caller's account —
  // otherwise this is an unvalidated cross-account foreign key.
  const ownedOrgs = await prisma.org.findMany({ where: { accountId, id: { in: orgIds } }, select: { id: true } });
  const ownedOrgIds = new Set(ownedOrgs.map((o) => o.id));
  for (const orgId of orgIds) {
    if (!ownedOrgIds.has(orgId)) {
      return res.status(400).json({ error: `Org ${orgId} does not belong to this account` });
    }
    const requestedBranches = Array.from(new Set(body.branchIdsByOrg[orgId] || []));
    if (requestedBranches.length) {
      const ownedBranches = await prisma.branch.findMany({
        where: { accountId, orgId, id: { in: requestedBranches } },
        select: { id: true },
      });
      if (ownedBranches.length !== requestedBranches.length) {
        return res.status(400).json({ error: `One or more branches do not belong to org ${orgId}` });
      }
    }
  }

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
    toName: user.fullName ?? undefined,
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
