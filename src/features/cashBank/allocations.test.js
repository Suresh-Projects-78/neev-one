import { describe, expect, it } from 'vitest';

import { allocationJournalLines, allocationSummary, validateAllocation } from './allocations';

/**
 * The parent/child rule of statement allocation.
 *
 * The bank transaction is immutable evidence; the allocation rows say what
 * the money was. Everything here is derived from the two together — a stored
 * status or total could disagree with the rows it summarises.
 */

const TXN_OUT = { id: 31, cashBankAccountId: '502', direction: 'OUT', amount: 10000, date: '2026-09-01' };

describe('the three figures', () => {
  it('bank, allocated, difference — from the rows, not a stored field', () => {
    const rows = [
      { ledgerId: '610', amount: 8000 },
      { ledgerId: '620', amount: 2000 },
    ];
    expect(allocationSummary(TXN_OUT, rows)).toEqual({
      bankAmount: 10000,
      allocated: 10000,
      difference: 0,
      status: 'Allocated',
    });
  });

  it('reads partial as partial and empty as unallocated', () => {
    expect(allocationSummary(TXN_OUT, [{ ledgerId: '610', amount: 8000 }]).status).toBe('Partially allocated');
    expect(allocationSummary(TXN_OUT, []).status).toBe('Unallocated');
  });
});

describe('what may be saved, and what may be posted', () => {
  it('saves a partial split but refuses to post it', () => {
    const check = validateAllocation(TXN_OUT, [{ ledgerId: '610', amount: 8000 }]);
    expect(check.canSave).toBe(true);
    expect(check.canPost).toBe(false);
  });

  it('posts only when allocated equals the bank amount', () => {
    const check = validateAllocation(TXN_OUT, [
      { ledgerId: '610', amount: 8000 },
      { ledgerId: '620', amount: 2000 },
    ]);
    expect(check.canPost).toBe(true);
  });

  it('refuses to allocate more than the bank amount', () => {
    const check = validateAllocation(TXN_OUT, [{ ledgerId: '610', amount: 12000 }]);
    expect(check.canSave).toBe(false);
    expect(check.problems).toContain('Allocated more than the bank amount.');
  });

  it('demands a ledger on every row', () => {
    const check = validateAllocation(TXN_OUT, [{ ledgerId: '', amount: 5000 }]);
    expect(check.canSave).toBe(false);
  });
});

describe('the journal a full allocation becomes', () => {
  it('credits the bank and debits the split for money out', () => {
    const lines = allocationJournalLines(TXN_OUT, [
      { ledgerId: '610', amount: 8000 },
      { ledgerId: '620', amount: 2000 },
    ]);
    expect(lines).toEqual([
      { accountId: '502', debit: 0, credit: 10000 },
      { accountId: '610', debit: 8000, credit: 0 },
      { accountId: '620', debit: 2000, credit: 0 },
    ]);
  });

  it('debits the bank and credits the split for money in', () => {
    const lines = allocationJournalLines({ ...TXN_OUT, direction: 'IN' }, [{ ledgerId: '410', amount: 10000 }]);
    expect(lines).toEqual([
      { accountId: '502', debit: 10000, credit: 0 },
      { accountId: '410', debit: 0, credit: 10000 },
    ]);
  });

  /* Balanced by construction — the engine would refuse it otherwise, but a
     builder that relies on downstream refusal is a builder that ships bugs. */
  it('is balanced whatever the split', () => {
    const lines = allocationJournalLines(TXN_OUT, [
      { ledgerId: '610', amount: 3333.33 },
      { ledgerId: '620', amount: 6666.67 },
    ]);
    const dr = lines.reduce((t, l) => t + l.debit, 0);
    const cr = lines.reduce((t, l) => t + l.credit, 0);
    expect(Math.round((dr - cr) * 100)).toBe(0);
  });
});
