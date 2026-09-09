import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';

import { prisma } from '../utils/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { requireTenantContext } from '../middleware/tenantContext.js';
import { requirePermission } from '../middleware/rbac.js';
import { PermissionAction } from '../constants/enums.js';

/**
 * Two masters that were only ever in the browser, and both of which something
 * else reads.
 *
 * A fixed asset appears on the balance sheet and a salesman is the axis of the
 * Sales by Salesman report — so holding either in one machine's localStorage
 * did not make a feature incomplete, it made the same company show different
 * figures on different machines. That is the reason these have a table now and
 * discount rules and cost centres, which nothing reports on, still do not.
 */
export const orgMastersRouter = Router();
orgMastersRouter.use(requireAuth, requireTenantContext);

const orgOk = (req: any, res: any) => {
  if (String(req.params.orgId) !== req.tenant!.orgId) {
    res.status(403).json({ error: 'orgId mismatch' });
    return false;
  }
  return true;
};

const dec = (v: number | null | undefined) =>
  v === null || v === undefined ? null : new Prisma.Decimal(Number(v).toFixed(2));

/* ------------------------------------------------------------------ salesmen */

const salesmanSchema = z.object({
  code: z.string().max(40).optional().nullable(),
  name: z.string().min(1).max(120),
  email: z.string().max(200).optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  commissionRate: z.number().min(0).max(100).optional(),
  isActive: z.boolean().optional(),
  notes: z.string().max(1000).optional().nullable(),
});

const SALESMAN_VIEW = requirePermission('MASTERS', PermissionAction.VIEW, 'Salesmen');
const SALESMAN_EDIT = requirePermission('MASTERS', PermissionAction.CREATE, 'Salesmen');

orgMastersRouter.get('/orgs/:orgId/salesmen', SALESMAN_VIEW, async (req, res) => {
  if (!orgOk(req, res)) return;
  const { accountId, orgId } = req.tenant!;
  const rows = await prisma.salesman.findMany({ where: { accountId, orgId }, orderBy: { name: 'asc' } });
  res.json({ salesmen: rows.map((r) => ({ ...r, commissionRate: Number(r.commissionRate) })) });
});

orgMastersRouter.post('/orgs/:orgId/salesmen', SALESMAN_EDIT, async (req, res) => {
  if (!orgOk(req, res)) return;
  const { accountId, orgId } = req.tenant!;
  const body = salesmanSchema.parse(req.body);
  try {
    const row = await prisma.salesman.create({
      data: {
        accountId,
        orgId,
        code: body.code ?? null,
        name: body.name.trim(),
        email: body.email ?? null,
        phone: body.phone ?? null,
        commissionRate: dec(body.commissionRate ?? 0)!,
        isActive: body.isActive ?? true,
        notes: body.notes ?? null,
        createdByUserId: req.auth!.userId,
      },
    });
    res.status(201).json({ salesman: { ...row, commissionRate: Number(row.commissionRate) } });
  } catch (e: any) {
    if (String(e?.code) === 'P2002') return res.status(409).json({ error: 'A salesman with that name already exists' });
    throw e;
  }
});

orgMastersRouter.patch('/orgs/:orgId/salesmen/:id', SALESMAN_EDIT, async (req, res) => {
  if (!orgOk(req, res)) return;
  const { accountId, orgId } = req.tenant!;
  const existing = await prisma.salesman.findFirst({ where: { id: String(req.params.id), accountId, orgId } });
  if (!existing) return res.status(404).json({ error: 'Salesman not found' });

  const body = salesmanSchema.partial().parse(req.body);
  const row = await prisma.salesman.update({
    where: { id: existing.id },
    data: {
      ...(body.code !== undefined ? { code: body.code ?? null } : {}),
      ...(body.name !== undefined ? { name: body.name.trim() } : {}),
      ...(body.email !== undefined ? { email: body.email ?? null } : {}),
      ...(body.phone !== undefined ? { phone: body.phone ?? null } : {}),
      ...(body.commissionRate !== undefined ? { commissionRate: dec(body.commissionRate)! } : {}),
      ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      ...(body.notes !== undefined ? { notes: body.notes ?? null } : {}),
    },
  });
  res.json({ salesman: { ...row, commissionRate: Number(row.commissionRate) } });
});

/*
 * Deactivated, never deleted: documents already carry the salesman, and
 * removing the row would leave those documents pointing at nothing and the
 * commission history unexplainable.
 */
orgMastersRouter.delete('/orgs/:orgId/salesmen/:id', SALESMAN_EDIT, async (req, res) => {
  if (!orgOk(req, res)) return;
  const { accountId, orgId } = req.tenant!;
  const existing = await prisma.salesman.findFirst({ where: { id: String(req.params.id), accountId, orgId } });
  if (!existing) return res.status(404).json({ error: 'Salesman not found' });
  const row = await prisma.salesman.update({ where: { id: existing.id }, data: { isActive: false } });
  res.json({ salesman: { ...row, commissionRate: Number(row.commissionRate) }, deactivated: true });
});

/* -------------------------------------------------------------- fixed assets */

