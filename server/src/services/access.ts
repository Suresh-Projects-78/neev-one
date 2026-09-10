import { prisma } from '../utils/prisma.js';
import { permKey } from '../constants/permissionCatalog.js';
import { RoleType } from '../constants/enums.js';

/**
 * The field level an administrator holds.
 *
 * Higher than anything the catalogue declares, so a level added later does not
 * silently start stripping fields from the account owner's own requests.
 */
const ADMIN_FIELD_LEVEL = 99;

/**
 * One place that answers "what may this user do here".
 *
 * Every caller — the requirePermission middleware, /permissions/me, and the
 * write-time field filter — resolves through this, so direct role assignments
 * and role profiles can never drift apart.
 */

export type EffectiveAccess = {
  roleIds: string[];
  /** "MODULE::Resource::ACTION" */
  permissions: Set<string>;
  /** Highest field level granted per "MODULE::Resource::ACTION". */
  levels: Map<string, number>;
};

/** Role ids from direct assignments plus every role inside assigned profiles. */
export async function resolveRoleIds(accountId: string, orgId: string, userId: string, branchId?: string) {
  const direct = await prisma.userRoleAssignment.findMany({
    where: {
      accountId,
      orgId,
      userId,
      ...(branchId ? { OR: [{ branchId: null }, { branchId }] } : {}),
    },
    select: { roleId: true },
  });

  const profileAssignments = await prisma.userRoleProfile.findMany({
    where: {
      accountId,
      orgId,
      userId,
      ...(branchId ? { OR: [{ branchId: null }, { branchId }] } : {}),
    },
    select: { profileId: true },
  });

  let fromProfiles: Array<{ roleId: string }> = [];
  if (profileAssignments.length) {
    fromProfiles = await prisma.roleProfileRole.findMany({
      where: { accountId, orgId, profileId: { in: profileAssignments.map((p) => p.profileId) } },
      select: { roleId: true },
    });
  }

  return Array.from(new Set([...direct, ...fromProfiles].map((r) => r.roleId)));
}

export async function resolveAccess(
  accountId: string,
  orgId: string,
  userId: string,
  branchId?: string
): Promise<EffectiveAccess> {
  const roleIds = await resolveRoleIds(accountId, orgId, userId, branchId);

  if (!roleIds.length) {
    return { roleIds, permissions: new Set(), levels: new Map() };
  }

  const rows = await prisma.rolePermission.findMany({
    where: { roleId: { in: roleIds }, allowed: true },
    select: {
      permLevel: true,
      permission: { select: { module: true, subModule: true, action: true } },
    },
  });

  /*
   * An administrator holds every field level, not level 0.
   *
   * Grants are written at level 0 — the seeder has no reason to pick anything
   * else — while the catalogue puts an invoice's status, its discount and its
   * paid amount at level 1, so a clerk may raise an invoice without settling
   * it. `filterFieldsByLevel` then dropped those three fields from EVERY
   * request, the account owner's included, and the server fell back to its
   * default: every invoice raised through the product was stored as a Draft
   * whatever the screen said, and the discount and paid amount never arrived
   * at all.
   *
   * An ADMIN role is the one that is not meant to be restricted by anything,
   * so it carries the maximum level rather than the level somebody remembered
   * to type. Restricted roles are unaffected: they keep exactly the level they
   * were granted.
   */
  const adminRoles = await prisma.role.count({
    where: { id: { in: roleIds }, roleType: RoleType.ADMIN },
  });
  const isAdmin = adminRoles > 0;

  const permissions = new Set<string>();
  const levels = new Map<string, number>();

  for (const r of rows) {
    const k = permKey(r.permission.module, r.permission.subModule, r.permission.action);
    permissions.add(k);
    if (isAdmin) {
      levels.set(k, ADMIN_FIELD_LEVEL);
      continue;
    }
    // Several roles may grant the same permission at different levels; the
    // highest wins, exactly as overlapping roles are additive elsewhere.
    const current = levels.get(k) ?? 0;
    if (r.permLevel > current) levels.set(k, r.permLevel);
    else if (!levels.has(k)) levels.set(k, r.permLevel);
  }

  return { roleIds, permissions, levels };
}

/** The field level this user holds for a given permission. */
export function levelFor(access: EffectiveAccess, module: string, resource: string, action: string) {
  return access.levels.get(permKey(module, resource, action)) ?? -1;
}

/**
 * Strips fields the caller may not write.
 *
 * Fields declared above level 0 in the catalog require a rule granting at least
 * that level. Rather than rejecting the whole request, the field is dropped and
 * reported, which matches how ERPNext ignores out-of-level fields.
 */
export function filterFieldsByLevel<T extends Record<string, any>>(
  body: T,
  fields: Array<{ key: string; permLevel?: number }> | undefined,
  grantedLevel: number
): { value: T; stripped: string[] } {
  if (!fields?.length) return { value: body, stripped: [] };

  const stripped: string[] = [];
  const value: Record<string, any> = { ...body };

  for (const f of fields) {
    const required = Number(f.permLevel || 0);
    if (required <= 0) continue;
    if (grantedLevel >= required) continue;
    if (value[f.key] === undefined) continue;
    delete value[f.key];
    stripped.push(f.key);
  }

  return { value: value as T, stripped };
}

/** Document-level restrictions for a user, keyed by entity type. */
export async function resolveUserPermissions(accountId: string, orgId: string, userId: string) {
  const rows = await prisma.userPermission.findMany({
    where: { accountId, orgId, userId },
    select: { entityType: true, entityId: true },
  });

  const byType = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!byType.has(r.entityType)) byType.set(r.entityType, new Set());
    byType.get(r.entityType)!.add(r.entityId);
  }
  return byType;
}

/**
 * True when the user may touch this document.
 *
 * A user with no restriction rows for an entity type is unrestricted on it —
 * the same default as ERPNext, where User Permissions narrow rather than grant.
 */
export function allowsEntity(byType: Map<string, Set<string>>, entityType: string, entityId?: string | null) {
  const allowed = byType.get(entityType);
  if (!allowed || allowed.size === 0) return true;
  if (!entityId) return false;
  return allowed.has(String(entityId));
}
