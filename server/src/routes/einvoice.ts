import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { requireTenantContext } from '../middleware/tenantContext.js';
import { requirePermission } from '../middleware/rbac.js';
import { PermissionAction } from '../constants/enums.js';
import { isFeatureEnabled } from '../services/features.js';
import {
  getEInvoiceSetting,
  saveEInvoiceSetting,
  registerOnIrp,
  testIrpConnection,
} from '../services/einvoice.js';

/**
 * e-Invoice (IRP) surface: gateway settings and per-invoice IRN registration.
 * The client builds the NIC INV-01 payload (it already owns that logic for
 * the manual JSON download); the server owns credentials, the gateway call,
 * and persisting the IRN onto the invoice row.
 */
export const einvoiceRouter = Router();
einvoiceRouter.use(requireAuth, requireTenantContext);

const SETTINGS_VIEW = requirePermission('SETTINGS', PermissionAction.VIEW, 'Company Profile');
const SETTINGS_EDIT = requirePermission('SETTINGS', PermissionAction.EDIT, 'Company Profile');
const INVOICE_EDIT = requirePermission('SALES', PermissionAction.EDIT, 'Invoices');

const orgOk = (req: any, res: any) => {
  if (String(req.params.orgId) !== String(req.tenant!.orgId)) {
    res.status(403).json({ error: 'orgId mismatch' });
    return false;
  }
  return true;
};

/** Never returns secrets — only whether they are set. */
const publicSetting = (row: any) => ({
  mode: row?.mode || 'SANDBOX',
  baseUrl: row?.baseUrl || '',
  gstin: row?.gstin || '',
  username: row?.username || '',
  clientId: row?.clientId || '',
  headersJson: row?.headersJson || '',
  autoRegister: Boolean(row?.autoRegister),
  hasPassword: Boolean(row?.passwordEnc),
  hasClientSecret: Boolean(row?.clientSecretEnc),
  verifiedAt: row?.verifiedAt || null,
  lastError: row?.lastError || null,
});

einvoiceRouter.get('/orgs/:orgId/einvoice/settings', SETTINGS_VIEW, async (req, res) => {
  if (!orgOk(req, res)) return;
  const row = await getEInvoiceSetting(req.tenant!.orgId);
  res.json({ settings: publicSetting(row) });
});

const settingsSchema = z.object({
  mode: z.enum(['SANDBOX', 'PRODUCTION']).optional(),
  baseUrl: z.string().max(500).optional().nullable(),
  gstin: z.string().max(15).optional().nullable(),
  username: z.string().max(200).optional().nullable(),
  password: z.string().max(500).optional().nullable(),
  clientId: z.string().max(200).optional().nullable(),
  clientSecret: z.string().max(500).optional().nullable(),
  headersJson: z
    .string()
    .max(4000)
    .optional()
    .nullable()
    .refine(
      (v) => {
        if (!v) return true;
        try {
          const parsed = JSON.parse(v);
          return parsed && typeof parsed === 'object' && !Array.isArray(parsed);
        } catch {
          return false;
        }
      },
      { message: 'Extra headers must be a JSON object' }
    ),
  autoRegister: z.boolean().optional(),
});

einvoiceRouter.put('/orgs/:orgId/einvoice/settings', SETTINGS_EDIT, async (req, res) => {
  if (!orgOk(req, res)) return;
  const input = settingsSchema.parse(req.body || {});
  const row = await saveEInvoiceSetting(req.tenant!.accountId, req.tenant!.orgId, req.auth!.userId, input);
  res.json({ settings: publicSetting(row) });
});

einvoiceRouter.post('/orgs/:orgId/einvoice/test', SETTINGS_EDIT, async (req, res) => {
  if (!orgOk(req, res)) return;
  const result = await testIrpConnection(req.tenant!.orgId);
  await prisma.eInvoiceSetting.updateMany({
    where: { orgId: req.tenant!.orgId },
    data: result.ok ? { verifiedAt: new Date(), lastError: null } : { lastError: result.error || 'Unreachable' },
  });
  res.status(result.ok ? 200 : 400).json(result);
});

/**
 * Register one invoice on the IRP. Body: { payload } — the NIC INV-01 JSON
 * built client-side. On success the IRN lands on the invoice row.
 */
einvoiceRouter.post('/orgs/:orgId/invoices/:invoiceId/einvoice', INVOICE_EDIT, async (req, res) => {
  if (!orgOk(req, res)) return;
  const { accountId, orgId } = req.tenant!;

  if (!(await isFeatureEnabled(accountId, orgId, 'einvoice'))) {
    return res.status(400).json({ error: 'e-Invoicing is switched off for this company (Settings → Features).' });
  }

  const invoice = await prisma.invoice.findFirst({
    where: { id: String(req.params.invoiceId), accountId, orgId },
  });
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
  if (invoice.irn && invoice.irnStatus === 'REGISTERED') {
    return res.status(409).json({ error: `Invoice already has IRN ${invoice.irn}` });
  }

  const payload = req.body?.payload;
  if (!payload || typeof payload !== 'object') {
    return res.status(400).json({ error: 'Missing INV-01 payload' });
  }

  const result = await registerOnIrp(orgId, payload);
  if (!result.ok) {
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { irnStatus: 'FAILED', irnError: String(result.error || 'Registration failed').slice(0, 1000) },
    });
    return res.status(502).json({ error: result.error || 'IRP registration failed' });
  }

  const updated = await prisma.invoice.update({
    where: { id: invoice.id },
    data: {
      irn: result.irn,
      irnStatus: 'REGISTERED',
      irnAckNo: result.ackNo || null,
      irnAckDate: result.ackDate || null,
      irnSignedQr: result.signedQr || null,
      irnError: null,
      irnRegisteredAt: new Date(),
    },
  });

  res.json({
    ok: true,
    irn: updated.irn,
    ackNo: updated.irnAckNo,
    ackDate: updated.irnAckDate,
    signedQr: updated.irnSignedQr,
  });
});
