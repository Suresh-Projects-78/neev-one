import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../api/masters', async (importOriginal) => ({
  ...(await importOriginal()),
  createCustomer: vi.fn(),
  listCustomers: vi.fn(async () => ({ customers: [] })),
  lookupGstin: vi.fn(),
}));
const notify = { success: vi.fn(), error: vi.fn() };
vi.mock('../ui/notify', () => ({ notify: { success: (...a) => notify.success(...a), error: (...a) => notify.error(...a) } }));

import { lookupGstin } from '../../api/masters';
import { CustomerForm } from './CustomerPicker';

/**
 * The customer master form.
 *
 * The old form had two fixed addresses and a single `contactPerson` string, so
 * a customer with a second warehouse and an accounts clerk had nowhere to put
 * either. These hold the parts of the spec that could not be expressed before.
 */

const db = { customers: [], chartOfAccounts: [], accountGroups: [{ id: 1, companyId: 1, name: 'Sundry Debtors' }], accountTypes: [] };
const company = { id: 1, name: 'Test Co', state: 'Karnataka' };

const renderForm = (props = {}) =>
  render(<CustomerForm db={db} setDb={() => {}} currentCompany={company} onClose={() => {}} {...props} />);

beforeEach(() => {
  notify.success.mockReset();
  notify.error.mockReset();
  lookupGstin.mockReset();
});

/*
 * Billing state is required, and rightly: it decides whether a sale splits into
 * CGST + SGST or leaves as IGST. Set through the picker the form actually uses.
 */
const setBillingState = async (user, name = 'Karnataka') => {
  const trigger = screen.getAllByRole('combobox').filter((c) => (c.getAttribute('aria-label') || c.textContent).includes('Select'))[0];
  await user.click(trigger);
  await user.click((await screen.findAllByRole('option')).find((o) => o.textContent.includes(name)));
};

describe('basic details', () => {
  it('asks the six things every customer needs, in order', () => {
    renderForm();
    for (const label of ['GST Registration Type', 'Customer Name', 'Customer Group', 'Currency', 'Opening Balance Type']) {
      expect(screen.getByText(label, { exact: true })).toBeInTheDocument();
    }
    expect(screen.getByPlaceholderText('0.00')).toBeInTheDocument();
    // Dr is the default: a customer normally owes you, not the other way round.
    expect(screen.getByRole('radio', { name: /Dr \(Default\)/ })).toBeChecked();
  });

  /* GSTIN is only asked of somebody who says they have one. */
  it('shows the GSTIN field only when registered', async () => {
    const user = userEvent.setup();
    renderForm();
    expect(screen.getByPlaceholderText('Enter 15 digit GSTIN')).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'Unregistered' }));
    expect(screen.queryByPlaceholderText('Enter 15 digit GSTIN')).toBeNull();
  });

  it('fills the state and PAN from the GSTIN when fetched', async () => {
    lookupGstin.mockResolvedValue({ pan: 'AABCU9603R', state: 'Karnataka', source: 'derived' });
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByPlaceholderText('Enter 15 digit GSTIN'), '29AABCU9603R1ZJ');
    await user.click(screen.getByRole('button', { name: /Fetch from GSTN/i }));

    expect(lookupGstin).toHaveBeenCalledWith('29AABCU9603R1ZJ');
    await user.click(screen.getByRole('tab', { name: 'Statutory Details' }));
    expect(screen.getByLabelText('PAN')).toHaveValue('AABCU9603R');
  });

  it('refuses to fetch a number that is not 15 characters', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByPlaceholderText('Enter 15 digit GSTIN'), '29AAB');
    await user.click(screen.getByRole('button', { name: /Fetch from GSTN/i }));
    expect(lookupGstin).not.toHaveBeenCalled();
    expect(notify.error).toHaveBeenCalled();
  });
});

