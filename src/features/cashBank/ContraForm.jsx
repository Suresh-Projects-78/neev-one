import { useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';

import PopupSelect from '../../components/pickers/PopupSelect';
import { notify } from '../../components/ui/notify';
import { formatMoney, round2 } from '../../utils/money';
import { postJournalToLedger } from '../../utils/journalSync';
import { bumpCompanyNextNumber, getDocSettings, nextFreeVoucherNumber } from '../../utils/docSettings';
import { cashBankIndex } from './transactions';

/**
 * A contra: money moved between two of the company's own accounts.
 *
 * There is no new accounting here and deliberately none. A contra IS a
 * journal — credit the account the money left, debit the one it reached —
 * and this form is a thin front on that fact: two pickers and an amount
 * instead of a line grid, because a transfer has exactly two lines and a
 * person should not have to know which side is the debit. The entry it
 * writes is indistinguishable from one typed on the journal form, posts
 * through the same engine, and lands in the same series — which is also why
 * the cash book already knows how to show it.
 */
const ContraForm = ({ db, setDb, currentCompany, onClose }) => {
  const companyId = currentCompany?.id;
  const { accounts } = useMemo(() => cashBankIndex(db, companyId), [db, companyId]);

  const branchId = String(localStorage.getItem('activeBranchId') || localStorage.getItem('branchId') || '').trim();
  const numbering = getDocSettings(db, currentCompany, { branchId: branchId || null })?.numbering?.journalEntry;
  const isAuto = String(numbering?.mode || '').toLowerCase() === 'auto';
  const lockNumber = isAuto && !numbering?.allowManualOverride;
  const generated = nextFreeVoucherNumber({
    db,
    company: currentCompany,
    voucherKey: 'journalEntry',
    branchId: branchId || null,
    takenNumbers: (db.journalEntries || [])
      .filter((j) => j.companyId === companyId)
      .map((j) => String(j.number || '').trim()),
  });

  const [form, setForm] = useState(() => ({
    number: generated || `JV-${Date.now()}`,
    date: new Date().toISOString().slice(0, 10),
    fromId: '',
    toId: '',
    amount: '',
    narration: '',
  }));
  const set = (patch) => setForm((prev) => ({ ...prev, ...patch }));
  const [saving, setSaving] = useState(false);

  const from = accounts.find((a) => String(a.id) === String(form.fromId)) || null;
  const to = accounts.find((a) => String(a.id) === String(form.toId)) || null;
  const amount = round2(Math.abs(Number(form.amount || 0)));

  const problems = [];
  if (!from) problems.push('Pick the account the money leaves.');
  if (!to) problems.push('Pick the account the money reaches.');
  if (from && to && String(from.id) === String(to.id)) problems.push('A transfer needs two different accounts.');
  if (amount <= 0.005) problems.push('The amount cannot be zero.');
  if (!String(form.number || '').trim() && !isAuto) problems.push('The voucher needs its number.');

  const save = async () => {
    if (problems.length || saving) {
      if (problems.length) notify.error(problems[0]);
      return;
    }

    /* Year-end lock: a transfer back-dates into closed books no more than a
       journal does — because it is one. */
    const lock = (db.fyLocks || []).find((l) => l.companyId === companyId);
    if (lock && String(form.date || '').slice(0, 10) <= lock.upTo) {
      notify.error(`Books are locked up to ${lock.upTo} (Year-End Close). Pick a later date or unlock the year.`);
      return;
    }

    let number = String(form.number || '').trim();
    if (lockNumber || (isAuto && !number)) number = String(generated || '').trim();
    if (!number) {
      notify.error('Voucher number is required.');
      return;
    }
    if ((db.journalEntries || []).some((j) => j.companyId === companyId && String(j.number || '').trim() === number)) {
      notify.error('This number already exists — change it or update numbering settings.');
      return;
    }

    const narration =
      String(form.narration || '').trim() || `Transfer from ${from.name} to ${to.name}`;
    const lines = [
      { accountId: String(to.id), accountName: to.name || '', accountCode: to.code || '', debit: amount, credit: 0 },
      { accountId: String(from.id), accountName: from.name || '', accountCode: from.code || '', debit: 0, credit: amount },
    ];

    setSaving(true);
    const chartRows = (db.chartOfAccounts || []).filter((a) => a.companyId === companyId);
    const ledgerPatch = await postJournalToLedger({
      chartRows,
      entry: { date: form.date, narration, lines },
    });

    setDb((prev) => {
      const nextId = (prev.journalEntries || []).reduce((m, j) => Math.max(m, Number(j?.id || 0)), 0) + 1;
      return {
        ...prev,
        journalEntries: [
          ...(prev.journalEntries || []),
          {
            id: nextId,
            companyId,
            number,
            date: form.date,
            narration,
            lines,
            totalDebit: amount,
            totalCredit: amount,
            voucherKind: 'contra',
            createdAt: new Date().toISOString(),
            ...ledgerPatch,
          },
        ],
        companies: bumpCompanyNextNumber({
          db: prev,
          companyId,
          voucherKey: 'journalEntry',
          usedNumber: number,
          branchId: branchId || null,
        }),
      };
    });

    setSaving(false);
    notify.success(`${formatMoney(amount, currentCompany)} moved from ${from.name} to ${to.name}.`);
    onClose?.();
  };

  const options = accounts.map((a) => ({ value: String(a.id), label: String(a.name || '') }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="ui-label" htmlFor="contra-number">Voucher No.</label>
          <input
            id="contra-number"
            type="text"
            className="ui-input ui-mono w-full"
            value={form.number}
            readOnly={lockNumber}
            onChange={(e) => set({ number: e.target.value })}
          />
        </div>
        <div>
          <label className="ui-label" htmlFor="contra-date">Date</label>
          <input
            id="contra-date"
            type="date"
            className="ui-input w-full"
            value={form.date}
            onChange={(e) => set({ date: e.target.value })}
          />
        </div>
      </div>

      {/* From, then to — the sentence the entry writes. */}
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1">
          <PopupSelect
            label="From account"
            title="accounts"
            value={form.fromId}
            onChange={(next) => set({ fromId: String(next || '') })}
            options={options}
            placeholder="Money leaves…"
            showValueSubtext={false}
          />
        </div>
        <ArrowRight size={16} aria-hidden="true" className="ui-muted mb-2.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <PopupSelect
            label="To account"
            title="accounts"
            value={form.toId}
            onChange={(next) => set({ toId: String(next || '') })}
            options={options}
            placeholder="Money reaches…"
            showValueSubtext={false}
          />
        </div>
        <div className="w-36">
          <label className="ui-label" htmlFor="contra-amount">Amount</label>
          <input
            id="contra-amount"
            type="number"
            min="0"
            step="0.01"
            className="ui-input ui-money w-full"
            value={form.amount}
            onChange={(e) => set({ amount: e.target.value })}
          />
        </div>
      </div>

      <div>
        <label className="ui-label" htmlFor="contra-narration">Narration</label>
        <input
          id="contra-narration"
          type="text"
          className="ui-input w-full"
          placeholder={from && to ? `Transfer from ${from.name} to ${to.name}` : 'Why the money moved'}
          value={form.narration}
          onChange={(e) => set({ narration: e.target.value })}
        />
      </div>

      <div className="flex items-center justify-between gap-2 border-t pt-3">
        <p className="ui-caption">
          {problems[0] || 'Posts one balanced journal through the same engine as a hand-typed entry.'}
        </p>
        <div className="flex items-center gap-2">
          <button type="button" className="ui-btn ui-btn-secondary" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="ui-btn ui-btn-primary"
            disabled={problems.length > 0 || saving}
            onClick={save}
          >
            {saving ? 'Saving…' : 'Record transfer'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ContraForm;
