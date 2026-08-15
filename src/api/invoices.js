import { apiFetch } from './http';

const getOrgId = () => String(localStorage.getItem('activeOrgId') || '').trim();

const requireOrgId = () => {
  const orgId = getOrgId();
  if (!orgId) throw new Error('Missing active org. Please select an organization.');
  return orgId;
};

export async function listInvoicesApi() {
  const orgId = requireOrgId();
  const data = await apiFetch(`/orgs/${orgId}/invoices`);
  return Array.isArray(data?.invoices) ? data.invoices : [];
}

export async function createInvoiceApi(payload) {
  const orgId = requireOrgId();
  const data = await apiFetch(`/orgs/${orgId}/invoices`, {
    method: 'POST',
    body: payload,
  });
  return data?.invoice || null;
}

export async function updateInvoiceApi(invoiceId, payload) {
  const orgId = requireOrgId();
  const data = await apiFetch(`/orgs/${orgId}/invoices/${invoiceId}`, {
    method: 'PATCH',
    body: payload,
  });
  return data?.invoice || null;
}

export async function updateInvoiceStatusApi(invoiceId, payload) {
  const orgId = requireOrgId();
  const data = await apiFetch(`/orgs/${orgId}/invoices/${invoiceId}/status`, {
    method: 'PATCH',
    body: payload,
  });
  return data?.invoice || null;
}

export async function deleteInvoiceApi(invoiceId) {
  const orgId = requireOrgId();
  const data = await apiFetch(`/orgs/${orgId}/invoices/${invoiceId}`, {
    method: 'DELETE',
  });
  return Boolean(data?.ok);
}
