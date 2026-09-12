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

import RecordDisbursementForm from './RecordDisbursementForm';

/**
 * TDS when the money actually leaves.
 *
 * The law deducts at credit or payment, whichever is earlier. So a payment
 * deducts what the bill did not — and where the bill already did, deducting
 * again would pay the department twice out of one obligation and leave the
 * vendor short by exactly the tax. §16 calls that mandatory; this is where it
 * is enforced.
 */

const CONTRACTOR = 'CONTRACTOR_SUB_CONTRACTOR';

const COMPANY = {
  id: 1,
  name: 'Neev Steels',
  state: 'Karnataka',
  profile: { taxCompliances: { tds: { enabled: true, tan: 'BLRN12345F' } } },
};

const dbWith = (bills) => ({
  companies: [COMPANY],
  vendors: [
    {
      id: 9,
      companyId: 1,
      name: 'Steel Supply Co',
      displayName: 'Steel Supply Co',
      pan: 'AABCU9603R',
      tdsApplicable: true,
      tdsNatureCode: CONTRACTOR,
    },
  ],
  accountGroups: [{ id: 11, companyId: 1, name: 'TDS Payable', parentGroupId: null }],
  chartOfAccounts: [
    { id: 101, companyId: 1, name: 'TDS on Contractors', groupId: 11, tdsNatureCode: CONTRACTOR },
  ],
  bills,
  expenses: [],
  debitNotes: [],
  payments: [],
  tdsTransactions: [],
});

/** A bill that never deducted, and one that did. */
const plainBill = {
  id: 7, companyId: 1, vendorId: 9, number: 'BILL-1', date: '2026-09-01', dueDate: '2026-10-01',
  total: 118000, subtotal: 100000, paidAmount: 0, status: 'Unpaid',
};
const deductedBill = {
  ...plainBill, id: 8, number: 'BILL-2',
  tdsAmount: 2000, tdsNatureCode: CONTRACTOR, tdsLedgerId: '101',
};

const Host = ({ bills = [plainBill], onSaved = () => {} }) => {
  const [db, setDb] = useState(() => dbWith(bills));
  return (
    <RecordDisbursementForm
      db={db}
      setDb={(next) => {
        const value = typeof next === 'function' ? next(db) : next;
        onSaved(value);
        setDb(value);
      }}
      currentCompany={COMPANY}
      onClose={() => {}}
    />
  );
};

const pickVendor = async (user) => {
  await user.click(screen.getByRole('button', { name: /Select Vendor/ }));
  await user.click(await screen.findByRole('option', { name: /Steel Supply Co/ }));
};

const selectBill = async (user, number) => {
  const row = (await screen.findByText(number)).closest('tr');
  await user.click(row.querySelector('input[type="checkbox"]'));
  /* The amount paid is its own field — a selected bill proposes it, and the
     form will not record a payment of nothing. */
  fireEvent.change(screen.getByLabelText(/Amount paid|Payment amount|Amount/i), { target: { value: '118000' } });
};

describe('what the payment offers to deduct', () => {
  beforeEach(() => localStorage.clear());

  it('suggests the engine’s figure for a bill that never deducted', async () => {
    const user = userEvent.setup();
    render(<Host />);
    await pickVendor(user);
    await selectBill(user, 'BILL-1');

    /* 194C at 2% on the taxable value, not on the bill total. */
    expect(await screen.findByText(/suggests ₹2,000\.00 at 2% on ₹1,00,000\.00/)).toBeInTheDocument();
  });

  it('puts the suggestion in the field when it is taken up', async () => {
    const user = userEvent.setup();
    render(<Host />);
    await pickVendor(user);
    await selectBill(user, 'BILL-1');
    await user.click(await screen.findByRole('button', { name: 'Use it' }));

    expect(screen.getByLabelText('TDS deduction')).toHaveValue(2000);
    expect(screen.getByLabelText('TDS ledger')).toHaveValue('101');
  });

  /* The whole point of §16. */
  it('refuses to suggest again where the bill already deducted', async () => {
    const user = userEvent.setup();
    render(<Host bills={[deductedBill]} />);
    await pickVendor(user);
    await selectBill(user, 'BILL-2');

    expect(await screen.findByText(/Already deducted on the bills being settled: ₹2,000\.00/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Use it' })).toBeNull();
  });

  it('offers only the ledgers mapped to the vendor’s nature', async () => {
    const user = userEvent.setup();
    render(<Host />);
    await pickVendor(user);
    await selectBill(user, 'BILL-1');
    await user.click(await screen.findByRole('button', { name: 'Use it' }));

    const options = [...screen.getByLabelText('TDS ledger').options].map((o) => o.textContent);
    expect(options).toEqual(['Select ledger', 'TDS on Contractors']);
  });
});

describe('what the payment records', () => {
  beforeEach(() => localStorage.clear());

  const recordPayment = async (user) => {
    await user.click(screen.getByRole('button', { name: /Record Payment/ }));
  };

  it('writes a compliance record for a deduction it made itself', async () => {
    const user = userEvent.setup();
    let saved = null;
    render(<Host onSaved={(next) => { saved = next; }} />);

    await pickVendor(user);
    await selectBill(user, 'BILL-1');
    await user.click(await screen.findByRole('button', { name: 'Use it' }));
    await recordPayment(user);

    await waitFor(() => expect((saved?.tdsTransactions || []).length).toBe(1));
    expect((saved.tdsTransactions || []).at(-1)).toMatchObject({
      sourceType: 'payment',
      partyId: 9,
      natureCode: CONTRACTOR,
      sectionCode: '194C',
      tdsAmount: 2000,
      ledgerId: '101',
      status: 'Posted',
    });
  });

  /* A deduction that exists only as the difference between two figures cannot
     be reported — the return is built from these records. */
  it('keeps the nature and the rule version on the payment itself', async () => {
    const user = userEvent.setup();
    let saved = null;
    render(<Host onSaved={(next) => { saved = next; }} />);

    await pickVendor(user);
    await selectBill(user, 'BILL-1');
    await user.click(await screen.findByRole('button', { name: 'Use it' }));
    await recordPayment(user);

    await waitFor(() => expect((saved?.payments || []).length).toBe(1));
    const payment = saved.payments.at(-1);
    expect(payment.tdsAmount).toBe(2000);
    expect(payment.tdsNatureCode).toBe(CONTRACTOR);
    expect(payment.tdsRuleVersionId).toBeTruthy();
  });

  it('writes no record where nothing was deducted', async () => {
    const user = userEvent.setup();
    let saved = null;
    render(<Host onSaved={(next) => { saved = next; }} />);

    await pickVendor(user);
    await selectBill(user, 'BILL-1');
    await recordPayment(user);

    await waitFor(() => expect((saved?.payments || []).length).toBe(1));
    expect(saved.tdsTransactions || []).toHaveLength(0);
  });

  /* Typed over, because a certificate or a part-payment is the operator's
     call — but still recorded as a deduction under the resolved nature. */
  it('records a figure typed over the suggestion', async () => {
    const user = userEvent.setup();
    let saved = null;
    render(<Host onSaved={(next) => { saved = next; }} />);

    await pickVendor(user);
    await selectBill(user, 'BILL-1');
    fireEvent.change(screen.getByLabelText('TDS deduction'), { target: { value: '500' } });
    await recordPayment(user);

    await waitFor(() => expect((saved?.tdsTransactions || []).length).toBe(1));
    expect(saved.tdsTransactions.at(-1).tdsAmount).toBe(500);
  });
});
