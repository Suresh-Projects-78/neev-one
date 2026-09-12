import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';

import Modal from '../../components/ui/Modal';
import { notify } from '../../components/ui/notify';
import { formatMoney, round2 } from '../../utils/money';
import { postJournalToLedger } from '../../utils/journalSync';
import { allocationJournalLines, allocationSummary, validateAllocation } from './allocations';

/**
 * One bank line, split across the book.
 *
 * The parent — what the bank said — sits at the top and cannot be touched
 * from here. Underneath, the child rows say what the money was: a ledger, an
 * amount, a word of narration each. The three figures the specification
 * insists on are always in view: Bank Amount, Allocated, Difference.
 *
 * Save keeps a partial split (half-done work is still worth keeping); POST is
 * offered only when the difference is zero, and then it writes exactly one
 * journal through the same engine a hand-typed entry uses — bank leg on one
 * side, a leg per allocation on the other. No accounting happens here; this
 * dialog only decides what the journal will say.
 */
const AllocationDialog = ({ db, setDb, currentCompany, txn, onClose }) => {
  const companyId = currentCompany?.id;

  const ledgers = useMemo(
    () =>
      (db?.chartOfAccounts || [])
        .filter((a) => a.companyId === companyId)
        .filter((a) => String(a.id) !== String(txn?.cashBankAccountId))
        .slice()
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))),
    [db?.chartOfAccounts, companyId, txn?.cashBankAccountId]
  );

  const existing = useMemo(
    () =>
      (db?.bankAllocations || [])
        .filter((a) => Number(a.companyId) === Number(companyId))
        .filter((a) => String(a.bankTransactionId) === String(txn?.id)),
    [db?.bankAllocations, companyId, txn?.id]
  );

  const [rows, setRows] = useState(() =>
    existing.length
      ? existing.map((a) => ({ ledgerId: String(a.ledgerId || ''), amount: String(a.amount ?? ''), narration: String(a.narration || '') }))
      : [{ ledgerId: '', amount: '', narration: '' }]
  );

  const summary = allocationSummary(txn, rows.map((r) => ({ ...r, amount: Number(r.amount || 0) })));
  const check = validateAllocation(txn, rows.map((r) => ({ ...r, amount: Number(r.amount || 0) })));

  const setRow = (i, patch) => setRows((prev) => prev.map((r, n) => (n === i ? { ...r, ...patch } : r)));
  const addRow = () => setRows((prev) => [...prev, { ledgerId: '', amount: '', narration: '' }]);
  const removeRow = (i) => setRows((prev) => (prev.length > 1 ? prev.filter((_, n) => n !== i) : prev));

  /** Replace this txn's child rows; post the journal only when told to. */
  const save = async ({ post }) => {
    const live = rows
      .map((r) => ({ ledgerId: String(r.ledgerId || '').trim(), amount: round2(Math.abs(Number(r.amount || 0))), narration: String(r.narration || '').trim() }))
      .filter((r) => r.amount > 0.005);

    if (post && !check.canPost) return;
    if (!post && !check.canSave) {
      notify.error(check.problems[0] || 'Nothing to save.');
      return;
    }

    let journalPatch = {};
    let journalId = null;
    if (post) {
      /*
       * The one journal this split becomes. Local entry plus the server-side
       * posting the journal form itself uses — the entry is indistinguishable
       * from one typed by hand, because it is one.
       */
      const accounts = (db.chartOfAccounts || []).filter((a) => a.companyId === companyId);
      const lines = allocationJournalLines(txn, live).map((l) => {
        const acc = accounts.find((a) => String(a.id) === String(l.accountId));
        return { ...l, accountName: acc?.name || '', accountCode: acc?.code || '' };
      });
      journalPatch = await postJournalToLedger({
        chartRows: accounts,
        entry: {
          date: txn.date,
          narration: `Bank allocation — ${String(txn.narration || txn.description || '').trim() || txn.date}`,
          lines,
        },
      });
      journalId = ((db.journalEntries || []).reduce((m, j) => Math.max(m, Number(j?.id || 0)), 0) || 0) + 1;
    }

    setDb((prev) => {
      const others = (prev.bankAllocations || []).filter(
        (a) => !(Number(a.companyId) === Number(companyId) && String(a.bankTransactionId) === String(txn.id))
      );
      let nextId = (prev.bankAllocations || []).reduce((m, a) => Math.max(m, Number(a?.id || 0)), 0) + 1;
      const children = live.map((r) => ({
        id: nextId++,
        companyId,
        bankTransactionId: txn.id,
        ledgerId: r.ledgerId,
        amount: r.amount,
        narration: r.narration,
        journalEntryId: post ? journalId : null,
        createdAt: new Date().toISOString(),
      }));

      const journalEntry = post
        ? {
            id: journalId,
            companyId,
            number: `BA-${txn.id}`,
            date: txn.date,
            narration: `Bank allocation — ${String(txn.narration || txn.description || '').trim() || txn.date}`,
            lines: allocationJournalLines(txn, live).map((l) => {
              const acc = (prev.chartOfAccounts || []).find((a) => String(a.id) === String(l.accountId));
              return { ...l, accountName: acc?.name || '', accountCode: acc?.code || '' };
            }),
            totalDebit: summary.bankAmount,
            totalCredit: summary.bankAmount,
            sourceBankTransactionId: txn.id,
            createdAt: new Date().toISOString(),
            ...journalPatch,
          }
        : null;

      return {
        ...prev,
        bankAllocations: [...others, ...children],
        journalEntries: journalEntry ? [...(prev.journalEntries || []), journalEntry] : prev.journalEntries,
        /* The parent's bank-side facts never move; what changes is only the
           note that its accounting now exists. */
        bankTransactions: (prev.bankTransactions || []).map((t) =>
          t.companyId === companyId && String(t.id) === String(txn.id)
            ? { ...t, allocationJournalId: post ? journalId : t.allocationJournalId ?? null }
            : t
        ),
      };
    });

    notify.success(post ? 'Allocated and posted.' : 'Allocation saved — not posted yet.');
    onClose?.();
  };

  const out = String(txn?.direction || '').toUpperCase() === 'OUT';

  return (
    <Modal onClose={onClose} title="Allocate bank transaction" maxWidthClass="max-w-3xl">
      <div className="space-y-4">
        {/* The immutable parent, stated, not editable. */}
        <div className="ui-sunken rounded-lg border p-3 text-sm">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>{txn?.date}</span>
            <span className="ui-muted truncate">{String(txn?.narration || txn?.description || '').trim() || '—'}</span>
            {txn?.reference ? <span className="ui-mono ui-muted">{txn.reference}</span> : null}
            <span className={`ui-money ms-auto ${out ? 'text-[rgb(var(--neg-ink))]' : 'text-[rgb(var(--pos-ink))]'}`}>
              {out ? '−' : ''}{formatMoney(summary.bankAmount, currentCompany)}
            </span>
          </div>
        </div>

        {/* The three figures, always on screen. */}
        <dl className="grid grid-cols-3 gap-3 text-sm">
          <div>
            <dt className="ui-caption">Bank amount</dt>
            <dd className="ui-money">{formatMoney(summary.bankAmount, currentCompany)}</dd>
          </div>
          <div>
            <dt className="ui-caption">Allocated</dt>
            <dd className="ui-money">{formatMoney(summary.allocated, currentCompany)}</dd>
          </div>
          <div>
            <dt className="ui-caption">Difference</dt>
            <dd className={`ui-money ${Math.abs(summary.difference) > 0.005 ? 'text-[rgb(var(--neg-ink))]' : 'text-[rgb(var(--pos-ink))]'}`}>
              {formatMoney(summary.difference, currentCompany)}
            </dd>
          </div>
        </dl>

        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <label className="ui-label" htmlFor={`alloc-ledger-${i}`}>Ledger</label>
                <select
                  id={`alloc-ledger-${i}`}
                  className="ui-select w-full"
                  value={r.ledgerId}
                  onChange={(e) => setRow(i, { ledgerId: e.target.value })}
                >
                  <option value="">Select ledger</option>
                  {ledgers.map((l) => (
                    <option key={l.id} value={String(l.id)}>{l.name}</option>
                  ))}
                </select>
              </div>
              <div className="w-32">
                <label className="ui-label" htmlFor={`alloc-amount-${i}`}>Amount</label>
                <input
                  id={`alloc-amount-${i}`}
                  type="number"
                  min="0"
                  step="0.01"
                  className="ui-input ui-money w-full"
                  value={r.amount}
                  onChange={(e) => setRow(i, { amount: e.target.value })}
                />
              </div>
              <div className="min-w-0 flex-1">
                <label className="ui-label" htmlFor={`alloc-narr-${i}`}>Narration</label>
                <input
                  id={`alloc-narr-${i}`}
                  type="text"
                  className="ui-input w-full"
                  value={r.narration}
                  onChange={(e) => setRow(i, { narration: e.target.value })}
                />
              </div>
              <button
                type="button"
                onClick={() => removeRow(i)}
                disabled={rows.length === 1}
                className="ui-icon-btn !h-9 !w-9"
                aria-label={`Remove allocation row ${i + 1}`}
              >
                <Trash2 size={15} aria-hidden="true" className="text-[rgb(var(--neg))]" />
              </button>
            </div>
          ))}
          <button type="button" onClick={addRow} className="ui-btn ui-btn-secondary ui-btn-sm">
            <Plus size={14} aria-hidden="true" /> Add row
          </button>
        </div>

        <div className="flex items-center justify-between gap-2 border-t pt-3">
          <p className="ui-caption">
            {check.canPost
              ? 'Fully allocated — posting writes one balanced journal.'
              : 'Post needs the difference at zero; Save keeps a partial split without posting.'}
          </p>
          <div className="flex items-center gap-2">
            <button type="button" className="ui-btn ui-btn-secondary" onClick={onClose}>Cancel</button>
            <button type="button" className="ui-btn ui-btn-secondary" disabled={!check.canSave} onClick={() => save({ post: false })}>
              Save
            </button>
            <button type="button" className="ui-btn ui-btn-primary" disabled={!check.canPost} onClick={() => save({ post: true })}>
              Allocate &amp; post
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default AllocationDialog;
