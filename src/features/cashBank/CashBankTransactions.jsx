import { useMemo, useRef, useState } from 'react';
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, ChevronDown, ListChecks, Plus, Upload } from 'lucide-react';

import DocumentListShell from '../../components/list/DocumentListShell';
import { LIST_PERIODS, usePeriodFilter } from '../../components/ListControls';
import PopupSelect from '../../components/pickers/PopupSelect';
import Popover from '../../components/ui/Popover';
import { EmptyState, StatusPill } from '../../components/ui/Primitives';
import { formatMoney } from '../../utils/money';
import { cashBankIndex, cashBankTotals, cashBankTransactions } from './transactions';

/**
 * What happened to the money.
 *
 * One consolidated view of every movement through a cash or bank account,
 * whatever entered it — a payment, a receipt, a transfer between the company's
 * own accounts, or a line imported from the bank. The screen before it showed
 * imported rows split into "uncategorised" and "categorised", which is a
 * question about the import rather than about the account's own history.
 *
 * Account first, then period, on one line, and no search: §4. A cash book is
 * read down a column of dates for one account, not hunted through.
 */

const TYPE_STYLE = {
  Payment: { className: 'text-[rgb(var(--neg-ink))]', sign: '−' },
  Receipt: { className: 'text-[rgb(var(--pos-ink))]', sign: '' },
  Contra: { className: 'text-[rgb(var(--ov-blue))]', sign: '' },
};

