import React, { useCallback, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Link2, Link2Off, Lock, Scale, Upload } from 'lucide-react';

import { PageHeader, EmptyState } from '../../components/ui/Primitives';
import { notify } from '../../components/ui/notify';
import { formatMoney, round2 } from '../../utils/money';
import { readStatement } from '../../utils/statementImport';
import { DEFAULT_DATE_WINDOW_DAYS, matchStatement, reconciliationSummary } from '../../utils/bankReco';
import { reconcilePayment } from '../../api/payments';

/**
 * Reconciling a bank account.
 *
 * The product could import a statement — turn its rows into new transactions,
 * warn that some looked like duplicates, and import them anyway. On a book that
 * already records its receipts and payments that is the wrong operation: it
 * doubles the money.
 *
 * This is the other one. Nothing is created. The statement and the book are
 * matched, and the two leftovers are the answer: what the bank has seen and the
 * books have not, and what the books hold that has not reached the bank.
 *
 * The difference at the bottom is the number the exercise exists for.
 */

const safeArray = (v) => (Array.isArray(v) ? v : []);
const money = (v, company) => formatMoney(Number(v || 0), company);

const Figure = ({ label, value, company, strong = false, tone = '' }) => (
  <div className="flex items-baseline justify-between gap-4 py-1">
    <span className={strong ? 'font-semibold' : ''}>{label}</span>
    <span
      className={`ui-money ${strong ? 'font-semibold' : ''}`}
      style={tone ? { color: `rgb(var(--${tone}-ink))` } : undefined}
    >
      {money(value, company)}
    </span>
  </div>
);

const Row = ({ row, company, right = null }) => (
  <div className="flex items-center gap-3 px-4 py-2.5">
    <div className="ui-col-date w-24 shrink-0 text-sm">{row.date || '—'}</div>
    <div className="min-w-0 flex-1 truncate text-sm">{row.narration || row.description || '—'}</div>
    <div className="w-16 shrink-0 text-xs ui-muted">{row.direction === 'OUT' ? 'Paid' : 'Received'}</div>
    <div className="ui-col-amount w-32 shrink-0 text-right">{money(row.amount, company)}</div>
    {right ? <div className="w-28 shrink-0 text-right">{right}</div> : null}
  </div>
);

