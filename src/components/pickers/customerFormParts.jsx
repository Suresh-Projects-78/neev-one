import { Info, Plus, Trash2 } from 'lucide-react';

import PopupSelect from './PopupSelect';

/**
 * The parts of the customer master that repeat.
 *
 * Two of them are tables rather than field groups, and that is the whole point
 * of the redesign: a customer with exactly one delivery address and exactly one
 * person at the other end is the exception. The old form had two fixed
 * addresses and a single `contactPerson` string, so the second warehouse and
 * the accounts clerk had nowhere to go.
 */

export const CUSTOMER_TABS = [
  { key: 'address', label: 'Address' },
  { key: 'contacts', label: 'Contacts' },
  { key: 'credit', label: 'Credit Details' },
  { key: 'statutory', label: 'Statutory Details' },
  { key: 'others', label: 'Others' },
];

export const CURRENCY_OPTIONS = [
  { value: 'INR', label: 'INR - Indian Rupee' },
  { value: 'USD', label: 'USD - US Dollar' },
  { value: 'EUR', label: 'EUR - Euro' },
  { value: 'GBP', label: 'GBP - Pound Sterling' },
  { value: 'AED', label: 'AED - UAE Dirham' },
  { value: 'SGD', label: 'SGD - Singapore Dollar' },
];

/**
 * Label on the left, control on the right, explanation behind the icon.
 *
 * The hint is a `title` rather than always-on helper text: a form with a line of
 * prose under every field is longer than the form, and the person filling it in
 * for the twentieth time is not reading any of it.
 */
export const FormRow = ({ label, hint = '', required = false, htmlFor = '', children }) => (
  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[minmax(8rem,12rem)_minmax(16rem,1fr)] sm:items-start sm:gap-5">
    <div className="flex items-center gap-1.5 sm:pt-2">
      {/* A real <label> where the control has an id: a bare <span> beside a
          field names it for a sighted reader and for nobody else. */}
      <label className="text-sm" htmlFor={htmlFor || undefined}>
        {label}
        {required ? <span style={{ color: 'rgb(var(--neg))' }}> *</span> : null}
      </label>
      {hint ? (
        <span title={hint} aria-label={hint} className="ui-subtle inline-flex cursor-help">
          <Info size={13} aria-hidden="true" />
        </span>
      ) : null}
    </div>
    <div className="min-w-0">{children}</div>
  </div>
);

const COLS = ['Name of Place', 'Address Line 1', 'Address Line 2', 'Country', 'State', 'City', 'District', 'Pincode'];

