import type { Request, Response, NextFunction } from 'express';
import { type PermissionAction as PermissionActionType } from '../constants/enums.js';
import { flattenCatalog } from '../constants/permissionCatalog.js';
import { prisma } from '../utils/prisma.js';
import { resolveAccess } from '../services/access.js';

// DB-stored RBAC:
// - UserRoleAssignment can be org-wide (branchId null) or branch-scoped
// - RolePermission stores Permission rows (module/subModule/action)

declare module 'express-serve-static-core' {
  interface Request {
    permissions?: Set<string>;
    permissionLevels?: Map<string, number>;
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

  // C-4: seed the FULL catalog, not a partial core set. The old partial seed
  // meant the Owner's effective grants depended on which endpoints they
  // happened to hit first (the lazy ensureOwnerPermissionForCreator patched
  // holes one request at a time). Seeding everything up front makes the
  // Owner's access deterministic; the lazy fallback stays for legacy orgs.
  const core: Array<{ module: string; subModule: string; action: string }> = flattenCatalog();

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

    // Effective access resolves direct role assignments AND role profiles.
    let access = await resolveAccess(accountId, orgId, userId, branchId);

    if (access.roleIds.length === 0) {
      const bootstrapped = await bootstrapOwnerRoleIfCreator(accountId, orgId, userId);
      if (!bootstrapped) return res.status(403).json({ error: 'No roles assigned' });
      access = await resolveAccess(accountId, orgId, userId, branchId);
      if (access.roleIds.length === 0) return res.status(403).json({ error: 'No roles assigned' });
    }

    const allowed = access.permissions;
    req.permissions = allowed;
    req.permissionLevels = access.levels;

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
