import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../permissions/useFeatures', () => ({ useFeatures: () => ({ isEnabled: () => false }) }));
vi.mock('../../api/payments', () => ({ createPayment: vi.fn(async () => ({})) }));
vi.mock('./usePaymentModes', () => ({
  default: () => ({ modes: [{ id: 'srv-hdfc', code: '1200', name: 'HDFC Current A/c', controlKind: 'BANK' }], loading: false, error: '' }),
  modeLabel: (m) => `${m.code} · ${m.name}`,
}));

import RecordReceiptForm from './RecordReceiptForm';

/**
 * TDS the customer actually deducted.
 *
 * The invoice only ever expected this. The asset is recognised here, when the
 * money arrives short by exactly the tax — §18, and the reason the sell side
 * never debits TDS Receivable at invoice time: an expectation that never
 * arrives would sit in the books as tax somebody else had paid for us.
 */

const CONTRACTOR = 'CONTRACTOR_SUB_CONTRACTOR';

const COMPANY = {
  id: 1,
  name: 'Neev Steels',
  state: 'Karnataka',
  profile: { taxCompliances: { tds: { enabled: true, tan: 'BLRN12345F' } } },
};

const INVOICE = {
  id: 5, companyId: 1, customerId: 3, number: 'INV-1', date: '2026-09-01',
  total: 118000, subtotal: 100000, paidAmount: 0, status: 'Unpaid',
  /* What the invoice said the customer was expected to withhold. */
  tdsExpectedAmount: 1000,
};

const db0 = {
  companies: [COMPANY],
  customers: [
    { id: 3, companyId: 1, name: 'ABC Industries', displayName: 'ABC Industries', pan: 'AABCU9603R', tdsNatureCode: CONTRACTOR },
  ],
  accountGroups: [
    { id: 11, companyId: 1, name: 'TDS Payable', parentGroupId: null },
    { id: 12, companyId: 1, name: 'TDS Receivable', parentGroupId: null },
  ],
  chartOfAccounts: [
    { id: 101, companyId: 1, name: 'TDS Payable - Contractor', groupId: 11, tdsNatureCode: CONTRACTOR },
    { id: 201, companyId: 1, name: 'TDS Receivable - Contractor', groupId: 12, tdsNatureCode: CONTRACTOR },
  ],
  invoices: [INVOICE],
  creditNotes: [],
  payments: [],
  tdsTransactions: [],
};

const Host = ({ onSaved = () => {}, company = COMPANY }) => {
  const [db, setDb] = useState(db0);
  return (
    <RecordReceiptForm
      db={db}
      setDb={(next) => {
        const value = typeof next === 'function' ? next(db) : next;
        onSaved(value);
        setDb(value);
      }}
      currentCompany={company}
      onClose={() => {}}
    />
  );
};

const pickCustomer = async (user) => {
  /* The customer field is a type-ahead: the name is typed and the suggestion
     taken, which is the motion the operator actually performs. */
  await user.type(screen.getByPlaceholderText('Type a customer name'), 'ABC');
  await user.click(await screen.findByRole('option', { name: /ABC Industries/ }));
};

const selectInvoice = async (user) => {
  /*
   * The bills are a dialog now, not a table halfway down the receipt, so the
   * motion is the operator's: open it from the party's allocation row, tick
   * the invoice, apply.
   */
  fireEvent.change(screen.getByLabelText(/Amount received/i), { target: { value: '118000' } });
  await user.click(await screen.findByRole('button', { name: /View outstanding invoices/i }));
  const row = (await screen.findByText('INV-1')).closest('tr');
  await user.click(row.querySelector('input[type="checkbox"]'));
  await user.click(screen.getByRole('button', { name: /Apply Allocation/i }));
};

describe('what the receipt offers', () => {
  /* §2: with TDS off the compact control is not offered at all. */
  it('offers no TDS control while TDS is switched off for the company', () => {
    const off = { ...COMPANY, profile: { taxCompliances: { tds: { enabled: false } } } };
    render(<Host company={off} />);
    expect(screen.queryByLabelText('TDS deducted')).toBeNull();
  });

  beforeEach(() => localStorage.clear());

  it('offers what the invoice expected the customer to withhold', async () => {
    const user = userEvent.setup();
    render(<Host />);
    await pickCustomer(user);
    await selectInvoice(user);

    expect(await screen.findByText(/The invoices expected ₹1,000\.00/)).toBeInTheDocument();
  });

  it('takes up the expectation, and asks where it posts', async () => {
    const user = userEvent.setup();
    render(<Host />);
    await pickCustomer(user);
    await selectInvoice(user);
    await user.click(await screen.findByRole('button', { name: 'Use it' }));

    expect(screen.getByLabelText('TDS deducted')).toHaveValue(1000);
    expect(screen.getByLabelText('TDS receivable ledger')).toHaveValue('201');
  });

  /* The receivable side only — a payable ledger is what we owe, and cannot
     hold tax somebody else withheld from us. */
  it('offers receivable ledgers only', async () => {
    const user = userEvent.setup();
    render(<Host />);
    await pickCustomer(user);
    await selectInvoice(user);
    fireEvent.change(screen.getByLabelText('TDS deducted'), { target: { value: '1000' } });

    const options = [...screen.getByLabelText('TDS receivable ledger').options].map((o) => o.textContent);
    expect(options).toEqual(['Select ledger', 'TDS Receivable - Contractor']);
  });
});

describe('what the receipt records', () => {
  beforeEach(() => localStorage.clear());

  it('recognises the receivable, against the mapped ledger', async () => {
    const user = userEvent.setup();
    let saved = null;
    render(<Host onSaved={(next) => { saved = next; }} />);

    await pickCustomer(user);
    await selectInvoice(user);
    await user.click(await screen.findByRole('button', { name: 'Use it' }));
    await user.click(screen.getByRole('button', { name: /Record Receipt/ }));

    await waitFor(() => expect((saved?.tdsTransactions || []).length).toBe(1));
    expect(saved.tdsTransactions.at(-1)).toMatchObject({
      sourceType: 'receipt',
      side: 'RECEIVABLE',
      partyId: 3,
      natureCode: CONTRACTOR,
      tdsAmount: 1000,
      ledgerId: '201',
      status: 'Posted',
    });
  });

  it('records nothing where the customer deducted nothing', async () => {
    const user = userEvent.setup();
    let saved = null;
    render(<Host onSaved={(next) => { saved = next; }} />);

    await pickCustomer(user);
    await selectInvoice(user);
    await user.click(screen.getByRole('button', { name: /Record Receipt/ }));

    await waitFor(() => expect((saved?.payments || []).length).toBe(1));
    expect(saved.tdsTransactions || []).toHaveLength(0);
  });
});
