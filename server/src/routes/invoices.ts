import { Router } from 'express';
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
  itemId: z.string().optional().nullable(),
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
  subtotal: z.number().optional(),
  cgstTotal: z.number().optional(),
  sgstTotal: z.number().optional(),
  igstTotal: z.number().optional(),
  gstTotal: z.number().optional(),
  total: z.number().optional(),
  paidAmount: z.number().optional(),
  status: z.string().optional(),
  sourceEstimateId: z.string().optional().nullable(),
  items: z.array(invoiceItemSchema).default([]),
});

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
    subtotal: toNumber(row.subtotal),
    cgstTotal: toNumber(row.cgstTotal),
    sgstTotal: toNumber(row.sgstTotal),
    igstTotal: toNumber(row.igstTotal),
    gstTotal: toNumber(row.gstTotal),
    total: toNumber(row.total),
    paidAmount: toNumber(row.paidAmount),
    status: row.status || 'Draft',
    sourceEstimateId: row.sourceEstimateId || null,
    items,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
};

invoicesRouter.get('/orgs/:orgId/invoices', requirePermission(INVOICE_MODULE, PermissionAction.VIEW, INVOICE_SUBMODULE), async (req, res) => {
  const accountId = req.tenant!.accountId;
  const orgId = String(req.params.orgId);
  const branchId = req.tenant!.branchId;
  if (orgId !== req.tenant!.orgId) return res.status(403).json({ error: 'orgId mismatch' });

  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT * FROM Invoice
     WHERE accountId = ? AND orgId = ? AND branchId = ?
     ORDER BY date DESC, createdAt DESC`,
    accountId,
    orgId,
    branchId
  );

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
        customerId, customerName, customerGstin, placeOfSupplyState, taxType,
        subtotal, cgstTotal, sgstTotal, igstTotal, gstTotal, total, paidAmount,
        status, sourceEstimateId, itemsJson, createdByUserId, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
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
      userId
    );
  } catch (e: any) {
    const msg = String(e?.message || '');
    if (msg.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'Invoice number already exists for this branch' });
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
        subtotal = ?, cgstTotal = ?, sgstTotal = ?, igstTotal = ?, gstTotal = ?, total = ?,
        paidAmount = ?, status = ?, sourceEstimateId = ?, itemsJson = ?, updatedAt = CURRENT_TIMESTAMP
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
      existing.id
    );
  } catch (e: any) {
    const msg = String(e?.message || '');
    if (msg.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'Invoice number already exists for this branch' });
    }
    throw e;
  }

  const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM Invoice WHERE id = ?`, existing.id);
  const row = rows[0];
  if (!row) return res.status(500).json({ error: 'Failed to update invoice' });

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

  res.json({ invoice: normalizeInvoiceResponse(row) });
});

invoicesRouter.delete('/orgs/:orgId/invoices/:invoiceId', requirePermission(INVOICE_MODULE, PermissionAction.DELETE, INVOICE_SUBMODULE), async (req, res) => {
  const accountId = req.tenant!.accountId;
  const orgId = String(req.params.orgId);
  const invoiceId = String(req.params.invoiceId);
  if (orgId !== req.tenant!.orgId) return res.status(403).json({ error: 'orgId mismatch' });

  const existingRows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT id FROM Invoice WHERE id = ? AND accountId = ? AND orgId = ? AND branchId = ?`,
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
  res.json({ ok: true, reversedEntries: posted.length });
});
