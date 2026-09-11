import { Info, Search } from 'lucide-react';

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
/*
 * Which grid row each field of the left column takes.
 *
 * The GSTIN row only exists for a registered party — and a vendor opens
 * unregistered — so the rows below it move up by one when it is absent. Written
 * as whole class names rather than built from a number, because Tailwind reads
 * the source for the classes it keeps and never sees one that is concatenated.
 */
const LEFT_ROWS = {
  withGstin: { name: 'lg:col-start-1 lg:row-start-3', opening: 'lg:col-start-1 lg:row-start-4', type: 'lg:col-start-1 lg:row-start-5' },
  withoutGstin: { name: 'lg:col-start-1 lg:row-start-2', opening: 'lg:col-start-1 lg:row-start-3', type: 'lg:col-start-1 lg:row-start-4' },
};

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
  sameAsBilling = false,
  onSameAsBilling = null,
  updateAddressRow,
  addAddressRow,
  removeAddressRow,
  updateContactRow,
  addContactRow,
  removeContactRow,
  setPrimaryContact,
}) {
  const rows = formData.gstRegistration === 'Registered' ? LEFT_ROWS.withGstin : LEFT_ROWS.withoutGstin;

  return (
    <div className="space-y-6">
        <DocFormActions
          ownCard
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

        <section className="ui-card p-5 sm:p-6">
          <h3 className="ui-t-sec">Basic Details</h3>
          <p className="ui-caption mt-0.5">Enter the primary information about your {cfg.noun.toLowerCase()}.</p>

          {/*
            Two columns, and they are not the same shape.

            The left is the identity — who they are and what they owe you on day
            one — and reads as a labelled form, label beside field. The right is
            three settings that each have one obvious answer, so they read as
            controls with their names above them. One column of eight rows made
            the card twice as tall as the tabs below it and left half the width
            empty.
          */}
          {/*
            One grid, both halves on the same rows.

            Each side stacking on its own rhythm looked right until measured:
            the GST row is a pair of radios and shorter than a field row, so
            the two columns drifted eight to seventeen pixels apart down the
            card. Placed on shared rows, a row is as tall as the taller of its
            two cells and the sides cannot drift at all.
          */}
          <div className="mt-5 grid gap-x-14 gap-y-4 lg:grid-cols-2">

          <FormRow className="lg:col-start-1 lg:row-start-1" label="GST Registration Type" hint="Decides whether a GSTIN is required, and whether input credit can be claimed on what you buy from them.">
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
            <FormRow className="lg:col-start-1 lg:row-start-2" label="GSTIN" hint="The first two digits are the state code and characters 3–12 are the PAN, so both are filled from the number.">
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
                  {gstinFetching ? 'Fetching…' : 'Fetch from GSTIN'}
                </button>
              </div>
            </FormRow>
          ) : null}

          <FormRow className={rows.name} label={`${cfg.noun} Name`} required htmlFor="party-name" hint={cfg.nameHint}>
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

          <FormRow className={rows.opening} label="Opening Balance" htmlFor="party-opening-balance" hint={cfg.openingBalanceHint}>
            {/* The symbol sits in the field rather than in the label: a column
                of money the eye reads as money before it reads the number. */}
            <div className="relative">
              <span className="ui-subtle pointer-events-none absolute inset-y-0 start-3 flex items-center text-sm">₹</span>
              <input
                id="party-opening-balance"
                type="number"
                step="0.01"
                value={formData.openingBalance}
                onChange={(e) => setFormData((p) => ({ ...p, openingBalance: e.target.value }))}
                className="ui-input ui-money w-full ps-7"
                placeholder="0.00"
              />
            </div>
          </FormRow>

          <FormRow className={rows.type} label="Balance Type" hint={cfg.openingHint}>
            {/* Under the balance it qualifies. On the other side of the card
                it was three columns away from the number it describes. */}
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

            {/*
              Both halves are the same shape: a name, then its control, on the
              grid's own rows. Stacked with its label above, this side read as a
              different kind of form from the one beside it, and took two rows
              to say what the other said in one.
            */}
              <FormRow className="lg:col-start-2 lg:row-start-1" label={`${cfg.noun} Group`} hint={cfg.groupHint}>
                <PopupSelect
                  label={null}
                  ariaLabel={`${cfg.noun} Group`}
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

              <FormRow className="lg:col-start-2 lg:row-start-2" label="Currency" hint={cfg.currencyHint}>
                <PopupSelect
                  label={null}
                  ariaLabel="Currency"
                  title="Select Currency"
                  value={formData.currency}
                  onChange={(v) => setFormData((p) => ({ ...p, currency: v }))}
                  options={CURRENCY_OPTIONS}
                  placeholder="Select currency"
                />
              </FormRow>
          </div>
        </section>

        <section className="ui-card p-5 sm:p-6">
        <div className="ui-tabs" role="tablist" aria-label={`${cfg.noun} details`}>
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
              sameAsBilling={sameAsBilling}
              onSameAsBilling={onSameAsBilling}
            />
          ) : null}

          {tab === 'contacts' ? (
            <ContactsTab
              /* Whose people these are follows the party, or the vendor form
                 says "the people at this customer". */
              caption={`The people at this ${cfg.noun.toLowerCase()}. The one marked primary is who a reminder is addressed to.`}
              rows={formData.contacts}
              onChange={updateContactRow}
              onAdd={addContactRow}
              onRemove={removeContactRow}
              onSetPrimary={setPrimaryContact}
            />
          ) : null}

          {tab === 'credit' ? (
            <section className="space-y-4">
              <div>
                <h4 className="ui-t-sec">Credit Details</h4>
                <p className="ui-caption mt-0.5">Set credit terms and limits for this {cfg.noun.toLowerCase()}.</p>
              </div>

            {/*
              Two columns that each hold a pair: what the terms are on the left,
              what the ceiling is on the right. The price list ran the width of
              the card and pushed the note switch below the fold of the tab.
            */}
            <div className="grid gap-x-10 gap-y-4 lg:grid-cols-2">
              <div className="space-y-4">
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

              <div className="space-y-4">
                <div>
                  <label className="ui-label" htmlFor="cust-credit-limit">Credit Limit</label>
                  <div className="relative">
                    <span className="ui-subtle pointer-events-none absolute inset-y-0 start-3 flex items-center text-sm">₹</span>
                    <input
                      id="cust-credit-limit"
                      type="number"
                      min="0"
                      value={formData.creditLimit}
                      onChange={(e) => setFormData({ ...formData, creditLimit: e.target.value })}
                      className="ui-input ui-money w-full ps-7"
                      placeholder="0.00"
                    />
                  </div>
                  <p className="ui-caption mt-1">Maximum outstanding amount allowed.</p>
                </div>

                {cfg.noteToggle ? (
                  <div>
                    <span className="ui-label block">{cfg.noteToggle.title}</span>
                    <label className="mt-1.5 inline-flex cursor-pointer items-center gap-2.5 text-sm">
                      <input
                        type="checkbox"
                        className="ui-checkbox"
                        checked={formData.allowCreditNotes !== false}
                        onChange={(e) => setFormData((p) => ({ ...p, allowCreditNotes: e.target.checked }))}
                      />
                      {cfg.noteToggle.label}
                    </label>
                    <p className="ui-caption mt-1">{cfg.noteToggle.help}</p>
                  </div>
                ) : null}
              </div>
            </div>

            </section>
          ) : null}

          {tab === 'statutory' ? (
            <section className="space-y-4">
              <div>
                <h4 className="ui-t-sec">Statutory Details</h4>
                <p className="ui-caption mt-0.5">Tax and regulatory information for this {cfg.noun.toLowerCase()}.</p>
              </div>

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
                <p className="ui-caption mt-1">Permanent Account Number.</p>
              </div>
              <div>
                <label className="ui-label" htmlFor="cust-gst-treatment">GST Registration / Treatment</label>
                {/*
                  A disabled select rather than a live one: it is the choice
                  made under Basic Details, shown here because this is where
                  somebody looks for it. Two live controls on one value is two
                  answers to "is this party registered", and the one that wins
                  is whichever was touched last.
                */}
                <select
                  id="cust-gst-treatment"
                  value={formData.gstRegistration || 'Unregistered'}
                  disabled
                  onChange={() => {}}
                  className="ui-select w-full"
                >
                  <option value="Registered">Registered</option>
                  <option value="Unregistered">Unregistered</option>
                </select>
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
              {/* One column, not the width of the card: a full-width box under
                  two half-width ones reads as a different kind of field. */}
              <div>
                <label className="ui-label inline-flex items-center gap-1.5" htmlFor="cust-stat-other">
                  Others
                  <span
                    title="Anything else this party is registered under — an IEC for exports, a LUT number, a licence."
                    aria-label="Anything else this party is registered under — an IEC for exports, a LUT number, a licence."
                    className="ui-subtle inline-flex cursor-help"
                  >
                    <Info size={13} aria-hidden="true" />
                  </span>
                </label>
                <input
                  id="cust-stat-other"
                  type="text"
                  value={formData.statutoryOther}
                  onChange={(e) => setFormData({ ...formData, statutoryOther: e.target.value })}
                  className="ui-input w-full"
                  placeholder="IEC, LUT, licence number…"
                />
                <p className="ui-caption mt-1">Any additional statutory numbers or notes.</p>
              </div>
            </div>
            </section>
          ) : null}

          {tab === 'others' ? (
            <section className="space-y-4">
              <div>
                <h4 className="ui-t-sec">Others</h4>
                <p className="ui-caption mt-0.5">Additional settings for this {cfg.noun.toLowerCase()}.</p>
              </div>

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

              {/*
                Where a note about this party goes. Without it the only place to
                write "pays on the 10th, never before" was the address line.
              */}
              <div className="sm:col-span-2 lg:col-span-1">
                <label className="ui-label" htmlFor="party-remarks">Remarks</label>
                <textarea
                  id="party-remarks"
                  rows={3}
                  value={formData.notes || ''}
                  onChange={(e) => setFormData((p) => ({ ...p, notes: e.target.value }))}
                  className="ui-input w-full"
                  placeholder="Enter remarks (optional)"
                />
                <p className="ui-caption mt-1">Internal notes about this {cfg.noun.toLowerCase()}.</p>
              </div>
            </div>
            </section>
          ) : null}
        </div>
        </section>
    </div>
  );
}

export default PartyFormLayout;
