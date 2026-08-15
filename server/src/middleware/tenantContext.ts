import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/prisma.js';

export type TenantContext = {
  accountId: string;
  orgId: string;
  branchId: string;
  allowedBranchIds: string[];
  warehouseId?: string;
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

  let allowedWarehouseIds: string[] = [];
  if (warehouseId) {
    const whAccess = await prisma.userWarehouseAccess.findFirst({
      where: { accountId, orgId, branchId, warehouseId, userId },
      select: { id: true },
    });
    if (!whAccess) return res.status(403).json({ error: 'No access to warehouse' });

    const allWh = await prisma.userWarehouseAccess.findMany({
      where: { accountId, orgId, userId },
      select: { warehouseId: true },
    });
    allowedWarehouseIds = allWh.map((x: { warehouseId: string }) => x.warehouseId);
  }

  req.tenant = {
    accountId,
    orgId,
    branchId,
    allowedBranchIds: allowed.map((x: { branchId: string }) => x.branchId),
    warehouseId: warehouseId || undefined,
    allowedWarehouseIds: allowedWarehouseIds.length ? allowedWarehouseIds : undefined,
  };

  next();
}
