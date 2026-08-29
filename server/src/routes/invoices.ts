import { Router, type Request } from 'express';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { prisma } from '../utils/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { requireTenantContext } from '../middleware/tenantContext.js';
import { requirePermission } from '../middleware/rbac.js';
import { PermissionAction } from '../constants/enums.js';
import { ensureLedgerSetup, invoicePostingLines, postEntry, reverseEntry } from '../services/ledger.js';
import { allowsEntity, filterFieldsByLevel, levelFor, resolveAccess, resolveUserPermissions } from '../services/access.js';
import { evaluateApproval, isPending } from '../services/approvals.js';
import { fieldsFor } from '../constants/permissionCatalog.js';
import { dueDateFor } from './parties.js';
import { allocateNumber, ensureDefaultSeries } from '../services/numbering.js';
import { isFeatureEnabled } from '../services/features.js';
import { FxError, baseCurrencyFor, isBase, rateFor, toBase } from '../services/fx.js';

export const invoicesRouter = Router();
invoicesRouter.use(requireAuth, requireTenantContext);

const INVOICE_MODULE = 'SALES';
const INVOICE_SUBMODULE = 'Invoices';

const invoiceItemSchema = z.object({
  itemId: z
    .union([z.string(), z.number()])
    .transform((v) => String(v))
    .optional()
    .nullable(),
  description: z.string().optional().nullable(),
  quantity: z.number().optional().nullable(),
  rate: z.number().optional().nullable(),
  gstRate: z.number().optional().nullable(),
  hsnSac: z.string().optional().nullable(),
  amount: z.number().optional().nullable(),
  taxableAmount: z.number().optional().nullable(),
  gstAmount: z.number().optional().nullable(),
  cgstAmount: z.number().optional().nullable(),
  sgstAmount: z.number().optional().nullable(),
  igstAmount: z.number().optional().nullable(),
  lineTotal: z.number().optional().nullable(),
  taxType: z.string().optional().nullable(),
  // Batch-tracked lines carry their batch identity; without these the
  // write-through dropped them and hydration lost batch detail.
  batchId: z.union([z.string(), z.number()]).optional().nullable(),
  batchNo: z.string().optional().nullable(),
  expiryDate: z.string().optional().nullable(),
  serials: z.array(z.string()).optional(),
  // Line discounts (same silent-strip class as batch fields).
  discountPct: z.union([z.string(), z.number()]).optional().nullable(),
  discountAmount: z.union([z.string(), z.number()]).optional().nullable(),
  discountManual: z.boolean().optional(),
});

const invoiceUpsertSchema = z.object({
  branchId: z.string().min(1).optional(),
  seriesId: z.string().optional().nullable(),
  warehouseId: z.string().optional().nullable(),
  // Omit to have the server allocate from the series.
  number: z.string().min(1).optional(),
  date: z.string().min(1),
  dueDate: z.string().optional().nullable(),
  refNo: z.string().optional().nullable(),
  refDate: z.string().optional().nullable(),
  customerId: z.string().optional().nullable(),
  customerName: z.string().min(1),
  /// Omit for the base currency.
  currency: z.string().length(3).optional(),
  customerGstin: z.string().optional().nullable(),
  placeOfSupplyState: z.string().optional().nullable(),
  taxType: z.string().optional().nullable(),
  reverseCharge: z.boolean().optional(),
  subtotal: z.number().optional(),
  cgstTotal: z.number().optional(),
  sgstTotal: z.number().optional(),
  igstTotal: z.number().optional(),
  gstTotal: z.number().optional(),
  total: z.number().optional(),
  paidAmount: z.number().optional(),
  status: z.string().optional(),
  sourceEstimateId: z.string().optional().nullable(),
  // Everything the entry forms collect that has no column of its own. Kept
  // together so the server stops silently discarding them.
  salesmanId: z.union([z.string(), z.number()]).optional().nullable(),
  costCenterId: z.union([z.string(), z.number()]).optional().nullable(),
  invoiceDiscountType: z.string().optional().nullable(),
  invoiceDiscountValue: z.union([z.string(), z.number()]).optional().nullable(),
  invoiceDiscountApplied: z.number().optional().nullable(),
  otherCharges: z.array(z.record(z.any())).optional(),
  otherChargesTotal: z.number().optional().nullable(),
  shipToAddressId: z.union([z.string(), z.number()]).optional().nullable(),
  sourceChallanId: z.union([z.string(), z.number()]).optional().nullable(),
  sourceSalesOrderId: z.union([z.string(), z.number()]).optional().nullable(),
  posSale: z.boolean().optional(),
  tender: z.string().optional().nullable(),
  customerMobile: z.string().optional().nullable(),
  items: z.array(invoiceItemSchema).default([]),
});

