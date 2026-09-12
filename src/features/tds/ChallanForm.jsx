import { useMemo, useState } from 'react';
import { Wand2 } from 'lucide-react';

import { notify } from '../../components/ui/notify';
import { formatMoney, round2 } from '../../utils/money';
import { natureByCode } from './ruleMaster';
import { allocationsByEvent, isLive, tdsEvents } from './reports';

/**
 * Recording a challan, and saying which deductions it paid.
 *
 * A challan is the department's receipt: number, BSR code, date, and the
 * amounts on its face. The allocation underneath is the company's own claim —
 * this challan covers THOSE deductions — and it is the link the return, the
 * exceptions list and the reconciliation all read. The two are saved together
 * because a challan nobody has allocated answers no question anybody asks.
 *
 * Only the TAX component pays deductions. Interest and late fee are the cost
 * of being late, not tax deducted from anybody, so the allocation is capped at
 * the tax amount and the extras ride along on the record for the register to
 * total.
 */
const ChallanForm = ({ db, setDb, currentCompany, onClose }) => {
  const companyId = currentCompany?.id;

  const [head, setHead] = useState({
    number: '',
    paymentDate: new Date().toISOString().slice(0, 10),
    bsrCode: '',
    bankName: '',
    taxAmount: '',
    interest: '',
    lateFee: '',
    otherAmount: '',
  });
  const set = (patch) => setHead((prev) => ({ ...prev, ...patch }));

  /* Deductions still owed to the department: posted, payable, and not yet
     fully covered by an earlier challan. Oldest first — that is the order
     the department expects them paid in. */
  const outstanding = useMemo(() => {
    const paid = allocationsByEvent(db, companyId);
    return tdsEvents(db, companyId, { side: 'PAYABLE' })
      .filter(isLive)
      .map((e) => ({ ...e, due: round2(Number(e.tdsAmount || 0) - paid.for(e.id)) }))
      .filter((e) => e.due > 0.005)
      .sort((a, b) => (String(a.transactionDate) < String(b.transactionDate) ? -1 : 1));
  }, [db, companyId]);

  /* Allocation drafts, keyed by event id. Strings, because they are inputs. */
  const [alloc, setAlloc] = useState({});
  const setOne = (id, value) => setAlloc((prev) => ({ ...prev, [id]: value }));

  const tax = round2(Math.abs(Number(head.taxAmount || 0)));
  const allocated = round2(
    outstanding.reduce((t, e) => t + Math.abs(Number(alloc[e.id] || 0)), 0)
  );
  const remaining = round2(tax - allocated);

  /** Oldest-first, each deduction up to its due, until the tax runs out. */
  const autoAllocate = () => {
    if (tax <= 0.005) {
      notify.error('Enter the tax amount first — allocation spends it.');
      return;
    }
    let left = tax;
    const next = {};
    for (const e of outstanding) {
      if (left <= 0.005) break;
      const take = round2(Math.min(e.due, left));
      next[e.id] = String(take);
      left = round2(left - take);
    }
    setAlloc(next);
  };

  const problems = [];
  if (!String(head.number || '').trim()) problems.push('The challan needs its number (CIN).');
  if (!String(head.paymentDate || '').trim()) problems.push('The challan needs its payment date.');
  if (tax <= 0.005) problems.push('The tax amount is what pays the deductions — it cannot be zero.');
  if (allocated > tax + 0.005)
    problems.push('More is allocated than the challan’s tax amount — interest and late fee do not pay deductions.');
  for (const e of outstanding) {
    if (Math.abs(Number(alloc[e.id] || 0)) > e.due + 0.005) {
      problems.push(`${e.partyName || 'A deduction'} is allocated more than it is owed.`);
      break;
    }
  }

  const save = () => {
    if (problems.length) {
      notify.error(problems[0]);
      return;
    }

    setDb((prev) => {
      const challanId = ((prev.tdsChallans || []).reduce((m, c) => Math.max(m, Number(c?.id || 0)), 0) || 0) + 1;
      let allocId = ((prev.tdsChallanAllocations || []).reduce((m, a) => Math.max(m, Number(a?.id || 0)), 0) || 0) + 1;

      const challan = {
        id: challanId,
        companyId,
        number: String(head.number).trim(),
        paymentDate: String(head.paymentDate).slice(0, 10),
        bsrCode: String(head.bsrCode || '').trim(),
        bankName: String(head.bankName || '').trim(),
        taxAmount: tax,
        interest: round2(Math.abs(Number(head.interest || 0))),
        lateFee: round2(Math.abs(Number(head.lateFee || 0))),
        otherAmount: round2(Math.abs(Number(head.otherAmount || 0))),
        createdAt: new Date().toISOString(),
      };

      const links = outstanding
        .map((e) => ({ event: e, amount: round2(Math.abs(Number(alloc[e.id] || 0))) }))
        .filter((l) => l.amount > 0.005)
        .map((l) => ({
          id: allocId++,
          companyId,
          challanId,
          tdsTransactionId: l.event.id,
          amount: l.amount,
          createdAt: challan.createdAt,
        }));

      return {
        ...prev,
        tdsChallans: [...(prev.tdsChallans || []), challan],
        tdsChallanAllocations: [...(prev.tdsChallanAllocations || []), ...links],
      };
    });

    notify.success(allocated > 0.005 ? 'Challan recorded and allocated.' : 'Challan recorded — nothing allocated yet.');
    onClose?.();
  };

  return (
    <div className="space-y-6">
      {/* The receipt's face: what the department was told and paid. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="lg:col-span-2">
          <label className="ui-label" htmlFor="chl-number">Challan No. (CIN)</label>
          <input
            id="chl-number"
            type="text"
            className="ui-input ui-mono w-full"
            value={head.number}
            onChange={(e) => set({ number: e.target.value })}
          />
        </div>
        <div>
          <label className="ui-label" htmlFor="chl-date">Payment date</label>
          <input
            id="chl-date"
            type="date"
            className="ui-input w-full"
            value={head.paymentDate}
            onChange={(e) => set({ paymentDate: e.target.value })}
          />
        </div>
        <div>
          <label className="ui-label" htmlFor="chl-bsr">BSR code</label>
          <input
            id="chl-bsr"
            type="text"
            className="ui-input ui-mono w-full"
            value={head.bsrCode}
            onChange={(e) => set({ bsrCode: e.target.value })}
          />
        </div>
        <div className="lg:col-span-2">
          <label className="ui-label" htmlFor="chl-bank">Bank</label>
          <input
            id="chl-bank"
            type="text"
            className="ui-input w-full"
            value={head.bankName}
            onChange={(e) => set({ bankName: e.target.value })}
          />
        </div>
        {[
          ['taxAmount', 'Tax amount'],
          ['interest', 'Interest'],
          ['lateFee', 'Late fee'],
          ['otherAmount', 'Other'],
        ].map(([key, label]) => (
          <div key={key}>
            <label className="ui-label" htmlFor={`chl-${key}`}>{label}</label>
            <input
              id={`chl-${key}`}
              type="number"
              min="0"
              step="0.01"
              className="ui-input ui-money w-full"
              value={head[key]}
              onChange={(e) => set({ [key]: e.target.value })}
            />
          </div>
        ))}
      </div>

      {/* The claim: which deductions this challan pays. */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="ui-t-label">Allocate against deductions</div>
            <p className="ui-caption">
              {outstanding.length
                ? 'Only the tax amount pays deductions; interest and late fee ride along on the record.'
                : 'Nothing is outstanding — every posted deduction is already covered by a challan.'}
            </p>
          </div>
          {outstanding.length ? (
            <button type="button" onClick={autoAllocate} className="ui-btn ui-btn-secondary ui-btn-sm">
              <Wand2 size={14} aria-hidden="true" /> Auto allocate (oldest first)
            </button>
          ) : null}
        </div>

        {outstanding.length ? (
          <div className="ui-table-scroll max-h-72 overflow-y-auto rounded-lg border">
            <table className="ui-table">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Party</th>
                  <th scope="col">Section</th>
                  <th scope="col">Quarter</th>
                  <th scope="col" className="text-end">Outstanding</th>
                  <th scope="col" className="text-end">Allocate</th>
                </tr>
              </thead>
              <tbody>
                {outstanding.map((e) => (
                  <tr key={e.id}>
                    <td>{e.transactionDate}</td>
                    <td className="truncate">{e.partyName || natureByCode(e.natureCode)?.name || '—'}</td>
                    <td className="ui-mono">{e.sectionReference || e.sectionCode || '—'}</td>
                    <td>{e.returnQuarter || '—'}</td>
                    <td className="ui-money">{formatMoney(e.due, currentCompany)}</td>
                    <td className="text-end">
                      <input
                        type="number"
                        min="0"
                        max={e.due}
                        step="0.01"
                        className="ui-input ui-money !h-8 !min-h-0 w-28 text-sm"
                        aria-label={`Allocate to ${e.partyName || `entry ${e.id}`}`}
                        value={alloc[e.id] ?? ''}
                        onChange={(ev) => setOne(e.id, ev.target.value)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      {/* The three figures, always in view while allocating. */}
      <dl className="grid grid-cols-3 gap-3 border-t pt-3 text-sm">
        <div>
          <dt className="ui-caption">Tax amount</dt>
          <dd className="ui-money">{formatMoney(tax, currentCompany)}</dd>
        </div>
        <div>
          <dt className="ui-caption">Allocated</dt>
          <dd className="ui-money">{formatMoney(allocated, currentCompany)}</dd>
        </div>
        <div>
          <dt className="ui-caption">Remaining</dt>
          <dd className={`ui-money ${remaining < -0.005 ? 'text-[rgb(var(--neg-ink))]' : ''}`}>
            {formatMoney(remaining, currentCompany)}
          </dd>
        </div>
      </dl>

      <div className="flex items-center justify-between gap-2">
        <p className="ui-caption">{problems[0] || 'A challan with nothing allocated can still be saved and allocated later.'}</p>
        <div className="flex items-center gap-2">
          <button type="button" className="ui-btn ui-btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="ui-btn ui-btn-primary" disabled={problems.length > 0} onClick={save}>
            Record challan
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChallanForm;
