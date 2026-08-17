import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/prisma.js';

export type TenantContext = {
  accountId: string;
  orgId: string;
  branchId: string;
  allowedBranchIds: string[];
  /** The warehouse the caller may use, when one was supplied and permitted. */
  warehouseId?: string;
  /** What the client asked for, permitted or not. */
  requestedWarehouseId?: string;
  allowedWarehouseIds?: string[];
};

declare module 'express-serve-static-core' {
  interface Request {
    tenant?: TenantContext;
  }
}

// Enforces the CRITICAL isolation rule:
// - user must belong to org
// - user must belong to branch
// - accountId must match everywhere
//
// You can choose token-bound org/branch, or header-bound org/branch.
// This implementation uses headers so user can switch org/branch without re-login:
//   x-org-id, x-branch-id
export async function requireTenantContext(req: Request, res: Response, next: NextFunction) {
  const accountId = String(req.auth?.accountId || '').trim();
  const userId = String(req.auth?.userId || '').trim();
  const orgId = String(req.headers['x-org-id'] || '').trim();
  const branchId = String(req.headers['x-branch-id'] || '').trim();
  const warehouseId = String(req.headers['x-warehouse-id'] || '').trim();

  if (!accountId || !userId) return res.status(401).json({ error: 'Missing auth context' });
  if (!orgId) return res.status(400).json({ error: 'Missing x-org-id' });
  if (!branchId) return res.status(400).json({ error: 'Missing x-branch-id' });

  const orgMember = await prisma.userOrgMembership.findFirst({
    where: { accountId, orgId, userId },
    select: { id: true },
  });
  if (!orgMember) return res.status(403).json({ error: 'No access to org' });

  const branchMember = await prisma.userBranchMembership.findFirst({
    where: { accountId, orgId, branchId, userId },
    select: { id: true },
  });
  if (!branchMember) return res.status(403).json({ error: 'No access to branch' });

  const allowed = await prisma.userBranchMembership.findMany({
    where: { accountId, orgId, userId },
    select: { branchId: true },
  });

  // Warehouse is resolved but NOT enforced here.
  //
  // The header is sent by the client on almost every request, including ones
  // that have nothing to do with stock — the ledger, approvals, settings.
  // Rejecting those because the user lacks access to whichever warehouse
  // happened to be selected produced 'No access to warehouse' on a trial
  // balance. Routes that genuinely act on a warehouse call requireWarehouse
  // below, which is where the check belongs.
  let allowedWarehouseIds: string[] = [];
  let resolvedWarehouseId: string | undefined;

  if (warehouseId) {
    const allWh = await prisma.userWarehouseAccess.findMany({
      where: { accountId, orgId, userId },
      select: { warehouseId: true },
    });
    allowedWarehouseIds = allWh.map((x: { warehouseId: string }) => x.warehouseId);

    // The org creator reaches every warehouse in their own organisation.
    //
    // Warehouse access is only ever granted by an administrator assigning it to
    // somebody else, so the creator of a brand-new company had none: they could
    // create a warehouse and then be told 'No access to warehouse' by every
    // stock route, with no way to grant it to themselves. This mirrors the
    // permission safety net in rbac.ts, and is deliberately narrow — it applies
    // to the creator of this org and to nobody else.
    if (!allowedWarehouseIds.includes(warehouseId)) {
      const org = await prisma.org.findFirst({
        where: { accountId, id: orgId },
        select: { createdByUserId: true },
      });
      if (org?.createdByUserId === userId) {
        const inOrg = await prisma.warehouse.findFirst({
          where: { id: warehouseId, accountId, orgId },
          select: { id: true },
        });
        if (inOrg) allowedWarehouseIds = [...allowedWarehouseIds, warehouseId];
      }
    }

    // Only treat it as the active warehouse when the user may actually use it.
    if (allowedWarehouseIds.includes(warehouseId)) resolvedWarehouseId = warehouseId;
  }

  req.tenant = {
    accountId,
    orgId,
    branchId,
    allowedBranchIds: allowed.map((x: { branchId: string }) => x.branchId),
    warehouseId: resolvedWarehouseId,
    requestedWarehouseId: warehouseId || undefined,
    allowedWarehouseIds: allowedWarehouseIds.length ? allowedWarehouseIds : undefined,
  };

  next();
}

/**
 * Enforces warehouse access, for routes that actually operate on stock.
 *
 * Kept separate from requireTenantContext so a stray header cannot break
 * unrelated requests, while a stock movement still cannot be posted into a
 * warehouse the user has no rights to.
 */
export function requireWarehouse(req: Request, res: Response, next: NextFunction) {
  const requested = req.tenant?.requestedWarehouseId;
  if (!requested) return res.status(400).json({ error: 'Missing x-warehouse-id' });
  if (!req.tenant?.warehouseId) return res.status(403).json({ error: 'No access to warehouse' });
  return next();
}
