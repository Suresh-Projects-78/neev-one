import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../permissions/useFeatures', () => ({ useFeatures: () => ({ isEnabled: () => false }) }));
vi.mock('../../api/purchaseDocs', () => ({
  createDocApi: vi.fn(async () => ({})),
  deleteDocApi: vi.fn(async () => ({})),
  hasApiSession: () => false,
  saveSettlementApi: vi.fn(async () => ({})),
}));
vi.mock('../../api/ledger', () => ({
  listLedgerAccounts: vi.fn(async () => ({ accounts: [] })),
  createLedgerAccount: vi.fn(async () => ({})),
}));

import { EstimateForm } from './index';
import SalesOrders from './SalesOrders';
import RecordReceiptForm from '../payments/RecordReceiptForm';

/**
 * One shape of screen for every document.
 *
 * A quotation becomes a sales order becomes an invoice, and a receipt settles
 * it. They had drifted into four layouts: the number on the left of one and
 * the right of another, "Add line" here and "Add Item" there, a running total
 * on the invoice and nowhere else. Somebody who has raised a hundred invoices
 * should not have to read the quotation screen.
 *
 * These are the parts of the invoice's layout the others must carry. They are
 * asserted per screen rather than as a rendered comparison, because a sales
 * order genuinely has no due date and a receipt genuinely has no line grid —
 * what is shared is where things sit, not which fields exist.
 */

const COMPANY = { id: 1, name: 'Neev Steels', gstin: '29ABCDE1234F1Z5', state: 'Karnataka' };

const baseDb = (over = {}) => ({
  companies: [COMPANY],
  customers: [{ id: 5, companyId: 1, name: 'Acme Traders', displayName: 'Acme Traders' }],
  items: [{ id: 11, companyId: 1, name: 'MS Angle 50mm', gstRate: 18, unit: 'Nos', salePrice: 100 }],
  estimates: [],
  salesOrders: [],
  invoices: [],
  creditNotes: [],
  receipts: [],
  chartOfAccounts: [],
  uoms: [],
  gstRates: [],
  salesmen: [],
  ...over,
});

/** The line grid the invoice defines, column for column. */
const LINE_COLUMNS = ['Item', 'Description', 'Qty', 'Unit', 'Rate (₹)', 'Disc %', 'Tax %', 'Amount (₹)'];

const lineHeaders = () => {
  const table = screen.getAllByRole('table').find((t) => within(t).queryByText('Item'));
  return within(table)
    .getAllByRole('columnheader')
    .map((th) => th.textContent.replace(/\s+/g, ' ').replace(' *', '').trim())
    .filter(Boolean);
};

describe('the quotation wears the invoice layout', () => {
  const renderQuote = () =>
    render(<EstimateForm db={baseDb()} setDb={() => {}} currentCompany={COMPANY} onClose={() => {}} />);

  it('carries every line column the invoice has', () => {
    renderQuote();
    expect(lineHeaders()).toEqual(LINE_COLUMNS);
  });

  it('adds lines with the invoice\'s control and hint', () => {
    renderQuote();
    expect(screen.getByRole('button', { name: /Add Item/i })).toBeInTheDocument();
    expect(screen.getByText(/press Tab in the last field of the last row/i)).toBeInTheDocument();
  });

  it('keeps a running total on screen', () => {
    renderQuote();
    expect(screen.getByText('Total')).toBeInTheDocument();
    expect(screen.getByText(/line\(s\)/)).toBeInTheDocument();
  });

  it('puts the paperwork in the right-hand column', () => {
    renderQuote();
    // Number and both dates, named as the invoice names them.
    expect(screen.getByLabelText(/^Quotation No\./)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Date/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Valid Until/)).toBeInTheDocument();
  });
});

describe('the sales order wears the invoice layout', () => {
  const openForm = () => {
    render(<SalesOrders db={baseDb()} setDb={() => {}} currentCompany={COMPANY} />);
    return screen.getByRole('button', { name: /New Sales Order/i });
  };

  it('carries every line column the invoice has, and the same add control', async () => {
    const { click } = await import('@testing-library/user-event').then((m) => ({ click: m.default.setup().click }));
    const trigger = openForm();
    await click(trigger);

    expect(lineHeaders()).toEqual(LINE_COLUMNS);
    expect(screen.getByRole('button', { name: /Add Item/i })).toBeInTheDocument();
    expect(screen.getByText(/press Tab in the last field of the last row/i)).toBeInTheDocument();
  });

  it('names the first total as the invoice does and keeps a running one', async () => {
    const { click } = await import('@testing-library/user-event').then((m) => ({ click: m.default.setup().click }));
    await click(openForm());

    // "Taxable value" is the return's word for it; the invoice says Subtotal.
    expect(screen.getByText('Subtotal')).toBeInTheDocument();
    expect(screen.getByText(/line\(s\)/)).toBeInTheDocument();
  });
});

describe('the receipt wears the invoice layout', () => {
  const renderReceipt = () =>
    render(
      <RecordReceiptForm
        db={baseDb()}
        setDb={() => {}}
        currentCompany={COMPANY}
        onClose={() => {}}
        screenTitle="Record Receipt"
        onBack={() => {}}
      />
    );

  it('puts the name, Back and the primary action in one bar', () => {
    renderReceipt();
    expect(screen.getByRole('heading', { name: 'Record Receipt' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Record Receipt/i })).toBeInTheDocument();
  });

  it('marks its mandatory fields and says what the marker means', () => {
    renderReceipt();
    expect(screen.getByLabelText(/^Receipt Date \*$/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Amount Received \*$/)).toBeInTheDocument();
    expect(screen.getByText(/Indicates mandatory fields/i)).toBeInTheDocument();
  });

  it('keeps the figure that must match the bank on screen', () => {
    renderReceipt();
    expect(screen.getAllByText('Net into the account').length).toBeGreaterThan(0);
    expect(screen.getByText(/invoice\(s\) allocated/)).toBeInTheDocument();
  });
});
