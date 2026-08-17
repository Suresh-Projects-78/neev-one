import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { requireTenantContext } from '../middleware/tenantContext.js';
import { requirePermission } from '../middleware/rbac.js';
import { PermissionAction } from '../constants/enums.js';
import { validateGstinOrThrow } from '../utils/gstin.js';
import { allowsEntity, resolveUserPermissions } from '../services/access.js';

/**
 * Customers and vendors.
 *
 * Both live in one `Party` table: in practice the same business is often both,
 * and splitting them duplicates every GSTIN, address and contact rule.
 * `partyType` decides which lists it appears in.
 */
export const partiesRouter = Router();
partiesRouter.use(requireAuth, requireTenantContext);

/** Routes are declared per party type so permissions stay legible. */
const RESOURCE = { CUSTOMER: 'Customers', VENDOR: 'Vendors' } as const;
type PartyKind = keyof typeof RESOURCE;

const orgOk = (req: any, res: any) => {
  if (String(req.params.orgId) !== req.tenant!.orgId) {
    res.status(403).json({ error: 'orgId mismatch' });
    return false;
  }
  return true;
};

const addressFields = {
  billingLine1: z.string().max(250).optional().nullable(),
  billingLine2: z.string().max(250).optional().nullable(),
  billingCity: z.string().max(100).optional().nullable(),
  billingState: z.string().max(100).optional().nullable(),
  billingPincode: z.string().max(12).optional().nullable(),
  billingCountry: z.string().max(100).optional().nullable(),
  shippingSameAsBilling: z.boolean().optional(),
  shippingLine1: z.string().max(250).optional().nullable(),
  shippingLine2: z.string().max(250).optional().nullable(),
  shippingCity: z.string().max(100).optional().nullable(),
  shippingState: z.string().max(100).optional().nullable(),
  shippingPincode: z.string().max(12).optional().nullable(),
  shippingCountry: z.string().max(100).optional().nullable(),
};

const partySchema = z.object({
  code: z.string().max(40).optional().nullable(),
  name: z.string().min(1).max(200),
  legalName: z.string().max(200).optional().nullable(),
  gstin: z.string().max(15).optional().nullable(),
  gstRegistrationType: z.enum(['REGULAR', 'COMPOSITION', 'UNREGISTERED']).optional(),
  pan: z.string().max(10).optional().nullable(),
  placeOfSupplyState: z.string().max(100).optional().nullable(),
  email: z.string().email().max(200).optional().nullable().or(z.literal('')),
  phone: z.string().max(30).optional().nullable(),
  contactPerson: z.string().max(120).optional().nullable(),
  paymentTermDays: z.number().int().min(0).max(365).optional(),
  paymentTermName: z.string().max(60).optional().nullable(),
  creditLimit: z.number().nonnegative().optional().nullable(),
  openingBalance: z.number().optional(),
  openingBalanceType: z.enum(['DR', 'CR']).optional(),
  notes: z.string().max(1000).optional().nullable(),
  isActive: z.boolean().optional(),
  alsoOtherType: z.boolean().optional(),
  ...addressFields,
});

const toDecimal = (v: number | null | undefined) =>
  v === null || v === undefined ? null : new Prisma.Decimal(Number(v).toFixed(2));

const normalize = (row: any) => ({
  ...row,
  creditLimit: row.creditLimit === null ? null : Number(row.creditLimit),
  openingBalance: Number(row.openingBalance ?? 0),
});

/** Both list and single reads honour document restrictions. */
async function assertAllowed(req: any, kind: PartyKind, partyId?: string | null) {
  const restrictions = await resolveUserPermissions(req.tenant.accountId, req.tenant.orgId, req.auth.userId);
  return allowsEntity(restrictions, kind, partyId);
}