describe('addresses', () => {
  it('opens on Billing and Shipping, and adds named places beyond them', async () => {
    const user = userEvent.setup();
    renderForm();

    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(3); // header + 2

    await user.click(screen.getByRole('button', { name: /Add Address/i }));
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(4);
    // Named for the user, not left blank for them to name.
    expect(screen.getByDisplayValue('Shipping 2')).toBeInTheDocument();
  });

  /*
   * Every document reaches for billing and shipping by name, so those two
   * cannot be renamed or removed. The ones the user adds can be.
   */
  it('will not let the two built-in places be removed or renamed', async () => {
    const user = userEvent.setup();
    renderForm();

    expect(screen.getByRole('button', { name: /Remove Billing/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Remove Shipping$/i })).toBeDisabled();
    expect(screen.getByDisplayValue('Billing')).toHaveAttribute('readonly');

    await user.click(screen.getByRole('button', { name: /Add Address/i }));
    expect(screen.getByRole('button', { name: /Remove Shipping 2/i })).toBeEnabled();
  });

  it('carries a District column, which the old two-address shape had nowhere for', () => {
    renderForm();
    expect(screen.getByRole('columnheader', { name: 'District' })).toBeInTheDocument();
    expect(screen.getByLabelText('District, row 1')).toBeInTheDocument();
  });
});

describe('contacts', () => {
  /*
   * A line is already there. An empty state with an Add button is one click
   * before anybody can start, and the commonest customer has exactly one
   * contact.
   */
  it('opens with one line ready to type into', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole('tab', { name: 'Contacts' }));

    expect(screen.getByLabelText('Contact name, row 1')).toBeInTheDocument();
    expect(screen.queryByText('No contacts yet.')).toBeNull();
  });

  it('takes more people when asked', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole('tab', { name: 'Contacts' }));
    await user.click(screen.getByRole('button', { name: /Add Contact/i }));

    expect(screen.getByLabelText('Position, row 2')).toBeInTheDocument();
  });
});

describe('the remaining tabs', () => {
  it('puts credit, statutory and code where the master asks for them', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole('tab', { name: 'Credit Details' }));
    expect(screen.getByLabelText(/Credit Period/)).toBeInTheDocument();
    expect(screen.getByLabelText('Credit Limit')).toBeInTheDocument();
    expect(screen.getByLabelText('Price List')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Statutory Details' }));
    expect(screen.getByLabelText('MSME / Udyam')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Others' }));
    expect(screen.getByLabelText('Customer Code')).toBeInTheDocument();
  });

  /*
   * The spec listed GSTIN twice, under Basic Details and again under
   * Statutory. The same value in two editable fields on one form is how two
   * different values get saved, so the second one states it and does not take
   * input.
   */
  it('shows GSTIN under Statutory as a statement, not a second input', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByPlaceholderText('Enter 15 digit GSTIN'), '29AABCU9603R1ZJ');
    await user.click(screen.getByRole('tab', { name: 'Statutory Details' }));

    const shown = screen.getByLabelText('GSTIN');
    expect(shown).toHaveValue('29AABCU9603R1ZJ');
    expect(shown).toHaveAttribute('readonly');
  });
});

describe('the record reaches the server', () => {
  /*
   * The gap this closes: the Customers screen wrote the customer to the browser
   * and stopped. The server write only ever happened when a customer was
   * created from inside an invoice, and even there it sent six fields. So the
   * contacts, the extra addresses, the group, the MSME number and the rest
   * reached nothing — and the customer code the server allots, which the master
   * asks to be auto generated, was never asked for.
   */
  it('sends the whole master, and keeps the code the server allotted', async () => {
    const { createCustomer } = await import('../../api/masters');
    createCustomer.mockResolvedValue({ party: { id: 'srv_1', code: 'CUS-0007' } });

    const rows = [];
    const user = userEvent.setup();
    render(
      <CustomerForm
        db={db}
        setDb={(next) => rows.push(typeof next === 'function' ? next({ customers: [] }) : next)}
        currentCompany={company}
        onClose={() => {}}
      />
    );

    await user.click(screen.getByRole('radio', { name: 'Unregistered' }));
    await user.type(screen.getByPlaceholderText('Enter customer name'), 'Acme Traders');
    await setBillingState(user);

    await user.click(screen.getByRole('tab', { name: 'Contacts' }));
    await user.click(screen.getByRole('button', { name: /Add Contact/i }));
    await user.type(screen.getByLabelText('Contact name, row 1'), 'Priya Nair');
    await user.type(screen.getByLabelText('Position, row 1'), 'Accounts');

    await user.click(screen.getByRole('tab', { name: 'Statutory Details' }));
    await user.type(screen.getByLabelText('MSME / Udyam'), 'UDYAM-KR-03-0001234');

    await user.click(screen.getByRole('button', { name: /^Save$/ }));

    expect(createCustomer).toHaveBeenCalledTimes(1);
    const sent = createCustomer.mock.calls[0][0];
    expect(sent.name).toBe('Acme Traders');
    expect(sent.msmeNumber).toBe('UDYAM-KR-03-0001234');
    expect(sent.contacts).toEqual([{ name: 'Priya Nair', position: 'Accounts', email: undefined, mobile: undefined }]);

    // The allotted code comes back onto the local row — this is the master's
    // "auto generated", which previously stayed blank.
    const written = rows.at(-1);
    expect(written.customers.at(-1).code).toBe('CUS-0007');
    expect(written.customers.at(-1).backendPartyId).toBe('srv_1');
  });

  /* A refused write must not lose the entry. */
  it('keeps the customer on this device when the server refuses', async () => {
    const { createCustomer } = await import('../../api/masters');
    createCustomer.mockRejectedValue(new Error('offline'));

    const rows = [];
    const user = userEvent.setup();
    render(<CustomerForm db={db} setDb={(n) => rows.push(n)} currentCompany={company} onClose={() => {}} />);

    await user.click(screen.getByRole('radio', { name: 'Unregistered' }));
    await user.type(screen.getByPlaceholderText('Enter customer name'), 'Offline Co');
    await setBillingState(user);
    await user.click(screen.getByRole('button', { name: /^Save$/ }));

    expect(rows.at(-1).customers.at(-1).name).toBe('Offline Co');
    expect(notify.error).toHaveBeenCalled();
  });
});

