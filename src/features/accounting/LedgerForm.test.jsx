import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../api/masters', async (importOriginal) => ({
  ...(await importOriginal()),
  lookupGstin: vi.fn(async () => ({ pan: 'AABCU9603R', source: 'derived' })),
}));

import { ChartAccountForm } from '../../App';

/**
 * The ledger master: one form whose shape follows the group.
 *
 * It used to be a single flat list — name, group, opening balance, a GST rate
 * and four bank fields, all on screen at once whatever kind of ledger was being
 * made. The spec asks for Basic Details above tabs that the group decides, so
 * an Indirect Expenses ledger is not offered somewhere to type an IFSC and a
 * bank ledger is not asked for a TDS section.
 */

const group = (id, name, typeId, groupCategory = '') => ({ id, companyId: 1, name, typeId, groupCategory, parentGroupId: null });

const db = {
  chartOfAccounts: [],
  accountTypes: [{ id: 1, companyId: 1, name: 'Bank', accountClass: 'Asset', main: 'Balance Sheet' }],
  accountGroups: [
    group(10, 'Bank Accounts', 1),
    group(11, 'Indirect Expenses', 1, 'Expense'),
    group(12, 'Duties & Taxes', 1),
    group(13, 'TDS Payable', 1),
    group(14, 'TCS Payable', 1),
  ],
};
const company = { id: 1, name: 'Test Co', state: 'Karnataka' };

const renderForm = (props = {}) =>
  render(<ChartAccountForm db={db} setDb={() => {}} currentCompany={company} onClose={() => {}} {...props} />);

const pickGroup = async (user, name) => {
  const trigger = screen.getAllByRole('combobox').find((c) => /group/i.test(c.getAttribute('aria-label') || c.textContent));
  await user.click(trigger);
  await user.click((await screen.findAllByRole('option')).find((o) => o.textContent.includes(name)));
};

beforeEach(() => vi.clearAllMocks());

describe('Basic Details', () => {
  it('holds only what the spec allows above the tabs', () => {
    renderForm();
    expect(screen.getByText('Ledger Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Currency')).toBeInTheDocument();
    expect(screen.getByLabelText('Opening Balance')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Dr \(Default\)/ })).toBeChecked();
    // Excluded by the spec.
    expect(screen.queryByLabelText(/^Description$/i)).toBeNull();
  });
});

describe('the group decides the tabs', () => {
  it('offers Bank Details for a bank ledger and no TDS tab', async () => {
    const user = userEvent.setup();
    renderForm();
    await pickGroup(user, 'Bank Accounts');

    expect(screen.getByRole('tab', { name: 'Bank Details' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'TDS Details' })).toBeNull();
  });

  it('offers TDS Details under a TDS group and no bank tab', async () => {
    const user = userEvent.setup();
    renderForm();
    await pickGroup(user, 'TDS Payable');

    expect(screen.getByRole('tab', { name: 'TDS Details' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Bank Details' })).toBeNull();
  });

  /* Statutory, Address and Contacts apply to any ledger. */
  it('always offers Statutory, Address and Contact Persons', async () => {
    const user = userEvent.setup();
    renderForm();
    await pickGroup(user, 'Indirect Expenses');

    for (const name of ['Statutory Details', 'Address', 'Contact Persons']) {
      expect(screen.getByRole('tab', { name })).toBeInTheDocument();
    }
    expect(screen.queryByRole('tab', { name: 'Bank Details' })).toBeNull();
  });
});

describe('Bank Details', () => {
  it('carries the fields the approved example shows', async () => {
    const user = userEvent.setup();
    renderForm();
    await pickGroup(user, 'Bank Accounts');
    await user.click(screen.getByRole('tab', { name: 'Bank Details' }));

    for (const label of ['Bank Name *', 'Account Number *', 'IFSC Code *', 'Branch Name', 'Account Holder Name', 'UPI ID', 'Branch Address', 'Account Type']) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
  });

  /*
   * The spec is explicit: PAN and GSTIN belong to Statutory Details and must
   * not appear inside Bank Details.
   */
  it('keeps PAN and GSTIN out of the bank tab', async () => {
    const user = userEvent.setup();
    renderForm();
    await pickGroup(user, 'Bank Accounts');
    await user.click(screen.getByRole('tab', { name: 'Bank Details' }));

    expect(screen.queryByLabelText('PAN')).toBeNull();
    expect(screen.queryByLabelText('GSTIN')).toBeNull();

    await user.click(screen.getByRole('tab', { name: 'Statutory Details' }));
    expect(screen.getByLabelText('PAN')).toBeInTheDocument();
    expect(screen.getByLabelText('GSTIN')).toBeInTheDocument();
  });
});

describe('TDS Details', () => {
  /*
   * The ledger is the accounting destination, not the calculator. It says which
   * section it accumulates; the rate and threshold come from the section master
   * the engine already reads, so there is only ever one source for a rate.
   */
  it('seeds the rate from the section master rather than storing its own', async () => {
    const user = userEvent.setup();
    renderForm();
    await pickGroup(user, 'TDS Payable');
    await user.click(screen.getByRole('tab', { name: 'TDS Details' }));

    await user.selectOptions(screen.getByLabelText('TDS Section'), '194J(b)');
    expect(screen.getByLabelText('Rate (%)')).toHaveValue(10);
    expect(screen.getByText(/the TDS engine does the calculation/i)).toBeInTheDocument();
  });
});