export default function CashBankTransactions({
  db,
  currentCompany,
  onNewPayment = null,
  onNewReceipt = null,
  onNewContra = null,
  onImportStatement = null,
  /* Opens the screen that owns a row's source document — a cash-book row is
     a view of a payment, a journal or an imported line, never a record of its
     own, so acting on it means going to the thing itself. */
  onOpenSource = null,
  onOpenReconciliation = null,
  onOpenAccounts = null,
}) {
  const companyId = currentCompany?.id;
  const { accounts } = useMemo(() => cashBankIndex(db, companyId), [db, companyId]);
  const period = usePeriodFilter();

  const [accountId, setAccountId] = useState('');
  const newBtnRef = useRef(null);
  const [newOpen, setNewOpen] = useState(false);

  /* An account that has since been deleted reads as "All accounts" rather than
     as a dangling id — the same rule the branch field on a document follows. */
  const accountInList = accounts.some((a) => String(a.id) === String(accountId)) ? accountId : '';

  const rows = useMemo(
    () =>
      cashBankTransactions(db, companyId, {
        accountId: accountInList,
        from: period.dateFrom,
        to: period.dateTo,
      }),
    [db, companyId, accountInList, period.dateFrom, period.dateTo]
  );

  const totals = useMemo(() => cashBankTotals(rows), [rows]);

  const newItems = [
    onNewPayment ? { key: 'payment', label: 'Payment', icon: ArrowUpRight, onSelect: onNewPayment } : null,
    onNewReceipt ? { key: 'receipt', label: 'Receipt', icon: ArrowDownLeft, onSelect: onNewReceipt } : null,
    onNewContra ? { key: 'contra', label: 'Contra — move between accounts', icon: ArrowLeftRight, onSelect: onNewContra } : null,
  ].filter(Boolean);

  return (
    <DocumentListShell
      entity="transfer"
      title="Transactions"
      company={currentCompany}
      moreItems={[
        onOpenReconciliation ? { key: 'reco', label: 'Reconciliation' } : null,
        onOpenAccounts ? { key: 'accounts', label: 'Bank & cash accounts' } : null,
      ].filter(Boolean)}
      onMoreSelect={(key) => {
        if (key === 'reco') onOpenReconciliation?.();
        if (key === 'accounts') onOpenAccounts?.();
      }}
      headerExtras={
        onImportStatement ? (
          <button type="button" onClick={onImportStatement} className="ui-btn ui-btn-secondary">
            <Upload size={16} aria-hidden="true" /> Import Statement
          </button>
        ) : null
      }
      primary={
        newItems.length ? (
          <>
            {/* One primary verb — and a cash book has three shapes of entry
                under it, so it opens rather than guessing which was meant. */}
            <button
              type="button"
              ref={newBtnRef}
              onClick={() => setNewOpen((v) => !v)}
              className="ui-btn ui-btn-primary"
              aria-haspopup="menu"
              aria-expanded={newOpen}
            >
              <Plus size={16} aria-hidden="true" /> New Transaction
              <ChevronDown size={15} aria-hidden="true" />
            </button>
            {newOpen ? (
              <Popover anchorRef={newBtnRef} onClose={() => setNewOpen(false)} minWidth={240}>
                <div className="py-1" role="menu">
                  {newItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setNewOpen(false);
                          item.onSelect?.();
                        }}
                        className="ui-hover-sunken flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
                      >
                        <Icon size={15} aria-hidden="true" /> {item.label}
                      </button>
                    );
                  })}
                </div>
              </Popover>
            ) : null}
          </>
        ) : null
      }
      cards={[
        { label: 'Payments', value: totals.payments, tone: 'neg', Icon: ArrowUpRight },
        { label: 'Receipts', value: totals.receipts, tone: 'paid', Icon: ArrowDownLeft },
        { label: 'Contra entries', value: totals.contra, tone: 'sent', Icon: ArrowLeftRight },
        { label: 'Vouchers', value: totals.count, count: true, tone: 'draft', Icon: ListChecks },
      ]}
      above={
        /* Account, then period, on one line — the order somebody asks the
           question in, and the only two narrowings this list has. */
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 sm:w-72">
            <PopupSelect
              label="Account"
      title="accounts"
              value={String(accountInList || '')}
              onChange={(next) => setAccountId(String(next || ''))}
              options={[
                { value: '', label: 'All accounts' },
                ...accounts.map((a) => ({ value: String(a.id), label: String(a.name || '') })),
              ]}
              placeholder="All accounts"
              showValueSubtext={false}
            />
          </div>
          <div className="min-w-0 sm:w-56">
            <PopupSelect
              label="Period"
      title="periods"
              value={period.period}
              onChange={(next) => period.setPeriod(String(next || 'all'))}
              options={LIST_PERIODS.map((p) => ({ value: p.key, label: p.label }))}
              placeholder="All time"
              showValueSubtext={false}
            />
          </div>

          {/* Only a custom range needs the two dates; a preset has already
              answered them. */}
          {period.period === 'custom' ? (
            <>
              <div>
                <label className="ui-label" htmlFor="cb-from">From</label>
                <input
                  id="cb-from"
                  type="date"
                  className="ui-input"
                  value={period.dateFrom}
                  onChange={(e) => period.setDateFrom(e.target.value)}
                />
              </div>
              <div>
                <label className="ui-label" htmlFor="cb-to">To</label>
                <input
                  id="cb-to"
                  type="date"
                  className="ui-input"
                  value={period.dateTo}
                  onChange={(e) => period.setDateTo(e.target.value)}
                />
              </div>
            </>
          ) : null}
        </div>
      }
    >
      <div className="ui-table-scroll">
        <table className="ui-table ui-table-wide ui-table-sticky">
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Account</th>
              <th scope="col">Ledger name</th>
              <th scope="col">Type</th>
              <th scope="col" className="text-end">Amount</th>
              <th scope="col">Status</th>
              <th scope="col" className="text-end">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <EmptyState
      title="Nothing moved in this window"
                    message="Payments, receipts, transfers between your own accounts and imported bank lines all appear here."
                  />
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const style = TYPE_STYLE[r.type] || TYPE_STYLE.Receipt;
                return (
                  <tr key={r.id}>
                    <td>{r.date}</td>
                    <td>{r.accountName}</td>
                    <td className="truncate">{r.ledgerName}</td>
                    <td>
                      {/* Payment red, Receipt green, Contra blue — the type is
                          read from the colour before the word is read. */}
                      <span className={style.className}>{r.type}</span>
                    </td>
                    <td className={`ui-money ${style.className}`}>
                      {style.sign}
                      {formatMoney(r.amount, currentCompany)}
                    </td>
                    <td>
                      <StatusPill status={r.status} />
                    </td>
                    <td className="text-end">
                      {onOpenSource ? (
                        <button
                          type="button"
                          onClick={() => onOpenSource(r)}
                          className="ui-btn ui-btn-ghost ui-btn-sm"
      title="Open the document this movement came from"
                        >
                          View
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </DocumentListShell>
  );
}
