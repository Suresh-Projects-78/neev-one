import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../permissions/useFeatures', () => ({ useFeatures: () => ({ isEnabled: () => false }) }));
vi.mock('../../api/purchaseDocs', () => ({
  createDocApi: vi.fn(async () => ({})),
  hasApiSession: () => false,
}));

import { BillForm } from './index';

/**
 * TDS on a purchase.
 *
 * On the buy side the deduction is the company's own obligation: the vendor is
 * paid short and the difference is owed to the government until it is
 * deposited. So it is not a section picked out of the Act — it is one of the
 * ledgers the company keeps under TDS Payable, and the rate follows from
 * whichever is chosen.
 *
 * What must not move is the bill: reducing the total would understate input
 * GST and lose part of what the vendor is owed. Only the cash that leaves
 * changes.
 */

const COMPANY = { id: 1, name: 'Neev Steels', gstin: '29ABCDE1234F1Z5', state: 'Karnataka' };

const GROUPS = [
  { id: 10, companyId: 1, name: 'Duties & Taxes', parentGroupId: null },
  { id: 11, companyId: 1, name: 'TDS Payable', parentGroupId: 10 },
  { id: 12, companyId: 1, name: 'TDS Receivable', parentGroupId: 10 },
];

const LEDGERS = [
  { id: 101, companyId: 1, name: 'TDS on Contractors', groupId: 11, tdsSection: '194C' },
  { id: 102, companyId: 1, name: 'TDS on Professional Fees', groupId: 11, tdsSection: '194J(b)' },
  { id: 103, companyId: 1, name: 'TDS Receivable 194C', groupId: 12, tdsSection: '194C' },
];

const dbWith = (over = {}) => ({
  companies: [COMPANY],
  vendors: [{ id: 9, companyId: 1, name: 'Steel Supply Co', displayName: 'Steel Supply Co' }],
  items: [{ id: 11, companyId: 1, name: 'MS Angle 50mm', gstRate: 18, unit: 'Nos', purchasePrice: 100 }],
  accountGroups: GROUPS,
  chartOfAccounts: LEDGERS,
  bills: [],
  purchaseOrders: [],
  batches: [],
  uoms: [],
  gstRates: [],
  debitNotes: [],
  ...over,
});

const Host = ({ db: seed = dbWith(), onSaved = () => {} }) => {
  const [db, setDb] = useState(seed);
  return (
    <BillForm
      db={db}
      setDb={(next) => {
        const value = typeof next === 'function' ? next(db) : next;
        onSaved(value);
        setDb(value);
      }}
      currentCompany={db.companies[0]}
      branches={[{ id: 'b1', companyId: 1, name: 'Bengaluru' }]}
      warehouses={[{ id: 'w1', companyId: 1, name: 'Main Store', branchId: 'b1' }]}
      onClose={() => {}}
    />
  );
};

/** A bill for one line at `rate`, ready to save. */
const fillBill = async (user, rate) => {
  await user.click(screen.getByRole('combobox', { name: 'Warehouse *' }));
  await user.click(await screen.findByRole('option', { name: 'Main Store' }));
  await user.click(screen.getByRole('button', { name: /Select Vendor/ }));
  await user.click(await screen.findByRole('option', { name: /Steel Supply Co/ }));
  await user.click(screen.getByRole('button', { name: /Select Item/ }));
  await user.click(await screen.findByRole('option', { name: /MS Angle 50mm/ }));

  const row = document.querySelector('[data-line-row="0"]');
  const numbers = row.querySelectorAll('input[type="number"]');
  await user.clear(numbers[1]);
  await user.type(numbers[1], String(rate));
};

const chooseLedger = async (user, label) => {
  await user.click(screen.getByRole('button', { name: /TDS deduction/ }));
  await user.selectOptions(screen.getByLabelText(/TDS deduction/), label);
};

