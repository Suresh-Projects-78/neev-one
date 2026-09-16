import React, { useMemo, useState } from 'react';

import Modal from '../../components/ui/Modal';

/**
 * Which bills this money is settling — asked for, not always on show.
 *
 * The outstanding invoices used to be a permanent table halfway down the
 * receipt, between the allocation and the notes. It was the largest thing on
 * the screen, it was empty until a party had been picked, and it said "select
 * party name to see outstanding invoices" for the whole of every receipt that
 * was not against an invoice at all — a bank charge, an advance, interest.
 *
 * So it is a dialog now, opened from the allocation row it fills in. The
 * receipt stays about the ledger and the amount; settling invoices is a thing
 * you can go and do.
 *
 * Nothing is committed until Apply: the ticks and the figures live here, and
 * the caller is handed the finished allocation in one piece. Cancel therefore
 * means cancel, rather than "stop editing something already applied".
 */
export const OutstandingBillsModal = ({
  partyName = '',
  noun = 'invoice',
  bills = [],
  /** `{ [billId]: { selected, amount } }` as the caller currently holds it. */
  value = {},
  onApply,
  onClose,
  money,
  /** What is left of the receipt to place — the ceiling for "settle in full". */
  available = 0,
}) => {
  const [draft, setDraft] = useState(() => {
    const out = {};
    for (const [k, v] of Object.entries(value || {})) {
      if (!v) continue;
      out[String(k)] = { selected: Boolean(v.selected), amount: v.amount ?? '' };
    }
    return out;
  });

  const set = (id, patch) =>
    setDraft((p) => ({ ...p, [String(id)]: { ...(p[String(id)] || {}), ...patch } }));

  /*
   * Ticking a bill fills its allocation in, because the overwhelmingly common
   * case is settling it in full — and typing the figure that is already on the
   * row is work the screen can do. It is capped at what is left of the receipt
   * so ticking four bills against a part payment cannot silently over-allocate.
   */
  const toggle = (bill, selected) => {
    if (!selected) {
      set(bill.id, { selected: false, amount: '' });
      return;
    }
    const placedElsewhere = Object.entries(draft)
      .filter(([k]) => String(k) !== String(bill.id))
      .reduce((t, [, v]) => t + (v?.selected ? Number(v.amount) || 0 : 0), 0);
    const room = Math.max(0, Number(available || 0) - placedElsewhere);
    const fill = room > 0 ? Math.min(bill.outstanding, room) : bill.outstanding;
    set(bill.id, { selected: true, amount: String(Math.round(fill * 100) / 100) });
  };

  const summary = useMemo(() => {
    let count = 0;
    let total = 0;
    for (const bill of bills) {
      const row = draft[String(bill.id)];
      if (!row?.selected) continue;
      const amt = Number(row.amount) || 0;
      if (amt <= 0) continue;
      count += 1;
      total += Math.min(bill.outstanding, amt);
    }
    return { count, total: Math.round(total * 100) / 100 };
  }, [draft, bills]);

  /* Over-allocating a single bill is the one thing that cannot be posted, so
     it is named on the row rather than refused at Apply. */
  const overRows = bills.filter((b) => {
    const row = draft[String(b.id)];
    return row?.selected && Number(row.amount) > b.outstanding + 0.004;
  });

  const apply = () => {
    const out = {};
    for (const bill of bills) {
      const row = draft[String(bill.id)];
      if (!row?.selected) continue;
      const amt = Number(row.amount) || 0;
      if (amt <= 0) continue;
      out[String(bill.id)] = { selected: true, amount: Math.round(Math.min(bill.outstanding, amt) * 100) / 100 };
    }
    onApply(out, summary.total);
  };

  return (
    <Modal onClose={onClose} title="Allocate Outstanding Bills" maxWidthClass="max-w-5xl">
      <div className="space-y-4">
        {partyName ? (
          <div>
            <span className="ui-t-label block mb-0.5">Party</span>
            <span className="text-sm font-medium">{partyName}</span>
          </div>
        ) : null}

        <div className="border ui-border-c rounded-xl overflow-hidden">
          <div className="max-h-[52vh] overflow-y-auto">
            <table className="ui-table w-full">
              <thead className="ui-sunken">
                <tr>
                  <th className="ui-th w-12">Select</th>
                  <th className="ui-th">{noun === 'bill' ? 'Bill No.' : 'Inv No.'}</th>
                  <th className="ui-th">{noun === 'bill' ? 'Bill Date' : 'Inv Date'}</th>
                  <th className="ui-th ui-num">{noun === 'bill' ? 'Bill Amount' : 'Inv Amount'}</th>
                  <th className="ui-th ui-num">TDS</th>
                  <th className="ui-th ui-num">Outstanding</th>
                  <th className="ui-th ui-num w-40">Allocation</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {!bills.length ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-10 text-center ui-muted">
                      Nothing outstanding for this party. The receipt will be recorded as an advance.
                    </td>
                  </tr>
                ) : (
                  bills.map((bill) => {
                    const row = draft[String(bill.id)] || {};
                    const selected = Boolean(row.selected);
                    const over = selected && Number(row.amount) > bill.outstanding + 0.004;
                    return (
                      <tr key={bill.id} className="ui-hover-sunken" data-selected={selected ? 'true' : undefined}>
                        <td className="px-4 py-2.5">
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={(e) => toggle(bill, e.target.checked)}
                            aria-label={`Allocate against ${bill.number || bill.id}`}
                          />
                        </td>
                        <td className="ui-col-meta px-4 py-2.5">{bill.number || '—'}</td>
                        <td className="ui-col-date px-4 py-2.5">{bill.date || '—'}</td>
                        <td className="ui-col-amount px-4 py-2.5 text-right">{money(bill.total)}</td>
                        <td className="ui-col-amount px-4 py-2.5 text-right">
                          {bill.tdsExpected > 0 ? money(bill.tdsExpected) : <span className="ui-muted">—</span>}
                        </td>
                        <td className="ui-col-amount px-4 py-2.5 text-right">{money(bill.outstanding)}</td>
                        <td className="px-4 py-2.5 text-right">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={row.amount ?? ''}
                            onChange={(e) => set(bill.id, { selected: true, amount: e.target.value })}
                            className="ui-input ui-mono w-32 text-right"
                            placeholder="0.00"
                            aria-label={`Allocation against ${bill.number || bill.id}`}
                            aria-invalid={over ? 'true' : undefined}
                            style={over ? { borderColor: 'rgb(var(--neg))' } : undefined}
                          />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {overRows.length ? (
          <p className="text-sm" style={{ color: 'rgb(var(--neg))' }} role="alert">
            {overRows.length === 1
              ? `${overRows[0].number || 'One bill'} is allocated more than it is owed.`
              : `${overRows.length} bills are allocated more than they are owed.`}{' '}
            Applying will settle each one in full and no further.
          </p>
        ) : null}

        <div
          className="flex flex-wrap items-center justify-between gap-3 pt-3"
          style={{ borderTop: '1px solid rgb(var(--border))' }}
        >
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
            <span className="ui-muted">
              Selected <span className="ui-mono ms-1">{summary.count}</span>
            </span>
            <span className="ui-muted">
              Total allocation <span className="ui-money ms-1">{money(summary.total)}</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="ui-btn ui-btn-secondary">
              Cancel
            </button>
            <button type="button" onClick={apply} className="ui-btn ui-btn-primary">
              Apply Allocation
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default OutstandingBillsModal;