export default function BankReconciliation({ db, setDb, currentCompany }) {
  const companyId = currentCompany?.id;
  const fileRef = useRef(null);

  const accounts = useMemo(
    () =>
      safeArray(db?.chartOfAccounts)
        .filter((a) => a.companyId === companyId)
        .filter((a) => /bank|cash/i.test(String(a.groupName || a.group || a.category || ''))),
    [db?.chartOfAccounts, companyId]
  );

  const [accountId, setAccountId] = useState(() => String(accounts[0]?.id || ''));
  const [statement, setStatement] = useState([]);
  const [statementName, setStatementName] = useState('');
  const [closingBalance, setClosingBalance] = useState('');
  const [windowDays, setWindowDays] = useState(String(DEFAULT_DATE_WINDOW_DAYS));
  const [rejected, setRejected] = useState(() => new Set());
  const [saving, setSaving] = useState(false);

  /*
   * The book side: what this account already holds. Receipts and payments
   * entered through their own screens, plus anything recorded straight onto the
   * bank book. Nothing here is created or changed by reconciling.
   */
  const book = useMemo(() => {
    const acct = accounts.find((a) => String(a.id) === String(accountId));
    const serverLedgerId = String(acct?.serverLedgerAccountId || '').trim();
    const payments = safeArray(db?.payments)
      .filter((p) => p.companyId === companyId)
      .filter((p) => (serverLedgerId ? String(p.ledgerAccountId || '') === serverLedgerId : false))
      /*
       * Already reconciled in an earlier session, so it is not outstanding and
       * must not be offered again. Without this every statement a business ever
       * loads re-proposes every payment it has ever made.
       */
      .filter((p) => p.reconciled !== true)
      .map((p) => ({
        paymentId: String(p.id),
        id: `pay-${p.id}`,
        date: String(p.date || '').slice(0, 10),
        direction: p.voucherType === 'receipt' ? 'IN' : 'OUT',
        amount: round2(Math.abs(Number(p.amount ?? 0))),
        narration: `${p.number || ''} ${p.customerName || p.vendorName || p.partyName || ''} ${p.notes || ''}`.trim(),
        source: 'Receipt / payment',
      }));

    const entered = safeArray(db?.bankTransactions)
      .filter((t) => t.companyId === companyId)
      .filter((t) => String(t.cashBankAccountId) === String(accountId))
      .map((t) => ({
        id: `txn-${t.id}`,
        date: String(t.date || '').slice(0, 10),
        direction: String(t.direction || 'IN').toUpperCase(),
        amount: round2(Math.abs(Number(t.amount ?? 0))),
        narration: String(t.narration || t.description || ''),
        source: 'Bank book',
      }));

    return [...payments, ...entered];
  }, [db?.payments, db?.bankTransactions, accounts, accountId, companyId]);

  const bookBalance = useMemo(
    () => round2(book.reduce((s, r) => s + (r.direction === 'OUT' ? -r.amount : r.amount), 0)),
    [book]
  );

  const result = useMemo(
    () => matchStatement({ statement, book, dateWindowDays: Number(windowDays) || 0 }),
    [statement, book, windowDays]
  );

  /*
   * A rejected suggestion is not a match, and both of its sides go back to
   * being unexplained. Rejecting has to put them in the leftovers or the
   * difference stops adding up.
   */
  const view = useMemo(() => {
    const kept = result.matched.filter((m) => !rejected.has(m.statement.id));
    const undone = result.matched.filter((m) => rejected.has(m.statement.id));
    return {
      matched: kept,
      statementOnly: [...result.statementOnly, ...undone.map((m) => m.statement)],
      bookOnly: [...result.bookOnly, ...undone.map((m) => m.book)],
    };
  }, [result, rejected]);

  const summary = useMemo(
    () =>
      reconciliationSummary({
        bookBalance,
        statementBalance: Number(closingBalance || 0),
        statementOnly: view.statementOnly,
        bookOnly: view.bookOnly,
      }),
    [bookBalance, closingBalance, view]
  );

  const onFile = useCallback(async (file) => {
    if (!file) return;
    let text = '';
    try {
      text = await file.text();
    } catch {
      notify.error('That file could not be read.');
      return;
    }
    const { rows, error } = readStatement(text);
    if (error) {
      notify.error(error);
      return;
    }
    setStatement(rows);
    setStatementName(file.name || 'statement');
    setRejected(new Set());

    // The closing balance is the last balance the statement itself carries —
    // asking for it again when the file already says it is busy-work.
    const last = [...rows].reverse().find((r) => r.balance !== null && Number.isFinite(Number(r.balance)));
    if (last && !closingBalance) setClosingBalance(String(last.balance));
    notify.success(`${rows.length} statement line(s) read.`);
  }, [closingBalance]);

  /**
   * Tying the matched pairs off, for good.
   *
   * Until this existed the screen worked out the answer and then forgot it: the
   * matching, the confirming and the unmatching all lived in this component's
   * state, so closing the tab threw away the reconciliation and the next
   * statement re-proposed every payment again.
   *
   * Only a receipt or payment can be marked. A row entered straight into the
   * bank book has no server record to mark yet — that is the next thing to fix,
   * and it is stated below rather than hidden, because a reconciliation that
   * silently ties off half of what is on screen is worse than one that does
   * less and says so.
   */
  const markable = useMemo(() => view.matched.filter((m) => m.book.paymentId), [view.matched]);
  const unmarkable = view.matched.length - markable.length;

  const reconcileMatched = async () => {
    if (!markable.length || saving) return;
    setSaving(true);
    const done = [];
    const failed = [];

    for (const m of markable) {
      try {
        // One at a time on purpose: a refusal on one payment must not take the
        // rest of the reconciliation down with it.
        await reconcilePayment(m.book.paymentId, {
          reconciled: true,
          bankDate: m.statement.date || null,
          // What the bank called it. The point of keeping this is that a query
          // six months later is answered from the statement's own wording.
          statementRef: `${statementName} · ${m.statement.narration || m.statement.date}`.slice(0, 120),
        });
        done.push(m.book.paymentId);
      } catch (e) {
        failed.push(String(e?.message || e));
      }
    }

    /*
     * Mirrored into the local book so the screen agrees with the server without
     * a reload — and so a row that was tied off does not come back as
     * outstanding the moment somebody loads the next statement.
     */
    if (done.length && typeof setDb === 'function') {
      const marked = new Set(done);
      setDb((prev) => ({
        ...prev,
        payments: safeArray(prev.payments).map((p) => (marked.has(String(p.id)) ? { ...p, reconciled: true } : p)),
      }));
    }

    setSaving(false);
    if (failed.length) {
      notify.error(`${done.length} reconciled. ${failed.length} could not be saved: ${failed[0]}`);
      return;
    }
    notify.success(`${done.length} entr${done.length === 1 ? 'y' : 'ies'} reconciled.`);
  };

  const toggleReject = (id) =>
    setRejected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (!accounts.length) {
    return (
      <div className="space-y-6">
        <PageHeader title="Bank Reconciliation" description="Tie a bank statement to the book." />
        <div className="ui-card">
          <EmptyState
            icon={Scale}
            title="No bank or cash account yet"
            description="Add one under Chart of Accounts, then bring a statement here."
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bank Reconciliation"
        description="Match a statement against the book. Nothing is created — what is left on each side is the answer."
      />

      <div className="ui-card flex flex-wrap items-end gap-3 p-4">
        <div>
          <label className="ui-label" htmlFor="reco-account">
            Account
          </label>
          <select
            id="reco-account"
            value={accountId}
            onChange={(e) => {
              setAccountId(e.target.value);
              setRejected(new Set());
            }}
            className="ui-select"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="ui-label" htmlFor="reco-closing">
            Closing balance per statement
          </label>
          <input
            id="reco-closing"
            type="number"
            step="0.01"
            value={closingBalance}
            onChange={(e) => setClosingBalance(e.target.value)}
            className="ui-input text-right"
            placeholder="0.00"
          />
        </div>
        <div>
          <label className="ui-label" htmlFor="reco-window">
            Clearing window (days)
          </label>
          <input
            id="reco-window"
            type="number"
            min="0"
            max="60"
            value={windowDays}
            onChange={(e) => setWindowDays(e.target.value)}
            className="ui-input w-24 text-right"
          />
        </div>
        <div className="ml-auto">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.txt"
            className="hidden"
            onChange={(e) => {
              onFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <button type="button" onClick={() => fileRef.current?.click?.()} className="ui-btn ui-btn-primary">
            <Upload size={15} aria-hidden="true" /> {statementName ? 'Load another statement' : 'Load statement'}
          </button>
        </div>
      </div>

      {!statement.length ? (
        <div className="ui-card">
          <EmptyState
            icon={Scale}
            title="Bring a statement"
            description="A CSV from the bank: date, description, and either debit and credit columns or one signed amount."
          />
        </div>
      ) : (
        <>
          <div className="ui-card p-4">
            <div className="ui-label mb-2">Reconciliation — {statementName}</div>
            <div className="max-w-md text-sm">
              <Figure label="Balance as per the books" value={summary.bookBalance} company={currentCompany} />
              <Figure label="Less: not yet on the statement" value={summary.unpresented} company={currentCompany} />
              <Figure label="Add: not yet in the books" value={summary.unrecorded} company={currentCompany} />
              <div className="my-1 border-t" />
              <Figure label="Expected statement balance" value={summary.expected} company={currentCompany} strong />
              <Figure label="Actual statement balance" value={summary.statementBalance} company={currentCompany} />
              <div className="my-1 border-t" />
              <Figure
                label="Difference"
                value={summary.difference}
                company={currentCompany}
                strong
                tone={summary.reconciled ? 'pos' : 'neg'}
              />
            </div>
            {summary.reconciled ? (
              <div
                className="mt-3 inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm"
                style={{ background: 'rgb(var(--pos-soft))', color: 'rgb(var(--pos-ink))' }}
              >
                <CheckCircle2 size={16} aria-hidden="true" /> This account reconciles.
              </div>
            ) : (
              <div className="mt-3 text-sm" style={{ color: 'rgb(var(--neg-ink))' }}>
                {money(summary.difference, currentCompany)} is unexplained. Everything below has to account for it.
              </div>
            )}
          </div>

          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="ui-label">
                Matched ({view.matched.length}) — the same money on both sides
              </div>
              {view.matched.length ? (
                <div className="flex items-center gap-3">
                  {unmarkable ? (
                    <span className="ui-caption ui-muted">
                      {unmarkable} entered straight into the bank book — not yet savable
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={reconcileMatched}
                    disabled={saving || !markable.length}
                    className="ui-btn ui-btn-primary ui-btn-sm"
                  >
                    <Lock size={14} aria-hidden="true" />{' '}
                    {saving ? 'Saving…' : `Reconcile ${markable.length} matched`}
                  </button>
                </div>
              ) : null}
            </div>
            <div className="ui-card divide-y">
              {view.matched.length === 0 ? (
                <div className="px-4 py-3 text-sm ui-muted">Nothing matched yet.</div>
              ) : (
                view.matched.map((m) => (
                  <div key={m.statement.id} className="px-4 py-2.5">
                    <div className="flex items-center gap-3">
                      <div className="ui-col-date w-24 shrink-0 text-sm">{m.statement.date}</div>
                      <div className="min-w-0 flex-1 truncate text-sm">{m.statement.narration || '—'}</div>
                      <div className="ui-col-amount w-32 shrink-0 text-right">
                        {money(m.statement.amount, currentCompany)}
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleReject(m.statement.id)}
                        aria-label={`Unmatch ${m.statement.narration || m.statement.date}`}
                        className="ui-btn ui-btn-secondary ui-btn-sm text-xs"
                      >
                        <Link2Off size={13} aria-hidden="true" /> Unmatch
                      </button>
                    </div>
                    <div className="ui-caption ui-muted mt-0.5 flex items-center gap-2">
                      <Link2 size={12} aria-hidden="true" />
                      {m.book.source}: {m.book.narration || m.book.date}
                      {m.dayGap ? ` · cleared ${m.dayGap} day${m.dayGap === 1 ? '' : 's'} later` : ' · same day'}
                      {m.confident ? '' : ' · confirm this'}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div>
            <div className="ui-label mb-2">
              On the statement, not in the books ({view.statementOnly.length}) — money that moved and was never recorded
            </div>
            <div className="ui-card divide-y">
              {view.statementOnly.length === 0 ? (
                <div className="px-4 py-3 text-sm ui-muted">Nothing outstanding.</div>
              ) : (
                view.statementOnly.map((r) => <Row key={r.id} row={r} company={currentCompany} />)
              )}
            </div>
          </div>

          <div>
            <div className="ui-label mb-2">
              In the books, not on the statement ({view.bookOnly.length}) — cheques that have not cleared
            </div>
            <div className="ui-card divide-y">
              {view.bookOnly.length === 0 ? (
                <div className="px-4 py-3 text-sm ui-muted">Nothing outstanding.</div>
              ) : (
                view.bookOnly.map((r) => (
                  <Row
                    key={r.id}
                    row={r}
                    company={currentCompany}
                    right={<span className="ui-caption ui-muted">{r.source}</span>}
                  />
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
