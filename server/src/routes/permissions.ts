import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { requireTenantContext } from '../middleware/tenantContext.js';
import { requirePermission } from '../middleware/rbac.js';
import { PermissionAction } from '../constants/enums.js';
import {
  PERMISSION_CATALOG,
  ROLE_PRESETS,
  expandPreset,
  flattenCatalog,
  isKnownPermission,
  permKey,
} from '../constants/permissionCatalog.js';

export const permissionsRouter = Router();
permissionsRouter.use(requireAuth, requireTenantContext);

const requireOrgMatch = (req: any, res: any) => {
  if (String(req.params.orgId) !== req.tenant!.orgId) {
    res.status(403).json({ error: 'orgId mismatch' });
    return false;
  }
  return true;
};

/** Ensure a Permission row exists for every catalog entry. Idempotent. */
export async function ensurePermissionCatalog() {
  const existing = await prisma.permission.findMany({
    select: { id: true, module: true, subModule: true, action: true },
  });
  const seen = new Set(existing.map((p) => permKey(p.module, p.subModule, p.action)));

  const missing = flattenCatalog().filter((r) => !seen.has(permKey(r.module, r.subModule, r.action)));
  for (const m of missing) {
    try {
      await prisma.permission.create({ data: { module: m.module, subModule: m.subModule, action: m.action } });
    } catch (err: any) {
      // Unique constraint: another request seeded it first.
      if (String(err?.code || '') !== 'P2002') throw err;
    }
  }
  return missing.length;
}

/** The matrix scaffold the UI renders: modules -> resources -> actions. */
permissionsRouter.get(
  '/orgs/:orgId/permissions/catalog',
  requirePermission('SETTINGS', PermissionAction.VIEW, 'Roles'),
  async (req, res) => {
    if (!requireOrgMatch(req, res)) return;
    res.json({
      modules: PERMISSION_CATALOG,
      presets: Object.entries(ROLE_PRESETS).map(([key, p]) => ({
        key,
        label: p.label,
        description: p.description,
      })),
    });
  }
);

/** The permissions currently granted to one role, as wire keys. */
permissionsRouter.get(
  '/orgs/:orgId/roles/:roleId/permissions',
  requirePermission('SETTINGS', PermissionAction.VIEW, 'Roles'),
  async (req, res) => {
    if (!requireOrgMatch(req, res)) return;
    const accountId = req.tenant!.accountId;
    const roleId = String(req.params.roleId);

    const role = await prisma.role.findFirst({
      where: { id: roleId, accountId, orgId: req.tenant!.orgId },
      select: { id: true, name: true, roleType: true, description: true },
    });
    if (!role) return res.status(404).json({ error: 'Role not found' });

    const rows = await prisma.rolePermission.findMany({
      where: { roleId: role.id, allowed: true },
      select: { permission: { select: { module: true, subModule: true, action: true } } },
    });

    res.json({
      role,
      permissions: rows.map((r) => permKey(r.permission.module, r.permission.subModule, r.permission.action)),
    });
  }
);

const putPermissionsSchema = z.object({
  // Wire keys: "MODULE::Resource::ACTION"
  permissions: z.array(z.string().min(3)),
});

/**
 * Replace a role's permission set wholesale. The matrix UI submits the full
 * checked set, so this diffs rather than clearing and re-inserting: keeping the
 * untouched rows means a concurrent grant is not silently dropped mid-save.
 */
