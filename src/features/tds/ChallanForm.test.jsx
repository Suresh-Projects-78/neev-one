import { useEffect, useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import ChallanForm from './ChallanForm';

/**
 * A challan is the department's receipt; the allocation is the company's
 * claim about which deductions it paid. Only the tax component pays
 * deductions — interest and late fee ride along on the record.
 */

const COMPANY = { id: 1, name: 'Neev Steels' };

const event = (over = {}) => ({
  companyId: 1,
  side: 'PAYABLE',
  status: 'Posted',
  sourceType: 'bill',
  partyId: 2,
  partyName: 'Sharp Contractors',
  natureCode: 'CONTRACT',
  sectionCode: '194C',
  sectionReference: '194C',
  transactionDate: '2026-07-01',
  returnQuarter: 'FY 2026-27 Q2',
  panSnapshot: 'ABCDE1234F',
  ledgerId: '200',
  baseAmount: 100000,
  rate: 2,
  tdsAmount: 2000,
  ...over,
});

const db0 = {
  companies: [COMPANY],
  tdsTransactions: [
    { id: 1, ...event() },
    { id: 2, ...event({ partyName: 'Acme Works', transactionDate: '2026-08-10', tdsAmount: 5000 }) },
    /* Already fully paid by an earlier challan — must not be offered. */
    { id: 3, ...event({ partyName: 'Settled & Co', tdsAmount: 1000 }) },
    /* Reversed and receivable entries are not payable either. */
    { id: 4, ...event({ partyName: 'Reversed Ltd', status: 'Reversed' }) },
    { id: 5, ...event({ partyName: 'ABC Industries', side: 'RECEIVABLE' }) },
  ],
  tdsChallans: [{ id: 9, companyId: 1, number: 'CHL-OLD', paymentDate: '2026-07-07', taxAmount: 1000 }],
  tdsChallanAllocations: [{ id: 1, companyId: 1, challanId: 9, tdsTransactionId: 3, amount: 1000 }],
};

const latest = { db: db0 };
let closed = false;
const Host = () => {
  const [db, setDb] = useState(db0);
  useEffect(() => {
    latest.db = db;
  }, [db]);
  return (
    <ChallanForm
      db={db}
      setDb={(next) => setDb((prev) => (typeof next === 'function' ? next(prev) : next))}
      currentCompany={COMPANY}
      onClose={() => {
        closed = true;
      }}
    />
  );
};

const fillHead = async (user, { tax }) => {
  await user.type(screen.getByLabelText('Challan No. (CIN)'), 'CHL-2026-091');
  await user.type(screen.getByLabelText('Tax amount'), String(tax));
};

describe('what the form offers to allocate', () => {
  beforeEach(() => {
    latest.db = db0;
    closed = false;
  });

  it('lists only outstanding payable deductions, oldest first', () => {
    render(<Host />);
    const rows = screen.getAllByRole('row').slice(1); // drop the header
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining('Sharp Contractors'),
      expect.stringContaining('Acme Works'),
    ]);
    expect(screen.queryByText('Settled & Co')).toBeNull();
    expect(screen.queryByText('Reversed Ltd')).toBeNull();
    expect(screen.queryByText('ABC Industries')).toBeNull();
  });

  it('auto-allocates oldest first and stops when the tax runs out', async () => {
    const user = userEvent.setup();
    render(<Host />);
    await fillHead(user, { tax: 3000 });
    await user.click(screen.getByRole('button', { name: /Auto allocate/ }));

    /* ₹2,000 owed since July is met in full; August gets what is left. */
    expect(screen.getByLabelText('Allocate to Sharp Contractors')).toHaveValue(2000);
    expect(screen.getByLabelText('Allocate to Acme Works')).toHaveValue(1000);
  });

  it('refuses to spend more than the tax amount', async () => {
    const user = userEvent.setup();
    render(<Host />);
    await fillHead(user, { tax: 1000 });
    /* Interest does not pay deductions, however large. */
    await user.type(screen.getByLabelText('Interest'), '5000');
    await user.type(screen.getByLabelText('Allocate to Sharp Contractors'), '2000');

    expect(screen.getByRole('button', { name: 'Record challan' })).toBeDisabled();
    expect(screen.getByText(/interest and late fee do not pay deductions/i)).toBeInTheDocument();
  });
});

describe('saving', () => {
  beforeEach(() => {
    latest.db = db0;
    closed = false;
  });

  it('writes the challan and one allocation row per deduction it pays', async () => {
    const user = userEvent.setup();
    render(<Host />);
    await fillHead(user, { tax: 3000 });
    await user.click(screen.getByRole('button', { name: /Auto allocate/ }));
    await user.click(screen.getByRole('button', { name: 'Record challan' }));

    const challan = latest.db.tdsChallans.find((c) => c.number === 'CHL-2026-091');
    expect(challan).toMatchObject({ companyId: 1, taxAmount: 3000 });

    const links = latest.db.tdsChallanAllocations.filter((a) => a.challanId === challan.id);
    expect(links).toHaveLength(2);
    expect(links.map((l) => [l.tdsTransactionId, l.amount])).toEqual([
      [1, 2000],
      [2, 1000],
    ]);
    expect(closed).toBe(true);
  });

  it('a challan with nothing allocated still saves, for allocating later', async () => {
    const user = userEvent.setup();
    render(<Host />);
    await fillHead(user, { tax: 500 });
    await user.click(screen.getByRole('button', { name: 'Record challan' }));

    const challan = latest.db.tdsChallans.find((c) => c.number === 'CHL-2026-091');
    expect(challan.taxAmount).toBe(500);
    expect(latest.db.tdsChallanAllocations.filter((a) => a.challanId === challan.id)).toHaveLength(0);
  });

  it('needs a number and a non-zero tax amount before it will save', async () => {
    const user = userEvent.setup();
    render(<Host />);
    expect(screen.getByRole('button', { name: 'Record challan' })).toBeDisabled();
    await user.type(screen.getByLabelText('Challan No. (CIN)'), 'CHL-X');
    expect(screen.getByRole('button', { name: 'Record challan' })).toBeDisabled();
    await user.type(screen.getByLabelText('Tax amount'), '100');
    expect(screen.getByRole('button', { name: 'Record challan' })).toBeEnabled();
  });
});
