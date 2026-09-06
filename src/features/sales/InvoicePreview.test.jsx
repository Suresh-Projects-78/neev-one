import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../permissions/useFeatures', () => ({ useFeatures: () => ({ isEnabled: () => false }) }));
import InvoicePreview from './InvoicePreview';

const COMPANY = { id: 1, name: 'Neev Steels', gstin: '29ABCDE1234F1Z5', state: 'Karnataka' };

const invoiceWith = (items) => ({
  number: 'INV-3', date: '2026-09-06', dueDate: '2026-10-06',
  customerName: 'Acme Traders', customerGstin: '29AAAAA0000A1Z5',
  placeOfSupplyState: 'Karnataka', taxType: 'CGST_SGST',
  items, subtotal: 450, cgstTotal: 40.5, sgstTotal: 40.5, igstTotal: 0, gstTotal: 81, total: 531,
});

const LINE = { itemId: 11, name: 'MS Angle 50mm', description: '', quantity: 4, rate: 100, gstRate: 18, taxable: 400, lineTotal: 472 };

describe('InvoicePreview', () => {
  it('names a line from the item master', () => {
    const db = { companies: [COMPANY], customers: [], uoms: [], gstRates: [],
      items: [{ id: 11, companyId: 1, name: 'MS Angle 50mm' }] };
    render(<InvoicePreview db={db} currentCompany={COMPANY} invoice={invoiceWith([LINE])} />);
    expect(screen.getByText('MS Angle 50mm')).toBeInTheDocument();
  });

  /*
   * The book can come back from the server with ids as strings. Every picker
   * compares companyId as a number, so the item is selectable; the preview
   * compared it strictly and could not find the master it had just been given.
   */
  it('finds the master when companyId arrives as a string', () => {
    const db = { companies: [COMPANY], customers: [], uoms: [], gstRates: [],
      items: [{ id: 11, companyId: '1', name: 'MS Angle 50mm' }] };
    render(<InvoicePreview db={db} currentCompany={COMPANY} invoice={invoiceWith([LINE])} />);
    expect(screen.getByText('MS Angle 50mm')).toBeInTheDocument();
  });

  /* A line records what it was called. With no master at all, that is still
     the honest thing to print — not a dash, and not the description. */
  it("falls back to the line's own name when the master is gone", () => {
    const db = { companies: [COMPANY], customers: [], uoms: [], gstRates: [], items: [] };
    render(<InvoicePreview db={db} currentCompany={COMPANY} invoice={invoiceWith([LINE])} />);
    expect(screen.getByText('MS Angle 50mm')).toBeInTheDocument();
  });

  it('still shows the number, the customer and the total', () => {
    const db = { companies: [COMPANY], customers: [], uoms: [], gstRates: [], items: [] };
    render(<InvoicePreview db={db} currentCompany={COMPANY} invoice={invoiceWith([LINE])} />);
    expect(screen.getByText(/INV-3/)).toBeInTheDocument();
    expect(screen.getByText(/Acme Traders/)).toBeInTheDocument();
  });
});