const assetSchema = z.object({
  code: z.string().max(40).optional().nullable(),
  name: z.string().min(1).max(160),
  category: z.string().max(80).optional().nullable(),
  purchaseDate: z.string().min(1),
  cost: z.number().nonnegative(),
  salvageValue: z.number().nonnegative().optional(),
  depreciationMethod: z.enum(['SLM', 'WDV']).optional(),
  depreciationRate: z.number().min(0).max(100).optional(),
  usefulLifeYears: z.number().int().min(0).max(100).optional().nullable(),
  accumulatedDepreciation: z.number().nonnegative().optional(),
  status: z.enum(['ACTIVE', 'DISPOSED', 'WRITTEN_OFF']).optional(),
  disposalDate: z.string().optional().nullable(),
  disposalValue: z.number().optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

const ASSET_VIEW = requirePermission('ACCOUNTING', PermissionAction.VIEW, 'Ledger');
const ASSET_EDIT = requirePermission('ACCOUNTING', PermissionAction.CREATE, 'Ledger');

const outAsset = (r: any) => ({
  ...r,
  cost: Number(r.cost),
  salvageValue: Number(r.salvageValue),
  depreciationRate: Number(r.depreciationRate),
  accumulatedDepreciation: Number(r.accumulatedDepreciation),
  disposalValue: r.disposalValue === null ? null : Number(r.disposalValue),
  /* What the balance sheet carries it at. Derived, never stored. */
  netBlock: Number(r.cost) - Number(r.accumulatedDepreciation),
});

orgMastersRouter.get('/orgs/:orgId/fixed-assets', ASSET_VIEW, async (req, res) => {
  if (!orgOk(req, res)) return;
  const { accountId, orgId } = req.tenant!;
  const rows = await prisma.fixedAsset.findMany({ where: { accountId, orgId }, orderBy: { purchaseDate: 'desc' } });
  res.json({ assets: rows.map(outAsset) });
});

orgMastersRouter.post('/orgs/:orgId/fixed-assets', ASSET_EDIT, async (req, res) => {
  if (!orgOk(req, res)) return;
  const { accountId, orgId, branchId } = req.tenant!;
  const body = assetSchema.parse(req.body);
  const row = await prisma.fixedAsset.create({
    data: {
      accountId,
      orgId,
      branchId,
      code: body.code ?? null,
      name: body.name.trim(),
      category: body.category ?? null,
      purchaseDate: body.purchaseDate,
      cost: dec(body.cost)!,
      salvageValue: dec(body.salvageValue ?? 0)!,
      depreciationMethod: body.depreciationMethod || 'SLM',
      depreciationRate: dec(body.depreciationRate ?? 0)!,
      usefulLifeYears: body.usefulLifeYears ?? null,
      accumulatedDepreciation: dec(body.accumulatedDepreciation ?? 0)!,
      status: body.status || 'ACTIVE',
      disposalDate: body.disposalDate ?? null,
      disposalValue: dec(body.disposalValue ?? null),
      notes: body.notes ?? null,
      createdByUserId: req.auth!.userId,
    },
  });
  res.status(201).json({ asset: outAsset(row) });
});

orgMastersRouter.patch('/orgs/:orgId/fixed-assets/:id', ASSET_EDIT, async (req, res) => {
  if (!orgOk(req, res)) return;
  const { accountId, orgId } = req.tenant!;
  const existing = await prisma.fixedAsset.findFirst({ where: { id: String(req.params.id), accountId, orgId } });
  if (!existing) return res.status(404).json({ error: 'Asset not found' });

  const b = assetSchema.partial().parse(req.body);
  const row = await prisma.fixedAsset.update({
    where: { id: existing.id },
    data: {
      ...(b.code !== undefined ? { code: b.code ?? null } : {}),
      ...(b.name !== undefined ? { name: b.name.trim() } : {}),
      ...(b.category !== undefined ? { category: b.category ?? null } : {}),
      ...(b.purchaseDate !== undefined ? { purchaseDate: b.purchaseDate } : {}),
      ...(b.cost !== undefined ? { cost: dec(b.cost)! } : {}),
      ...(b.salvageValue !== undefined ? { salvageValue: dec(b.salvageValue)! } : {}),
      ...(b.depreciationMethod !== undefined ? { depreciationMethod: b.depreciationMethod } : {}),
      ...(b.depreciationRate !== undefined ? { depreciationRate: dec(b.depreciationRate)! } : {}),
      ...(b.usefulLifeYears !== undefined ? { usefulLifeYears: b.usefulLifeYears ?? null } : {}),
      ...(b.accumulatedDepreciation !== undefined
        ? { accumulatedDepreciation: dec(b.accumulatedDepreciation)! }
        : {}),
      ...(b.status !== undefined ? { status: b.status } : {}),
      ...(b.disposalDate !== undefined ? { disposalDate: b.disposalDate ?? null } : {}),
      ...(b.disposalValue !== undefined ? { disposalValue: dec(b.disposalValue ?? null) } : {}),
      ...(b.notes !== undefined ? { notes: b.notes ?? null } : {}),
    },
  });
  res.json({ asset: outAsset(row) });
});

export default orgMastersRouter;
