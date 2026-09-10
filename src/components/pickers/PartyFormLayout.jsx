import { Search } from 'lucide-react';

import { AddressTab, ContactsTab, CURRENCY_OPTIONS, FormRow } from './customerFormParts';
import { DocFormActions } from '../DocumentForm';
import PopupSelect from './PopupSelect';

/**
 * The party master, laid out once and used by both customers and vendors.
 *
 * The vendor specification asks for "the Customer Creation form's counterpart —
 * reuse the same UI and interaction pattern; change only the fields and
 * behaviours that are genuinely vendor-specific". Written as two forms that is
 * three hundred lines duplicated and two places to fix every future change, so
 * it is written once and told which party it is describing.
 *
 * What is genuinely different is small and lives in `cfg`: the noun, which
 * group root the party rolls up to, whether an opening balance normally sits Dr
 * or Cr, whether the price list is a sales or a purchase one, and whether the
 * statutory tab carries a TDS configuration. Everything else — the tabs, the
 * address table, the contacts, the GSTIN fetch, the header — is the same by
 * construction rather than by having been kept in step.
 *
 * State, validation and saving stay with the caller. A customer writes to
 * `db.customers` and a debtor ledger, a vendor to `db.vendors` and a creditor
 * ledger; those are genuinely different and are not the layout's business.
 */
