import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/prisma';
import { validateGstinOrThrow } from '../utils/gstin';
import { requireAuth } from '../middleware/auth';
import { requireTenantContext } from '../middleware/tenantContext';
import { requirePermission } from '../middleware/rbac';
import { PermissionAction } from '../constants/enums';

export const branchesRouter = Router();

// Uses tenant context headers for isolation.
branchesRouter.use(requireAuth, requireTenantContext);

const branchSchema = z.object({
  branchCode: z.string().min(1).max(20),
  branchName: z.string().min(1).max(200),
  addressLine1: z.string().min(1).max(250),
  addressLine2: z.string().max(250).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  state: z.string().min(1).max(100),
  country: z.string().min(1).max(100).default('India'),
  gstin: z.string().max(15).optional().nullable(),
  gstRegistrationType: z.enum(['REGULAR', 'COMPOSITION', 'UNREGISTERED']).default('UNREGISTERED'),
  phone: z.string().max(30).optional().nullable(),
  email: z.string().email().optional().nullable(),
  contactPerson: z.string().max(100).optional().nullable(),
  parentBranchId: z.string().optional().nullable(),
  shareHeadOfficeSettings: z.boolean().optional().default(false),
});

branchesRouter.get('/orgs/:orgId/branches', requirePermission('MASTERS', PermissionAction.VIEW, 'Company/Branch setup'), async (req, res) => {
  const accountId = req.tenant!.accountId;
  const orgId = String(req.params.orgId);

  if (orgId !== req.tenant!.orgId) return res.status(403).json({ error: 'orgId mismatch' });

  const rows = await prisma.branch.findMany({
    where: { accountId, orgId },
    orderBy: [{ branchCode: 'asc' }],
  });

  res.json({ branches: rows });
});

branchesRouter.post('/orgs/:orgId/branches', requirePermission('MASTERS', PermissionAction.CREATE, 'Company/Branch setup'), async (req, res) => {
  const accountId = req.tenant!.accountId;
  const userId = req.auth!.userId;
  const orgId = String(req.params.orgId);

  if (orgId !== req.tenant!.orgId) return res.status(403).json({ error: 'orgId mismatch' });

  const body = branchSchema.parse(req.body);

  // GST rules
  if (body.gstRegistrationType !== 'UNREGISTERED') {
    validateGstinOrThrow(String(body.gstin || ''), body.state);
  }

  const created = await prisma.branch.create({
    data: {
      accountId,
      orgId,
      branchCode: body.branchCode,
      branchName: body.branchName,
      addressLine1: body.addressLine1,
      addressLine2: body.addressLine2 ?? null,
      city: body.city ?? null,
      state: body.state,
      country: body.country,
      gstin: body.gstin ? String(body.gstin).toUpperCase() : null,
      gstRegistrationType: body.gstRegistrationType as any,
      phone: body.phone ?? null,
      email: body.email ?? null,
      contactPerson: body.contactPerson ?? null,
      parentBranchId: body.parentBranchId ?? null,
      shareHeadOfficeSettings: Boolean(body.shareHeadOfficeSettings),
      createdByUserId: userId,
    },
  });

  res.status(201).json({ branch: created });
});

branchesRouter.patch('/orgs/:orgId/branches/:branchId', requirePermission('MASTERS', PermissionAction.EDIT, 'Company/Branch setup'), async (req, res) => {
  const accountId = req.tenant!.accountId;
  const userId = req.auth!.userId;
  const orgId = String(req.params.orgId);
  const branchId = String(req.params.branchId);

  if (orgId !== req.tenant!.orgId) return res.status(403).json({ error: 'orgId mismatch' });

  const body = branchSchema.partial().parse(req.body);

  const existing = await prisma.branch.findFirst({
    where: { accountId, orgId, id: branchId },
  });
  if (!existing) return res.status(404).json({ error: 'Branch not found' });

  const nextState = body.state ?? existing.state;
  const nextGstin = body.gstin ?? existing.gstin;
  const nextRegType = body.gstRegistrationType ?? existing.gstRegistrationType;

  if (nextRegType !== 'UNREGISTERED') {
    validateGstinOrThrow(String(nextGstin || ''), nextState);
  }

  const updated = await prisma.branch.update({
    where: { id: branchId },
    data: {
      ...('branchCode' in body ? { branchCode: body.branchCode } : {}),
      ...('branchName' in body ? { branchName: body.branchName } : {}),
      ...('addressLine1' in body ? { addressLine1: body.addressLine1 } : {}),
      ...('addressLine2' in body ? { addressLine2: body.addressLine2 ?? null } : {}),
      ...('city' in body ? { city: body.city ?? null } : {}),
      ...('state' in body ? { state: body.state } : {}),
      ...('country' in body ? { country: body.country } : {}),
      ...('gstin' in body ? { gstin: body.gstin ? String(body.gstin).toUpperCase() : null } : {}),
      ...('gstRegistrationType' in body ? { gstRegistrationType: body.gstRegistrationType as any } : {}),
      ...('phone' in body ? { phone: body.phone ?? null } : {}),
      ...('email' in body ? { email: body.email ?? null } : {}),
      ...('contactPerson' in body ? { contactPerson: body.contactPerson ?? null } : {}),
      ...('parentBranchId' in body ? { parentBranchId: body.parentBranchId ?? null } : {}),
      ...('shareHeadOfficeSettings' in body ? { shareHeadOfficeSettings: Boolean(body.shareHeadOfficeSettings) } : {}),
      // update audit via updatedAt (Prisma @updatedAt)
      createdByUserId: existing.createdByUserId || userId,
    },
  });

  res.json({ branch: updated });
});

branchesRouter.delete('/orgs/:orgId/branches/:branchId', requirePermission('MASTERS', PermissionAction.DELETE, 'Company/Branch setup'), async (req, res) => {
  const accountId = req.tenant!.accountId;
  const orgId = String(req.params.orgId);
  const branchId = String(req.params.branchId);

  if (orgId !== req.tenant!.orgId) return res.status(403).json({ error: 'orgId mismatch' });

  const existing = await prisma.branch.findFirst({ where: { accountId, orgId, id: branchId } });
  if (!existing) return res.status(404).json({ error: 'Branch not found' });

  await prisma.branch.delete({ where: { id: branchId } });
  res.json({ ok: true });
});
