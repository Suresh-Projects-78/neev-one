import { prisma } from '../utils/prisma.js';
import { encryptSecret, decryptSecret } from './mailer.js';

/**
 * e-Invoice (IRP) integration.
 *
 * The GST network's Invoice Registration Portal is reached through a GSP /
 * API-gateway REST endpoint (MasterGST, ClearTax, Cygnet, a self-hosted NIC
 * proxy, or the NIC sandbox). The org stores its gateway URL and credentials
 * once; registering an invoice POSTs the NIC INV-01 payload and stores the
 * returned IRN + signed QR on the invoice row.
 *
 * The HTTP transport is injectable so the whole flow is testable without a
 * live IRP.
 */

export type EInvoiceConfig = {
  mode: string;
  baseUrl: string;
  gstin: string;
  username: string;
  password: string;
  clientId: string;
  clientSecret: string;
  headers: Record<string, string>;
  autoRegister: boolean;
};

const SANDBOX_HINT =
  'No e-Invoice gateway configured. Set the IRP/GSP endpoint and credentials under Settings → Tax & Compliance.';

export async function getEInvoiceSetting(orgId: string) {
  return prisma.eInvoiceSetting.findUnique({ where: { orgId } });
}

export async function getEInvoiceConfig(orgId: string): Promise<EInvoiceConfig | null> {
  const row = await getEInvoiceSetting(orgId);
  if (!row || !String(row.baseUrl || '').trim()) return null;

  let headers: Record<string, string> = {};
  try {
    const parsed = JSON.parse(String(row.headersJson || '{}'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      headers = Object.fromEntries(Object.entries(parsed).map(([k, v]) => [String(k), String(v)]));
    }
  } catch {
    headers = {};
  }

  return {
    mode: String(row.mode || 'SANDBOX'),
    baseUrl: String(row.baseUrl || '').replace(/\/+$/, ''),
    gstin: String(row.gstin || ''),
    username: String(row.username || ''),
    password: row.passwordEnc ? decryptSecret(row.passwordEnc) : '',
    clientId: String(row.clientId || ''),
    clientSecret: row.clientSecretEnc ? decryptSecret(row.clientSecretEnc) : '',
    headers,
    autoRegister: Boolean(row.autoRegister),
  };
}

export async function saveEInvoiceSetting(
  accountId: string,
  orgId: string,
  userId: string,
  input: {
    mode?: string;
    baseUrl?: string | null;
    gstin?: string | null;
    username?: string | null;
    password?: string | null;
    clientId?: string | null;
    clientSecret?: string | null;
    headersJson?: string | null;
    autoRegister?: boolean;
  }
) {
  const data: Record<string, unknown> = {
    accountId,
    orgId,
    updatedByUserId: userId,
  };
  if (input.mode !== undefined) data.mode = input.mode === 'PRODUCTION' ? 'PRODUCTION' : 'SANDBOX';
  if (input.baseUrl !== undefined) data.baseUrl = input.baseUrl ? String(input.baseUrl).trim() : null;
  if (input.gstin !== undefined) data.gstin = input.gstin ? String(input.gstin).trim().toUpperCase() : null;
  if (input.username !== undefined) data.username = input.username ? String(input.username).trim() : null;
  if (input.clientId !== undefined) data.clientId = input.clientId ? String(input.clientId).trim() : null;
  if (input.headersJson !== undefined) data.headersJson = input.headersJson ? String(input.headersJson) : null;
  if (input.autoRegister !== undefined) data.autoRegister = Boolean(input.autoRegister);
  // Blank secret = leave stored secret untouched; the settings form never
  // echoes secrets back, so an untouched field arrives empty.
  if (input.password) data.passwordEnc = encryptSecret(String(input.password));
  if (input.clientSecret) data.clientSecretEnc = encryptSecret(String(input.clientSecret));

  const { accountId: _a, orgId: _o, ...update } = data;
  return prisma.eInvoiceSetting.upsert({
    where: { orgId },
    create: data as any,
    update: update as any,
  });
}

// ---------------------------------------------------------------------------
// IRP calls
// ---------------------------------------------------------------------------

export type IrpResult = {
  ok: boolean;
  irn?: string;
  ackNo?: string;
  ackDate?: string;
  signedQr?: string;
  error?: string;
  raw?: unknown;
};

type FetchLike = (url: string, init?: any) => Promise<{ status: number; json: () => Promise<any>; text: () => Promise<string> }>;

const authHeaders = (cfg: EInvoiceConfig): Record<string, string> => ({
  'Content-Type': 'application/json',
  ...(cfg.username ? { username: cfg.username } : {}),
  ...(cfg.password ? { password: cfg.password } : {}),
  ...(cfg.clientId ? { client_id: cfg.clientId } : {}),
  ...(cfg.clientSecret ? { client_secret: cfg.clientSecret } : {}),
  ...(cfg.gstin ? { gstin: cfg.gstin } : {}),
  ...cfg.headers,
});

/** Pull IRN fields out of the many response shapes gateways use. */
const parseIrpResponse = (body: any): IrpResult => {
  // Gateways wrap the NIC response differently: {data: {...}}, {result: {...}},
  // or the NIC shape itself {Status, Data|ErrorDetails}.
  const layers = [body, body?.data, body?.result, body?.Data, body?.response].filter(
    (x) => x && typeof x === 'object'
  );
  for (const layer of layers) {
    const irn = layer.Irn || layer.irn || layer.IRN;
    if (irn) {
      return {
        ok: true,
        irn: String(irn),
        ackNo: String(layer.AckNo ?? layer.ackNo ?? layer.ack_no ?? ''),
        ackDate: String(layer.AckDt ?? layer.ackDt ?? layer.ack_dt ?? layer.AckDate ?? ''),
        signedQr: String(layer.SignedQRCode ?? layer.signedQRCode ?? layer.signed_qr_code ?? ''),
        raw: body,
      };
    }
  }

  const errors =
    body?.ErrorDetails || body?.errorDetails || body?.error_details || body?.errors || body?.error || body?.message;
  let error = '';
  if (Array.isArray(errors)) {
    error = errors
      .map((e: any) => String(e?.ErrorMessage ?? e?.error_message ?? e?.message ?? JSON.stringify(e)))
      .join('; ');
  } else if (errors && typeof errors === 'object') {
    error = String((errors as any).ErrorMessage ?? (errors as any).message ?? JSON.stringify(errors));
  } else if (errors) {
    error = String(errors);
  }
  return { ok: false, error: error || 'IRP did not return an IRN', raw: body };
};

/**
 * Register one INV-01 payload on the IRP. `doFetch` defaults to global fetch;
 * tests inject a stub.
 */
export async function registerOnIrp(
  orgId: string,
  payload: unknown,
  doFetch: FetchLike = fetch as unknown as FetchLike
): Promise<IrpResult> {
  const cfg = await getEInvoiceConfig(orgId);
  if (!cfg) return { ok: false, error: SANDBOX_HINT };

  const url = `${cfg.baseUrl}/invoice`;
  let res: Awaited<ReturnType<FetchLike>>;
  try {
    res = await doFetch(url, {
      method: 'POST',
      headers: authHeaders(cfg),
      body: JSON.stringify(payload),
    });
  } catch (err: any) {
    return { ok: false, error: `Could not reach the e-Invoice gateway: ${String(err?.message || err)}` };
  }

  let body: any = null;
  try {
    body = await res.json();
  } catch {
    const text = await res.text().catch(() => '');
    return { ok: false, error: `Gateway answered ${res.status} with a non-JSON body${text ? `: ${text.slice(0, 200)}` : ''}` };
  }

  if (res.status >= 400) {
    const parsed = parseIrpResponse(body);
    return { ok: false, error: parsed.error || `Gateway answered ${res.status}`, raw: body };
  }
  return parseIrpResponse(body);
}

/** Cheap reachability check for the settings form's Test button. */
export async function testIrpConnection(
  orgId: string,
  doFetch: FetchLike = fetch as unknown as FetchLike
): Promise<{ ok: boolean; error?: string }> {
  const cfg = await getEInvoiceConfig(orgId);
  if (!cfg) return { ok: false, error: SANDBOX_HINT };
  try {
    const res = await doFetch(cfg.baseUrl, { method: 'GET', headers: authHeaders(cfg) });
    // Any HTTP answer means DNS/TLS/network are fine; auth is proven on the
    // first real registration.
    return res.status < 500 ? { ok: true } : { ok: false, error: `Gateway answered ${res.status}` };
  } catch (err: any) {
    return { ok: false, error: `Could not reach the e-Invoice gateway: ${String(err?.message || err)}` };
  }
}