export const AddressTab = ({
  rows,
  states,
  onChange,
  onAdd,
  onRemove,
  /* Shipping is the billing address far more often than not. */
  onCopyBilling = null,
  /* The ledger master reuses this table and has no customers, so the copy is
     a prop rather than the customer wording repeated in a second component. */
  caption = 'Billing and shipping are here by default. Add more places below if you need them.',
}) => (
  <section className="space-y-3">
    <div>
      <h4 className="ui-t-sec">Address</h4>
      <p className="ui-caption mt-0.5">{caption}</p>
    </div>

    <div className="overflow-x-auto">
      <table className="w-full min-w-[60rem] border-collapse text-sm">
        <thead>
          <tr>
            {COLS.map((c) => (
              <th key={c} className="ui-t-label px-2 py-2 text-left">
                {c}
              </th>
            ))}
            <th className="ui-t-label px-2 py-2 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.key ?? i}>
              <td className="px-1 py-1">
                <input
                  value={r.label}
                  onChange={(e) => onChange(i, 'label', e.target.value)}
                  className="ui-input w-40"
                  aria-label={`Name of place, row ${i + 1}`}
                  /* Billing and shipping are the two places every document
                     reaches for by name, so their labels are not editable. */
                  readOnly={r.builtIn}
                />
              </td>
              <td className="px-1 py-1">
                <input value={r.line1} onChange={(e) => onChange(i, 'line1', e.target.value)} className="ui-input w-48" aria-label={`Address line 1, row ${i + 1}`} />
              </td>
              <td className="px-1 py-1">
                <input value={r.line2} onChange={(e) => onChange(i, 'line2', e.target.value)} className="ui-input w-48" aria-label={`Address line 2, row ${i + 1}`} />
              </td>
              <td className="px-1 py-1">
                <div className="w-32">
                  <PopupSelect
                    label={null}
                    ariaLabel={`Country, row ${i + 1}`}
                    title="Select Country"
                    value={r.country}
                    onChange={(v) => onChange(i, 'country', v)}
                    options={[{ value: 'India', label: 'India' }]}
                    placeholder="Country"
                    allowCustom
                  />
                </div>
              </td>
              <td className="px-1 py-1">
                <div className="w-40">
                  <PopupSelect
                    label={null}
                    ariaLabel={`State, row ${i + 1}`}
                    title="Select State"
                    value={r.state}
                    onChange={(v) => onChange(i, 'state', v)}
                    options={states.map((s) => ({ value: s.name, label: s.name, code: s.code }))}
                    placeholder="Select"
                    /* An Indian state decides CGST + SGST against IGST by
                       string match, so a typed "Karntaka" charges the wrong
                       tax silently. Outside India there is no list to pick
                       from and typing is the only way in. */
                    allowCustom={String(r.country || '').trim() !== 'India'}
                  />
                </div>
              </td>
              <td className="px-1 py-1">
                <input value={r.city} onChange={(e) => onChange(i, 'city', e.target.value)} className="ui-input w-32" aria-label={`City, row ${i + 1}`} />
              </td>
              <td className="px-1 py-1">
                <input value={r.district} onChange={(e) => onChange(i, 'district', e.target.value)} className="ui-input w-32" aria-label={`District, row ${i + 1}`} />
              </td>
              <td className="px-1 py-1">
                <input
                  value={r.pincode}
                  onChange={(e) => onChange(i, 'pincode', e.target.value)}
                  className="ui-input ui-mono w-24"
                  maxLength={10}
                  aria-label={`Pincode, row ${i + 1}`}
                />
              </td>
              <td className="px-1 py-1 text-right whitespace-nowrap">
                {onCopyBilling && i === 1 ? (
                  <button
                    type="button"
                    onClick={onCopyBilling}
                    className="ui-btn ui-btn-ghost ui-btn-sm me-1"
                    title="Copy the billing address into this row"
                  >
                    Copy billing
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => onRemove(i)}
                  disabled={r.builtIn}
                  aria-label={`Remove ${r.label || `address ${i + 1}`}`}
                  title={r.builtIn ? 'Billing and shipping cannot be removed' : 'Remove this address'}
                  className="ui-icon-btn ui-btn-sm !w-8 disabled:opacity-40"
                >
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>

    {/*
      Below the rows, not above them. The button adds a row to the end of the
      table, so it belongs where that row will appear — put at the top it reads
      as a heading action and you lose sight of what it did.
    */}
    <div>
      <button type="button" onClick={onAdd} className="ui-btn ui-btn-secondary">
        <Plus size={15} aria-hidden="true" /> Add Address
      </button>
    </div>
  </section>
);

export const ContactsTab = ({
  rows,
  onChange,
  onAdd,
  onRemove,
  onSetPrimary = null,
  heading = 'Contacts',
  caption = 'The people at this customer. The one marked primary is who a reminder is addressed to.',
}) => (
  <section className="space-y-3">
    <div>
      <h4 className="ui-t-sec">{heading}</h4>
      <p className="ui-caption mt-0.5">{caption}</p>
    </div>

    {/*
      A row is already there to type into. An empty state with an Add button is
      one click before anybody can start, and the commonest case by far is a
      customer with exactly one contact.
    */}
    <div className="overflow-x-auto">
        <table className="w-full min-w-[42rem] border-collapse text-sm">
          <thead>
            <tr>
              {onSetPrimary ? <th className="ui-t-label px-2 py-2 text-left">Primary</th> : null}
              {['Name', 'Position', 'Email', 'Mobile'].map((c) => (
                <th key={c} className="ui-t-label px-2 py-2 text-left">
                  {c}
                </th>
              ))}
              <th className="ui-t-label px-2 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {/*
                  Which of them a reminder is addressed to. Both masters ask for
                  it, and without it the first row typed was the one every
                  message went to — so adding an accounts clerk above the person
                  you actually deal with quietly redirected the correspondence.
                */}
                {onSetPrimary ? (
                  <td className="px-1 py-1">
                    <input
                      type="radio"
                      name="party-primary-contact"
                      className="ui-radio"
                      checked={Boolean(r.isPrimary) || (!rows.some((c) => c?.isPrimary) && i === 0)}
                      onChange={() => onSetPrimary(i)}
                      aria-label={`Primary contact, row ${i + 1}`}
                    />
                  </td>
                ) : null}
                <td className="px-1 py-1">
                  <input value={r.name} onChange={(e) => onChange(i, 'name', e.target.value)} className="ui-input w-44" aria-label={`Contact name, row ${i + 1}`} />
                </td>
                <td className="px-1 py-1">
                  <input value={r.position} onChange={(e) => onChange(i, 'position', e.target.value)} className="ui-input w-36" aria-label={`Position, row ${i + 1}`} />
                </td>
                <td className="px-1 py-1">
                  <input type="email" value={r.email} onChange={(e) => onChange(i, 'email', e.target.value)} className="ui-input w-52" aria-label={`Email, row ${i + 1}`} />
                </td>
                <td className="px-1 py-1">
                  <input value={r.mobile} onChange={(e) => onChange(i, 'mobile', e.target.value)} className="ui-input ui-mono w-36" aria-label={`Mobile, row ${i + 1}`} />
                </td>
                <td className="px-1 py-1 text-right">
                  <button type="button" onClick={() => onRemove(i)} aria-label={`Remove contact ${i + 1}`} className="ui-icon-btn ui-btn-sm !w-8">
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
    </div>

    <div>
      <button type="button" onClick={onAdd} className="ui-btn ui-btn-secondary">
        <Plus size={15} aria-hidden="true" /> Add Contact
      </button>
    </div>
  </section>
);
