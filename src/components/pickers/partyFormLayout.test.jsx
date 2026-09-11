import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../api/masters', async (importOriginal) => ({
  ...(await importOriginal()),
  createCustomer: vi.fn(),
  listCustomers: vi.fn(async () => ({ customers: [] })),
  lookupGstin: vi.fn(),
}));

import { CustomerForm } from './CustomerPicker';
import { VendorForm } from './VendorPicker';

/*
 * The shape of the party master, as drawn.
 *
 * The form was one column of eight labelled rows and a table of addresses eight
 * columns wide. It is three cards now — the bar, the identity, the tabs — with
 * the identity in two columns and each address in the shape of an address.
 * These hold the parts of that which are contract rather than styling.
 */

const db = {
  customers: [],
  vendors: [],
  chartOfAccounts: [],
  accountGroups: [
    { id: 1, companyId: 1, name: 'Sundry Debtors' },
    { id: 2, companyId: 1, name: 'Sundry Creditors' },
  ],
  accountTypes: [],
};
const company = { id: 1, name: 'Test Co', state: 'Karnataka' };

const renderCustomer = () =>
  render(<CustomerForm db={db} setDb={() => {}} currentCompany={company} onClose={() => {}} />);

describe('the form is three cards, not one', () => {
  it('gives the bar, the identity and the tabs a card each', () => {
    const { container } = renderCustomer();
    /* The caller used to supply a card and the form filled it. It brings its
       own now, or the modal and the page draw it differently. */
    expect(container.querySelectorAll('.ui-card').length).toBeGreaterThanOrEqual(3);
  });

  it('heads each part with what it is for', async () => {
    const user = userEvent.setup();
    renderCustomer();
    expect(screen.getByText('Enter the primary information about your customer.')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Credit Details' }));
    expect(screen.getByText('Set credit terms and limits for this customer.')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Statutory Details' }));
    expect(screen.getByText('Tax and regulatory information for this customer.')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Others' }));
    expect(screen.getByText('Additional settings for this customer.')).toBeInTheDocument();
  });
});

describe('an address reads as an address', () => {
  it('names the two built-in places and what each is for', () => {
    renderCustomer();
    expect(screen.getByText('Primary address for invoices and accounting.')).toBeInTheDocument();
    expect(screen.getByText('Used for delivery and correspondence.')).toBeInTheDocument();
    /* Which one a document is addressed to, said on the card rather than
       inferred from its position in a table. */
    expect(screen.getByText('Primary')).toBeInTheDocument();
  });

  it('keeps the fields of a place together', () => {
    renderCustomer();
    for (const label of ['Address Line 1', 'Address Line 2', 'City', 'Pincode', 'District']) {
      expect(screen.getAllByLabelText(label).length).toBeGreaterThanOrEqual(2);
    }
    /* The two pickers say which card they belong to, so a screen reader does
       not hear "Country" twice with nothing to tell them apart. */
    expect(screen.getByLabelText('Country, address 1')).toBeInTheDocument();
    expect(screen.getByLabelText('State, address 2')).toBeInTheDocument();
  });
});

describe('remarks', () => {
  it('gives a note about the party somewhere to go', async () => {
    const user = userEvent.setup();
    renderCustomer();
    await user.click(screen.getByRole('tab', { name: 'Others' }));
    const box = screen.getByLabelText('Remarks');
    await user.type(box, 'Pays on the 10th, never before.');
    expect(box).toHaveValue('Pays on the 10th, never before.');
  });
});

describe('notes may be switched off for a party', () => {
  it('offers the switch, on by default', async () => {
    const user = userEvent.setup();
    renderCustomer();
    await user.click(screen.getByRole('tab', { name: 'Credit Details' }));
    const box = screen.getByLabelText('Allow credit notes for this customer');
    expect(box).toBeChecked();
    await user.click(box);
    expect(box).not.toBeChecked();
  });

  it('says debit notes on the vendor, which is what a vendor gets', async () => {
    const user = userEvent.setup();
    render(<VendorForm db={db} setDb={() => {}} currentCompany={company} onClose={() => {}} />);
    await user.click(screen.getByRole('tab', { name: 'Credit Details' }));
    expect(screen.getByLabelText('Allow debit notes for this vendor')).toBeInTheDocument();
  });
});

describe('the money field says what money it is', () => {
  it('carries the rupee sign inside the opening balance', () => {
    renderCustomer();
    const field = screen.getByLabelText('Opening Balance');
    expect(within(field.parentElement).getByText('₹')).toBeInTheDocument();
  });
});