/** The extras, as stored: absent keys stay absent rather than becoming nulls. */
const EXTRA_KEYS = [
  'salesmanId',
  'costCenterId',
  'invoiceDiscountType',
  'invoiceDiscountValue',
  'invoiceDiscountApplied',
  'otherCharges',
  'otherChargesTotal',
  'shipToAddressId',
  'sourceChallanId',
  'sourceSalesOrderId',
  'posSale',
  'tender',
  'customerMobile',
] as const;

const extrasFrom = (body: any) => {
  const out: Record<string, unknown> = {};
  for (const k of EXTRA_KEYS) {
    if (body?.[k] !== undefined && body?.[k] !== null && body?.[k] !== '') out[k] = body[k];
  }
  return Object.keys(out).length ? JSON.stringify(out) : null;
};

const statusSchema = z.object({
  status: z.string().min(1),
  paidAmount: z.number().optional(),
});

const toNumber = (v: number | string | null | undefined) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const normalizeInvoiceResponse = (row: any) => {
  let items: any[] = [];
  try {
    const parsed = JSON.parse(String(row?.itemsJson || '[]'));
    if (Array.isArray(parsed)) items = parsed;
  } catch {
    items = [];
  }

  return {
    id: row.id,
    accountId: row.accountId,
    orgId: row.orgId,
    branchId: row.branchId,
    warehouseId: row.warehouseId || '',
    number: row.number,
    date: row.date,
    dueDate: row.dueDate || '',
    refNo: row.refNo || '',
    refDate: row.refDate || '',
    customerId: row.customerId || '',
    customerName: row.customerName || '',
    customerGstin: row.customerGstin || '',
    placeOfSupplyState: row.placeOfSupplyState || '',
    taxType: row.taxType || '',
    reverseCharge: !!row.reverseCharge,
    subtotal: toNumber(row.subtotal),
    cgstTotal: toNumber(row.cgstTotal),
    sgstTotal: toNumber(row.sgstTotal),
    igstTotal: toNumber(row.igstTotal),
    gstTotal: toNumber(row.gstTotal),
    total: toNumber(row.total),
    paidAmount: toNumber(row.paidAmount),
    status: row.status || 'Draft',
    sourceEstimateId: row.sourceEstimateId || null,
    ...(() => {
      try {
        const parsed = JSON.parse(String(row?.extrasJson || 'null'));
        return parsed && typeof parsed === 'object' ? parsed : {};
      } catch {
        return {};
      }
    })(),
    items,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
};

// Financial fields whose changes are recorded field-by-field in AuditLog.
const AUDITED_FIELDS = [
  'number', 'date', 'dueDate', 'customerId', 'customerName', 'customerGstin',
  'placeOfSupplyState', 'taxType', 'reverseCharge', 'subtotal', 'cgstTotal',
  'sgstTotal', 'igstTotal', 'gstTotal', 'total', 'paidAmount', 'status',
  'warehouseId', 'itemsJson',
] as const;

/** Write a per-field diff of an invoice mutation. Never fails the request. */
async function auditInvoiceChange(
  req: Request,
  action: 'UPDATE' | 'STATUS' | 'DELETE',
  before: any,
  after: any | null,
) {
  try {
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    if (after) {
      for (const f of AUDITED_FIELDS) {
        const a = before?.[f];
        const b = after?.[f];
        // Decimal columns come back as objects/strings; compare numerically
        // when both sides are numeric, as strings otherwise.
        const bothNumeric =
          a !== null && a !== undefined && a !== '' && !isNaN(Number(a)) &&
          b !== null && b !== undefined && b !== '' && !isNaN(Number(b));
        const same = bothNumeric ? toNumber(a) === toNumber(b) : String(a ?? '') === String(b ?? '');
        if (!same) changes[f] = { from: a ?? null, to: b ?? null };
      }
      if (!Object.keys(changes).length) return;
    }
    await prisma.auditLog.create({
      data: {
        accountId: req.tenant!.accountId,
        orgId: req.tenant!.orgId,
        branchId: req.tenant!.branchId,
        entity: 'INVOICE',
        entityId: String(before?.id || ''),
        action,
        message:
          action === 'DELETE'
            ? `Invoice ${before?.number || ''} deleted (total ${toNumber(before?.total)})`
            : `Invoice ${before?.number || ''} ${action === 'STATUS' ? 'status changed' : 'edited'}`,
        metadata: JSON.stringify(after ? { changes } : { number: before?.number, total: toNumber(before?.total) }),
        createdByUserId: req.auth!.userId,
      },
    });
  } catch {
    // Audit is best-effort; the financial write itself already succeeded.
  }
}

invoicesRouter.get('/orgs/:orgId/invoices', requirePermission(INVOICE_MODULE, PermissionAction.VIEW, INVOICE_SUBMODULE), async (req, res) => {
  const accountId = req.tenant!.accountId;
  const orgId = String(req.params.orgId);
  const branchId = req.tenant!.branchId;
  if (orgId !== req.tenant!.orgId) return res.status(403).json({ error: 'orgId mismatch' });

  // Typed + bounded: ?limit (default 500, max 1000) and ?offset page through
  // large books instead of returning every row ever written (S-3/C-9).
  const limit = Math.min(1000, Math.max(1, Number(req.query.limit) || 500));
  const offset = Math.max(0, Number(req.query.offset) || 0);
  const rows = await prisma.invoice.findMany({
    where: { accountId, orgId, branchId },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    take: limit,
    skip: offset,
  });

  res.json({ invoices: rows.map((r: any) => normalizeInvoiceResponse(r)) });
});

invoicesRouter.post('/orgs/:orgId/invoices', requirePermission(INVOICE_MODULE, PermissionAction.CREATE, INVOICE_SUBMODULE), async (req, res) => {
  const accountId = req.tenant!.accountId;
  const orgId = String(req.params.orgId);
  const userId = req.auth!.userId;
  if (orgId !== req.tenant!.orgId) return res.status(403).json({ error: 'orgId mismatch' });

  const parsed = invoiceUpsertSchema.parse(req.body);
  const branchId = String(parsed.branchId || req.tenant!.branchId || '').trim();
  if (!branchId) return res.status(400).json({ error: 'Missing branchId' });

  // Document restrictions: a user limited to certain customers may not raise an
  // invoice for anyone else.
  const userPerms = await resolveUserPermissions(accountId, orgId, userId);
  if (!allowsEntity(userPerms, 'CUSTOMER', parsed.customerId)) {
    return res.status(403).json({ error: 'You are not permitted to raise documents for this customer' });
  }

  // Field-level permissions: silently drop fields above the caller's level
  // rather than failing the whole request, as ERPNext does.
  const access = await resolveAccess(accountId, orgId, userId, branchId);
  const grantedLevel = levelFor(access, INVOICE_MODULE, INVOICE_SUBMODULE, PermissionAction.CREATE);
  const { value: body, stripped } = filterFieldsByLevel(
    parsed,
    fieldsFor(INVOICE_MODULE, INVOICE_SUBMODULE),
    grantedLevel
  );

  // Requirement 12: the due date comes from the customer's payment terms, on
  // the server, so it cannot be quietly extended in the browser.
  // Gated on the paymentTerms feature: an org that switches it off keeps the
  // due date the operator typed instead of having it recomputed underneath
  // them.
  let resolvedDueDate = String(body.dueDate || '').trim() || null;
  if (body.customerId && (await isFeatureEnabled(accountId, orgId, 'paymentTerms'))) {
    const party = await prisma.party.findFirst({
      where: { id: String(body.customerId), accountId, orgId },
      select: { paymentTermDays: true },
    });
    if (party && party.paymentTermDays > 0) {
      resolvedDueDate = dueDateFor(String(body.date).trim(), party.paymentTermDays) || resolvedDueDate;
    }
  }

  // Requirement 2: the number comes from the configured series, allocated on
  // the server. Two browsers cannot mint the same one.
  let invoiceNumber = String(body.number || '').trim();
  if (!invoiceNumber) {
    await ensureDefaultSeries({ accountId, orgId, branchId, docType: 'INVOICE', userId });
    const allocated = await prisma.$transaction((tx) =>
      allocateNumber(tx, {
        accountId,
        orgId,
        branchId,
        docType: 'INVOICE',
        userId,
        date: String(body.date).trim(),
        seriesId: body.seriesId || null,
      })
    );
    invoiceNumber = allocated.number;
  }

  const id = randomUUID();
  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO Invoice (
        id, accountId, orgId, branchId, warehouseId, number, date, dueDate, refNo, refDate,
        customerId, customerName, customerGstin, placeOfSupplyState, taxType, reverseCharge,
        subtotal, cgstTotal, sgstTotal, igstTotal, gstTotal, total, paidAmount,
        status, sourceEstimateId, itemsJson, extrasJson, createdByUserId, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      id,
      accountId,
      orgId,
      branchId,
      String(body.warehouseId || '').trim() || null,
      invoiceNumber,
      String(body.date).trim(),
      resolvedDueDate,
      String(body.refNo || '').trim() || null,
      String(body.refDate || '').trim() || null,
      String(body.customerId || '').trim() || null,
      String(body.customerName || '').trim(),
      String(body.customerGstin || '').trim() || null,
      String(body.placeOfSupplyState || '').trim() || null,
      String(body.taxType || '').trim() || null,
      body.reverseCharge ? 1 : 0,
      body.subtotal ?? 0,
      body.cgstTotal ?? 0,
      body.sgstTotal ?? 0,
      body.igstTotal ?? 0,
      body.gstTotal ?? 0,
      body.total ?? 0,
      body.paidAmount ?? 0,
      String(body.status || 'Draft').trim() || 'Draft',
      String(body.sourceEstimateId || '').trim() || null,
      JSON.stringify(body.items || []),
      extrasFrom(body),
      userId
    );
  } catch (e: any) {
    const msg = String(e?.message || '');
    if (msg.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'That invoice number is already used. Numbers are unique across every branch.' });
    }
    throw e;
  }

  const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM Invoice WHERE id = ?`, id);
  const row = rows[0];
  if (!row) return res.status(500).json({ error: 'Failed to create invoice' });

  // Approval thresholds are evaluated before anything reaches the ledger: an
  // invoice awaiting sign-off must not appear in the books.
  const approval = await evaluateApproval({
    accountId,
    orgId,
    branchId,
    userId,
    docType: 'INVOICE',
    docId: id,
    amount: Number(body.total ?? 0),
  });

  if (approval.required) {
    await prisma.$executeRawUnsafe(`UPDATE Invoice SET status = ? WHERE id = ?`, 'Pending Approval', id);
    const held = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM Invoice WHERE id = ?`, id);
    return res.status(201).json({
      invoice: normalizeInvoiceResponse(held[0]),
      approval: { required: true, rule: approval.ruleName },
      strippedFields: stripped,
    });
  }

  // Post the invoice to the general ledger. A failure here is not silent: the
  // invoice row is removed so the books and the document list cannot diverge.
  try {
    await ensureLedgerSetup(accountId, orgId, userId);

    // Requirement 8: the document may be in any currency, but the ledger is
    // kept in one. Translate every amount at the rate in force on the document
    // date before posting — mixing currencies in one ledger would give a trial
    // balance that foots to zero and means nothing.
    const baseCurrency = await baseCurrencyFor(accountId, orgId);
    const docCurrency = String(body.currency || baseCurrency).toUpperCase();
    const fxRate = isBase(docCurrency, baseCurrency)
      ? 1
      : await rateFor({ accountId, orgId, currency: docCurrency, date: String(body.date).trim(), baseCurrency });

    await prisma.$executeRawUnsafe(
      `UPDATE Invoice SET currency = ?, exchangeRate = ?, baseTotal = ? WHERE id = ?`,
      docCurrency,
      fxRate,
      toBase(Number(body.total ?? 0), fxRate),
      id
    );

    await postEntry({
      accountId,
      orgId,
      branchId,
      userId,
      date: String(body.date).trim(),
      journalCode: 'SAL',
      narration:
        `Invoice ${invoiceNumber} - ${String(body.customerName || '').trim()}` +
        (fxRate === 1 ? '' : ` (${docCurrency} at ${fxRate})`),
      sourceDocType: 'INVOICE',
      sourceDocId: id,
      lines: invoicePostingLines({
        customerId: body.customerId ?? null,
        customerName: body.customerName,
        subtotal: toBase(Number(body.subtotal ?? 0), fxRate),
        cgstTotal: toBase(Number(body.cgstTotal ?? 0), fxRate),
        sgstTotal: toBase(Number(body.sgstTotal ?? 0), fxRate),
        igstTotal: toBase(Number(body.igstTotal ?? 0), fxRate),
        total: toBase(Number(body.total ?? 0), fxRate),
      }),
    });
  } catch (e: any) {
    await prisma.$executeRawUnsafe(`DELETE FROM Invoice WHERE id = ?`, id);
    const status = Number(e?.status || 400);
    return res.status(status).json({ error: `Invoice not saved: ${String(e?.message || e)}` });
  }

  res.status(201).json({ invoice: normalizeInvoiceResponse(row), strippedFields: stripped });
});