function register(kind: PartyKind, basePath: string) {
  const resource = RESOURCE[kind];
  const VIEW = requirePermission('MASTERS', PermissionAction.VIEW, resource);
  const CREATE = requirePermission('MASTERS', PermissionAction.CREATE, resource);
  const EDIT = requirePermission('MASTERS', PermissionAction.EDIT, resource);
  const DELETE = requirePermission('MASTERS', PermissionAction.DELETE, resource);

  // A party of type BOTH belongs in both lists.
  const typeFilter = { partyType: { in: [kind, 'BOTH'] } };

  partiesRouter.get(`/orgs/:orgId/${basePath}`, VIEW, async (req, res) => {
    if (!orgOk(req, res)) return;
    const { accountId, orgId } = req.tenant!;
    const search = String(req.query.search || '').trim();
    const take = Math.min(500, Math.max(1, Number(req.query.limit || 200)));

    const rows = await prisma.party.findMany({
      where: {
        accountId,
        orgId,
        ...typeFilter,
        ...(String(req.query.includeInactive || '') === 'true' ? {} : { isActive: true }),
        ...(search
          ? {
              OR: [
                { name: { contains: search } },
                { code: { contains: search } },
                { gstin: { contains: search } },
                { phone: { contains: search } },
                { email: { contains: search } },
              ],
            }
          : {}),
      },
      orderBy: { name: 'asc' },
      take,
    });

    // Restricted users see only the parties they are permitted to.
    const restrictions = await resolveUserPermissions(accountId, orgId, req.auth!.userId);
    const visible = rows.filter((r) => allowsEntity(restrictions, kind, r.id));

    res.json({ [basePath]: visible.map(normalize) });
  });

  partiesRouter.get(`/orgs/:orgId/${basePath}/:partyId`, VIEW, async (req, res) => {
    if (!orgOk(req, res)) return;
    const { accountId, orgId } = req.tenant!;
    const row = await prisma.party.findFirst({
      where: { id: String(req.params.partyId), accountId, orgId, ...typeFilter },
    });
    if (!row) return res.status(404).json({ error: `${kind === 'CUSTOMER' ? 'Customer' : 'Vendor'} not found` });
    if (!(await assertAllowed(req, kind, row.id))) {
      return res.status(403).json({ error: 'You are not permitted to view this record' });
    }
    res.json({ party: normalize(row) });
  });

  partiesRouter.post(`/orgs/:orgId/${basePath}`, CREATE, async (req, res) => {
    if (!orgOk(req, res)) return;
    const { accountId, orgId } = req.tenant!;
    const body = partySchema.parse(req.body);

    if (body.gstin) {
      // Throws a 400-shaped error when the checksum or state code is wrong.
      validateGstinOrThrow(body.gstin, body.billingState || body.placeOfSupplyState || '');
    }

    const partyType = body.alsoOtherType ? 'BOTH' : kind;

    try {
      const created = await prisma.party.create({
        data: {
          accountId,
          orgId,
          partyType,
          code: body.code ?? null,
          name: body.name.trim(),
          legalName: body.legalName ?? null,
          gstin: body.gstin ? body.gstin.trim().toUpperCase() : null,
          gstRegistrationType: body.gstRegistrationType || (body.gstin ? 'REGULAR' : 'UNREGISTERED'),
          pan: body.pan ?? null,
          placeOfSupplyState: body.placeOfSupplyState ?? body.billingState ?? null,
          email: body.email ? String(body.email) : null,
          phone: body.phone ?? null,
          contactPerson: body.contactPerson ?? null,
          paymentTermDays: body.paymentTermDays ?? 0,
          paymentTermName: body.paymentTermName ?? null,
          creditLimit: toDecimal(body.creditLimit ?? null),
          openingBalance: new Prisma.Decimal(Number(body.openingBalance ?? 0).toFixed(2)),
          openingBalanceType: body.openingBalanceType || 'DR',
          notes: body.notes ?? null,
          isActive: body.isActive ?? true,
          billingLine1: body.billingLine1 ?? null,
          billingLine2: body.billingLine2 ?? null,
          billingCity: body.billingCity ?? null,
          billingState: body.billingState ?? null,
          billingPincode: body.billingPincode ?? null,
          billingCountry: body.billingCountry ?? 'India',
          shippingSameAsBilling: body.shippingSameAsBilling ?? true,
          shippingLine1: body.shippingLine1 ?? null,
          shippingLine2: body.shippingLine2 ?? null,
          shippingCity: body.shippingCity ?? null,
          shippingState: body.shippingState ?? null,
          shippingPincode: body.shippingPincode ?? null,
          shippingCountry: body.shippingCountry ?? null,
          createdByUserId: req.auth!.userId,
        },
      });
      res.status(201).json({ party: normalize(created) });
    } catch (err: any) {
      if (String(err?.code || '') === 'P2002') {
        return res.status(409).json({ error: 'A record with that name already exists' });
      }
      throw err;
    }
  });

  partiesRouter.patch(`/orgs/:orgId/${basePath}/:partyId`, EDIT, async (req, res) => {
    if (!orgOk(req, res)) return;
    const { accountId, orgId } = req.tenant!;
    const existing = await prisma.party.findFirst({
      where: { id: String(req.params.partyId), accountId, orgId, ...typeFilter },
    });
    if (!existing) return res.status(404).json({ error: 'Record not found' });
    if (!(await assertAllowed(req, kind, existing.id))) {
      return res.status(403).json({ error: 'You are not permitted to edit this record' });
    }

    const body = partySchema.partial().parse(req.body);
    if (body.gstin) {
      validateGstinOrThrow(body.gstin, body.billingState || existing.billingState || '');
    }

    const data: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body)) {
      if (v === undefined || k === 'alsoOtherType') continue;
      if (k === 'creditLimit') data[k] = toDecimal(v as number);
      else if (k === 'openingBalance') data[k] = new Prisma.Decimal(Number(v).toFixed(2));
      else if (k === 'gstin') data[k] = v ? String(v).trim().toUpperCase() : null;
      else if (k === 'name') data[k] = String(v).trim();
      else data[k] = v;
    }
    if (body.alsoOtherType === true) data.partyType = 'BOTH';
    if (body.alsoOtherType === false && existing.partyType === 'BOTH') data.partyType = kind;

    try {
      const updated = await prisma.party.update({ where: { id: existing.id }, data });
      res.json({ party: normalize(updated) });
    } catch (err: any) {
      if (String(err?.code || '') === 'P2002') {
        return res.status(409).json({ error: 'A record with that name already exists' });
      }
      throw err;
    }
  });

  /**
   * Soft delete. A party referenced by a posted document must not vanish, or
   * historical invoices lose the name they were issued to.
   */
  partiesRouter.delete(`/orgs/:orgId/${basePath}/:partyId`, DELETE, async (req, res) => {
    if (!orgOk(req, res)) return;
    const { accountId, orgId } = req.tenant!;
    const existing = await prisma.party.findFirst({
      where: { id: String(req.params.partyId), accountId, orgId, ...typeFilter },
    });
    if (!existing) return res.status(404).json({ error: 'Record not found' });

    const used = await prisma.$queryRawUnsafe<any[]>(
      `SELECT COUNT(*) AS n FROM Invoice WHERE accountId = ? AND orgId = ? AND customerId = ?`,
      accountId,
      orgId,
      existing.id
    );
    const inUse = Number(used?.[0]?.n || 0) > 0;

    if (inUse) {
      const deactivated = await prisma.party.update({
        where: { id: existing.id },
        data: { isActive: false },
      });
      return res.json({ ok: true, deactivated: true, party: normalize(deactivated) });
    }

    await prisma.party.delete({ where: { id: existing.id } });
    res.json({ ok: true, deactivated: false });
  });
}

register('CUSTOMER', 'customers');
register('VENDOR', 'vendors');

/**
 * Due date from the party's terms, computed on the server so the browser
 * cannot quietly extend credit.
 */
export function dueDateFor(dateIso: string, paymentTermDays: number) {
  const base = new Date(`${String(dateIso).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(base.getTime())) return null;
  base.setUTCDate(base.getUTCDate() + Math.max(0, Number(paymentTermDays) || 0));
  return base.toISOString().slice(0, 10);
}
