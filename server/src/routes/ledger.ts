import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { requireTenantContext } from '../middleware/tenantContext.js';
import { requirePermission } from '../middleware/rbac.js';
import { PermissionAction } from '../constants/enums.js';
import { ensureLedgerSetup, postEntry, reverseEntry, trialBalance, fiscalYearFor } from '../services/ledger.js';

export const ledgerRouter = Router();
ledgerRouter.use(requireAuth, requireTenantContext);

const MODULE = 'ACCOUNTING';
const SUB = 'Ledger';

const manualEntrySchema = z.object({
  date: z.string().min(1),
  journalCode: z.string().min(1).default('JV'),
  narration: z.string().max(500).optional().nullable(),
  lines: z
    .array(
      z.object({
        ledgerAccountId: z.string().optional(),
        controlKind: z.string().optional(),
        debit: z.number().optional(),
        credit: z.number().optional(),
        partyType: z.enum(['CUSTOMER', 'VENDOR']).optional().nullable(),
        partyId: z.string().optional().nullable(),
        description: z.string().max(300).optional().nullable(),
      })
    )
    .min(2),
});

const requireOrgMatch = (req: any, res: any) => {
  if (String(req.params.orgId) !== req.tenant!.orgId) {
    res.status(403).json({ error: 'orgId mismatch' });
    return false;
  }
  return true;
};

// Idempotent: creates the default chart of accounts + journals for the org.
ledgerRouter.post('/orgs/:orgId/ledger/setup', requirePermission(MODULE, PermissionAction.CREATE, SUB), async (req, res) => {
  if (!requireOrgMatch(req, res)) return;
  await ensureLedgerSetup(req.tenant!.accountId, req.tenant!.orgId, req.auth!.userId);
  const accounts = await prisma.ledgerAccount.findMany({
    where: { orgId: req.tenant!.orgId },
    orderBy: { code: 'asc' },
    select: { id: true, code: true, name: true, accountType: true, controlKind: true },
  });
  res.json({ accounts });
});

ledgerRouter.get('/orgs/:orgId/ledger/accounts', requirePermission(MODULE, PermissionAction.VIEW, SUB), async (req, res) => {
  if (!requireOrgMatch(req, res)) return;
  const accounts = await prisma.ledgerAccount.findMany({
    where: { orgId: req.tenant!.orgId, isActive: true },
    orderBy: { code: 'asc' },
    select: { id: true, code: true, name: true, accountType: true, controlKind: true, branchId: true },
  });
  res.json({ accounts });
});

ledgerRouter.get('/orgs/:orgId/ledger/trial-balance', requirePermission(MODULE, PermissionAction.VIEW, SUB), async (req, res) => {
  if (!requireOrgMatch(req, res)) return;
  const allBranches = String(req.query.allBranches || '') === 'true';
  const result = await trialBalance({
    accountId: req.tenant!.accountId,
    orgId: req.tenant!.orgId,
    branchId: allBranches ? undefined : req.tenant!.branchId,
    fromDate: req.query.from ? String(req.query.from) : undefined,
    toDate: req.query.to ? String(req.query.to) : undefined,
  });
  res.json(result);
});

ledgerRouter.get('/orgs/:orgId/ledger/entries', requirePermission(MODULE, PermissionAction.VIEW, SUB), async (req, res) => {
  if (!requireOrgMatch(req, res)) return;
  const take = Math.min(200, Math.max(1, Number(req.query.limit || 50)));
  const entries = await prisma.journalEntry.findMany({
    where: {
      accountId: req.tenant!.accountId,
      orgId: req.tenant!.orgId,
      branchId: req.tenant!.branchId,
      ...(req.query.docType ? { sourceDocType: String(req.query.docType) } : {}),
      ...(req.query.docId ? { sourceDocId: String(req.query.docId) } : {}),
    },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    take,
    include: {
      lines: {
        select: {
          id: true,
          debit: true,
          credit: true,
          description: true,
          ledgerAccount: { select: { code: true, name: true, controlKind: true } },
        },
      },
    },
  });

  res.json({
    entries: entries.map((e) => ({
      ...e,
      lines: e.lines.map((l) => ({ ...l, debit: Number(l.debit), credit: Number(l.credit) })),
    })),
  });
});

ledgerRouter.post('/orgs/:orgId/ledger/entries', requirePermission(MODULE, PermissionAction.CREATE, SUB), async (req, res) => {
  if (!requireOrgMatch(req, res)) return;
  const body = manualEntrySchema.parse(req.body);
  const entry = await postEntry({
    accountId: req.tenant!.accountId,
    orgId: req.tenant!.orgId,
    branchId: req.tenant!.branchId,
    userId: req.auth!.userId,
    date: body.date,
    journalCode: body.journalCode,
    narration: body.narration ?? null,
    sourceDocType: 'MANUAL',
    lines: body.lines as any,
  });
  res.status(201).json({ entry });
});

ledgerRouter.post('/orgs/:orgId/ledger/entries/:entryId/reverse', requirePermission(MODULE, PermissionAction.EDIT, SUB), async (req, res) => {
  if (!requireOrgMatch(req, res)) return;
  const reversal = await reverseEntry({
    accountId: req.tenant!.accountId,
    orgId: req.tenant!.orgId,
    branchId: req.tenant!.branchId,
    userId: req.auth!.userId,
    entryId: String(req.params.entryId),
    date: req.body?.date ? String(req.body.date) : undefined,
    narration: req.body?.narration ? String(req.body.narration) : undefined,
  });
  res.status(201).json({ entry: reversal });
});

// ---- period lock -----------------------------------------------------------

const lockSchema = z.object({ lockedThrough: z.string().min(1).nullable() });

ledgerRouter.get('/orgs/:orgId/ledger/fiscal-years', requirePermission(MODULE, PermissionAction.VIEW, SUB), async (req, res) => {
  if (!requireOrgMatch(req, res)) return;
  const years = await prisma.fiscalYear.findMany({
    where: { orgId: req.tenant!.orgId },
    orderBy: { name: 'desc' },
  });
  res.json({ fiscalYears: years });
});

ledgerRouter.post('/orgs/:orgId/ledger/fiscal-years/:name/lock', requirePermission(MODULE, PermissionAction.APPROVE, SUB), async (req, res) => {
  if (!requireOrgMatch(req, res)) return;
  const body = lockSchema.parse(req.body);
  const name = String(req.params.name);

  const fy =
    (await prisma.fiscalYear.findFirst({ where: { orgId: req.tenant!.orgId, name } })) ||
    (await (async () => {
      const spec = fiscalYearFor(`${name.slice(0, 4)}-04-01`);
      return prisma.fiscalYear.create({
        data: {
          accountId: req.tenant!.accountId,
          orgId: req.tenant!.orgId,
          name: spec.name,
          startDate: spec.startDate,
          endDate: spec.endDate,
          createdByUserId: req.auth!.userId,
        },
      });
    })());

  const updated = await prisma.fiscalYear.update({
    where: { id: fy.id },
    data: { lockedThrough: body.lockedThrough },
  });
  res.json({ fiscalYear: updated });
});