permissionsRouter.put(
  '/orgs/:orgId/roles/:roleId/permissions',
  requirePermission('SETTINGS', PermissionAction.EDIT, 'Roles'),
  async (req, res) => {
    if (!requireOrgMatch(req, res)) return;
    const accountId = req.tenant!.accountId;
    const orgId = req.tenant!.orgId;
    const roleId = String(req.params.roleId);

    const role = await prisma.role.findFirst({ where: { id: roleId, accountId, orgId }, select: { id: true, name: true } });
    if (!role) return res.status(404).json({ error: 'Role not found' });

    const body = putPermissionsSchema.parse(req.body);

    // Reject anything outside the catalog: a role must not hold a permission
    // that no route checks, and must not be a way to smuggle in new keys.
    const wanted: Array<{ module: string; subModule: string; action: string }> = [];
    for (const key of body.permissions) {
      const [module, subModule, action] = String(key).split('::');
      if (!module || !subModule || !action) return res.status(400).json({ error: `Malformed permission: ${key}` });
      if (!isKnownPermission(module, subModule, action)) {
        return res.status(400).json({ error: `Unknown permission: ${key}` });
      }
      wanted.push({ module, subModule, action });
    }

    await ensurePermissionCatalog();

    const permissions = await prisma.permission.findMany({
      select: { id: true, module: true, subModule: true, action: true },
    });
    const idByKey = new Map(permissions.map((p) => [permKey(p.module, p.subModule, p.action), p.id]));

    const wantedIds = new Set(
      wanted.map((w) => idByKey.get(permKey(w.module, w.subModule, w.action))).filter(Boolean) as string[]
    );

    const current = await prisma.rolePermission.findMany({
      where: { roleId: role.id },
      select: { id: true, permissionId: true, allowed: true },
    });
    const currentByPermId = new Map(current.map((c) => [c.permissionId, c]));

    await prisma.$transaction(async (tx) => {
      for (const permissionId of wantedIds) {
        const existing = currentByPermId.get(permissionId);
        if (!existing) {
          await tx.rolePermission.create({ data: { accountId, orgId, roleId: role.id, permissionId, allowed: true } });
        } else if (!existing.allowed) {
          await tx.rolePermission.update({ where: { id: existing.id }, data: { allowed: true } });
        }
      }
      const toRemove = current.filter((c) => !wantedIds.has(c.permissionId)).map((c) => c.id);
      if (toRemove.length) await tx.rolePermission.deleteMany({ where: { id: { in: toRemove } } });
    });

    await prisma.auditLog.create({
      data: {
        accountId,
        orgId,
        branchId: req.tenant!.branchId,
        entity: 'Role',
        entityId: role.id,
        action: 'PERMISSIONS',
        message: `Permissions updated for role ${role.name}: ${wantedIds.size} granted`,
        createdByUserId: req.auth!.userId,
      },
    });

    res.json({ ok: true, granted: wantedIds.size });
  }
);

const applyPresetSchema = z.object({ preset: z.string().min(1) });

/** Overwrite a role's permissions from a preset template. */
permissionsRouter.post(
  '/orgs/:orgId/roles/:roleId/permissions/preset',
  requirePermission('SETTINGS', PermissionAction.EDIT, 'Roles'),
  async (req, res) => {
    if (!requireOrgMatch(req, res)) return;
    const body = applyPresetSchema.parse(req.body);
    if (!ROLE_PRESETS[body.preset]) return res.status(400).json({ error: `Unknown preset: ${body.preset}` });

    const rows = expandPreset(body.preset);
    res.json({ permissions: rows.map((r) => permKey(r.module, r.subModule, r.action)) });
  }
);

/**
 * The effective permission set for the signed-in user in this org and branch,
 * plus the document-level restrictions (branch and warehouse) that scope it.
 * The client renders navigation and buttons from this.
 */
permissionsRouter.get('/orgs/:orgId/permissions/me', async (req, res) => {
  if (!requireOrgMatch(req, res)) return;
  const accountId = req.tenant!.accountId;
  const orgId = req.tenant!.orgId;
  const branchId = req.tenant!.branchId;
  const userId = req.auth!.userId;

  const assignments = await prisma.userRoleAssignment.findMany({
    where: { accountId, orgId, userId, OR: [{ branchId: null }, { branchId }] },
    select: { roleId: true, role: { select: { id: true, name: true, roleType: true } } },
  });

  const roleIds = assignments.map((a) => a.roleId);
  const rows = roleIds.length
    ? await prisma.rolePermission.findMany({
        where: { roleId: { in: roleIds }, allowed: true },
        select: { permission: { select: { module: true, subModule: true, action: true } } },
      })
    : [];

  const permissions = Array.from(
    new Set(rows.map((r) => permKey(r.permission.module, r.permission.subModule, r.permission.action)))
  ).sort();

  const branches = await prisma.userBranchMembership.findMany({
    where: { accountId, orgId, userId },
    select: { branchId: true },
  });
  const warehouses = await prisma.userWarehouseAccess.findMany({
    where: { accountId, orgId, userId },
    select: { warehouseId: true },
  });

  res.json({
    roles: assignments.map((a) => a.role),
    permissions,
    // Document-level restrictions, ERPNext's "User Permissions".
    restrictions: {
      branchIds: branches.map((b) => b.branchId),
      warehouseIds: warehouses.map((w) => w.warehouseId),
    },
  });
});
