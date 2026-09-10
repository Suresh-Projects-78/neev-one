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

const groupTrigger = () => screen.getByLabelText('Ledger Group *');

const pickGroup = async (user, name) => {
  await user.click(groupTrigger());
  await user.click((await screen.findAllByRole('option')).find((o) => o.textContent.includes(name)));
};

beforeEach(() => vi.clearAllMocks());

describe('Basic Details', () => {
  it('holds only what the spec allows above the tabs', () => {
    renderForm();
    /* The spec marks the three mandatory fields with an asterisk. */
    expect(screen.getByLabelText(/^Ledger Name \*$/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Currency \*$/)).toBeInTheDocument();
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

describe('the group decides which side the opening balance opens on', () => {
  /*
   * A liability ledger opened on the debit side is a wrong sign that nothing
   * complains about — the number looks right until the trial balance is read.
   */
  const natureDb = {
    chartOfAccounts: [],
    accountTypes: [
      { id: 1, companyId: 1, name: 'Bank', accountClass: 'Asset', main: 'Balance Sheet' },
      { id: 2, companyId: 1, name: 'Current Liabilities', accountClass: 'Liability', main: 'Balance Sheet' },
    ],
    accountGroups: [group(10, 'Bank Accounts', 1), group(20, 'Sundry Creditors', 2)],
  };

  it('credits a liability group and debits an asset group', async () => {
    const user = userEvent.setup();
    render(<ChartAccountForm db={natureDb} setDb={() => {}} currentCompany={company} onClose={() => {}} />);

    await pickGroup(user, 'Sundry Creditors');
    expect(screen.getByRole('radio', { name: 'Cr' })).toBeChecked();

    await pickGroup(user, 'Bank Accounts');
    expect(screen.getByRole('radio', { name: /Dr \(Default\)/ })).toBeChecked();
  });

  it('leaves a chosen side alone when the group changes afterwards', async () => {
    const user = userEvent.setup();
    render(<ChartAccountForm db={natureDb} setDb={() => {}} currentCompany={company} onClose={() => {}} />);

    await pickGroup(user, 'Bank Accounts');
    // A bank overdraft is a real credit balance on an asset group.
    await user.click(screen.getByRole('radio', { name: 'Cr' }));
    await pickGroup(user, 'Sundry Creditors');
    await pickGroup(user, 'Bank Accounts');

    expect(screen.getByRole('radio', { name: 'Cr' })).toBeChecked();
  });
});

describe('what the form refuses', () => {
  const fill = async (user, label, value) => {
    const field = screen.getByLabelText(label);
    await user.clear(field);
    await user.type(field, value);
  };

  it('will not save a bank ledger without a valid IFSC', async () => {
    const user = userEvent.setup();
    const setDb = vi.fn();
    render(<ChartAccountForm db={db} setDb={setDb} currentCompany={company} onClose={() => {}} />);

    await fill(user, /^Ledger Name \*$/, 'HDFC Bank - Current Account');
    await pickGroup(user, 'Bank Accounts');
    await user.click(screen.getByRole('tab', { name: 'Bank Details' }));
    await fill(user, 'Bank Name *', 'HDFC Bank Limited');
    await fill(user, 'Account Number *', '50100012345678');
    await fill(user, 'IFSC Code *', 'HDFCX001234');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(setDb).not.toHaveBeenCalled();

    await fill(user, 'IFSC Code *', 'HDFC0001234');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(setDb).toHaveBeenCalled();
  });

  it('will not save a second ledger under a name already used', async () => {
    const user = userEvent.setup();
    const setDb = vi.fn();
    const taken = { ...db, chartOfAccounts: [{ id: 5, companyId: 1, name: 'Office Rent' }] };
    render(<ChartAccountForm db={taken} setDb={setDb} currentCompany={company} onClose={() => {}} />);

    await fill(user, /^Ledger Name \*$/, 'office   rent');
    await pickGroup(user, 'Indirect Expenses');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(setDb).not.toHaveBeenCalled();
  });
});

describe('Save and New', () => {
  it('saves, keeps the group and clears the ledger for the next one', async () => {
    const user = userEvent.setup();
    const setDb = vi.fn();
    render(<ChartAccountForm db={db} setDb={setDb} currentCompany={company} onClose={() => {}} />);

    const name = screen.getByLabelText(/^Ledger Name \*$/);
    await user.type(name, 'Office Rent');
    await pickGroup(user, 'Indirect Expenses');
    await user.click(screen.getByRole('button', { name: 'Save and New' }));

    expect(setDb).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText(/^Ledger Name \*$/)).toHaveValue('');
    // The next ledger is almost always a sibling of the one just saved.
    expect(screen.getByRole('tab', { name: 'Statutory Details' })).toBeInTheDocument();
  });

  it('is not offered while editing an existing ledger', () => {
    render(
      <ChartAccountForm
        db={db}
        setDb={() => {}}
        currentCompany={company}
        onClose={() => {}}
        initialData={{ id: 5, companyId: 1, name: 'Office Rent', groupId: 11 }}
      />
    );
    expect(screen.queryByRole('button', { name: 'Save and New' })).toBeNull();
  });
});

describe('a ledger that has been posted to', () => {
  /*
   * Re-filing it moves every figure it holds onto another statement, and the
   * entries that produced them say nothing about the move.
   */
  const posted = {
    ...db,
    chartOfAccounts: [{ id: 5, companyId: 1, name: 'Office Rent', groupId: 11 }],
    journalEntries: [{ companyId: 1, lines: [{ accountId: '5' }] }],
  };

  it('keeps its group', () => {
    render(
      <ChartAccountForm db={posted} setDb={() => {}} currentCompany={company} onClose={() => {}} initialData={posted.chartOfAccounts[0]} />
    );
    expect(groupTrigger()).toBeDisabled();
    expect(screen.getByText(/its group is fixed/i)).toBeInTheDocument();
  });

  it('lets an untouched ledger be re-filed', () => {
    render(
      <ChartAccountForm db={{ ...posted, journalEntries: [] }} setDb={() => {}} currentCompany={company} onClose={() => {}} initialData={posted.chartOfAccounts[0]} />
    );
    expect(groupTrigger()).not.toBeDisabled();
  });
});

describe('the TDS tab shows the rule it points at', () => {
  it('reads threshold, applicability and version from the section master', async () => {
    const user = userEvent.setup();
    renderForm();
    await pickGroup(user, 'TDS Payable');
    await user.click(screen.getByRole('tab', { name: 'TDS Details' }));
    await user.selectOptions(screen.getByLabelText('TDS Section'), '194C');

    expect(screen.getByText(/30,000 per payment/)).toBeInTheDocument();
    expect(screen.getByText(/whole aggregate/i)).toBeInTheDocument();
    expect(screen.getByText(/393\(1\)/)).toBeInTheDocument();
    expect(screen.getByText('Payable')).toBeInTheDocument();
  });
});
