import { apiFetch } from './http';

/**
 * Receipts and payments.
 *
 * The server owns the number, the double-entry posting and the party balance;
 * this module only carries the request. Requirement 14 lives in
 * `listPaymentModes`: the mode a user picks is a real cash or bank ledger, not
 * a free-text label, so the money lands in a named account instead of a string
 * nobody can reconcile later.
 */

const orgId = () => {
  const id = String(localStorage.getItem('activeOrgId') || '').trim();
  if (!id) throw new Error('Missing active org. Please select an organization.');
  return id;
};

const base = () => `/orgs/${encodeURIComponent(orgId())}`;

// Payments belong to a branch, not a warehouse; sending the warehouse header
// makes the server reject the call for users with no warehouse access.
const opts = { skipWarehouseHeader: true };

/** The cash and bank ledgers this branch may receive or pay through. */
export async function listPaymentModes() {
  const data = await apiFetch(`${base()}/payment-modes`, opts);
  return Array.isArray(data?.modes) ? data.modes : [];
}

export async function listPayments({ direction = 'RECEIPT', unreconciled = false, limit } = {}) {
  const params = new URLSearchParams({ direction });
  if (unreconciled) params.set('unreconciled', 'true');
  if (limit) params.set('limit', String(limit));
  const data = await apiFetch(`${base()}/payments?${params.toString()}`, opts);
  return Array.isArray(data?.payments) ? data.payments : [];
}

/**
 * Creates the payment and posts it to the ledger in one server call.
 *
 * Returns the stored row, whose `number` is the series-allocated one — prefer
 * it over any number generated in the browser, which two tabs can duplicate.
 */
export async function createPayment(payload) {
  const data = await apiFetch(`${base()}/payments`, { method: 'POST', body: payload, ...opts });
  return data?.payment || null;
}

/** Reversal, not deletion: the original stays in the audit trail. */
export async function reversePayment(paymentId) {
  const data = await apiFetch(`${base()}/payments/${encodeURIComponent(paymentId)}/reverse`, {
    method: 'POST',
    ...opts,
  });
  return data?.payment || null;
}

export async function reconcilePayment(paymentId, { reconciled, bankDate, statementRef } = {}) {
  const data = await apiFetch(`${base()}/payments/${encodeURIComponent(paymentId)}/reconcile`, {
    method: 'PATCH',
    body: { reconciled: Boolean(reconciled), bankDate: bankDate ?? null, statementRef: statementRef ?? null },
    ...opts,
  });
  return data?.payment || null;
}
