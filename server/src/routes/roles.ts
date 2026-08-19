import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { requireTenantContext } from '../middleware/tenantContext.js';
import { requirePermission } from '../middleware/rbac.js';
import { PermissionAction, type PermissionAction as PermissionActionType } from '../constants/enums.js';
import { ensureDefaultRoles } from '../services/defaultRoles.js';

export const rolesRouter = Router();
rolesRouter.use(requireAuth, requireTenantContext);

const permissionObject = z.object({
  module: z.string().min(1),
  subModule: z.string().optional().nullable(),
  action: z.enum(['VIEW', 'CREATE', 'EDIT', 'DELETE', 'APPROVE', 'EXPORT']),
  allowed: z.boolean().default(true),
});

/**
 * Accept both shapes: the object form above, and the catalog's string keys
 * ("MODULE::Resource::ACTION") that the Role form and the Role Permission
 * matrix hold natively. The UI sent strings and this schema rejected every
 * create with "Expected object, received string" — no custom role could be
 * made at all.
 */
const permissionInput = z.union([
  permissionObject,
  z
    .string()
    .regex(/^[^:]+::[^:]+::(VIEW|CREATE|EDIT|DELETE|APPROVE|EXPORT)$/)
    .transform((key) => {
      const [module, subModule, action] = key.split('::');
      return {
        module,
        subModule: subModule === '*' ? null : subModule,
        action: action as 'VIEW' | 'CREATE' | 'EDIT' | 'DELETE' | 'APPROVE' | 'EXPORT',
        allowed: true,
      };
    }),
]);

const roleSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(300).optional().nullable(),
  roleType: z.enum(['ADMIN', 'ACCOUNTANT', 'SALES', 'CUSTOM']).default('CUSTOM'),
  // optional branch-scoped role
  branchId: z.string().optional().nullable(),
  permissions: z.array(permissionInput).default([]),
});

async function upsertPermission(module: string, subModule: string | null, action: PermissionActionType) {
  const existing = await prisma.permission.findFirst({ where: { module, subModule, action } });
  if (existing) return existing;
  return prisma.permission.create({ data: { module, subModule, action } });
}

rolesRouter.get('/orgs/:orgId/roles', requirePermission('SETTINGS', PermissionAction.VIEW, 'Roles'), async (req, res) => {
  const accountId = req.tenant!.accountId;
  const orgId = String(req.params.orgId);
  if (orgId !== req.tenant!.orgId) return res.status(403).json({ error: 'orgId mismatch' });

  // First visit to any screen that lists roles materialises the standard set,
  // so the user-create dropdown is never just "Owner". Failure to seed must
  // not break listing what already exists.
  try {
    await ensureDefaultRoles(accountId, orgId, req.auth!.userId);
  } catch {
    /* listing continues with whatever roles exist */
  }

  const roles = await prisma.role.findMany({
    where: { accountId, orgId },
    include: {
      permissions: { include: { permission: true } },
    },
    orderBy: [{ name: 'asc' }],
  });

  const roleIds = roles.map((r) => r.id);
  const assignmentCounts = roleIds.length
    ? await prisma.userRoleAssignment.groupBy({
        by: ['roleId'],
        where: { accountId, orgId, roleId: { in: roleIds } },
        _count: { roleId: true },
      })
    : [];
  const countByRoleId = new Map<string, number>();
  for (const row of assignmentCounts) {
    countByRoleId.set(row.roleId, row._count.roleId);
  }

  const rolesWithCounts = roles.map((r) => ({
    ...r,
    assignedUsersCount: countByRoleId.get(r.id) || 0,
  }));

  res.json({ roles: rolesWithCounts });
});

rolesRouter.post('/orgs/:orgId/roles', requirePermission('SETTINGS', PermissionAction.CREATE, 'Roles'), async (req, res) => {
  const accountId = req.tenant!.accountId;
  const orgId = String(req.params.orgId);
  const createdByUserId = req.auth!.userId;
  if (orgId !== req.tenant!.orgId) return res.status(403).json({ error: 'orgId mismatch' });

  const body = roleSchema.parse(req.body);

  const role = await prisma.role.create({
    data: {
      accountId,
      orgId,
      branchId: body.branchId ?? null,
      name: body.name,
      description: body.description ?? null,
      roleType: body.roleType,
      createdByUserId,
    },
  });

  for (const p of body.permissions) {
    const perm = await upsertPermission(p.module.trim(), p.subModule ? p.subModule.trim() : null, p.action as PermissionAction);
    await prisma.rolePermission.create({
      data: {
        accountId,
        orgId,
        roleId: role.id,
        permissionId: perm.id,
        allowed: Boolean(p.allowed),
      },
    });
  }

  const full = await prisma.role.findUnique({ where: { id: role.id }, include: { permissions: { include: { permission: true } } } });
  res.status(201).json({ role: full });
});

rolesRouter.patch('/orgs/:orgId/roles/:roleId', requirePermission('SETTINGS', PermissionAction.EDIT, 'Roles'), async (req, res) => {
  const accountId = req.tenant!.accountId;
  const orgId = String(req.params.orgId);
  const roleId = String(req.params.roleId);
  if (orgId !== req.tenant!.orgId) return res.status(403).json({ error: 'orgId mismatch' });

  const body = roleSchema.partial().parse(req.body);

  const role = await prisma.role.findFirst({ where: { id: roleId, accountId, orgId } });
  if (!role) return res.status(404).json({ error: 'Role not found' });

  await prisma.role.update({
    where: { id: roleId },
    data: {
      ...('name' in body ? { name: body.name } : {}),
      ...('description' in body ? { description: body.description ?? null } : {}),
      ...('roleType' in body ? { roleType: body.roleType } : {}),
      ...('branchId' in body ? { branchId: body.branchId ?? null } : {}),
    },
  });

  if ('permissions' in body && body.permissions) {
    // Replace permissions set for clarity (transaction safe in production)
    await prisma.rolePermission.deleteMany({ where: { roleId } });

    for (const p of body.permissions) {
      const perm = await upsertPermission(p.module.trim(), p.subModule ? p.subModule.trim() : null, p.action as PermissionAction);
      await prisma.rolePermission.create({
        data: {
          accountId,
          orgId,
          roleId,
          permissionId: perm.id,
          allowed: Boolean(p.allowed),
        },
      });
    }
  }

  const full = await prisma.role.findUnique({ where: { id: roleId }, include: { permissions: { include: { permission: true } } } });
  res.json({ role: full });
});
