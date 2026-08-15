import type { Request, Response, NextFunction } from 'express';
import { PermissionAction, type PermissionAction as PermissionActionType } from '../constants/enums';
import { prisma } from '../utils/prisma';

// DB-stored RBAC:
// - UserRoleAssignment can be org-wide (branchId null) or branch-scoped
// - RolePermission stores Permission rows (module/subModule/action)

declare module 'express-serve-static-core' {
  interface Request {
    permissions?: Set<string>;
  }
}

function permString(module: string, subModule: string | null, action: PermissionActionType): string {
  return `${module}::${subModule || ''}::${action}`;
}

async function ensureOwnerPermissionForCreator(
  accountId: string,
  orgId: string,
  userId: string,
  module: string,
  subModule: string | null,
  action: PermissionActionType,
) {
  const org = await prisma.org.findFirst({ where: { accountId, id: orgId }, select: { createdByUserId: true } });
  if (!org || org.createdByUserId !== userId) return false;

  const roleName = 'Owner';
  const role =
    (await prisma.role.findFirst({ where: { accountId, orgId, branchId: null, name: roleName }, select: { id: true } })) ||
    (await prisma.role.create({
      data: {
        accountId,
        orgId,
        branchId: null,
        name: roleName,
        description: 'Default owner role (auto-created)',
        roleType: 'ADMIN',
        createdByUserId: userId,
      },
      select: { id: true },
    }));

  // Ensure permission exists
  const perm =
    (await prisma.permission.findFirst({ where: { module, subModule, action }, select: { id: true } })) ||
    (await prisma.permission.create({ data: { module, subModule, action }, select: { id: true } }));

  // Ensure rolePermission is granted
  try {
    await prisma.rolePermission.create({
      data: { accountId, orgId, roleId: role.id, permissionId: perm.id, allowed: true },
      select: { id: true },
    });
  } catch (err: any) {
    if (!(String(err?.name || '') === 'PrismaClientKnownRequestError' && String(err?.code || '') === 'P2002')) {
      throw err;
    }
  }

  // Ensure assignment exists
  try {
    await prisma.userRoleAssignment.create({
      data: { accountId, orgId, branchId: null, userId, roleId: role.id, createdByUserId: userId },
      select: { id: true },
    });
  } catch (err: any) {
    if (!(String(err?.name || '') === 'PrismaClientKnownRequestError' && String(err?.code || '') === 'P2002')) {
      throw err;
    }
  }

  return true;
}

async function bootstrapOwnerRoleIfCreator(accountId: string, orgId: string, userId: string) {
  const org = await prisma.org.findFirst({ where: { accountId, id: orgId }, select: { createdByUserId: true } });
  if (!org || org.createdByUserId !== userId) return false;

  // Create a minimal owner role so the creator can proceed.
  const roleName = 'Owner';
  const role =
    (await prisma.role.findFirst({ where: { accountId, orgId, branchId: null, name: roleName }, select: { id: true } })) ||
    (await prisma.role.create({
      data: {
        accountId,
        orgId,
        branchId: null,
        name: roleName,
        description: 'Default owner role (auto-created)',
        roleType: 'ADMIN',
        createdByUserId: userId,
      },
      select: { id: true },
    }));

  // Ensure at least the requested module/subModule/action exists for this org.
  // (Other permissions may be added later via settings.)
  // Note: Permission table is global (not org-scoped).
  // We do not know the requested permission here, so we seed a small core set.
  const core: Array<{ module: string; subModule: string; action: string }> = [
    { module: 'MASTERS', subModule: 'Company/Branch setup', action: PermissionAction.VIEW },
    { module: 'MASTERS', subModule: 'Company/Branch setup', action: PermissionAction.CREATE },
    { module: 'MASTERS', subModule: 'Company/Branch setup', action: PermissionAction.EDIT },
    { module: 'MASTERS', subModule: 'Company/Branch setup', action: PermissionAction.DELETE },
    { module: 'SETTINGS', subModule: 'Users', action: PermissionAction.VIEW },
    { module: 'SETTINGS', subModule: 'Users', action: PermissionAction.CREATE },
    { module: 'SETTINGS', subModule: 'Users', action: PermissionAction.EDIT },
    { module: 'SETTINGS', subModule: 'Users', action: PermissionAction.DELETE },
    { module: 'SETTINGS', subModule: 'Roles', action: PermissionAction.VIEW },
    { module: 'SETTINGS', subModule: 'Roles', action: PermissionAction.CREATE },
    { module: 'SETTINGS', subModule: 'Roles', action: PermissionAction.EDIT },
    { module: 'SETTINGS', subModule: 'Roles', action: PermissionAction.DELETE },
    { module: 'SALES', subModule: 'Invoices', action: PermissionAction.VIEW },
    { module: 'SALES', subModule: 'Invoices', action: PermissionAction.CREATE },
    { module: 'SALES', subModule: 'Invoices', action: PermissionAction.EDIT },
    { module: 'SALES', subModule: 'Invoices', action: PermissionAction.DELETE },
  ];

  const permissionIds: string[] = [];
  for (const p of core) {
    const existing = await prisma.permission.findFirst({ where: { module: p.module, subModule: p.subModule, action: p.action }, select: { id: true } });
    if (existing) {
      permissionIds.push(existing.id);
      continue;
    }
    const created = await prisma.permission.create({ data: { module: p.module, subModule: p.subModule, action: p.action }, select: { id: true } });
    permissionIds.push(created.id);
  }

  for (const permissionId of permissionIds) {
    try {
      await prisma.rolePermission.create({
        data: { accountId, orgId, roleId: role.id, permissionId, allowed: true },
        select: { id: true },
      });
    } catch (err: any) {
      if (String(err?.name || '') === 'PrismaClientKnownRequestError' && String(err?.code || '') === 'P2002') continue;
      throw err;
    }
  }

  try {
    await prisma.userRoleAssignment.create({
      data: { accountId, orgId, branchId: null, userId, roleId: role.id, createdByUserId: userId },
      select: { id: true },
    });
  } catch (err: any) {
    if (!(String(err?.name || '') === 'PrismaClientKnownRequestError' && String(err?.code || '') === 'P2002')) {
      throw err;
    }
  }

  return true;
}