invoicesRouter.patch('/orgs/:orgId/invoices/:invoiceId', requirePermission(INVOICE_MODULE, PermissionAction.EDIT, INVOICE_SUBMODULE), async (req, res) => {
  const accountId = req.tenant!.accountId;
  const orgId = String(req.params.orgId);
  const invoiceId = String(req.params.invoiceId);
  if (orgId !== req.tenant!.orgId) return res.status(403).json({ error: 'orgId mismatch' });

  const existingRows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT * FROM Invoice WHERE id = ? AND accountId = ? AND orgId = ? AND branchId = ?`,
    invoiceId,
    accountId,
    orgId,
    req.tenant!.branchId
  );
  const existing = existingRows[0];
  if (!existing) return res.status(404).json({ error: 'Invoice not found' });

  const parsedPatch = invoiceUpsertSchema.parse(req.body);
  const editAccess = await resolveAccess(accountId, orgId, req.auth!.userId, req.tenant!.branchId);
  const { value: body, stripped } = filterFieldsByLevel(
    parsedPatch,
    fieldsFor(INVOICE_MODULE, INVOICE_SUBMODULE),
    levelFor(editAccess, INVOICE_MODULE, INVOICE_SUBMODULE, PermissionAction.EDIT)
  );

  if (await isPending(accountId, orgId, 'INVOICE', existing.id)) {
    return res.status(409).json({ error: 'This invoice is awaiting approval and cannot be edited' });
  }

  try {
    await prisma.$executeRawUnsafe(
      `UPDATE Invoice SET
        warehouseId = ?, number = ?, date = ?, dueDate = ?, refNo = ?, refDate = ?,
        customerId = ?, customerName = ?, customerGstin = ?, placeOfSupplyState = ?, taxType = ?,
        reverseCharge = ?, subtotal = ?, cgstTotal = ?, sgstTotal = ?, igstTotal = ?, gstTotal = ?, total = ?,
        paidAmount = ?, status = ?, sourceEstimateId = ?, itemsJson = ?, extrasJson = ?, updatedAt = CURRENT_TIMESTAMP
       WHERE id = ?`,
      String(body.warehouseId || '').trim() || null,
      String(body.number || existing.number).trim(),
      String(body.date).trim(),
      String(body.dueDate || '').trim() || null,
      String(body.refNo || '').trim() || null,
      String(body.refDate || '').trim() || null,
      String(body.customerId || '').trim() || null,
      String(body.customerName || '').trim(),
      String(body.customerGstin || '').trim() || null,
      String(body.placeOfSupplyState || '').trim() || null,
      String(body.taxType || '').trim() || null,
      body.reverseCharge ?? existing.reverseCharge ? 1 : 0,
      body.subtotal ?? 0,
      body.cgstTotal ?? 0,
      body.sgstTotal ?? 0,
      body.igstTotal ?? 0,
      body.gstTotal ?? 0,
      body.total ?? 0,
      body.paidAmount ?? toNumber(existing.paidAmount),
      String(body.status || existing.status || 'Draft').trim() || 'Draft',
      String(body.sourceEstimateId || '').trim() || null,
      JSON.stringify(body.items || []),
      extrasFrom(body),
      existing.id
    );
  } catch (e: any) {
    const msg = String(e?.message || '');
    if (msg.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'That invoice number is already used. Numbers are unique across every branch.' });
    }
    throw e;
  }

  const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM Invoice WHERE id = ?`, existing.id);
  const row = rows[0];
  if (!row) return res.status(500).json({ error: 'Failed to update invoice' });

  await auditInvoiceChange(req, 'UPDATE', existing, row);

  res.json({ invoice: normalizeInvoiceResponse(row), strippedFields: stripped });
});

