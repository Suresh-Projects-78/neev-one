import { apiFetch } from './http';

const orgId = () => {
  const id = String(localStorage.getItem('activeOrgId') || '').trim();
  if (!id) throw new Error('Missing active org. Please select an organization.');
  return id;
};
const base = () => `/orgs/${encodeURIComponent(orgId())}`;
const opts = { skipWarehouseHeader: true };

const q = (search) => (search ? `?search=${encodeURIComponent(search)}` : '');

export const listCustomers = (search) => apiFetch(`${base()}/customers${q(search)}`, opts);
export const createCustomer = (party) =>
  apiFetch(`${base()}/customers`, { method: 'POST', body: party, ...opts });

export const listVendors = (search) => apiFetch(`${base()}/vendors${q(search)}`, opts);
export const createVendor = (party) => apiFetch(`${base()}/vendors`, { method: 'POST', body: party, ...opts });

export const listItems = (search) => apiFetch(`${base()}/items${q(search)}`, opts);
export const createItem = (item) => apiFetch(`${base()}/items`, { method: 'POST', body: item, ...opts });

export const nextNumber = (docType, date) =>
  apiFetch(`${base()}/number-series/next/${encodeURIComponent(docType)}${date ? `?date=${date}` : ''}`, opts);
