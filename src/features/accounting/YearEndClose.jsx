import React, { useMemo, useState } from 'react';
import { Lock, Unlock, CalendarCheck } from 'lucide-react';
import { PageHeader } from '../../components/ui/Primitives';
import { notify, confirmDialog } from '../../components/ui/notify';
import { formatMoney } from '../../utils/money';
import { fyRange } from '../../utils/tdsTcs';

/**
 * Year-end close: the clean cut-over every April.
 *
 * 1. The FY's income and expense totals are computed from documents and
 *    prefill the net profit (editable — the CA may adjust).
 * 2. "Draft closing journal" books P&L → Capital Account.
 * 3. "Lock the year" freezes it: new invoices, bills and journal entries
 *    dated inside a locked period are refused at save time.
 */
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export const isDateLocked = (db, companyId, date) => {
  const lock = (db?.fyLocks || []).find((l) => l.companyId === companyId);
  return Boolean(lock && String(date || '').slice(0, 10) <= lock.upTo);
};

export default function YearEndClose({ db, setDb, currentCompany }) {
  const companyId = currentCompany.id;
  // The year being closed is the PREVIOUS FY once we're past April, but the
  // operator picks — default to the FY containing "one year ago today".
  const lastYearDate = useMemo(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return d.toISOString().slice(0, 10);
  }, []);
  const [fyDate, setFyDate] = useState(lastYearDate);
  const fy = useMemo(() => fyRange(fyDate), [fyDate]);

  const totals = useMemo(() => {
    const inFy = (d) => {
      const x = String(d || '').slice(0, 10);
      return x >= fy.from && x <= fy.to;
    };
    const live = (d) => !['draft', 'cancelled'].includes(String(d.status || '').toLowerCase());
    const income =
      (db.invoices || []).filter((d) => d.companyId === companyId && live(d) && inFy(d.date)).reduce((s, d) => s + num(d.subtotal) + num(d.otherChargesTotal), 0) -
      (db.creditNotes || []).filter((d) => d.companyId === companyId && inFy(d.date)).reduce((s, d) => s + num(d.subtotal), 0);
    const expense =
      (db.bills || []).filter((d) => d.companyId === companyId && live(d) && inFy(d.date)).reduce((s, d) => s + num(d.subtotal), 0) +
      (db.expenses || []).filter((d) => d.companyId === companyId && live(d) && inFy(d.date)).reduce((s, d) => s + num(d.taxableTotal ?? d.subtotal ?? d.amount), 0) -
      (db.debitNotes || []).filter((d) => d.companyId === companyId && inFy(d.date)).reduce((s, d) => s + num(d.subtotal), 0);
    return { income: Math.round(income * 100) / 100, expense: Math.round(expense * 100) / 100 };
  }, [db, companyId, fy]);

  const [netOverride, setNetOverride] = useState('');
  const net = netOverride === '' ? Math.round((totals.income - totals.expense) * 100) / 100 : Number(netOverride) || 0;

  const lock = (db.fyLocks || []).find((l) => l.companyId === companyId) || null;
  const money = (v) => formatMoney(Number(v || 0), currentCompany);

  const draftClosingJournal = () => {
    if (!net) {
      notify.error('Net result is zero — nothing to transfer.');
      return;
    }
    const profit = net > 0;
    const amount = Math.abs(net);
    const lines = [
      { accountId: '', accountCode: '', accountName: 'Profit & Loss A/c', debit: profit ? amount : 0, credit: profit ? 0 : amount },
      { accountId: '', accountCode: '', accountName: 'Capital Account', debit: profit ? 0 : amount, credit: profit ? amount : 0 },
    ];
    const nextId = (db.journalEntries || []).reduce((m, j) => Math.max(m, Number(j.id) || 0), 0) + 1;
    setDb((prev) => ({
      ...prev,
      journalEntries: [
        ...(prev.journalEntries || []),
        {
          id: nextId,
          companyId,
          number: `JE-CLOSE-${nextId}`,
          date: fy.to,
          narration: `${fy.label} closing: net ${profit ? 'profit' : 'loss'} transferred to Capital Account`,
          lines,
          totalDebit: amount,
          totalCredit: amount,
          createdAt: new Date().toISOString(),
        },
      ],
    }));
    notify.success(`Closing journal JE-CLOSE-${nextId} drafted — net ${profit ? 'profit' : 'loss'} ${money(amount)} to Capital.`);
  };

  const lockYear = async () => {
    const ok = await confirmDialog({
      title: `Lock ${fy.label}`,
      message: `Freeze all books up to ${fy.to}? New invoices, bills and journal entries dated on or before that day will be refused. You can unlock later.`,
      confirmLabel: 'Lock the year',
    });
    if (!ok) return;
    setDb((prev) => ({
      ...prev,
      fyLocks: [...(prev.fyLocks || []).filter((l) => l.companyId !== companyId), { companyId, upTo: fy.to, lockedAt: new Date().toISOString() }],
    }));
    notify.success(`Books locked up to ${fy.to}.`);
  };

  const unlockYear = async () => {
    const ok = await confirmDialog({ title: 'Unlock books', message: `Remove the lock at ${lock.upTo}?`, confirmLabel: 'Unlock' });
    if (!ok) return;
    setDb((prev) => ({ ...prev, fyLocks: (prev.fyLocks || []).filter((l) => l.companyId !== companyId) }));
    notify.success('Books unlocked.');
  };

  return (
    <div className="space-y-5">
      <PageHeader title="Year-End Close" description="Transfer the year's result to capital, then lock the period so nothing back-dates into closed books." />

      <div className="ui-card flex flex-wrap items-end gap-3 p-4">
        <div>
          <label className="ui-label">Close the FY containing</label>
          <input type="date" value={fyDate} onChange={(e) => setFyDate(e.target.value)} className="ui-input px-3 py-2" />
        </div>
        <div className="pb-2 text-sm font-semibold">{fy.label} · {fy.from} → {fy.to}</div>
        {lock ? (
          <div className="pb-2 text-sm">
            <span className="ui-badge-warn rounded-full px-2 py-1 text-xs">Books locked up to {lock.upTo}</span>
          </div>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="ui-card p-4">
          <div className="ui-caption">Income ({fy.label})</div>
          <div className="ui-amount-pos text-2xl font-bold">{money(totals.income)}</div>
          <div className="ui-caption mt-0.5">Invoice + other-charge values, net of credit notes.</div>
        </div>
        <div className="ui-card p-4">
          <div className="ui-caption">Expenses</div>
          <div className="text-2xl font-bold">{money(totals.expense)}</div>
          <div className="ui-caption mt-0.5">Bills + expenses, net of debit notes.</div>
        </div>
        <div className="ui-card p-4">
          <div className="ui-caption">Net {net >= 0 ? 'profit' : 'loss'} to transfer</div>
          <div className={`text-2xl font-bold ${net >= 0 ? 'ui-amount-pos' : 'ui-amount-neg'}`}>{money(Math.abs(net))}</div>
          <input
            type="number"
            step="0.01"
            value={netOverride}
            onChange={(e) => setNetOverride(e.target.value)}
            className="ui-input mt-1 !h-8 w-40 px-2 text-sm"
            placeholder="Override (CA adjusted)"
          />
        </div>
      </div>

      <div className="ui-card space-y-3 p-5">
        <div className="text-sm font-semibold">Close-out steps</div>
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          <li>
            Book depreciation first (Fixed Assets → Draft depreciation journal), then any CA adjustments as journal entries.
          </li>
          <li>
            <button type="button" onClick={draftClosingJournal} className="ui-btn ui-btn-secondary ui-btn-sm text-xs">
              <CalendarCheck size={13} aria-hidden="true" /> Draft closing journal ({money(Math.abs(net))})
            </button>
            <span className="ui-muted ml-2">P&amp;L → Capital Account, dated {fy.to}.</span>
          </li>
          <li>
            {lock ? (
              <button type="button" onClick={unlockYear} className="ui-btn ui-btn-secondary ui-btn-sm text-xs">
                <Unlock size={13} aria-hidden="true" /> Unlock books
              </button>
            ) : (
              <button type="button" onClick={lockYear} className="ui-btn ui-btn-primary ui-btn-sm text-xs">
                <Lock size={13} aria-hidden="true" /> Lock the year (freeze up to {fy.to})
              </button>
            )}
            <span className="ui-muted ml-2">New documents dated inside a locked period are refused.</span>
          </li>
        </ol>
      </div>
    </div>
  );
}
