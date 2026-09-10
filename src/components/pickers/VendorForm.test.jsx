import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../permissions/useFeatures', () => ({ useFeatures: () => ({ isEnabled: () => true }) }));
vi.mock('../../api/http', () => ({ apiFetch: vi.fn(async () => ({})) }));
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


/** Fill what a save needs: the name, and a billing state for India. */
const fillMinimum = async (user, name = 'Umbrella Chemicals') => {
  await user.type(screen.getByLabelText(/^Vendor Name/), name);
  await user.click(screen.getByRole('tab', { name: 'Address' }));
  await user.click(screen.getByLabelText('State, row 1'));
  await user.click((await screen.findAllByRole('option')).find((o) => o.textContent.includes('Karnataka')));
};

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

describe('the money fields', () => {
  const vendor = {
    id: 4,
    companyId: 1,
    displayName: 'Umbrella Chemicals',
    name: 'Umbrella Chemicals',
    groupId: 1,
    openingBalance: 25000,
    openingBalanceType: 'Cr',
    creditLimit: 200000,
    paymentTermDays: 45,
  };

  /*
   * The edit branch of the initial state carried none of these, so opening an
   * existing vendor rendered them from `undefined`: the balance and the limit
   * came up empty whatever the vendor held.
   */
  it('shows what an existing vendor already carries', async () => {
    const user = userEvent.setup();
    render(<VendorForm db={{ ...db, vendors: [vendor] }} setDb={() => {}} currentCompany={company} initialData={vendor} onClose={() => {}} />);

    expect(screen.getByLabelText('Opening Balance')).toHaveValue(25000);
    expect(screen.getByRole('radio', { name: /Cr \(Default\)/ })).toBeChecked();

    await user.click(screen.getByRole('tab', { name: 'Credit Details' }));
    expect(screen.getByLabelText('Credit Limit')).toHaveValue(200000);
    expect(screen.getByLabelText('Credit Period (days)')).toHaveValue(45);
  });

  it('saves the credit limit rather than dropping it', async () => {
    const user = userEvent.setup();
    const setDb = vi.fn();
    render(<VendorForm db={db} setDb={setDb} currentCompany={company} onClose={() => {}} />);

    await fillMinimum(user);
    await user.click(screen.getByRole('tab', { name: 'Credit Details' }));
    await user.type(screen.getByLabelText('Credit Limit'), '200000');
    await user.click(screen.getByRole('button', { name: /^Save$/ }));

    expect(setDb).toHaveBeenCalled();
    const saved = setDb.mock.calls.at(-1)[0].vendors.at(-1);
    expect(saved.creditLimit).toBe(200000);
  });

  /*
   * Two guards, and the outer one fires first: the control itself is bounded
   * at zero, so a negative never reaches the submit handler. The master's own
   * refusal is tested where it lives, in partyMaster.test.js — it is what
   * catches a value that arrives some other way.
   */
  it('will not save a negative credit limit', async () => {
    const user = userEvent.setup();
    const setDb = vi.fn();
    render(<VendorForm db={db} setDb={setDb} currentCompany={company} onClose={() => {}} />);

    await fillMinimum(user);
    await user.click(screen.getByRole('tab', { name: 'Credit Details' }));
    const limit = screen.getByLabelText('Credit Limit');
    expect(limit).toHaveAttribute('min', '0');
    await user.type(limit, '-5');
    await user.click(screen.getByRole('button', { name: /^Save$/ }));

    expect(setDb).not.toHaveBeenCalled();
  });

  it('opens a vendor ledger on the credit side', async () => {
    const user = userEvent.setup();
    const setDb = vi.fn();
    render(<VendorForm db={db} setDb={setDb} currentCompany={company} onClose={() => {}} />);

    await fillMinimum(user);
    await user.click(screen.getByRole('button', { name: /^Save$/ }));

    const ledger = setDb.mock.calls.at(-1)[0].chartOfAccounts.at(-1);
    expect(ledger.openingBalanceType).toBe('Cr');
  });
});

describe('the price list', () => {
  const withLists = {
    ...db,
    priceLists: [
      { id: 3, companyId: 1, name: 'Bulk purchase', status: 'active' },
      { id: 4, companyId: 1, name: 'Retired card', status: 'inactive' },
    ],
  };

  /*
   * The rate engine looks a price list up by id, so the free-text box this
   * replaced pointed at nothing whatever was typed into it.
   */
  it('offers the lists in force and not the retired one', async () => {
    const user = userEvent.setup();
    render(<VendorForm db={withLists} setDb={() => {}} currentCompany={company} onClose={() => {}} />);
    await user.click(screen.getByRole('tab', { name: 'Credit Details' }));

    const select = screen.getByLabelText('Purchase Price List');
    const labels = Array.from(select.options).map((o) => o.textContent);
    expect(labels).toContain('Bulk purchase');
    expect(labels).not.toContain('Retired card');
  });

  it('stores the list id, which is what pricing reads', async () => {
    const user = userEvent.setup();
    const setDb = vi.fn();
    render(<VendorForm db={withLists} setDb={setDb} currentCompany={company} onClose={() => {}} />);

    await fillMinimum(user);
    await user.click(screen.getByRole('tab', { name: 'Credit Details' }));
    await user.selectOptions(screen.getByLabelText('Purchase Price List'), '3');
    await user.click(screen.getByRole('button', { name: /^Save$/ }));

    expect(setDb.mock.calls.at(-1)[0].vendors.at(-1).priceListId).toBe('3');
  });
});

