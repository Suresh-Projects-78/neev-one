/**
 * Notes raised on account, and knocking them off later.
 *
 * A return usually answers one document, and then the note simply names it. But
 * goods come back in a heap that no single bill accounts for — three deliveries,
 * one rejected pallet — and forcing a clerk to guess which bill it belonged to
 * produces a tidy record of a fiction.
 *
 * So a note may instead be raised ON ACCOUNT: the value sits against the party
 * as unsettled, visible and owed, until someone allocates it against the bills
 * or invoices it should reduce. Allocations live on the note itself, so the
 * arithmetic is always recomputed and never drifts.
 *
 *   note.settlementMode : 'DOCUMENT' (default) | 'ON_ACCOUNT'
 *   note.billIds[] / note.invoiceIds[] : the documents it was raised against
 *   note.allocations[] : { docId, amount, date }
 */

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const round2 = (n) => Math.round(n * 100) / 100;

export const isLive = (doc) => String(doc?.status || '').trim().toLowerCase() !== 'cancelled';

export const isOnAccount = (note) => String(note?.settlementMode || '') === 'ON_ACCOUNT';

/** What the note is worth, what has been knocked off, and what is left. */
export function noteBalance(note) {
  const total = round2(num(note?.total));
  const allocated = round2((note?.allocations || []).reduce((t, a) => t + num(a.amount), 0));
  return {
    total,
    allocated,
    unsettled: round2(Math.max(0, total - allocated)),
  };
}

/** Every note of this party that still has value sitting on account. */
export function openNotesForParty(notes, { companyId, partyKey, partyId }) {
  return (Array.isArray(notes) ? notes : [])
    .filter((n) => Number(n?.companyId) === Number(companyId))
    .filter((n) => isLive(n))
    .filter((n) => isOnAccount(n))
    .filter((n) => String(n?.[partyKey] ?? '') === String(partyId ?? ''))
    .map((n) => ({ note: n, ...noteBalance(n) }))
    .filter((row) => row.unsettled > 0.0001);
}

/** What a bill or invoice still owes, after payments and after knock-offs. */
export function documentOutstanding(doc, notes) {
  const total = round2(num(doc?.total));
  const paid = round2(num(doc?.paidAmount));
  const knocked = round2(
    (Array.isArray(notes) ? notes : [])
      .filter((n) => isLive(n))
      .flatMap((n) => n?.allocations || [])
      .filter((a) => String(a?.docId ?? '') === String(doc?.id ?? ''))
      .reduce((t, a) => t + num(a.amount), 0)
  );
  return {
    total,
    paid,
    knocked,
    outstanding: round2(Math.max(0, total - paid - knocked)),
  };
}

/** Open documents of one party, oldest first — what a note can be knocked against. */
export function openDocumentsForParty(docs, notes, { companyId, partyKey, partyId }) {
  return (Array.isArray(docs) ? docs : [])
    .filter((d) => Number(d?.companyId) === Number(companyId))
    .filter((d) => isLive(d))
    .filter((d) => String(d?.status || '').trim().toLowerCase() !== 'draft')
    .filter((d) => String(d?.[partyKey] ?? '') === String(partyId ?? ''))
    .map((d) => ({ doc: d, ...documentOutstanding(d, notes) }))
    .filter((row) => row.outstanding > 0.0001)
    .sort((a, b) => String(a.doc.date || '').localeCompare(String(b.doc.date || '')));
}

/**
 * Spread an amount over open documents, oldest first. The clerk can override
 * every figure afterwards; this only saves the typing in the common case.
 */
export function suggestAllocation(amount, openRows) {
  let left = round2(num(amount));
  const out = [];
  for (const row of openRows) {
    if (left <= 0.0001) break;
    const take = round2(Math.min(left, row.outstanding));
    if (take <= 0) continue;
    out.push({ docId: String(row.doc.id), amount: take });
    left = round2(left - take);
  }
  return out;
}
