import { Router } from 'express';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { prisma } from '../utils/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { requireTenantContext } from '../middleware/tenantContext.js';
import { requirePermission } from '../middleware/rbac.js';
import { PermissionAction } from '../constants/enums.js';
import { ensureLedgerSetup, invoicePostingLines, postEntry, reverseEntry } from '../services/ledger.js';

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
  warehouseId: z.string().optional().nullable(),
  number: z.string().min(1),
  date: z.string().min(1),
  dueDate: z.string().optional().nullable(),
  refNo: z.string().optional().nullable(),
  refDate: z.string().optional().nullable(),
  customerId: z.string().optional().nullable(),
  customerName: z.string().min(1),
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

  const body = invoiceUpsertSchema.parse(req.body);
  const branchId = String(body.branchId || req.tenant!.branchId || '').trim();
  if (!branchId) return res.status(400).json({ error: 'Missing branchId' });

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
      String(body.number).trim(),
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

  // Post the invoice to the general ledger. A failure here is not silent: the
  // invoice row is removed so the books and the document list cannot diverge.
  try {
    await ensureLedgerSetup(accountId, orgId, userId);
    await postEntry({
      accountId,
      orgId,
      branchId,
      userId,
      date: String(body.date).trim(),
      journalCode: 'SAL',
      narration: `Invoice ${String(body.number).trim()} - ${String(body.customerName || '').trim()}`,
      sourceDocType: 'INVOICE',
      sourceDocId: id,
      lines: invoicePostingLines({
        customerId: body.customerId ?? null,
        customerName: body.customerName,
        subtotal: body.subtotal ?? 0,
        cgstTotal: body.cgstTotal ?? 0,
        sgstTotal: body.sgstTotal ?? 0,
        igstTotal: body.igstTotal ?? 0,
        total: body.total ?? 0,
      }),
    });
  } catch (e: any) {
    await prisma.$executeRawUnsafe(`DELETE FROM Invoice WHERE id = ?`, id);
    const status = Number(e?.status || 400);
    return res.status(status).json({ error: `Invoice not saved: ${String(e?.message || e)}` });
  }

  res.status(201).json({ invoice: normalizeInvoiceResponse(row) });
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

  const body = invoiceUpsertSchema.parse(req.body);

  try {
    await prisma.$executeRawUnsafe(
      `UPDATE Invoice SET
        warehouseId = ?, number = ?, date = ?, dueDate = ?, refNo = ?, refDate = ?,
        customerId = ?, customerName = ?, customerGstin = ?, placeOfSupplyState = ?, taxType = ?,
        subtotal = ?, cgstTotal = ?, sgstTotal = ?, igstTotal = ?, gstTotal = ?, total = ?,
        paidAmount = ?, status = ?, sourceEstimateId = ?, itemsJson = ?, updatedAt = CURRENT_TIMESTAMP
       WHERE id = ?`,
      String(body.warehouseId || '').trim() || null,
      String(body.number).trim(),
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

  res.json({ invoice: normalizeInvoiceResponse(row) });
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
