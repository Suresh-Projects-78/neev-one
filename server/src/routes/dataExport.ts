import { Router } from 'express';

import { prisma } from '../utils/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { requireTenantContext } from '../middleware/tenantContext.js';
import { requirePermission } from '../middleware/rbac.js';
import { PermissionAction } from '../constants/enums.js';

/**
 * A company's own books, in a file its owner can keep.
 *
 * Not the same thing as the server backup, and the difference matters. The
 * SQLite backup is an operator's tool: it is the whole multi-tenant database,
 * every customer's books in one file, and no customer should ever be handed
 * one. This is the other thing — one company's own data, for the people whose
 * data it is.
 *
 * Which is also why it is worth having beyond convenience: a customer who
 * cannot get their books out is a customer who is locked in, and under the DPDP
 * Act a data principal is entitled to their data in a portable form.
 *
 * bounded-file: every read here is deliberately unbounded.
 *
 * This is the company's own copy of its own books, so a page of it would be the
 * wrong answer rather than a partial one — a backup missing the invoices after
 * row 500 is not a backup. The limit that matters here is not a row count, it
 * is the org filter on every query below.
 *
 * Scoped to the active org throughout. The one defect that would matter here is
 * one company's export containing another's, so every query is filtered by
 * account and org, and a test asserts a second company's rows never appear.
 */
export const dataExportRouter = Router();
dataExportRouter.use(requireAuth, requireTenantContext);

/*
 * Gated on Company Profile rather than on a document permission. Taking a copy
 * of everything the company holds is an owner's act, not a clerk's — somebody
 * who may raise invoices should not thereby be able to walk out with the
 * customer list.
 */
const EXPORT = requirePermission('SETTINGS', PermissionAction.EXPORT, 'Company data');

const num = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** Decimal columns come back as objects; a file should hold numbers. */
const plain = (rows: any[]): any[] =>
  rows.map((r) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r)) {
      if (v && typeof v === 'object' && typeof (v as any).toFixed === 'function') out[k] = num(v);
      else if (v instanceof Date) out[k] = v.toISOString();
      else out[k] = v;
    }
    return out;
  });

dataExportRouter.get('/orgs/:orgId/export', EXPORT, async (req, res) => {
  if (String(req.params.orgId) !== req.tenant!.orgId) {
    return res.status(403).json({ error: 'orgId mismatch' });
  }
  const { accountId, orgId } = req.tenant!;
  const scope = { accountId, orgId };

  const org = await prisma.org.findFirst({ where: { id: orgId, accountId }, select: { id: true, name: true, slug: true } });
  if (!org) return res.status(404).json({ error: 'Company not found' });

  const [
    branches, warehouses, parties, partyAddresses, partyContacts, items,
    invoices, bills, estimates, salesOrders, purchaseOrders, deliveryChallans,
    creditNotes, debitNotes, expenses, payments, paymentAllocations,
    ledgerAccounts, journals, journalEntries, journalLines,
    salesmen, fixedAssets, masters, bankBook, recurring,
  ] = await Promise.all([
    prisma.branch.findMany({ where: scope }),
    prisma.warehouse.findMany({ where: scope }),
    prisma.party.findMany({ where: scope }),
    prisma.partyAddress.findMany({ where: scope }),
    prisma.partyContact.findMany({ where: scope }),
    prisma.itemMaster.findMany({ where: scope }),
    prisma.invoice.findMany({ where: scope }),
    prisma.bill.findMany({ where: scope }),
    prisma.estimate.findMany({ where: scope }),
    prisma.salesOrderDoc.findMany({ where: scope }),
    prisma.purchaseOrderDoc.findMany({ where: scope }),
    prisma.deliveryChallan.findMany({ where: scope }),
    prisma.creditNote.findMany({ where: scope }),
    prisma.debitNote.findMany({ where: scope }),
    prisma.expense.findMany({ where: scope }),
    prisma.payment.findMany({ where: scope }),
    prisma.paymentAllocation.findMany({ where: scope }),
    prisma.ledgerAccount.findMany({ where: scope }),
    prisma.journal.findMany({ where: scope }),
    prisma.journalEntry.findMany({ where: scope }),
    prisma.journalLine.findMany({ where: { entry: scope } }),
    prisma.salesman.findMany({ where: scope }),
    prisma.fixedAsset.findMany({ where: scope }),
    prisma.orgMaster.findMany({ where: scope }),
    prisma.bankBookEntry.findMany({ where: scope }),
    prisma.recurringSchedule.findMany({ where: scope }),
  ]);

  const data = {
    branches, warehouses, parties, partyAddresses, partyContacts, items,
    invoices, bills, estimates, salesOrders, purchaseOrders, deliveryChallans,
    creditNotes, debitNotes, expenses, payments, paymentAllocations,
    ledgerAccounts, journals, journalEntries, journalLines,
    salesmen, fixedAssets, masters, bankBook, recurringSchedules: recurring,
  } as Record<string, any[]>;

  const counts: Record<string, number> = {};
  const out: Record<string, any[]> = {};
  for (const [name, rows] of Object.entries(data)) {
    counts[name] = rows.length;
    out[name] = plain(rows);
  }

  res.json({
    /*
     * A header that says what this is and what it covers, because a file found
     * on a shared drive in two years' time has to explain itself.
     */
    export: {
      format: 'neev-one/company-export',
      version: 1,
      company: { id: org.id, name: org.name, handle: org.slug || null },
      takenAt: new Date().toISOString(),
      counts,
      note:
        'Every record belonging to this company. It contains no other company’s data, ' +
        'and no passwords, sessions or API credentials.',
    },
    data: out,
  });
});

export default dataExportRouter;
