import { prisma } from '../utils/prisma.js';
import { ROLE_PRESETS, expandPreset, permKey } from '../constants/permissionCatalog.js';
import { ensurePermissionCatalog } from '../routes/permissions.js';

/**
 * Seeds the standard roles for an organisation — requirement: the user-create
 * screen offered only "Owner", because nothing ever created anything else.
 *
 * One role per preset (Administrator, Accountant, Sales User, Store Keeper,
 * Viewer), each granted its preset's permissions. Idempotent by name, and the
 * grants are written ONLY when the role is first created: an administrator who
 * later trims the Accountant role must not find the preset silently restored
 * on the next visit to the users screen. Deleting a seeded role is likewise
 * respected — a name that has been used and removed is not resurrected.
 */

const PRESET_ROLE_TYPE: Record<string, string> = {
  ADMIN: 'ADMIN',
  ACCOUNTANT: 'ACCOUNTANT',
  SALES: 'SALES',
  STORE: 'CUSTOM',
  VIEWER: 'CUSTOM',
};

export async function ensureDefaultRoles(accountId: string, orgId: string, userId: string) {
  const existing = await prisma.role.findMany({
    where: { accountId, orgId, branchId: null },
    select: { name: true },
  });
  const have = new Set(existing.map((r) => r.name.toLowerCase()));

  const missing = Object.entries(ROLE_PRESETS).filter(([, p]) => !have.has(p.label.toLowerCase()));
  if (!missing.length) return;

  await ensurePermissionCatalog();
  const permissions = await prisma.permission.findMany({
    select: { id: true, module: true, subModule: true, action: true },
  });
  const idByKey = new Map(permissions.map((p) => [permKey(p.module, p.subModule, p.action), p.id]));

  for (const [presetKey, preset] of missing) {
    const rows = expandPreset(presetKey);
    try {
      await prisma.$transaction(async (tx) => {
        const role = await tx.role.create({
          data: {
            accountId,
            orgId,
            branchId: null,
            name: preset.label,
            description: preset.description,
            roleType: PRESET_ROLE_TYPE[presetKey] || 'CUSTOM',
            createdByUserId: userId,
          },
        });
        for (const r of rows) {
          const permissionId = idByKey.get(permKey(r.module, r.subModule, r.action));
          if (!permissionId) continue;
          await tx.rolePermission.create({
            data: { accountId, orgId, roleId: role.id, permissionId, allowed: true, permLevel: 0 },
          });
        }
      });
    } catch {
      // A concurrent request seeded the same role first; the unique index on
      // (orgId, branchId, name) makes that harmless.
    }
  }
}
