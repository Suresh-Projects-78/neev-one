import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { requireTenantContext } from '../middleware/tenantContext.js';
import { requirePermission } from '../middleware/rbac.js';
import { PermissionAction } from '../constants/enums.js';
import { SETUP_CASH_BANK_CODES, ensureLedgerSetup, postEntry, reverseEntry } from '../services/ledger.js';
import { allocateNumber, ensureDefaultSeries } from '../services/numbering.js';
import { isFeatureEnabled } from '../services/features.js';
import { baseCurrencyFor, isBase, rateFor, round2, toBase } from '../services/fx.js';

/**
 * Receipts and payments.
 *
 * One record regardless of which screen created it. The alternative — a
 * voucher screen and a bank-book screen writing separate rows — is how the same
 * receipt ends up in the books twice, which is the duplicate problem bank
 * reconciliation is usually asked to clean up afterwards.
 */
export const paymentsRouter = Router();
paymentsRouter.use(requireAuth, requireTenantContext);

const RECEIPT = { module: 'SALES', resource: 'Receipts' } as const;
const PAYMENT = { module: 'PURCHASE', resource: 'Payments' } as const;

const orgOk = (req: any, res: any) => {
  if (String(req.params.orgId) !== req.tenant!.orgId) {
    res.status(403).json({ error: 'orgId mismatch' });
    return false;
  }
  return true;
};

const paymentSchema = z.object({
  direction: z.enum(['RECEIPT', 'PAYMENT']),
  number: z.string().min(1).optional(),
  date: z.string().min(1),
  partyType: z.enum(['CUSTOMER', 'VENDOR']).optional().nullable(),
  partyId: z.string().optional().nullable(),
  partyName: z.string().max(200).optional().nullable(),
  /** Requirement 14: the mode is a real cash or bank ledger, not a free label. */
  ledgerAccountId: z.string().min(1),
  /** Omit for the base currency. */
  currency: z.string().length(3).optional(),
  instrumentRef: z.string().max(100).optional().nullable(),
  instrumentDate: z.string().max(20).optional().nullable(),
  amount: z.number().positive(),
  notes: z.string().max(500).optional().nullable(),
  allocations: z
    .array(z.object({ docType: z.enum(['INVOICE', 'BILL']), docId: z.string().min(1), amount: z.number().positive() }))
    .optional(),
  /*
   * What settled the document without reaching the bank.
   *
   * `amount` stays the cash that actually moved, so bank balances and
   * reconciliation are unaffected by this. A deduction is an additional debit —
   * tax the customer withheld against our PAN, or what the bank took on the way
   * through — and the party is credited with the sum of the two, because that
   * is how much of the invoice is now settled.
   */
  deductions: z
    .array(
      z.object({
        kind: z.enum(['TDS', 'BANK_CHARGES', 'OTHER']),
        amount: z.number().positive(),
        note: z.string().max(120).optional().nullable(),
      })
    )
    .optional(),
});

const normalize = (row: any) => ({
  ...row,
  amount: Number(row.amount),
  allocations: (row.allocations || []).map((a: any) => ({ ...a, amount: Number(a.amount) })),
});

const permsFor = (direction: string) => (direction === 'RECEIPT' ? RECEIPT : PAYMENT);

/** The cash and bank ledgers a payment may be made through. */
paymentsRouter.get('/orgs/:orgId/payment-modes', async (req, res) => {
  if (!orgOk(req, res)) return;
  const { accountId, orgId, branchId } = req.tenant!;
  await ensureLedgerSetup(accountId, orgId, req.auth!.userId);

  // Only the cash and bank accounts somebody actually opened. Setup creates a
  // Cash-in-Hand and a Bank Accounts control account for every org so that
  // postings resolve, and those were being offered here as though the user had
  // set them up — a business with no ledgers of its own was invited to receive
  // money into an account it had never heard of. They stay in the chart and
  // keep taking the postings; they are just not choices.
  const modes = await prisma.ledgerAccount.findMany({
    where: {
      orgId,
      isActive: true,
      controlKind: { in: ['CASH', 'BANK'] },
      code: { notIn: SETUP_CASH_BANK_CODES },
      OR: [{ branchId: null }, { branchId }],
    },
    orderBy: { code: 'asc' },
    select: { id: true, code: true, name: true, controlKind: true },
  });

  res.json({ modes });
});

