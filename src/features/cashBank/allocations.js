/**
 * Allocating an imported bank line across the book.
 *
 * The architecture the specification draws, enforced here: the BANK
 * TRANSACTION is the immutable parent — what the bank said happened — and
 * ALLOCATION ROWS are child records that say what the money WAS. A ₹10,000
 * debit may be ₹8,000 of GST and ₹2,000 of interest; the parent never moves,
 * however the children are rearranged, because the bank's figure is the one
 * fact nobody in this building gets to edit.
 *
 * Stored in `db.bankAllocations`, one row per split line:
 *   { id, companyId, bankTransactionId, ledgerId, partyId?, partyKind?,
 *     amount, narration, journalEntryId?, createdAt }
 *
 * `journalEntryId` is the accounting linkage: it is set when a full
 * allocation posts, and it points at the one journal that carried the split
 * into the ledger — through the same engine every other entry uses.
 */

const safeArray = (v) => (Array.isArray(v) ? v : []);
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** The child rows of one bank transaction. */
export const allocationsForTxn = (db, companyId, bankTransactionId) =>
  safeArray(db?.bankAllocations)
    .filter((a) => Number(a?.companyId) === Number(companyId))
    .filter((a) => String(a?.bankTransactionId) === String(bankTransactionId));

/**
 * The three figures the specification says are always on screen, and the
 * status that follows from them. Derived, never stored: a stored status can
 * disagree with the rows it summarises, and then one of them is lying.
 */
export const allocationSummary = (txn, rows) => {
  const bankAmount = r2(Math.abs(Number(txn?.amount || 0)));
  const allocated = r2(safeArray(rows).reduce((t, a) => t + Math.abs(Number(a?.amount || 0)), 0));
  const difference = r2(bankAmount - allocated);
  return {
    bankAmount,
    allocated,
    difference,
    status:
      allocated <= 0.005
        ? 'Unallocated'
        : Math.abs(difference) <= 0.005
          ? 'Allocated'
          : 'Partially allocated',
  };
};

/**
 * What stops a set of rows being saved, or being POSTED.
 *
 * Saving a partial allocation is allowed — half-done work is still work worth
 * keeping — but posting to the ledger demands the whole bank amount accounted
 * for: a journal for part of a movement leaves the rest unexplained in
 * nobody's book.
 */
export const validateAllocation = (txn, rows) => {
  const problems = [];
  const live = safeArray(rows).filter((a) => Math.abs(Number(a?.amount || 0)) > 0.005);
  if (!live.length) problems.push('Nothing is allocated yet.');
  for (const a of live) {
    if (!String(a?.ledgerId || '').trim()) problems.push('Every allocation row needs a ledger.');
  }
  const { difference } = allocationSummary(txn, live);
  if (difference < -0.005) problems.push('Allocated more than the bank amount.');
  return {
    problems: [...new Set(problems)],
    canSave: !problems.some((p) => p !== 'Nothing is allocated yet.') && live.length > 0,
    canPost: problems.length === 0 && Math.abs(difference) <= 0.005,
  };
};

/**
 * The journal a full allocation posts — one entry, balanced by construction.
 *
 * Money OUT of the bank credits the bank account and debits what it paid
 * for; money IN debits the bank and credits where it came from. The lines
 * use chart-row ids, the same shape the journal form writes, so the entry is
 * indistinguishable from one typed by hand — because it is one.
 */
export const allocationJournalLines = (txn, rows) => {
  const out = String(txn?.direction || '').toUpperCase() === 'OUT';
  const bankAmount = r2(Math.abs(Number(txn?.amount || 0)));
  const bankLeg = {
    accountId: String(txn?.cashBankAccountId || ''),
    debit: out ? 0 : bankAmount,
    credit: out ? bankAmount : 0,
  };
  const splitLegs = safeArray(rows)
    .filter((a) => Math.abs(Number(a?.amount || 0)) > 0.005)
    .map((a) => ({
      accountId: String(a.ledgerId),
      debit: out ? r2(Math.abs(Number(a.amount))) : 0,
      credit: out ? 0 : r2(Math.abs(Number(a.amount))),
    }));
  return [bankLeg, ...splitLegs];
};
