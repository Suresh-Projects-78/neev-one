import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../permissions/useFeatures', () => ({ useFeatures: () => ({ isEnabled: () => true }) }));
vi.mock('../../api/masters', async (importOriginal) => ({
  ...(await importOriginal()),
  createVendor: vi.fn(),
  listVendors: vi.fn(async () => ({ vendors: [] })),
}));
const notify = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
vi.mock('../ui/notify', () => ({
  notify: { success: (...a) => notify.success(...a), error: (...a) => notify.error(...a), info: (...a) => notify.info(...a) },
  confirmDialog: vi.fn(async () => true),
}));

import { VendorForm } from './VendorPicker';
import { CustomerForm } from './CustomerPicker';

/**
 * The vendor master, which the specification calls the customer form's
 * counterpart: same layout and interaction, only what is genuinely
 * vendor-specific changed.
 *
 * That is why both render one shared layout. Written as two forms it would be
 * three hundred lines duplicated and two places to fix every future change —
 * and the differences that matter would be buried among the ones that do not.
 */

const db = {
  vendors: [],
  customers: [],
  chartOfAccounts: [],
  accountTypes: [],
  accountGroups: [
    { id: 1, companyId: 1, name: 'Sundry Creditors' },
    { id: 2, companyId: 1, name: 'Sundry Debtors' },
  ],
};
const company = { id: 1, name: 'Test Co', state: 'Karnataka' };

const renderVendor = () =>
  render(<VendorForm db={db} setDb={() => {}} currentCompany={company} onClose={() => {}} />);

beforeEach(() => vi.clearAllMocks());

describe('the vendor form is the customer form, re-labelled', () => {
  it('carries the same tabs', () => {
    renderVendor();
    for (const name of ['Address', 'Contacts', 'Credit Details', 'Statutory Details', 'Others']) {
      expect(screen.getByRole('tab', { name })).toBeInTheDocument();
    }
  });

  it('uses vendor wording, not customer wording', () => {
    renderVendor();
    expect(screen.getByText('Vendor Name')).toBeInTheDocument();
    expect(screen.getByText('Vendor Group')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter vendor name')).toBeInTheDocument();
    expect(screen.queryByText('Customer Name')).toBeNull();
  });

  it('has the same header actions', () => {
    renderVendor();
    expect(screen.getByRole('button', { name: /^Back$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Cancel$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Save$/ })).toBeInTheDocument();
    // The bottom bar is gone on both.
    expect(screen.queryByRole('button', { name: /Create Vendor/i })).toBeNull();
  });
});

describe('what is genuinely different', () => {
  /*
   * The one accounting difference somebody could get wrong without noticing. A
   * vendor balance is money the business owes; a customer balance is money owed
   * to it.
   */
  it('defaults the opening balance to Cr, where a customer defaults to Dr', () => {
    renderVendor();
    expect(screen.getByRole('radio', { name: /Cr \(Default\)/ })).toBeChecked();

    render(<CustomerForm db={db} setDb={() => {}} currentCompany={company} onClose={() => {}} />);
    expect(screen.getAllByRole('radio', { name: /Dr \(Default\)/ }).at(-1)).toBeChecked();
  });

  it('offers a purchase price list rather than a sales one', async () => {
    const user = userEvent.setup();
    renderVendor();
    await user.click(screen.getByRole('tab', { name: 'Credit Details' }));
    expect(screen.getByLabelText('Purchase Price List')).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Price List$/)).toBeNull();
  });

  /* A vendor is the party a business deducts TDS from; a customer is not. */
  it('carries a TDS configuration a customer does not', async () => {
    const user = userEvent.setup();
    renderVendor();
    await user.click(screen.getByRole('tab', { name: 'Statutory Details' }));
    expect(screen.getByLabelText('TDS Configuration')).toBeInTheDocument();
  });

  it('does not offer a Vendor Type field, which the spec forbids', () => {
    renderVendor();
    expect(screen.queryByLabelText(/Vendor Type/i)).toBeNull();
    expect(screen.queryByText(/Business \/ Individual/i)).toBeNull();
  });
});