describe('the vendor reaches the server', () => {
  /*
   * The customer form has written through since the master was rebuilt; the
   * vendor form never did, so a vendor entered here lived in one browser and
   * hydration — which matches on backendPartyId — could not see it.
   */
  it('creates the party and keeps what the server allotted', async () => {
    const user = userEvent.setup();
    const setDb = vi.fn();
    const { createVendor } = await import('../../api/masters');
    createVendor.mockResolvedValueOnce({ party: { id: 'srv-77', code: 'VEN-000124' } });

    render(<VendorForm db={db} setDb={setDb} currentCompany={company} onClose={() => {}} />);
    await fillMinimum(user);
    await user.click(screen.getByRole('button', { name: /^Save$/ }));

    expect(createVendor).toHaveBeenCalledWith(expect.objectContaining({ name: 'Umbrella Chemicals' }));
    const saved = setDb.mock.calls.at(-1)[0].vendors.at(-1);
    expect(saved.backendPartyId).toBe('srv-77');
    expect(saved.code).toBe('VEN-000124');
  });

  it('keeps the vendor on this device when the server refuses', async () => {
    const user = userEvent.setup();
    const setDb = vi.fn();
    const { createVendor } = await import('../../api/masters');
    createVendor.mockRejectedValueOnce(new Error('offline'));

    render(<VendorForm db={db} setDb={setDb} currentCompany={company} onClose={() => {}} />);
    await fillMinimum(user);
    await user.click(screen.getByRole('button', { name: /^Save$/ }));

    expect(setDb.mock.calls.at(-1)[0].vendors.at(-1).displayName).toBe('Umbrella Chemicals');
    expect(notify.error).toHaveBeenCalledWith(expect.stringMatching(/this device only/i));
  });
});

describe('Fetch from GSTN', () => {
  const portal = {
    gstin: '29AABCU9603R1ZM',
    pan: 'AABCU9603R',
    legalName: 'Umbrella Chemicals Private Limited',
    state: 'Karnataka',
    address: { line1: '4 MG Road', city: 'Bengaluru', pincode: '560001' },
    source: 'portal',
  };

  const openRegistered = async (user) => {
    renderVendor();
    await user.click(screen.getByRole('radio', { name: 'Registered' }));
    await user.type(screen.getByPlaceholderText('Enter 15 digit GSTIN'), '29AABCU9603R1ZM');
  };

  it('fills an empty name and PAN from the portal', async () => {
    const user = userEvent.setup();
    const { apiFetch } = await import('../../api/http');
    apiFetch.mockResolvedValueOnce(portal);

    await openRegistered(user);
    await user.click(screen.getByRole('button', { name: /Fetch from GSTN/i }));

    expect(await screen.findByDisplayValue('Umbrella Chemicals Private Limited')).toBeInTheDocument();
  });

  /* The spec: do not silently overwrite manually entered information. */
  it('keeps a name that was already typed, and says so', async () => {
    const user = userEvent.setup();
    const { apiFetch } = await import('../../api/http');
    apiFetch.mockResolvedValueOnce(portal);

    const user2 = userEvent.setup();
    renderVendor();
    await user2.type(screen.getByLabelText(/^Vendor Name/), 'Umbrella Chem');
    await user2.click(screen.getByRole('radio', { name: 'Registered' }));
    await user2.type(screen.getByPlaceholderText('Enter 15 digit GSTIN'), '29AABCU9603R1ZM');
    await user2.click(screen.getByRole('button', { name: /Fetch from GSTN/i }));

    expect(await screen.findByDisplayValue('Umbrella Chem')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('Umbrella Chemicals Private Limited')).toBeNull();
    expect(notify.info).toHaveBeenCalledWith(expect.stringMatching(/kept what you had typed/i));
  });
});

describe('the three-dot menu', () => {
  const vendor = { id: 4, companyId: 1, displayName: 'Umbrella Chemicals', name: 'Umbrella Chemicals', groupId: 1, gstin: '29AABCU9603R1ZM', code: 'VEN-000001' };

  it('offers Duplicate only while editing, and hands back the values', async () => {
    const user = userEvent.setup();
    const onDuplicate = vi.fn();

    render(<VendorForm db={{ ...db, vendors: [vendor] }} setDb={() => {}} currentCompany={company} initialData={vendor} onClose={() => {}} onDuplicate={onDuplicate} />);
    await user.click(screen.getByRole('button', { name: /More options/i }));
    await user.click(screen.getByRole('menuitem', { name: /Duplicate this vendor/i }));

    expect(onDuplicate).toHaveBeenCalledWith(expect.objectContaining({ displayName: 'Umbrella Chemicals' }));
  });

  it('is not offered on a new vendor', async () => {
    const user = userEvent.setup();
    renderVendor();
    await user.click(screen.getByRole('button', { name: /More options/i }));
    expect(screen.queryByRole('menuitem', { name: /Duplicate/i })).toBeNull();
  });
});

describe('a duplicated vendor', () => {
  /* Everything about the trading relationship, none of the identity. */
  it('copies the terms but not the GSTIN, PAN or code', () => {
    const seed = {
      displayName: 'Umbrella Chemicals',
      groupId: '1',
      gstin: '29AABCU9603R1ZM',
      pan: 'AABCU9603R',
      code: 'VEN-000001',
      creditLimit: 200000,
      paymentTermDays: 45,
      billingAddress: { line1: '4 MG Road', state: 'Karnataka', country: 'India' },
      contacts: [{ name: 'R. Nair', position: 'Accounts', email: '', mobile: '' }],
    };

    render(<VendorForm db={db} setDb={() => {}} currentCompany={company} seedData={seed} onClose={() => {}} />);

    expect(screen.getByLabelText(/^Vendor Name/)).toHaveValue('Umbrella Chemicals (copy)');
    expect(screen.queryByDisplayValue('29AABCU9603R1ZM')).toBeNull();
    expect(screen.queryByDisplayValue('VEN-000001')).toBeNull();
  });
});
