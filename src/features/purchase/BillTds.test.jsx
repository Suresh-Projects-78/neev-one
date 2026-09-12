import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

/* TDS deducts nothing at all unless the company has switched it on — §2. */
const COMPANY = {
  id: 1,
  name: 'Neev Steels',
  gstin: '29ABCDE1234F1Z5',
  state: 'Karnataka',
  profile: { taxCompliances: { tds: { enabled: true, tan: 'BLRN12345F' } } },
};

const GROUPS = [
  { id: 10, companyId: 1, name: 'Duties & Taxes', parentGroupId: null },
  { id: 11, companyId: 1, name: 'TDS Payable', parentGroupId: 10 },
  { id: 12, companyId: 1, name: 'TDS Receivable', parentGroupId: 10 },
];

const CONTRACTOR = 'CONTRACTOR_SUB_CONTRACTOR';
const PROFESSIONAL = 'PROFESSIONAL_SERVICES';

const LEDGERS = [
  { id: 101, companyId: 1, name: 'TDS on Contractors', groupId: 11, tdsNatureCode: CONTRACTOR },
  { id: 102, companyId: 1, name: 'TDS on Professional Fees', groupId: 11, tdsNatureCode: PROFESSIONAL },
  { id: 103, companyId: 1, name: 'TDS Receivable 194C', groupId: 12, tdsNatureCode: CONTRACTOR },
];