export function requirePermission(module: string, action: PermissionActionType, subModule?: string) {
  const m = String(module || '').trim();
  const sm = String(subModule || '').trim();

  return async (req: Request, res: Response, next: NextFunction) => {
    const accountId = String(req.auth?.accountId || '').trim();
    const userId = String(req.auth?.userId || '').trim();
    const orgId = String(req.tenant?.orgId || '').trim();
    const branchId = String(req.tenant?.branchId || '').trim();

    if (!accountId || !userId) return res.status(401).json({ error: 'Missing auth context' });
    if (!orgId || !branchId) return res.status(400).json({ error: 'Missing tenant context' });

    // Build effective role set for this user in this org/branch
    const assignments = await prisma.userRoleAssignment.findMany({
      where: {
        accountId,
        orgId,
        userId,
        OR: [{ branchId: null }, { branchId }],
      },
      select: { roleId: true },
    });

    let roleIds = assignments.map((a: { roleId: string }) => a.roleId);
    if (roleIds.length === 0) {
      const bootstrapped = await bootstrapOwnerRoleIfCreator(accountId, orgId, userId);
      if (!bootstrapped) return res.status(403).json({ error: 'No roles assigned' });

      const retry = await prisma.userRoleAssignment.findMany({
        where: { accountId, orgId, userId, OR: [{ branchId: null }, { branchId }] },
        select: { roleId: true },
      });
      roleIds = retry.map((a: { roleId: string }) => a.roleId);
      if (roleIds.length === 0) return res.status(403).json({ error: 'No roles assigned' });
    }

    const rolePerms = await prisma.rolePermission.findMany({
      where: { roleId: { in: roleIds }, allowed: true },
      select: {
        permission: { select: { module: true, subModule: true, action: true } },
      },
    });

    const allowed = new Set<string>();
    for (const rp of rolePerms) {
      allowed.add(permString(rp.permission.module, rp.permission.subModule ?? null, rp.permission.action as PermissionActionType));
    }

    req.permissions = allowed;

    const want = permString(m, sm || null, action);
    const ok = allowed.has(want);
    if (!ok) {
      // Safety net: org creator should never get locked out of core administration.
      // If the creator is missing this permission (e.g., older bootstraps), grant it to their Owner role.
      try {
        const granted = await ensureOwnerPermissionForCreator(accountId, orgId, userId, m, sm || null, action);
        if (granted) {
          allowed.add(want);
          req.permissions = allowed;
          return next();
        }
      } catch {
        // fall through to the normal denial
      }

      return res.status(403).json({ error: 'Permission denied', permission: { module: m, subModule: sm || null, action } });
    }

    next();
  };
}