paymentsRouter.get('/orgs/:orgId/payments', async (req, res) => {
  if (!orgOk(req, res)) return;
  const { accountId, orgId, branchId } = req.tenant!;
  const direction = String(req.query.direction || 'RECEIPT') === 'PAYMENT' ? 'PAYMENT' : 'RECEIPT';

  const rows = await prisma.payment.findMany({
    where: {
      accountId,
      orgId,
      branchId,
      direction,
      ...(String(req.query.unreconciled || '') === 'true' ? { reconciled: false } : {}),
    },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    take: Math.min(200, Number(req.query.limit || 100)),
    include: { allocations: true },
  });

  res.json({ payments: rows.map(normalize) });
});

paymentsRouter.post('/orgs/:orgId/payments', async (req, res) => {
  if (!orgOk(req, res)) return;
  const { accountId, orgId, branchId } = req.tenant!;
  const userId = req.auth!.userId;
  const body = paymentSchema.parse(req.body);

  // Permission depends on the direction, so it is checked here rather than as
  // route middleware.
  const perms = permsFor(body.direction);
  const check = requirePermission(perms.module, PermissionAction.CREATE, perms.resource);
  let allowed = true;
  await new Promise<void>((resolve) => {
    check(req, { status: () => ({ json: () => { allowed = false; resolve(); } }) } as any, () => resolve());
  });
  if (!allowed) {
    return res.status(403).json({ error: `You do not have permission to create ${perms.resource.toLowerCase()}` });
  }

  const mode = await prisma.ledgerAccount.findFirst({
    where: { id: body.ledgerAccountId, orgId, isActive: true, controlKind: { in: ['CASH', 'BANK'] } },
  });
  if (!mode) return res.status(400).json({ error: 'Choose a cash or bank account for this payment' });

  const deductionTotal = round2((body.deductions || []).reduce((sum, d) => sum + d.amount, 0));
  // What the document was settled by: the cash, plus everything deducted from
  // it on the way. Allocations are measured against this, not against the cash.
  const settledTotal = round2(body.amount + deductionTotal);

  const allocationTotal = (body.allocations || []).reduce((sum, a) => sum + a.amount, 0);
  if (allocationTotal > settledTotal + 0.005) {
    return res.status(400).json({ error: 'Allocated amount is more than the payment' });
  }

  // Requirement 8. The ledger is kept in the base currency, so the rate is
  // resolved before anything is written — a payment whose rate cannot be found
  // must not reach the books at a wrong number.
  const baseCurrency = await baseCurrencyFor(accountId, orgId);
  const payCurrency = String(body.currency || baseCurrency).toUpperCase();
  let payRate = 1;
  try {
    payRate = isBase(payCurrency, baseCurrency)
      ? 1
      : await rateFor({ accountId, orgId, currency: payCurrency, date: body.date, baseCurrency });
  } catch (e: any) {
    return res.status(400).json({ error: String(e?.message || e) });
  }

  // Each allocated invoice was booked at its own rate. Settling it at a
  // different one is a realised gain or loss, and it belongs in its own account
  // rather than quietly adjusting revenue or the bank.
  const invoiceIds = (body.allocations || []).filter((a) => a.docType === 'INVOICE').map((a) => a.docId);
  const bookedRates = new Map<string, number>();
  if (invoiceIds.length) {
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id, exchangeRate FROM Invoice WHERE orgId = ? AND id IN (${invoiceIds.map(() => '?').join(',')})`,
      orgId,
      ...invoiceIds
    );
    for (const r of rows) bookedRates.set(String(r.id), Number(r.exchangeRate) || 1);
  }

  // Positive is a gain: more base currency came in than the receivable was
  // carried at. Summing per allocation is what makes the entry balance —
  // the difference is exactly bank-side minus party-side.
  const fxDifference = round2(
    (body.allocations || []).reduce((sum, a) => {
      const booked = bookedRates.get(String(a.docId));
      if (!booked) return sum;
      return sum + (toBase(a.amount, payRate) - toBase(a.amount, booked));
    }, 0)
  );

  await ensureDefaultSeries({ accountId, orgId, branchId, docType: body.direction, userId });

  const created = await prisma.$transaction(async (tx) => {
    const number =
      String(body.number || '').trim() ||
      (
        await allocateNumber(tx, {
          accountId,
          orgId,
          branchId,
          docType: body.direction,
          userId,
          date: body.date,
        })
      ).number;

    return tx.payment.create({
      data: {
        accountId,
        orgId,
        branchId,
        direction: body.direction,
        number,
        date: body.date,
        partyType: body.partyType ?? null,
        partyId: body.partyId ?? null,
        partyName: body.partyName ?? null,
        ledgerAccountId: body.ledgerAccountId,
        instrumentRef: body.instrumentRef ?? null,
        instrumentDate: body.instrumentDate ?? null,
        amount: new Prisma.Decimal(body.amount.toFixed(2)),
        currency: payCurrency,
        exchangeRate: new Prisma.Decimal(String(payRate)),
        notes: body.notes ?? null,
        createdByUserId: userId,
        allocations: {
          create: (body.allocations || []).map((a) => ({
            accountId,
            orgId,
            branchId,
            docType: a.docType,
            docId: a.docId,
            amount: new Prisma.Decimal(a.amount.toFixed(2)),
          })),
        },
      },
      include: { allocations: true },
    });
  });

  // A receipt debits the bank and credits the customer; a payment is the
  // mirror. Posting fails loudly: the payment row is removed so the books and
  // the list cannot disagree.
  try {
    await postEntry({
      accountId,
      orgId,
      branchId,
      userId,
      date: body.date,
      journalCode: mode.controlKind === 'BANK' ? 'BNK' : 'CSH',
      narration: `${body.direction === 'RECEIPT' ? 'Receipt' : 'Payment'} ${created.number}${
        body.partyName ? ` - ${body.partyName}` : ''
      }`,
      sourceDocType: body.direction,
      sourceDocId: created.id,
      lines:
        body.direction === 'RECEIPT'
          ? [
              // Cash side at the payment's own rate; party side at the rate the
              // receivable was carried at, with the difference taken to
              // exchange gain/loss. The three always foot to zero because the
              // difference is defined as the gap between the first two.
              { ledgerAccountId: mode.id, debit: toBase(body.amount, payRate), description: 'Money received' },
              /*
               * Each deduction is its own debit, at the payment's own rate.
               * TDS is an asset — tax already paid on our behalf, claimed
               * against the year's liability. Bank and other charges are
               * expenses. Neither reached the bank, and both settled the
               * invoice, which is why the credit below is the sum.
               */
              ...(body.deductions || []).map((d) => ({
                controlKind:
                  d.kind === 'TDS'
                    ? ('TDS_RECEIVABLE' as const)
                    : d.kind === 'BANK_CHARGES'
                      ? ('BANK_CHARGES' as const)
                      : ('EXPENSES' as const),
                debit: toBase(d.amount, payRate),
                description:
                  d.note ||
                  (d.kind === 'TDS' ? 'TDS deducted by customer' : d.kind === 'BANK_CHARGES' ? 'Bank charges' : 'Other charges'),
              })),
              {
                controlKind: 'AR',
                credit: round2(toBase(settledTotal, payRate) - fxDifference),
                partyType: 'CUSTOMER',
                partyId: body.partyId || null,
                description: `From ${body.partyName || 'customer'}`,
              },
              ...(fxDifference === 0
                ? []
                : [
                    fxDifference > 0
                      ? { controlKind: 'FX_GAIN_LOSS' as const, credit: fxDifference, description: 'Exchange gain on settlement' }
                      : { controlKind: 'FX_GAIN_LOSS' as const, debit: -fxDifference, description: 'Exchange loss on settlement' },
                  ]),
            ]
          : [
              {
                controlKind: 'AP',
                debit: round2(toBase(body.amount, payRate) - fxDifference),
                partyType: 'VENDOR',
                partyId: body.partyId || null,
                description: `To ${body.partyName || 'vendor'}`,
              },
              { ledgerAccountId: mode.id, credit: toBase(body.amount, payRate), description: 'Money paid' },
              ...(fxDifference === 0
                ? []
                : [
                    fxDifference > 0
                      ? { controlKind: 'FX_GAIN_LOSS' as const, credit: fxDifference, description: 'Exchange gain on settlement' }
                      : { controlKind: 'FX_GAIN_LOSS' as const, debit: -fxDifference, description: 'Exchange loss on settlement' },
                  ]),
            ],
    });
  } catch (e: any) {
    await prisma.payment.delete({ where: { id: created.id } });
    return res.status(Number(e?.status || 400)).json({ error: `Not saved: ${String(e?.message || e)}` });
  }

  res.status(201).json({ payment: normalize(created) });
});

/** Reversal, not deletion: a posted payment stays in the audit trail. */
paymentsRouter.post('/orgs/:orgId/payments/:paymentId/reverse', async (req, res) => {
  if (!orgOk(req, res)) return;
  const { accountId, orgId, branchId } = req.tenant!;

  const payment = await prisma.payment.findFirst({
    where: { id: String(req.params.paymentId), accountId, orgId },
  });
  if (!payment) return res.status(404).json({ error: 'Payment not found' });
  if (payment.status === 'REVERSED') return res.status(409).json({ error: 'Already reversed' });

  const entries = await prisma.journalEntry.findMany({
    where: { accountId, orgId, sourceDocType: payment.direction, sourceDocId: payment.id, status: 'POSTED' },
    select: { id: true },
  });
  for (const e of entries) {
    await reverseEntry({ accountId, orgId, branchId, userId: req.auth!.userId, entryId: e.id, narration: 'Payment reversed' });
  }

  const updated = await prisma.payment.update({
    where: { id: payment.id },
    data: { status: 'REVERSED' },
    include: { allocations: true },
  });
  res.json({ payment: normalize(updated), reversedEntries: entries.length });
});

// ---------------------------------------------------------------------------
// Reconciliation
// ---------------------------------------------------------------------------

const reconcileSchema = z.object({
  reconciled: z.boolean(),
  bankDate: z.string().optional().nullable(),
  statementRef: z.string().max(120).optional().nullable(),
});

/**
 * Marks a payment against the bank statement.
 *
 * Gated on the bankReconciliation feature: a business that does not reconcile
 * never sees this, and entry is unaffected either way.
 */
paymentsRouter.patch('/orgs/:orgId/payments/:paymentId/reconcile', async (req, res) => {
  if (!orgOk(req, res)) return;
  const { accountId, orgId } = req.tenant!;

  if (!(await isFeatureEnabled(accountId, orgId, 'bankReconciliation'))) {
    return res.status(400).json({ error: 'Bank reconciliation is switched off for this company' });
  }

  const payment = await prisma.payment.findFirst({
    where: { id: String(req.params.paymentId), accountId, orgId },
  });
  if (!payment) return res.status(404).json({ error: 'Payment not found' });

  const body = reconcileSchema.parse(req.body);
  const updated = await prisma.payment.update({
    where: { id: payment.id },
    data: {
      reconciled: body.reconciled,
      bankDate: body.bankDate ? new Date(body.bankDate) : body.reconciled ? new Date() : null,
      statementRef: body.statementRef ?? null,
    },
    include: { allocations: true },
  });

  res.json({ payment: normalize(updated) });
});