describe('choosing what to deduct against', () => {
  beforeEach(() => localStorage.clear());

  it('offers the company’s TDS payable ledgers', async () => {
    const user = userEvent.setup();
    render(<Host />);
    await user.click(screen.getByRole('button', { name: /TDS deduction/ }));

    const options = [...screen.getByLabelText(/TDS deduction/).options].map((o) => o.textContent);
    expect(options.join(' | ')).toMatch(/TDS on Contractors · 194C/);
    expect(options.join(' | ')).toMatch(/TDS on Professional Fees · 194J\(b\) .* @ 10%/);
  });

  /* The other side of the same tax is an asset — it has no business reducing
     what a vendor is paid. */
  it('never offers the receivable ledger', () => {
    render(<Host />);
    expect(screen.queryByText(/TDS Receivable 194C/)).toBeNull();
  });

  it('says how to get one where the chart has none', () => {
    render(<Host db={dbWith({ chartOfAccounts: [], accountGroups: [] })} />);
    expect(screen.getByRole('button', { name: /TDS deduction/ })).toBeDisabled();
    expect(screen.getByText(/Create a ledger under TDS Payable/)).toBeInTheDocument();
  });
});

describe('the figure the ledger produces', () => {
  beforeEach(() => localStorage.clear());

  it('deducts at the rate of the chosen ledger, under the total', async () => {
    const user = userEvent.setup();
    render(<Host />);
    await fillBill(user, 50000);
    await chooseLedger(user, '101');

    /* 194C at 2% on the taxable value, not on the GST-inclusive total. */
    expect(screen.getByText('Net payable:')).toBeInTheDocument();
    expect(screen.getByText(/− ₹1,000\.00/)).toBeInTheDocument();
    expect(screen.getByText(/₹58,000\.00/)).toBeInTheDocument();
  });

  it('follows the other ledger to the other rate', async () => {
    const user = userEvent.setup();
    render(<Host />);
    /* 194J(b)'s limit is 50,000 for the year and the test of it is strictly
       greater, so the bill has to clear it rather than meet it. */
    await fillBill(user, 60000);
    await chooseLedger(user, '102');

    /* Professional services, 10%. */
    expect(screen.getByText(/− ₹6,000\.00/)).toBeInTheDocument();
  });

  /* Nothing is due below the threshold, and a figure that simply failed to
     appear would be indistinguishable from a broken feature. */
  it('deducts nothing below the threshold, and says why', async () => {
    const user = userEvent.setup();
    render(<Host />);
    await fillBill(user, 10000);
    await chooseLedger(user, '101');

    expect(screen.getByText(/No deduction yet/)).toBeInTheDocument();
    expect(screen.queryByText('Net payable:')).toBeNull();
  });

  it('takes a rate typed over the ledger’s own', async () => {
    const user = userEvent.setup();
    render(<Host />);
    await fillBill(user, 50000);
    await chooseLedger(user, '101');

    const rate = screen.getByLabelText('Rate (%)');
    await user.clear(rate);
    await user.type(rate, '20');

    /* No PAN: 20%, and the bill says so rather than the ledger being edited. */
    expect(screen.getByText(/− ₹10,000\.00/)).toBeInTheDocument();
  });
});

describe('what is saved', () => {
  beforeEach(() => localStorage.clear());

  it('records the ledger, the section, the rate and the amount', async () => {
    const user = userEvent.setup();
    let saved = null;
    render(<Host onSaved={(next) => { saved = next; }} />);

    await fillBill(user, 50000);
    await chooseLedger(user, '101');
    await user.click(screen.getByRole('button', { name: 'Create Bill' }));

    const bill = (saved?.bills || []).at(-1);
    expect(bill?.tdsLedgerId).toBe('101');
    expect(bill?.tdsSection).toBe('194C');
    expect(bill?.tdsRate).toBe(2);
    expect(bill?.tdsAmount).toBe(1000);
  });

  /* The liability to the vendor is the whole bill; the deduction moves cash,
     not what was purchased. */
  it('leaves the bill total alone and states the net separately', async () => {
    const user = userEvent.setup();
    let saved = null;
    render(<Host onSaved={(next) => { saved = next; }} />);

    await fillBill(user, 50000);
    await chooseLedger(user, '101');
    await user.click(screen.getByRole('button', { name: 'Create Bill' }));

    const bill = (saved?.bills || []).at(-1);
    expect(bill?.total).toBe(59000);
    expect(bill?.netPayable).toBe(58000);
  });

  it('records nothing where no deduction was chosen', async () => {
    const user = userEvent.setup();
    let saved = null;
    render(<Host onSaved={(next) => { saved = next; }} />);

    await fillBill(user, 50000);
    await user.click(screen.getByRole('button', { name: 'Create Bill' }));

    const bill = (saved?.bills || []).at(-1);
    expect(bill?.tdsAmount).toBe(0);
    expect(bill?.tdsSection).toBe('');
    expect(bill?.netPayable).toBe(59000);
  });
});