describe('header actions', () => {
  /*
   * A form with tabs has no single bottom — the page ends wherever the selected
   * tab ends — so a bottom bar moves as you switch between Address and Others.
   * The spec puts the actions at the top, where they sit in one place whichever
   * tab is open.
   */
  it('puts Save and Cancel at the top and leaves no bottom bar', () => {
    const { container } = renderForm();
    const save = screen.getByRole('button', { name: /^Save$/ });
    const cancel = screen.getByRole('button', { name: /^Cancel$/ });
    const tabs = screen.getByRole('tab', { name: 'Address' });

    // Both actions come before the tab strip in the document.
    expect(save.compareDocumentPosition(tabs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(cancel.compareDocumentPosition(tabs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // And there is exactly one of each, so the old bar is gone rather than duplicated.
    expect(screen.getAllByRole('button', { name: /^Save$/ })).toHaveLength(1);
    expect(container.querySelectorAll('button[value="saveAndNew"]')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: /Save and New/i })).toBeNull();
  });

  /*
   * The same header the invoice uses, not a second one that looks like it:
   * Back, Cancel, Save, and a three-dot menu for the rest.
   */
  it('uses the shared document header, with Back beside the way out', () => {
    renderForm();
    expect(screen.getByRole('button', { name: /^Back$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Cancel$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Save$/ })).toBeInTheDocument();
  });

  it('keeps the secondary actions behind the three-dot menu', async () => {
    const user = userEvent.setup();
    renderForm();
    expect(screen.queryByText(/Save and add another/i)).toBeNull();

    await user.click(screen.getByRole('button', { name: /More options/i }));
    expect(screen.getByText(/Save and add another/i)).toBeInTheDocument();
    expect(screen.getByText(/Mark inactive/i)).toBeInTheDocument();
    expect(screen.getByText(/Clear the form/i)).toBeInTheDocument();
  });
});

describe('Others tab', () => {
  it('offers Active rather than a delete, and carries no remarks field', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole('tab', { name: 'Others' }));

    expect(screen.getByRole('checkbox', { name: 'Active' })).toBeChecked();
    // The spec excludes remarks; a Notes box was there before.
    expect(screen.queryByLabelText(/Notes/i)).toBeNull();
  });
});

describe('Statutory tab', () => {
  /*
   * TDS is deducted FROM a vendor, not from a customer, so the configuration
   * belongs on the vendor master alone. Asserted here because the two forms now
   * share a layout, and a flag flipped in the shared config would otherwise put
   * a vendor's field on the customer form with nothing to catch it.
   */
  it('does not carry the vendor-only TDS configuration', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole('tab', { name: 'Statutory Details' }));
    expect(screen.queryByLabelText('TDS Configuration')).toBeNull();
  });

  /* One place to set it, another to read it — never two places to set it. */
  it('states the GST treatment without letting it be set twice', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole('tab', { name: 'Statutory Details' }));
    const shown = screen.getByLabelText('GST Registration / Treatment');
    expect(shown).toHaveValue('Registered');
    expect(shown).toHaveAttribute('readonly');
  });
});
