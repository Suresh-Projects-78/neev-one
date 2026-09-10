import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../permissions/useFeatures', () => ({ useFeatures: () => ({ isEnabled: () => false }) }));
vi.mock('../../api/purchaseDocs', () => ({
  createDocApi: vi.fn(async () => ({})),
  deleteDocApi: vi.fn(async () => ({})),
  hasApiSession: () => false,
  saveSettlementApi: vi.fn(async () => ({})),
}));

import { InvoicesList } from '../sales/index';

const COMPANY = { id: 1, name: 'Neev Steels', state: 'Karnataka' };

const INVOICE = {
  id: 3,
  companyId: 1,
  number: 'INV-3',
  date: '2026-09-09',
  customerId: 5,
  customerName: 'Acme Traders',
  items: [],
  subtotal: 1000,
  gstTotal: 180,
  total: 1180,
  paidAmount: 180,
  status: 'Partial',
};

const db = {
  companies: [COMPANY],
  customers: [{ id: 5, companyId: 1, name: 'Acme Traders', displayName: 'Acme Traders' }],
  invoices: [INVOICE],
  items: [],
  payments: [],
  uoms: [],
  gstRates: [],
};

/*
 * A receipt is a document with a number that posts to the ledger, not a detail
 * of the invoice it settles. Opened as a dialog it had no address of its own,
 * the browser's Back button dismissed the list behind it, and there was nowhere
 * to return to once the money was recorded — rows 49 and 52 of the validation
 * sheet.
 */
describe('recording money against an invoice', () => {
  /* Record Receipt lives in the row's actions menu. */
  const openReceiptAction = () => {
    fireEvent.click(screen.getByRole('button', { name: 'Invoice actions' }));
    const action = screen.getByRole('button', { name: 'Record Receipt' });
    fireEvent.click(action);
  };

  it('navigates to the receipts screen instead of opening a dialog', () => {
    const onRecordReceipt = vi.fn();
    const openModal = vi.fn();
    render(
      <InvoicesList
        db={db}
        setDb={() => {}}
        currentCompany={COMPANY}
        openModal={openModal}
        onRecordReceipt={onRecordReceipt}
      />
    );
    openReceiptAction();

    expect(onRecordReceipt).toHaveBeenCalledTimes(1);
    expect(onRecordReceipt.mock.calls[0][0].id).toBe(3);
    // The point of the change: no dialog over the list.
    expect(openModal).not.toHaveBeenCalled();
  });

  /*
   * The dialog stays as the fallback where this list is rendered without a host
   * that can navigate, so no entry point is lost.
   */
  it('still opens the form when there is nowhere to navigate to', () => {
    const openModal = vi.fn();
    render(<InvoicesList db={db} setDb={() => {}} currentCompany={COMPANY} openModal={openModal} />);
    openReceiptAction();
    expect(openModal).toHaveBeenCalled();
  });
});
