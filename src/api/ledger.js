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

/**
 * A manual journal entry, posted to the general ledger on the server.
 *
 * The route has existed since the ledger was built and nothing called it: a
 * journal entry raised in the app was written to the browser and nowhere else.
 * That is worse than losing a document — a journal is a ledger posting, so the
 * trial balance, the P&L and the balance sheet differed by machine, and the
 * server's own books were missing entries somebody had made on purpose.
 */
export const postJournalEntry = ({ date, journalCode = 'JV', narration, lines }) =>
  apiFetch(`${base()}/entries`, {
    method: 'POST',
    body: { date, journalCode, narration: narration || null, lines },
    ...opts,
  });

/**
 * Reversing a posted entry, which is how a journal is taken back.
 *
 * A posting that has reached the ledger is never edited or erased — it is
 * reversed by an equal and opposite entry, so the audit trail shows both what
 * was recorded and that it was undone.
 */
export const reverseJournalEntry = (entryId, narration) =>
  apiFetch(`${base()}/entries/${entryId}/reverse`, {
    method: 'POST',
    body: { narration: narration || undefined },
    ...opts,
  });