export function PartyFormLayout({
  cfg,
  formData,
  setFormData,
  isEdit,
  subtitle = '',
  onClose,
  resetForm,
  saveAndNewRef,
  tab,
  setTab,
  tabs,
  groupOptions,
  onCreateGroup,
  codesEnabled,
  priceListOptions = [],
  onDuplicate = null,
  gstinFetching,
  fetchFromGstin,
  addressRows,
  onCopyBilling = null,
  updateAddressRow,
  addAddressRow,
  removeAddressRow,
  updateContactRow,
  addContactRow,
  removeContactRow,
  setPrimaryContact,
}) {
  return (
    <>
        <DocFormActions
          sticky
          title={isEdit ? `Edit ${cfg.noun}` : `New ${cfg.noun}`}
          subtitle={subtitle}
          onBack={onClose}
          backLabel="Back"
          secondaryLabel="Cancel"
          onSecondary={onClose}
          primaryLabel={isEdit ? 'Save changes' : 'Save'}
          primaryType="submit"
          menu={[
            {
              key: 'saveAndNew',
              label: 'Save and add another',
              submit: true,
              /*
                A ref, not state: the menu item submits the form in the same
                click, and a state update would not have landed by the time the
                submit handler reads it.
              */
              onSelect: () => {
                saveAndNewRef.current = true;
              },
            },
            {
              key: 'toggleActive',
              label: formData.isActive === false ? 'Mark active' : 'Mark inactive',
              onSelect: () => setFormData((p) => ({ ...p, isActive: !(p.isActive !== false) })),
            },
            ...(onDuplicate
              ? [{ key: 'duplicate', label: `Duplicate this ${cfg.noun.toLowerCase()}`, onSelect: onDuplicate }]
              : []),
            { key: 'clear', label: 'Clear the form', onSelect: resetForm },
          ]}
        />

        <div className="space-y-4">
          <h3 className="ui-t-sec">Basic Details</h3>

          <FormRow label="GST Registration Type" hint="Decides whether a GSTIN is required, and whether input credit can be claimed on what you buy from them.">
            <div className="flex items-center gap-6 pt-1.5">
              {[
                { v: 'Registered', l: 'Registered' },
                { v: 'Unregistered', l: 'Unregistered' },
              ].map((o) => (
                <label key={o.v} className="inline-flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="gstRegistration"
                    className="ui-radio"
                    checked={formData.gstRegistration === o.v}
                    onChange={() => setFormData((p) => ({ ...p, gstRegistration: o.v }))}
                  />
                  {o.l}
                </label>
              ))}
            </div>
          </FormRow>

          {formData.gstRegistration === 'Registered' ? (
            <FormRow label="GSTIN" hint="The first two digits are the state code and characters 3–12 are the PAN, so both are filled from the number.">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={formData.gstin}
                  onChange={(e) => setFormData((p) => ({ ...p, gstin: e.target.value.toUpperCase() }))}
                  className="ui-input min-w-0 flex-1"
                  placeholder="Enter 15 digit GSTIN"
                  maxLength={15}
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={fetchFromGstin}
                  disabled={gstinFetching}
                  className="ui-btn ui-btn-secondary shrink-0"
                  style={{ borderColor: 'rgb(var(--brand))', color: 'rgb(var(--brand))' }}
                >
                  <Search size={14} aria-hidden="true" />
                  {gstinFetching ? 'Fetching…' : 'Fetch from GSTN'}
                </button>
              </div>
            </FormRow>
          ) : null}

          <FormRow label={`${cfg.noun} Name`} required htmlFor="party-name" hint={cfg.nameHint}>
            <input
              id="party-name"
              type="text"
              value={formData.displayName}
              onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
              className="ui-input w-full"
              placeholder={`Enter ${cfg.noun.toLowerCase()} name`}
              required
            />
          </FormRow>

          <FormRow label={`${cfg.noun} Group`} hint={cfg.groupHint}>
            <PopupSelect
              label={null}
              value={String(formData.groupId || '').trim()}
              onChange={(val) => setFormData((p) => ({ ...p, groupId: String(val || '').trim() }))}
              options={groupOptions}
              placeholder={`Select ${cfg.noun.toLowerCase()} group`}
              title={`Select ${cfg.noun} Group`}
              showValueSubtext={false}
              allowCustom
              customActionText="Create new Group"
              onCustomAction={(typed) => onCreateGroup(String(typed || '').trim())}
            />
          </FormRow>

          <FormRow label="Currency" hint={cfg.currencyHint}>
            <PopupSelect
              label={null}
              title="Select Currency"
              value={formData.currency}
              onChange={(v) => setFormData((p) => ({ ...p, currency: v }))}
              options={CURRENCY_OPTIONS}
              placeholder="Select currency"
            />
          </FormRow>

          <FormRow label="Opening Balance" htmlFor="party-opening-balance" hint={cfg.openingBalanceHint}>
            <input
              id="party-opening-balance"
              type="number"
              step="0.01"
              value={formData.openingBalance}
              onChange={(e) => setFormData((p) => ({ ...p, openingBalance: e.target.value }))}
              className="ui-input ui-money w-full"
              placeholder="0.00"
            />
          </FormRow>

          <FormRow label="Opening Balance Type" hint={cfg.openingHint}>
            <div className="flex items-center gap-6 pt-1.5">
              {[
                { v: 'Dr', l: cfg.defaultBalanceType === 'Dr' ? 'Dr (Default)' : 'Dr' },
                { v: 'Cr', l: cfg.defaultBalanceType === 'Cr' ? 'Cr (Default)' : 'Cr' },
              ].map((o) => (
                <label key={o.v} className="inline-flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="openingBalanceType"
                    className="ui-radio"
                    checked={formData.openingBalanceType === o.v}
                    onChange={() => setFormData((p) => ({ ...p, openingBalanceType: o.v }))}
                  />
                  {o.l}
                </label>
              ))}
            </div>
          </FormRow>
        </div>

        <div className="ui-tabs mt-6" role="tablist" aria-label={`${cfg.noun} details`}>
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`ui-tab ${tab === t.key ? 'is-active' : ''}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 pt-5">
          {tab === 'address' ? (
            <AddressTab
              rows={addressRows}
              states={cfg.states}
              onChange={updateAddressRow}
              onAdd={addAddressRow}
              onRemove={removeAddressRow}
              onCopyBilling={onCopyBilling}
            />
          ) : null}

          {tab === 'contacts' ? (
            <ContactsTab
              rows={formData.contacts}
              onChange={updateContactRow}
              onAdd={addContactRow}
              onRemove={removeContactRow}
              onSetPrimary={setPrimaryContact}
            />
          ) : null}

          {tab === 'credit' ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className="ui-label" htmlFor="cust-credit-period">Credit Period (days)</label>
                <input
                  id="cust-credit-period"
                  type="number"
                  min="0"
                  value={formData.paymentTermDays}
                  onChange={(e) => setFormData({ ...formData, paymentTermDays: e.target.value })}
                  className="ui-input w-full"
                  placeholder="30"
                />
                <p className="ui-caption mt-1">Sets the due date on every invoice raised for them.</p>
              </div>
              <div>
                <label className="ui-label" htmlFor="cust-credit-limit">Credit Limit</label>
                <input
                  id="cust-credit-limit"
                  type="number"
                  min="0"
                  value={formData.creditLimit}
                  onChange={(e) => setFormData({ ...formData, creditLimit: e.target.value })}
                  className="ui-input ui-money w-full"
                  placeholder="0.00"
                />
              </div>
              <div>
                {/*
                  A list, not a typed name. The rate engine looks a price list
                  up by id, so a box somebody typed "Standard" into pointed at
                  nothing and the party was quietly on default rates. Only
                  lists in force are offered — a retired one cannot price
                  anything, so the master should not name it.
                */}
                <label className="ui-label" htmlFor="cust-price-list">{cfg.priceListLabel}</label>
                <select
                  id="cust-price-list"
                  value={String(formData.priceListId ?? '')}
                  onChange={(e) => setFormData({ ...formData, priceListId: e.target.value })}
                  className="ui-select w-full"
                  disabled={priceListOptions.length === 0}
                >
                  <option value="">— none —</option>
                  {priceListOptions.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <p className="ui-caption mt-1">
                  {priceListOptions.length === 0
                    ? 'No price list is in force. Add one under Master Data → Price Lists and it appears here.'
                    : `Rates come from this list before the item's own ${cfg.kind === 'VENDOR' ? 'purchase' : 'sale'} price.`}
                </p>
              </div>
            </div>
          ) : null}

          {tab === 'statutory' ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {/*
                The same value as Basic Details, editable here too — which is
                what the master asks for: one GSTIN seen in two places, never
                two GSTINs. Both fields are bound to the one field in state, so
                a correction made on either is the correction everywhere.
              */}
              <div>
                <label className="ui-label" htmlFor="cust-stat-gstin">GSTIN</label>
                <input
                  id="cust-stat-gstin"
                  type="text"
                  value={formData.gstin || ''}
                  onChange={(e) => setFormData((p) => ({ ...p, gstin: e.target.value.toUpperCase() }))}
                  className="ui-input ui-mono w-full"
                  placeholder="Enter 15 digit GSTIN"
                  maxLength={15}
                />
                <p className="ui-caption mt-1">The same number as Basic Details — editing either changes both.</p>
              </div>
              <div>
                <label className="ui-label" htmlFor="cust-pan">PAN</label>
                <input
                  id="cust-pan"
                  type="text"
                  value={formData.pan}
                  onChange={(e) => setFormData({ ...formData, pan: e.target.value.toUpperCase() })}
                  className="ui-input ui-mono w-full"
                  placeholder="ABCDE1234F"
                  maxLength={10}
                />
              </div>
              <div>
                <label className="ui-label" htmlFor="cust-gst-treatment">GST Registration / Treatment</label>
                <input
                  id="cust-gst-treatment"
                  type="text"
                  value={formData.gstRegistration || 'Unregistered'}
                  readOnly
                  className="ui-input w-full ui-sunken"
                />
                <p className="ui-caption mt-1">Chosen under Basic Details.</p>
              </div>
              {cfg.showTdsConfig ? (
                <div>
                  <label className="ui-label" htmlFor="party-tds">TDS Configuration</label>
                  <select
                    id="party-tds"
                    value={formData.tdsSection || ''}
                    onChange={(e) => setFormData((p) => ({ ...p, tdsSection: e.target.value }))}
                    className="ui-select w-full"
                  >
                    <option value="">— not deducted —</option>
                    {(cfg.tdsSections || []).map((t) => (
                      <option key={t.code} value={t.code}>{t.code} — {t.label}</option>
                    ))}
                  </select>
                  {/*
                    Which section this party's bills fall under. The rate,
                    threshold and whether anything is due at all come from the
                    TDS engine — the master says what kind of payee this is, not
                    what the deduction will be.
                  */}
                  <p className="ui-caption mt-1">The rate and threshold come from the section master; the TDS engine decides what is deducted.</p>
                </div>
              ) : null}
              <div>
                <label className="ui-label" htmlFor="cust-msme">MSME / Udyam</label>
                <input
                  id="cust-msme"
                  type="text"
                  value={formData.msmeNumber}
                  onChange={(e) => setFormData({ ...formData, msmeNumber: e.target.value })}
                  className="ui-input w-full"
                  placeholder="UDYAM-XX-00-0000000"
                />
                <p className="ui-caption mt-1">A registered micro or small supplier must be paid within 45 days.</p>
              </div>
              <div>
                <label className="ui-label" htmlFor="cust-stat-other">Others</label>
                <input
                  id="cust-stat-other"
                  type="text"
                  value={formData.statutoryOther}
                  onChange={(e) => setFormData({ ...formData, statutoryOther: e.target.value })}
                  className="ui-input w-full"
                  placeholder="IEC, LUT, licence number…"
                />
              </div>
            </div>
          ) : null}

          {tab === 'others' ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {/*
                Only where the business uses codes. Off, the field is not asked
                for and the server allots nothing — a code nobody uses is still
                a column somebody has to explain.
              */}
              {codesEnabled ? (
              <div>
                <label className="ui-label" htmlFor="cust-code">{cfg.noun} Code</label>
                <input
                  id="cust-code"
                  type="text"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  className="ui-input ui-mono w-full"
                  placeholder="Generated on save"
                />
                <p className="ui-caption mt-1">Left blank, a code is allotted in the format set under Settings.</p>
              </div>
              ) : null}
              {/*
                Active rather than delete. A party with transactions against it
                cannot be removed without orphaning the history, so the master
                carries a state instead — which is what both specs ask for.
              */}
              <div>
                <span className="ui-label block">Status</span>
                <label className="mt-1 inline-flex cursor-pointer items-center gap-2.5 text-sm">
                  <input
                    type="checkbox"
                    className="ui-checkbox"
                    checked={formData.isActive !== false}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  />
                  Active
                </label>
                <p className="ui-caption mt-1">Inactive keeps every past transaction and stops the {cfg.noun.toLowerCase()} appearing on new documents.</p>
              </div>
            </div>
          ) : null}
        </div>

    </>
  );
}

export default PartyFormLayout;
