import { describe, expect, it } from 'vitest';

import {
  challanRegister,
  monthWise,
  natureWise,
  partyWise,
  payableSummary,
  quarterWise,
  receivableSummary,
  tdsExceptions,
  tdsReconciliation,
  unmappedNatures,
} from './reports';

/**
 * The register, read from what was written rather than recomputed.
 *
 * Every figure comes from the normalized events — never from re-running the
 * rules over a document. A report that re-derived the tax from today's rules
 * would disagree with the challan already paid against last quarter's.
 */

const CONTRACTOR = 'CONTRACTOR_SUB_CONTRACTOR';
const PROFESSIONAL = 'PROFESSIONAL_SERVICES';

const event = (over) => ({
  companyId: 1,
  side: 'PAYABLE',
  status: 'Posted',
  partyId: 9,
  partyName: 'Steel Supply Co',
  panSnapshot: 'AABCU9603R',
  natureCode: CONTRACTOR,
  ruleVersionId: `${CONTRACTOR}@V2`,
  sectionReference: '393(1) Table 6(i)',
  sectionCode: '194C',
  ledgerId: '101',
  baseAmount: 100000,
  rate: 2,
  tdsAmount: 2000,
  transactionDate: '2026-09-12',
  returnQuarter: 'FY 2026-27 Q2',
  sourceType: 'bill',
  sourceId: 1,
  ...over,
});

const db = {
  chartOfAccounts: [
    { id: 101, companyId: 1, name: 'TDS Payable - Contractor', tdsNatureCode: CONTRACTOR },
    { id: 201, companyId: 1, name: 'TDS Receivable - Contractor', tdsNatureCode: CONTRACTOR },
  ],
  vendors: [{ id: 9, companyId: 1, name: 'Steel Supply Co', tdsNatureCode: CONTRACTOR }],
  customers: [{ id: 3, companyId: 1, name: 'ABC Industries', tdsNatureCode: PROFESSIONAL }],
  tdsTransactions: [
    { id: 1, ...event() },
    { id: 2, ...event({ sourceId: 2, tdsAmount: 500, baseAmount: 25000, transactionDate: '2026-08-02', returnQuarter: 'FY 2026-27 Q2' }) },
    { id: 3, ...event({ sourceId: 3, partyId: 4, partyName: 'Acme Works', natureCode: PROFESSIONAL, sectionCode: '194J(b)', sectionReference: '194J(b)', tdsAmount: 5000, baseAmount: 50000, transactionDate: '2026-05-10', returnQuarter: 'FY 2026-27 Q1' }) },
    { id: 4, ...event({ sourceType: 'receipt', sourceId: 8, side: 'RECEIVABLE', partyId: 3, partyName: 'ABC Industries', ledgerId: '201', tdsAmount: 1000, baseAmount: 100000 }) },
    /* Neither of these counts: one is another company's, one was reversed. */
    { id: 5, ...event({ companyId: 2, tdsAmount: 999 }) },
    { id: 6, ...event({ sourceId: 9, status: 'Reversed', tdsAmount: 777 }) },
  ],
  tdsChallans: [
    { id: 1, companyId: 1, number: 'CHL-1', paymentDate: '2026-09-07', taxAmount: 2000, interest: 0, lateFee: 0, otherAmount: 0 },
    { id: 2, companyId: 1, number: 'CHL-2', paymentDate: '2026-06-07', taxAmount: 5000, interest: 100, lateFee: 0, otherAmount: 0 },
  ],
  tdsChallanAllocations: [
    { id: 1, companyId: 1, challanId: 1, tdsTransactionId: 1, amount: 2000 },
    { id: 2, companyId: 1, challanId: 2, tdsTransactionId: 3, amount: 3000 },
  ],
};

describe('what is payable', () => {
  it('is what was deducted, less what challans have met', () => {
    expect(payableSummary(db, 1)).toEqual({ deducted: 7500, allocated: 5000, outstanding: 2500, count: 3 });
  });

  it('leaves out another company’s books and reversed events', () => {
    const rows = payableSummary(db, 1);
    expect(rows.deducted).not.toBe(7500 + 999);
    expect(rows.count).toBe(3);
  });

  it('counts the receivable side separately', () => {
    expect(receivableSummary(db, 1)).toEqual({ deducted: 1000, count: 1 });
  });
});

describe('the groupings', () => {
  it('totals by party, biggest first', () => {
    const rows = partyWise(db, 1, { side: 'PAYABLE' });
    expect(rows.map((r) => [r.partyName, r.tdsAmount])).toEqual([
      ['Acme Works', 5000],
      ['Steel Supply Co', 2500],
    ]);
  });

  /* The reference each event carried, not today's — a quarter either side of
     April 2026 legitimately shows both. */
  it('totals by nature and keeps the references the events carried', () => {
    const rows = natureWise(db, 1, { side: 'PAYABLE' });
    const contractor = rows.find((r) => r.natureCode === CONTRACTOR);
    expect(contractor.tdsAmount).toBe(2500);
    expect(contractor.references).toEqual(['393(1) Table 6(i)']);
  });

  it('totals by month and by return quarter', () => {
    expect(monthWise(db, 1, { side: 'PAYABLE' })).toEqual([
      { month: '2026-05', tdsAmount: 5000 },
      { month: '2026-08', tdsAmount: 500 },
      { month: '2026-09', tdsAmount: 2000 },
    ]);
    expect(quarterWise(db, 1, { side: 'PAYABLE' })).toEqual([
      { quarter: 'FY 2026-27 Q1', tdsAmount: 5000, count: 1 },
      { quarter: 'FY 2026-27 Q2', tdsAmount: 2500, count: 2 },
    ]);
  });

  it('narrows to a quarter, a party or a nature', () => {
    expect(payableSummary(db, 1, { quarter: 'FY 2026-27 Q1' }).deducted).toBe(5000);
    expect(payableSummary(db, 1, { partyId: 9 }).deducted).toBe(2500);
    expect(payableSummary(db, 1, { natureCode: PROFESSIONAL }).deducted).toBe(5000);
  });
});