const dbWith = (over = {}) => ({
  companies: [COMPANY],
  vendors: [
    { id: 9, companyId: 1, name: 'Steel Supply Co', displayName: 'Steel Supply Co', pan: 'AABCU9603R', tdsApplicable: true },
  ],
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
  /* One change rather than five keystrokes: typing digit by digit into a
     controlled number field re-renders the grid between them, and a dropped
     keystroke made this helper flaky. */
  fireEvent.change(numbers[1], { target: { value: String(rate) } });
};

/** Open the panel and choose a nature — the ledger then follows from it. */
const chooseNature = async (user, natureCode) => {
  await user.click(screen.getByRole('button', { name: /TDS deduction/ }));
  await user.selectOptions(screen.getByLabelText(/TDS deduction/), natureCode);
};

describe('choosing what to deduct against', () => {
  beforeEach(() => localStorage.clear());

  it('offers the natures, not a list of sections to look up', async () => {
    const user = userEvent.setup();
    render(<Host />);
    await user.click(screen.getByRole('button', { name: /TDS deduction/ }));

    const options = [...screen.getByLabelText(/TDS deduction/).options].map((o) => o.textContent);
    expect(options).toContain('Contractor / sub-contractor');
    expect(options).toContain('Professional services');
  });

  /* §14, and mandatory: a Contractor deduction offers the Contractor ledger
     and nothing else — not another nature's, and not the receivable side. */
  it('narrows the ledger list to the chosen nature and the payable side', async () => {
    const user = userEvent.setup();
    render(<Host />);
    await chooseNature(user, CONTRACTOR);

    const options = [...screen.getByLabelText('TDS ledger').options].map((o) => o.textContent);
    expect(options).toEqual(['Select ledger', 'TDS on Contractors']);
  });

  it('deducts nothing at all while TDS is switched off for the company', () => {
    const off = { ...COMPANY, profile: { taxCompliances: { tds: { enabled: false } } } };
    render(<Host db={dbWith({ companies: [off] })} />);
    expect(screen.getByRole('button', { name: /TDS deduction/ })).toBeDisabled();
    expect(screen.getByText(/TDS is switched off for this company/)).toBeInTheDocument();
  });
});

describe('the figure the ledger produces', () => {
  beforeEach(() => localStorage.clear());

  it('deducts at the rate of the chosen ledger, under the total', async () => {
    const user = userEvent.setup();
    render(<Host />);
    await fillBill(user, 50000);
    await chooseNature(user, CONTRACTOR);

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
    await chooseNature(user, PROFESSIONAL);

    /* Professional services, 10%. */
    expect(screen.getByText(/− ₹6,000\.00/)).toBeInTheDocument();
  });

  /* Nothing is due below the threshold, and a figure that simply failed to
     appear would be indistinguishable from a broken feature. */
  it('deducts nothing below the threshold, and says why', async () => {
    const user = userEvent.setup();
    render(<Host />);
    await fillBill(user, 10000);
    await chooseNature(user, CONTRACTOR);

    expect(screen.getByText(/No deduction yet/)).toBeInTheDocument();
    expect(screen.queryByText('Net payable:')).toBeNull();
  });

  it('takes a rate typed over the ledger’s own', async () => {
    const user = userEvent.setup();
    render(<Host />);
    await fillBill(user, 50000);
    await chooseNature(user, CONTRACTOR);

    const rate = screen.getByLabelText('Rate (%)');
    fireEvent.change(rate, { target: { value: '20' } });

    /* A certificate under section 197, or a vendor with no PAN, is a fact
       about this bill rather than about the ledger. */
    expect(await screen.findByText(/− ₹10,000\.00/)).toBeInTheDocument();
  });
});

describe('what is saved', () => {
  beforeEach(() => localStorage.clear());

  it('records the ledger, the section, the rate and the amount', async () => {
    const user = userEvent.setup();
    let saved = null;
    render(<Host onSaved={(next) => { saved = next; }} />);

    await fillBill(user, 50000);
    await chooseNature(user, CONTRACTOR);
    await user.click(screen.getByRole('button', { name: 'Create Bill' }));

    const bill = (saved?.bills || []).at(-1);
    expect(bill?.tdsLedgerId).toBe('101');
    expect(bill?.tdsNatureCode).toBe(CONTRACTOR);
    expect(bill?.tdsSection).toBe('194C');
    expect(bill?.tdsRate).toBe(2);
    expect(bill?.tdsAmount).toBe(1000);
    /* The rule version it was computed under — history must not move when the
       rule master does. */
    expect(bill?.tdsRuleVersionId).toBeTruthy();
  });

  /* The liability to the vendor is the whole bill; the deduction moves cash,
     not what was purchased. */
  it('leaves the bill total alone and states the net separately', async () => {
    const user = userEvent.setup();
    let saved = null;
    render(<Host onSaved={(next) => { saved = next; }} />);

    await fillBill(user, 50000);
    await chooseNature(user, CONTRACTOR);
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

describe('the compliance record', () => {
  beforeEach(() => localStorage.clear());

  /*
   * The bill is the accounting document; the TDS transaction is the compliance
   * record the register, the challan and the quarterly return all read. It
   * carries its own snapshot, so editing the vendor or the rule tomorrow
   * cannot restate what was deducted today.
   */
  it('is written beside the bill, with its own snapshot', async () => {
    const user = userEvent.setup();
    let saved = null;
    render(<Host onSaved={(next) => { saved = next; }} />);

    await fillBill(user, 50000);
    await chooseNature(user, CONTRACTOR);
    await user.click(screen.getByRole('button', { name: 'Create Bill' }));

    await waitFor(() => expect((saved?.tdsTransactions || []).length).toBe(1));
    const event = (saved?.tdsTransactions || []).at(-1);
    expect(event).toMatchObject({
      sourceType: 'bill',
      partyId: 9,
      panSnapshot: 'AABCU9603R',
      tanSnapshot: 'BLRN12345F',
      natureCode: CONTRACTOR,
      sectionCode: '194C',
      baseAmount: 50000,
      rate: 2,
      tdsAmount: 1000,
      ledgerId: '101',
      status: 'Posted',
    });
    expect(event.ruleVersionId).toBeTruthy();
    expect(event.returnQuarter).toMatch(/Q[1-4]$/);
  });

  it('writes nothing where nothing was deducted', async () => {
    const user = userEvent.setup();
    let saved = null;
    render(<Host onSaved={(next) => { saved = next; }} />);

    await fillBill(user, 50000);
    await user.click(screen.getByRole('button', { name: 'Create Bill' }));

    expect(saved?.tdsTransactions || []).toHaveLength(0);
  });
});
