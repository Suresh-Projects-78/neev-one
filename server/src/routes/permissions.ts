import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { requireTenantContext } from '../middleware/tenantContext.js';
import { requirePermission } from '../middleware/rbac.js';
import { resolveAccess, resolveUserPermissions } from '../services/access.js';
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
      select: { permLevel: true, permission: { select: { module: true, subModule: true, action: true } } },
    });

    const levels: Record<string, number> = {};
    for (const r of rows) {
      if (r.permLevel > 0) levels[permKey(r.permission.module, r.permission.subModule, r.permission.action)] = r.permLevel;
    }

    res.json({
      role,
      permissions: rows.map((r) => permKey(r.permission.module, r.permission.subModule, r.permission.action)),
      levels,
    });
  }
);

const putPermissionsSchema = z.object({
  // Wire keys: "MODULE::Resource::ACTION"
  permissions: z.array(z.string().min(3)),
  // Optional field level per key; absent means level 0.
  levels: z.record(z.number().int().min(0).max(9)).optional(),
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
      select: { id: true, permissionId: true, allowed: true, permLevel: true },
    });
    const currentByPermId = new Map(current.map((c) => [c.permissionId, c]));

    await prisma.$transaction(async (tx) => {
      const levelByPermId = new Map<string, number>();
      for (const [k, lvl] of Object.entries(body.levels || {})) {
        const id = idByKey.get(k);
        if (id) levelByPermId.set(id, Number(lvl) || 0);
      }

      for (const permissionId of wantedIds) {
        const existing = currentByPermId.get(permissionId);
        const permLevel = levelByPermId.get(permissionId) ?? 0;
        if (!existing) {
          await tx.rolePermission.create({
            data: { accountId, orgId, roleId: role.id, permissionId, allowed: true, permLevel },
          });
        } else if (!existing.allowed || existing.permLevel !== permLevel) {
          await tx.rolePermission.update({ where: { id: existing.id }, data: { allowed: true, permLevel } });
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
 * Lockout protection for the org creator.
 *
 * Two distinct cases, deliberately kept apart:
 *  1. The creator's ADMIN role holds nothing yet (a pre-catalog org, or a fresh
 *     bootstrap that failed): grant the whole Administrator preset once.
 *  2. Otherwise only re-grant the handful of administration permissions needed
 *     to reach this screen again. Re-applying the full preset on every load
 *     would silently undo a deliberate reduction the admin just saved.
 */
const LOCKOUT_GUARD = [
  'SETTINGS::Roles::VIEW',
  'SETTINGS::Roles::EDIT',
  'SETTINGS::Users::VIEW',
];

async function syncOwnerRoleIfCreator(accountId: string, orgId: string, userId: string) {
  const org = await prisma.org.findFirst({ where: { accountId, id: orgId }, select: { createdByUserId: true } });
  if (!org || org.createdByUserId !== userId) return;

  const adminAssignment = await prisma.userRoleAssignment.findFirst({
    where: { accountId, orgId, userId, role: { roleType: 'ADMIN' } },
    select: { roleId: true },
  });
  if (!adminAssignment) return;

  const held = await prisma.rolePermission.findMany({
    where: { roleId: adminAssignment.roleId, allowed: true },
    select: { permission: { select: { module: true, subModule: true, action: true } } },
  });
  const heldKeys = new Set(held.map((h) => permKey(h.permission.module, h.permission.subModule, h.permission.action)));

  const wanted = heldKeys.size === 0
    ? new Set(expandPreset('ADMIN').map((r) => permKey(r.module, r.subModule, r.action)))
    : new Set(LOCKOUT_GUARD);

  const missing = [...wanted].filter((k) => !heldKeys.has(k));
  if (missing.length === 0) return;

  await ensurePermissionCatalog();
  const permissions = await prisma.permission.findMany({
    select: { id: true, module: true, subModule: true, action: true },
  });

  for (const p of permissions) {
    const k = permKey(p.module, p.subModule, p.action);
    if (!wanted.has(k) || heldKeys.has(k)) continue;
    try {
      await prisma.rolePermission.create({
        data: { accountId, orgId, roleId: adminAssignment.roleId, permissionId: p.id, allowed: true },
        select: { id: true },
      });
    } catch (err: any) {
      if (String(err?.code || '') !== 'P2002') throw err;
    }
  }
}

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

  // Orgs created before the catalog existed hold a hand-written subset on their
  // Owner role, which would hide most of the product from the person who owns
  // it. Bring the creator's ADMIN role up to the full preset, once.
  await syncOwnerRoleIfCreator(accountId, orgId, userId);

  const access = await resolveAccess(accountId, orgId, userId, branchId);

  const roles = access.roleIds.length
    ? await prisma.role.findMany({
        where: { id: { in: access.roleIds } },
        select: { id: true, name: true, roleType: true },
      })
    : [];

  const profiles = await prisma.userRoleProfile.findMany({
    where: { accountId, orgId, userId },
    select: { profile: { select: { id: true, name: true } } },
  });

  const permissions = Array.from(access.permissions).sort();
  const levels: Record<string, number> = {};
  for (const [k, v] of access.levels) if (v > 0) levels[k] = v;

  const userPermissions = await resolveUserPermissions(accountId, orgId, userId);
  const restrictionsByType: Record<string, string[]> = {};
  for (const [type, ids] of userPermissions) restrictionsByType[type] = Array.from(ids);

  const branches = await prisma.userBranchMembership.findMany({
    where: { accountId, orgId, userId },
    select: { branchId: true },
  });
  const warehouses = await prisma.userWarehouseAccess.findMany({
    where: { accountId, orgId, userId },
    select: { warehouseId: true },
  });

  res.json({
    roles,
    profiles: profiles.map((p) => p.profile),
    permissions,
    // Highest field level held per permission; absent means level 0.
    levels,
    // Document-level restrictions, ERPNext's "User Permissions".
    restrictions: {
      branchIds: branches.map((b) => b.branchId),
      warehouseIds: warehouses.map((w) => w.warehouseId),
      ...restrictionsByType,
    },
  });
});
