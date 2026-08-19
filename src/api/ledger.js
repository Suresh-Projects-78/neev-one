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

export const getTrialBalance = (allBranches = false, from = '', to = '') => {
  const q = new URLSearchParams();
  if (allBranches) q.set('allBranches', 'true');
  if (from) q.set('from', from);
  if (to) q.set('to', to);
  const qs = q.toString();
  return apiFetch(`${base()}/trial-balance${qs ? `?${qs}` : ''}`, opts);
};

export const getAccountLedgerLines = (ledgerAccountId, { from = '', to = '', allBranches = false } = {}) => {
  const q = new URLSearchParams();
  if (allBranches) q.set('allBranches', 'true');
  if (from) q.set('from', from);
  if (to) q.set('to', to);
  const qs = q.toString();
  return apiFetch(`${base()}/accounts/${encodeURIComponent(ledgerAccountId)}/lines${qs ? `?${qs}` : ''}`, opts);
};

export const getLedgerAccounts = () => apiFetch(`${base()}/accounts`, opts);

/**
 * Creates (or re-syncs, keyed by sourceKey) one server ledger account.
 * Used when a cash/bank ledger is added to the client chart of accounts so it
 * becomes a real payment mode in receipt/payment entry.
 */
export const createLedgerAccount = ({ name, accountType, controlKind, sourceKey }) =>
  apiFetch(`${base()}/accounts`, {
    ...opts,
    method: 'POST',
    body: { name, accountType, controlKind, sourceKey },
  });

export const getJournalEntries = (limit = 50) => apiFetch(`${base()}/entries?limit=${limit}`, opts);
