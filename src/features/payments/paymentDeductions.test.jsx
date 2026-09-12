import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../api/payments', () => ({ createPayment: vi.fn(async () => ({ id: 'srv-1' })) }));
vi.mock('../../api/cashbank', () => ({ listPaymentModes: vi.fn(async () => []) }), { virtual: true });

import RecordDisbursementForm from './RecordDisbursementForm';

/**
 * A payment settles more than it moves.
 *
 * A bill of 10,000 with 1,000 of TDS is settled in full and takes 9,000 out of
 * the account. Before this the two were the same number, so either the bill was
 * left part-paid or the bank was overstated by exactly the tax deducted.
 */

const co = { id: 1, name: 'Mani beriyanis', state: 'Karnataka' };
const db = {
  companies: [co],
  vendors: [{ id: 3, companyId: 1, name: 'ABC Supplies', displayName: 'ABC Supplies' }],
  bills: [{ id: 1, companyId: 1, vendorId: 3, number: 'PUR-1', date: '2026-08-10', dueDate: '2026-08-25', total: 10000, paidAmount: 0, status: 'Open' }],
  expenses: [],
  debitNotes: [],
  payments: [],
  chartOfAccounts: [],
};

const renderForm = (props = {}) =>
  render(
    <RecordDisbursementForm db={db} setDb={() => {}} currentCompany={co} onClose={() => {}} screenTitle="New Payment" {...props} />
  );

const type = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('the running bar agrees with the summary', () => {
  it('shows what leaves the account, not what settles the bills', () => {
    renderForm();
    type(/^Amount Paid/, '10000');
    type('TDS deduction', '1000');
    /* The label says "paid from the account", and 9,000 is what goes. */
    const bar = document.querySelector('.ui-entry-summary');
    expect(bar.textContent).toMatch(/9,000/);
    expect(bar.textContent).not.toMatch(/10,000/);
  });
});

describe('what is held back', () => {
  it('totals the deductions and shows what actually leaves', () => {
    renderForm();
    type(/^Amount Paid/, '10000');
    type('TDS deduction', '1000');
    type('Bank charges', '50');

    const summary = screen.getByRole('region', { name: 'Payment summary' });
    /* 10,000 settles the bill; 1,050 is held back; 8,950 leaves the bank. */
    expect(summary.textContent).toMatch(/1,050/);
    expect(summary.textContent).toMatch(/8,950/);
  });

  it('says the unallocated part is an advance', () => {
    renderForm();
    type(/^Amount Paid/, '10000');
    const summary = screen.getByRole('region', { name: 'Payment summary' });
    /* Nothing allocated yet, so the whole payment is sitting on account. */
    expect(summary.textContent).toMatch(/Advance \(unallocated\)/i);
    expect(summary.textContent).toMatch(/10,000/);
  });

  it('reads the net back in words', () => {
    renderForm();
    type(/^Amount Paid/, '10000');
    type('TDS deduction', '1000');
    expect(screen.getByText(/Rupees Nine Thousand/i)).toBeInTheDocument();
  });

  it('keeps the gross and the net apart', () => {
    renderForm();
    type(/^Amount Paid/, '5000');
    type('Other deductions', '500');
    const summary = screen.getByRole('region', { name: 'Payment summary' });
    /* Both figures on screen: one settles the bills, the other moves. */
    expect(summary.textContent).toMatch(/5,000/);
    expect(summary.textContent).toMatch(/4,500/);
  });
});
