import { apiFetch } from './http';

const requireOrgId = () => {
  const orgId = String(localStorage.getItem('activeOrgId') || '').trim();
  if (!orgId) throw new Error('Missing active org. Please select an organization.');
  return orgId;
};

export const hasEInvoiceApiSession = () =>
  Boolean(String(localStorage.getItem('token') || '').trim() && String(localStorage.getItem('activeOrgId') || '').trim());

export async function getEInvoiceSettingsApi() {
  const data = await apiFetch(`/orgs/${requireOrgId()}/einvoice/settings`);
  return data?.settings || null;
}

export async function saveEInvoiceSettingsApi(payload) {
  const data = await apiFetch(`/orgs/${requireOrgId()}/einvoice/settings`, { method: 'PUT', body: payload });
  return data?.settings || null;
}

export async function testEInvoiceConnectionApi() {
  return apiFetch(`/orgs/${requireOrgId()}/einvoice/test`, { method: 'POST', body: {} });
}

/** Registers one invoice on the IRP. `payload` is the NIC INV-01 JSON. */
export async function registerEInvoiceApi(backendInvoiceId, payload) {
  return apiFetch(`/orgs/${requireOrgId()}/invoices/${encodeURIComponent(backendInvoiceId)}/einvoice`, {
    method: 'POST',
    body: { payload },
  });
}

/** Generates an e-Way Bill from the invoice's IRN (NIC provider). */
export async function generateEwaybillApi(backendInvoiceId, transport = {}) {
  return apiFetch(`/orgs/${requireOrgId()}/invoices/${encodeURIComponent(backendInvoiceId)}/ewaybill`, {
    method: 'POST',
    body: transport,
  });
}