invoicesRouter.patch('/orgs/:orgId/invoices/:invoiceId/status', requirePermission(INVOICE_MODULE, PermissionAction.EDIT, INVOICE_SUBMODULE), async (req, res) => {
  const accountId = req.tenant!.accountId;
  const orgId = String(req.params.orgId);
  const invoiceId = String(req.params.invoiceId);
  if (orgId !== req.tenant!.orgId) return res.status(403).json({ error: 'orgId mismatch' });

  const existingRows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT * FROM Invoice WHERE id = ? AND accountId = ? AND orgId = ? AND branchId = ?`,
    invoiceId,
    accountId,
    orgId,
    req.tenant!.branchId
  );
  const existing = existingRows[0];
  if (!existing) return res.status(404).json({ error: 'Invoice not found' });

  const body = statusSchema.parse(req.body);

  await prisma.$executeRawUnsafe(
    `UPDATE Invoice SET status = ?, paidAmount = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
    String(body.status || existing.status).trim(),
    body.paidAmount ?? toNumber(existing.paidAmount),
    existing.id
  );
  const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM Invoice WHERE id = ?`, existing.id);
  const row = rows[0];
  if (!row) return res.status(500).json({ error: 'Failed to update invoice status' });

  await auditInvoiceChange(req, 'STATUS', existing, row);

  res.json({ invoice: normalizeInvoiceResponse(row) });
});

invoicesRouter.delete('/orgs/:orgId/invoices/:invoiceId', requirePermission(INVOICE_MODULE, PermissionAction.DELETE, INVOICE_SUBMODULE), async (req, res) => {
  const accountId = req.tenant!.accountId;
  const orgId = String(req.params.orgId);
  const invoiceId = String(req.params.invoiceId);
  if (orgId !== req.tenant!.orgId) return res.status(403).json({ error: 'orgId mismatch' });

  const existingRows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT id, number, total FROM Invoice WHERE id = ? AND accountId = ? AND orgId = ? AND branchId = ?`,
    invoiceId,
    accountId,
    orgId,
    req.tenant!.branchId
  );
  const existing = existingRows[0];
  if (!existing) return res.status(404).json({ error: 'Invoice not found' });

  // Reverse any posted entry with a contra entry. Posted rows stay immutable,
  // so the audit trail keeps both the original and its reversal.
  const posted = await prisma.journalEntry.findMany({
    where: {
      accountId,
      orgId,
      sourceDocType: 'INVOICE',
      sourceDocId: existing.id,
      status: 'POSTED',
    },
    select: { id: true },
  });
  for (const p of posted) {
    await reverseEntry({
      accountId,
      orgId,
      branchId: req.tenant!.branchId,
      userId: req.auth!.userId,
      entryId: p.id,
      narration: 'Invoice deleted',
    });
  }

  await prisma.$executeRawUnsafe(`DELETE FROM Invoice WHERE id = ?`, existing.id);
  await auditInvoiceChange(req, 'DELETE', existing, null);
  res.json({ ok: true, reversedEntries: posted.length });
});
