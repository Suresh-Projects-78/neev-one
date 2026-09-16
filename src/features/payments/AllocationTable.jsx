import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';

import { allocationSummary, emptyAllocationRow } from './allocationLines';

/**
 * Where the money goes, line by line.
 *
 * The same table on a payment and on a receipt — only the heading and the
 * direction of the sentence underneath it change — because they are the same
 * accounting act seen from either side: one line against the bank, several
 * against everything else.
 *
 * What it deliberately does not do is hide the arithmetic. The figure still to
 * be placed is printed at the foot in the colour of a problem while it is not
 * zero, because the alternative is a save button that refuses with a toast and
 * a person hunting for the fifty rupees.
 */
export const AllocationTable = ({
  rows,
  onChange,
  ledgerOptions,
  amount,
  documentTotal = 0,
  documentLabel = '',
  heading = 'Payment allocation',
  noun = 'payment',
  money,
  disabled = false,
  /*
   * The party's own line, when there is a party.
   *
   * Presentational: it is not one of `rows` and never reaches the journal,
   * because settling invoices already credits the customer through the
   * document side. It is here so the one allocation a receipt usually makes
   * appears in the list of allocations rather than only as a total under it —
   * and so the link that opens the bills has an obvious place to live.
   */
  partyRow = null,
}) => {
  const summary = allocationSummary({ rows, documentTotal, amount });
  const set = (i, patch) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  /*
   * A row arriving or leaving, with a bridge.
   *
   * Both used to happen in a single frame, so the rows below a deleted one
   * jumped up under the cursor — the jarring change motion exists to prevent.
   * `leaving` holds the row on screen while its cells collapse; `entering`
   * fades the new one in. Both are indices, because the rows have no id of
   * their own and the caller owns the array.
   */
  const [leaving, setLeaving] = useState(null);
  const [entering, setEntering] = useState(null);

  const add = () => {
    setEntering(rows.length);
    onChange([...rows, emptyAllocationRow()]);
    setTimeout(() => setEntering(null), 200);
  };

  const remove = (i) => {
    if (leaving !== null) return;
    setLeaving(i);
    setTimeout(() => {
      setLeaving(null);
      onChange(rows.length > 1 ? rows.filter((_, j) => j !== i) : [emptyAllocationRow()]);
    }, 140);
  };

  return (
    <section>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h3 className="ui-t-sec">{heading}</h3>
          <p className="ui-caption mt-0.5">
            Add ledger(s) to allocate the {noun} amount.
            {partyRow ? ' Open the outstanding bills to allocate against invoices.' : ''}
          </p>
        </div>
      </div>

      <div className="border ui-border-c rounded-xl overflow-hidden">
        <table className="ui-table w-full">
          <thead className="ui-sunken">
            <tr>
              <th className="ui-th w-12">#</th>
              <th className="ui-th">Ledger <span className="text-[rgb(var(--neg))]">*</span></th>
              <th className="ui-th ui-num">Amount <span className="text-[rgb(var(--neg))]">*</span></th>
              <th className="ui-th w-16 text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {partyRow ? (
              <tr data-party-row="true">
                <td className="px-3 py-2 ui-muted text-sm">1</td>
                <td className="px-3 py-2">
                  {/* The party is not chosen here — it is the party the receipt
                      is from — so this states it rather than offering a list
                      that could contradict the head of the document. */}
                  <div className="text-sm font-medium truncate">{partyRow.name}</div>
                  <div className="ui-caption">{partyRow.groupName || 'Sundry Debtors'}</div>
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end gap-4">
                    <button
                      type="button"
                      onClick={partyRow.onViewBills}
                      className="text-sm font-medium underline underline-offset-2 flex-none"
                      style={{ color: 'rgb(var(--brand-ink))' }}
                    >
                      View Bills{partyRow.available > 0 ? ` (${partyRow.available})` : ''}
                    </button>
                    {/* Read-only: the figure is the sum of what was ticked in
                        the dialog, and a box you can type into that the next
                        Apply overwrites is a lie. */}
                    <span className="ui-money tabular-nums w-36 text-right">{money(partyRow.amount)}</span>
                  </div>
                </td>
                <td className="px-2 py-2 text-center">
                  {partyRow.count > 0 && !disabled ? (
                    <button
                      type="button"
                      onClick={partyRow.onClear}
                      className="ui-icon-btn"
                      aria-label="Clear the invoice allocation"
                    >
                      <Trash2 size={15} className="text-[rgb(var(--neg))]" aria-hidden="true" />
                    </button>
                  ) : null}
                </td>
              </tr>
            ) : null}

            {rows.map((row, i) => (
              <tr
                key={i}
                data-leaving={leaving === i ? 'true' : undefined}
                data-entering={entering === i ? 'true' : undefined}
              >
                <td className="px-3 py-2 ui-muted text-sm">
                  <div className="ui-row-slot"><div>{i + (partyRow ? 2 : 1)}</div></div>
                </td>
                <td className="px-3 py-2">
                  <div className="ui-row-slot"><div>
                  <select
                    value={row.ledgerId || ''}
                    onChange={(e) => set(i, { ledgerId: e.target.value })}
                    className="ui-select w-full"
                    aria-label={`Account, allocation row ${i + 1}`}
                    disabled={disabled}
                  >
                    <option value="">Select ledger</option>
                    {ledgerOptions.map((o) => (
                      <option key={o.id} value={String(o.id)}>{o.name}</option>
                    ))}
                  </select>
                  </div></div>
                </td>
                <td className="px-3 py-2">
                  <div className="ui-row-slot"><div>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={row.amount ?? ''}
                    onChange={(e) => set(i, { amount: e.target.value })}
                    className="ui-input ui-input-plain ui-mono w-36 ms-auto text-right block"
                    placeholder="0.00"
                    aria-label={`Amount, allocation row ${i + 1}`}
                    disabled={disabled}
                  />
                  </div></div>
                </td>
                <td className="px-2 py-2 text-center">
                  {!disabled ? (
                    <button
                      type="button"
                      onClick={() => remove(i)}
                      className="ui-icon-btn"
                      aria-label={`Remove allocation row ${i + 1}`}
                    >
                      <Trash2 size={15} className="text-[rgb(var(--neg))]" aria-hidden="true" />
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="ui-sunken border-t px-3 py-2 text-sm flex flex-wrap items-center justify-end gap-x-6 gap-y-1">
          {/* The document side, named, so it is obvious the bills are inside
              this total and not a second one competing with it. */}
          {summary.documentTotal > 0 ? (
            <span className="ui-muted">
              {documentLabel || 'Documents'} <span className="ui-money ms-1">{money(summary.documentTotal)}</span>
            </span>
          ) : null}
          <span className="ui-muted">
            Total allocated <span className="ui-money ms-1">{money(summary.allocated)}</span>
          </span>
          {/* The one figure on this form the user is steering toward, so the
              arrival at zero is worth seeing rather than blinking into place. */}
          <span
            style={{
              color: summary.balanced ? 'rgb(var(--pos))' : 'rgb(var(--neg))',
              transition: 'color var(--dur-surface) var(--ease-out)',
            }}
          >
            {summary.balanced ? 'Fully allocated' : 'Unallocated'}
            {summary.balanced ? null : <span className="ui-money ms-1">{money(summary.unallocated)}</span>}
          </span>
        </div>
      </div>

      {/* Under the rows it adds to, where the next row will appear — it was
          up in the heading, as far from the thing it does as the section is
          tall. */}
      {!disabled ? (
        <button type="button" onClick={add} className="ui-btn ui-btn-secondary ui-btn-sm mt-3">
          <Plus size={15} aria-hidden="true" /> Add Row
        </button>
      ) : null}

      <p className="ui-caption mt-1.5">
        One {noun} is one line against the bank and as many lines as it needs against everything else. The
        allocation has to come to the {noun} before it can be recorded.
      </p>
    </section>
  );
};

export default AllocationTable;