describe('challans', () => {
  /* A status somebody can set independently of the allocations is a status
     that can lie, so it is derived from them. */
  it('derives the status from what has been allocated', () => {
    const rows = challanRegister(db, 1);
    const byNumber = new Map(rows.map((r) => [r.number, r]));
    expect(byNumber.get('CHL-1')).toMatchObject({ totalAmount: 2000, allocated: 2000, unallocated: 0, status: 'Fully allocated' });
    expect(byNumber.get('CHL-2')).toMatchObject({ totalAmount: 5100, allocated: 3000, unallocated: 2100, status: 'Partially allocated' });
  });

  /* §21's full ladder: created→Unpaid, paid→Paid, then the allocation
     rungs, and Reconciled only when a person confirmed a fully allocated
     challan. Every rung derived, none typed. */
  it('walks every status the specification names', () => {
    const ladder = {
      ...db,
      tdsChallans: [
        { id: 11, companyId: 1, number: 'CH-U', paymentDate: '', taxAmount: 1000 },
        { id: 12, companyId: 1, number: 'CH-P', paymentDate: '2026-09-07', taxAmount: 1000 },
        { id: 13, companyId: 1, number: 'CH-R', paymentDate: '2026-09-07', taxAmount: 1000, reconciled: true },
        { id: 14, companyId: 1, number: 'CH-M', paymentDate: '2026-09-07', taxAmount: 1000 },
      ],
      tdsChallanAllocations: [
        { id: 11, companyId: 1, challanId: 13, tdsTransactionId: 1, amount: 1000 },
        { id: 12, companyId: 1, challanId: 14, tdsTransactionId: 1, amount: 1500 },
      ],
    };
    const byNumber = new Map(challanRegister(ladder, 1).map((r) => [r.number, r.status]));
    expect(byNumber.get('CH-U')).toBe('Unpaid');
    expect(byNumber.get('CH-P')).toBe('Paid');
    expect(byNumber.get('CH-R')).toBe('Reconciled');
    expect(byNumber.get('CH-M')).toBe('Mismatch');
  });

  it('counts interest and late fee in the challan total but not in the tax', () => {
    const chl2 = challanRegister(db, 1).find((r) => r.number === 'CHL-2');
    expect(chl2.taxAmount).toBe(5000);
    expect(chl2.totalAmount).toBe(5100);
  });
});

describe('what stops a quarter being filed', () => {
  const dbWithFaults = {
    ...db,
    tdsTransactions: [
      ...db.tdsTransactions,
      { id: 7, ...event({ sourceId: 11, panSnapshot: '', tdsAmount: 100 }) },
      { id: 8, ...event({ sourceId: 12, ledgerId: '', tdsAmount: 100 }) },
      /* The same obligation, deducted twice. */
      { id: 9, ...event({ sourceId: 1, tdsAmount: 2000 }) },
    ],
  };

  it('warns about a missing PAN', () => {
    const codes = tdsExceptions(dbWithFaults, 1).filter((x) => x.eventId === 7).map((x) => x.code);
    expect(codes).toContain('PAN_MISSING');
  });

  it('blocks a deduction with no ledger', () => {
    const row = tdsExceptions(dbWithFaults, 1).find((x) => x.eventId === 8 && x.code === 'NO_LEDGER');
    expect(row.severity).toBe('BLOCK');
  });

  it('blocks the same obligation deducted twice', () => {
    const row = tdsExceptions(dbWithFaults, 1).find((x) => x.code === 'DUPLICATE');
    expect(row.severity).toBe('BLOCK');
    expect(row.eventId).toBe(9);
  });

  it('flags what has been deducted but not paid over', () => {
    const row = tdsExceptions(db, 1).find((x) => x.eventId === 2 && x.code === 'CHALLAN_SHORT');
    expect(row.severity).toBe('WARNING');
  });

  it('says nothing about a clean, fully paid deduction', () => {
    expect(tdsExceptions(db, 1).filter((x) => x.eventId === 1)).toEqual([]);
  });
});

describe('reconciliation', () => {
  it('sets the register against the challans, ledger by ledger', () => {
    const recon = tdsReconciliation(db, 1);
    expect(recon).toMatchObject({ register: 7500, paid: 5000, outstanding: 2500 });
    expect(recon.ledgers[0]).toMatchObject({ name: 'TDS Payable - Contractor', deducted: 7500 });
  });
});

describe('setup faults', () => {
  /* A nature a party deducts under with no ledger mapped to it is found here
     rather than in the middle of a bill. */
  it('names a nature nobody has mapped a ledger to', () => {
    expect(unmappedNatures(db, 1)).toEqual([{ natureCode: PROFESSIONAL, natureName: 'Professional services' }]);
  });
});
