import { apiFetch } from './http';

const orgId = () => {
  const id = String(localStorage.getItem('activeOrgId') || '').trim();
  if (!id) throw new Error('Missing active org. Please select an organization.');
  return id;
};
const base = () => `/orgs/${encodeURIComponent(orgId())}/ledger`;

// The ledger is branch-scoped, not warehouse-scoped. Sending x-warehouse-id
// would make tenantContext check warehouse access the caller may not have, and
// reject a request that has nothing to do with stock.
const opts = { skipWarehouseHeader: true };

export const getTrialBalance = (allBranches = false) =>
  apiFetch(`${base()}/trial-balance${allBranches ? '?allBranches=true' : ''}`, opts);

export const getLedgerAccounts = () => apiFetch(`${base()}/accounts`, opts);

export const getJournalEntries = (limit = 50) => apiFetch(`${base()}/entries?limit=${limit}`, opts);
