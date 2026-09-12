import { useEffect, useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const postJournalToLedger = vi.fn(async () => ({}));
vi.mock('../../utils/journalSync', () => ({
  postJournalToLedger: (...a) => postJournalToLedger(...a),
}));

/*
 * The payment engine is its own machinery with its own tests; here it is a
 * stub that hands back the voucher it would have written. What THIS file
 * proves is the hand-off: a party row opens the engine, takes its result as
 * the row's facts, and stays out of the closing journal.
 */
vi.mock('../payments/RecordDisbursementForm', () => ({
  default: ({ onSaved, initialData }) => (
    <button
      type="button"
      onClick={() => onSaved({ id: 55, number: 'PAY-0055', netCash: 80000, vendorId: initialData?.vendorId })}
    >
      engine: settle bills
    </button>
  ),
}));
vi.mock('../payments/RecordReceiptForm', () => ({
  default: ({ onSaved }) => (
    <button type="button" onClick={() => onSaved({ id: 66, number: 'RCPT-0066', netCashAmount: 50000 })}>
      engine: settle invoices
    </button>
  ),
}));

import AllocationDialog from './AllocationDialog';

const COMPANY = { id: 1, name: 'Neev Steels' };

const TXN_OUT = {
  id: 31,
  companyId: 1,
  cashBankAccountId: '502',
  direction: 'OUT',
  amount: 100000,
  date: '2026-09-01',
  description: 'NEFT OUT 991',
};

const db0 = {
  companies: [COMPANY],
  chartOfAccounts: [
    { id: 502, companyId: 1, name: 'HDFC Bank' },
    { id: 610, companyId: 1, name: 'Sharp Contractors A/c' },
    { id: 620, companyId: 1, name: 'Bank Charges' },
    { id: 410, companyId: 1, name: 'ABC Industries A/c' },
  ],
  vendors: [{ id: 7, companyId: 1, name: 'Sharp Contractors', accountId: 610 }],
  customers: [{ id: 3, companyId: 1, name: 'ABC Industries', accountId: 410 }],
  bankTransactions: [TXN_OUT],
  bankAllocations: [],
  journalEntries: [],
};

const latest = { db: db0 };
const Host = ({ txn = TXN_OUT }) => {
  const [db, setDb] = useState(db0);
  useEffect(() => {
    latest.db = db;
  }, [db]);
  return (
    <AllocationDialog
      db={db}
      setDb={(next) => setDb((prev) => (typeof next === 'function' ? next(prev) : next))}
      currentCompany={COMPANY}
      txn={txn}
      onClose={() => {}}
    />
  );
};

describe('what a row offers depends on its ledger', () => {
  beforeEach(() => {
    postJournalToLedger.mockClear();
    latest.db = db0;
  });

  it('a vendor ledger on a debit offers bills; an ordinary ledger stays a plain row', async () => {
    const user = userEvent.setup();
    render(<Host />);

    await user.selectOptions(screen.getByLabelText('Ledger'), '610');
    expect(screen.getByRole('button', { name: 'Allocate Bills' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Amount')).toBeNull();

    await user.selectOptions(screen.getByLabelText('Ledger'), '620');
    expect(screen.queryByRole('button', { name: 'Allocate Bills' })).toBeNull();
    expect(screen.getByLabelText('Amount')).toBeInTheDocument();
  });

  /* A customer cannot settle a bank DEBIT — direction gates the offer. */
  it('a customer ledger on a debit gets no invoice offer', async () => {
    const user = userEvent.setup();
    render(<Host />);
    await user.selectOptions(screen.getByLabelText('Ledger'), '410');
    expect(screen.queryByRole('button', { name: 'Allocate Invoices' })).toBeNull();
    expect(screen.getByLabelText('Amount')).toBeInTheDocument();
  });

  it('a customer ledger on a credit offers invoices', async () => {
    const user = userEvent.setup();
    render(<Host txn={{ ...TXN_OUT, id: 32, direction: 'IN', amount: 50000 }} />);
    await user.selectOptions(screen.getByLabelText('Ledger'), '410');
    expect(screen.getByRole('button', { name: 'Allocate Invoices' })).toBeInTheDocument();
  });
});

describe('the hand-off to the payment engine', () => {
  beforeEach(() => {
    postJournalToLedger.mockClear();
    latest.db = db0;
  });

  it('a settled row carries its voucher and the closing journal covers only the plain rows', async () => {
    const user = userEvent.setup();
    render(<Host />);

    /* Row 1: the vendor, through the engine. */
    await user.selectOptions(screen.getByLabelText('Ledger'), '610');
    await user.click(screen.getByRole('button', { name: 'Allocate Bills' }));
    await user.click(screen.getByRole('button', { name: 'engine: settle bills' }));
    expect(screen.getByText(/settled via PAY-0055/)).toBeInTheDocument();

    /* Row 2: bank charges, a plain leg for the remainder. */
    await user.click(screen.getByRole('button', { name: /Add row/ }));
    await user.selectOptions(screen.getByLabelText('Ledger'), '620');
    await user.type(screen.getByLabelText('Amount'), '20000');

    await user.click(screen.getByRole('button', { name: /Allocate & post/ }));

    const children = latest.db.bankAllocations.filter((a) => String(a.bankTransactionId) === '31');
    expect(children).toHaveLength(2);
    const engine = children.find((a) => a.paymentId === 55);
    const plain = children.find((a) => !a.paymentId);
    expect(engine).toMatchObject({ amount: 80000, partyKind: 'vendor', partyId: 7, journalEntryId: null });
    expect(plain).toMatchObject({ ledgerId: '620', amount: 20000 });
    expect(plain.journalEntryId).not.toBeNull();

    /* One journal, and it repeats nothing the voucher posted: the bank leg
       is the plain remainder, not the whole debit. */
    const jv = latest.db.journalEntries.find((j) => j.sourceBankTransactionId === 31);
    expect(jv.totalDebit).toBe(20000);
    expect(jv.lines).toEqual([
      expect.objectContaining({ accountId: '502', credit: 20000, debit: 0 }),
      expect.objectContaining({ accountId: '620', debit: 20000, credit: 0 }),
    ]);
    expect(postJournalToLedger).toHaveBeenCalledTimes(1);
  });

  it('a fully engine-settled credit posts no journal at all', async () => {
    const user = userEvent.setup();
    render(<Host txn={{ ...TXN_OUT, id: 32, direction: 'IN', amount: 50000 }} />);

    await user.selectOptions(screen.getByLabelText('Ledger'), '410');
    await user.click(screen.getByRole('button', { name: 'Allocate Invoices' }));
    await user.click(screen.getByRole('button', { name: 'engine: settle invoices' }));
    await user.click(screen.getByRole('button', { name: /Allocate & post/ }));

    const children = latest.db.bankAllocations.filter((a) => String(a.bankTransactionId) === '32');
    expect(children).toHaveLength(1);
    expect(children[0]).toMatchObject({ paymentId: 66, partyKind: 'customer', journalEntryId: null });
    expect(latest.db.journalEntries).toHaveLength(0);
    expect(postJournalToLedger).not.toHaveBeenCalled();
  });
});
