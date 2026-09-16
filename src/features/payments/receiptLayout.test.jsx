/**
 * Where the fields sit.
 *
 * The head of the receipt is one three-column grid, not two halves with a rule
 * between them, and the reference falls directly under the account it names
 * the instrument of. These are layout facts the screenshots kept catching and
 * the test suite did not.
 */
import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../api/payments', () => ({ createPayment: vi.fn(async () => ({})) }));

import RecordReceiptForm from './RecordReceiptForm';

const COMPANY = { id: 1, name: 'Neev Steels', state: 'Karnataka' };

const db0 = {
  companies: [COMPANY],
  customers: [],
  invoices: [],
  creditNotes: [],
  payments: [],
  accountGroups: [{ id: 21, companyId: 1, name: 'Indirect Income', parentGroupId: null }],
  chartOfAccounts: [{ id: 401, companyId: 1, name: 'Interest Received', groupId: 21 }],
};

const Host = () => {
  const [db, setDb] = useState(db0);
  return (
    <RecordReceiptForm
      db={db}
      setDb={setDb}
      currentCompany={COMPANY}
      screenTitle="New Receipt"
      onClose={() => {}}
    />
  );
};

describe('the head of the receipt', () => {
  it('is one grid of three columns, not two halves with a rule', () => {
    render(<Host />);
    const heading = screen.getByText('Receipt Details');
    const grid = heading.parentElement.querySelector('.grid');
    expect(grid.className).toMatch(/lg:grid-cols-3/);
    /* The rule belonged to a two-column split that no longer exists. */
    expect(grid.className).not.toMatch(/grid-cols-12/);
    expect(heading.closest('section').querySelector('[style*="border-inline-start"]')).toBeNull();
  });

  it('puts the reference under the account it names the instrument of', () => {
    render(<Host />);
    const grid = screen.getByText('Receipt Details').parentElement.querySelector('.grid');
    const cells = [...grid.children];
    const account = cells.findIndex((c) => within(c).queryByText(/Received into/));
    const reference = cells.findIndex((c) => within(c).queryByText(/Reference \/ UTR/));
    expect(account).toBe(0);
    /* Three across, so the fourth cell lands beneath the first. */
    expect(reference).toBe(3);
  });

  it('names the screen and says what it is for', () => {
    render(<Host />);
    expect(screen.getByRole('heading', { name: 'New Receipt' })).toBeInTheDocument();
    expect(screen.getByText(/Record money received into your business/)).toBeInTheDocument();
  });
});

describe('the receipt summary', () => {
  it('states three figures, not the eight it used to', () => {
    render(<Host />);
    /* The heading and the figures are siblings, so the card is the parent. */
    const card = screen.getByText('Receipt Summary').parentElement;
    expect(within(card).getByText('Total allocation')).toBeInTheDocument();
    expect(within(card).getByText('TDS deducted')).toBeInTheDocument();
    expect(within(card).getByText('Bank amount (Total receipt)')).toBeInTheDocument();
    /* Named boxes that no longer exist, and the same number under three
       different words. */
    expect(within(card).queryByText('Amount received')).toBeNull();
    expect(within(card).queryByText('Bank charges')).toBeNull();
    expect(within(card).queryByText('Invoices selected')).toBeNull();
  });

  it('keeps the on-account line for the receipts that have one', () => {
    render(<Host />);
    /* Nothing allocated, nothing waiting — so the line is not drawn at all
       rather than reading nought on every receipt. */
    expect(screen.queryByText('On account (unallocated)')).toBeNull();
  });
});

describe('the allocation table', () => {
  it('does not cry unallocated before anything has been entered', () => {
    render(<Host />);
    expect(screen.queryByText('Unallocated')).toBeNull();
  });

  it('puts Add Row below the rows it adds to', () => {
    render(<Host />);
    const table = screen.getByText(/Ledger allocation/i).closest('section').querySelector('table');
    const addRow = screen.getByRole('button', { name: /Add Row/i });
    /* DOCUMENT_POSITION_FOLLOWING: the button comes after the table. */
    expect(table.compareDocumentPosition(addRow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
