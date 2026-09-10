import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../permissions/useFeatures', () => ({ useFeatures: () => ({ isEnabled: () => false }) }));
vi.mock('../../api/purchaseDocs', () => ({
  createDocApi: vi.fn(async () => ({})),
  hasApiSession: () => false,
}));

import { DebitNoteForm, DebitNotesList } from './index';

const COMPANY = { id: 1, name: 'Neev Steels', gstin: '29ABCDE1234F1Z5', state: 'Karnataka' };

const dbWith = (over = {}) => ({
  companies: [COMPANY],
  vendors: [{ id: 9, companyId: 1, name: 'Steel Supply Co', displayName: 'Steel Supply Co', gstin: '29BBBBB0000B1Z5' }],
  items: [{ id: 11, companyId: 1, name: 'MS Angle 50mm', gstRate: 18, unit: 'Nos' }],
  bills: [],
  debitNotes: [],
  uoms: [],
  gstRates: [],
  ...over,
});

describe('the debit note line grid', () => {
  const renderForm = (db = dbWith()) =>
    render(<DebitNoteForm db={db} setDb={() => {}} currentCompany={COMPANY} onClose={() => {}} />);

  /* A debit note reverses a bill, line for line, and was entered through a
     five-column table while the bill it corrects had the full grid. */
  it('carries the same columns as the document it corrects', () => {
    renderForm();
    const grid = document.querySelector('table.ui-grid-dense');
    expect(grid).toBeTruthy();
    const heads = within(grid).getAllByRole('columnheader').map((th) => th.textContent.trim());
    expect(heads).toEqual(expect.arrayContaining(['Unit', 'Disc %', 'Tax %']));
  });

  it('keeps the last line when everything else is removed', () => {
    renderForm();
    expect(screen.getByRole('button', { name: 'Remove line 1' })).toBeDisabled();
  });

  it('renders a field the company defined', () => {
    const company = {
      ...COMPANY,
      docSettings: {
        customFields: { invoice: [{ key: 'rtn', label: 'Return authorisation', type: 'Text', formPlacement: 'header', printPlacement: 'none' }] },
      },
    };
    render(<DebitNoteForm db={dbWith({ companies: [company] })} setDb={() => {}} currentCompany={company} onClose={() => {}} />);
    expect(screen.getByLabelText('Return authorisation')).toBeInTheDocument();
  });
});

describe('printing a debit note', () => {
  const NOTE = {
    id: 1,
    companyId: 1,
    number: 'DN-2',
    date: '2026-09-09',
    vendorId: 9,
    vendorName: 'Steel Supply Co',
    vendorGstin: '29BBBBB0000B1Z5',
    originalBillNumber: 'BILL-11',
    items: [{ itemId: 11, description: 'MS Angle 50mm', quantity: 2, rate: 100, gstRate: 18, taxableAmount: 200 }],
    subtotal: 200,
    cgstTotal: 18,
    sgstTotal: 18,
    gstTotal: 36,
    total: 236,
    status: 'Open',
  };

  const openPaper = () => {
    render(
      <DebitNotesList db={dbWith({ debitNotes: [NOTE] })} setDb={() => {}} openModal={() => {}} currentCompany={COMPANY} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Print debit note DN-2' }));
    return document.querySelector('.printable');
  };

  /* A vendor has to be sent the note; it existed only on screen. */
  it('puts the note on paper against its original bill', () => {
    const paper = openPaper();
    expect(paper).toBeTruthy();
    expect(within(paper).getByText('DEBIT NOTE')).toBeInTheDocument();
    expect(within(paper).getByText(/DN-2/)).toBeInTheDocument();
    expect(within(paper).getByText(/BILL-11/)).toBeInTheDocument();
  });

  /* The document is addressed to a vendor, not a customer. */
  it('addresses the vendor and cites section 34', () => {
    const paper = openPaper();
    expect(within(paper).getByText('Vendor')).toBeInTheDocument();
    expect(within(paper).getByText('Steel Supply Co')).toBeInTheDocument();
    expect(within(paper).getByText(/section 34/)).toBeInTheDocument();
  });

  /* The tax was claimed as input credit and is being given back — it has to
     be on the paper, split the way it was charged. */
  it('shows the tax split', () => {
    const paper = openPaper();
    expect(within(paper).getByText('CGST')).toBeInTheDocument();
    expect(within(paper).getByText('SGST')).toBeInTheDocument();
  });
});
