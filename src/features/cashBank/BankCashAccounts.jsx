import { useMemo, useState } from 'react';
import { Banknote, Landmark, ListChecks, PieChart, Plus } from 'lucide-react';

import DocumentListShell from '../../components/list/DocumentListShell';
import { EmptyState, StatusPill } from '../../components/ui/Primitives';
import { buildLedgerStatement } from '../../data/db';
import { formatMoney } from '../../utils/money';

/**
 * Where the money is.
 *
 * The module's first screen, and deliberately a master rather than a second
 * ledger system: every row here IS a ledger in the chart of accounts, under
 * Bank Accounts or Cash-in-Hand. Nothing is stored twice — the name, the bank
 * details and the branch are the ledger's own, and the balance is what the
 * ledger says it is, built from the same statement the Ledgers screen shows.
 *
 * That is the whole reason this screen can be trusted: there is no separate
 * "bank balance" that can drift from the books.
 */

const lower = (s) => String(s || '').trim().toLowerCase();

/** Whether a group, or anything above it, is named `rootLowerName`. */
const isUnderNamedRoot = (groupById, groupId, rootLowerName) => {
  let cur = groupById.get(String(groupId || '')) || null;
  const seen = new Set();
  while (cur && !seen.has(String(cur.id))) {
    seen.add(String(cur.id));
    if (lower(cur.name) === rootLowerName) return true;
    const pid = cur.parentGroupId;
    if (pid === null || pid === undefined || pid === '') return false;
    cur = groupById.get(String(pid)) || null;
  }
  return false;
};

/**
 * The accounts this module is about, with what each one is worth.
 *
 * Cash and bank are told apart by the group the ledger sits under, not by a
 * flag on the row: the chart is where a company already said which is which,
 * and a second answer here is a second answer to disagree with.
 */
export const cashBankAccounts = (db, companyId) => {
  const cid = Number(companyId);
  const groups = (Array.isArray(db?.accountGroups) ? db.accountGroups : []).filter(
    (g) => Number(g?.companyId) === cid
  );
  const groupById = new Map(groups.map((g) => [String(g.id), g]));

  return (Array.isArray(db?.chartOfAccounts) ? db.chartOfAccounts : [])
    .filter((a) => Number(a?.companyId) === cid)
    .map((a) => {
      const bank = isUnderNamedRoot(groupById, a.groupId, 'bank accounts');
      const cash = isUnderNamedRoot(groupById, a.groupId, 'cash-in-hand');
      if (!bank && !cash) return null;
      const statement = buildLedgerStatement(db, cid, a.id);
      const rows = Array.isArray(statement?.rows) ? statement.rows : [];
      const balance = rows.length
        ? Number(rows[rows.length - 1]?.runningBalance || 0)
        : Number(statement?.openingBalance || 0);
      return {
        id: a.id,
        name: String(a.name || '').trim(),
        type: bank ? 'Bank' : 'Cash',
        /* The ledger master keeps these under `bankDetails`; older rows kept
           them flat, and both are still in the wild. */
        bankName: String(a.bankDetails?.bankName || a.bankName || '').trim(),
        accountNumber: String(a.bankDetails?.accountNumber || a.bankAccountNumber || '').trim(),
        branch: String(a.bankDetails?.branch || a.bankDetails?.branchAddress || '').trim(),
        balance,
        isActive: a.isActive !== false,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
};

const TABS = [
  { value: 'all', label: 'All', tone: 'all' },
  { value: 'bank', label: 'Bank Accounts', tone: 'sent' },
  { value: 'cash', label: 'Cash Accounts', tone: 'paid' },
  { value: 'inactive', label: 'Inactive', tone: 'draft' },
];

export default function BankCashAccounts({ db, currentCompany, onAddAccount = null, onOpenAccount = null }) {
  const [tab, setTab] = useState('all');

  const accounts = useMemo(() => cashBankAccounts(db, currentCompany?.id), [db, currentCompany?.id]);

  const summary = useMemo(() => {
    const live = accounts.filter((a) => a.isActive);
    return {
      bank: live.filter((a) => a.type === 'Bank').reduce((t, a) => t + a.balance, 0),
      cash: live.filter((a) => a.type === 'Cash').reduce((t, a) => t + a.balance, 0),
      total: accounts.length,
      active: live.length,
    };
  }, [accounts]);

  const counts = useMemo(
    () => ({
      all: accounts.length,
      bank: accounts.filter((a) => a.isActive && a.type === 'Bank').length,
      cash: accounts.filter((a) => a.isActive && a.type === 'Cash').length,
      inactive: accounts.filter((a) => !a.isActive).length,
    }),
    [accounts]
  );

  /* The three live tabs show live accounts only — a closed account belongs
     under Inactive, not in the middle of the list of places money is. */
  const rows = useMemo(() => {
    if (tab === 'inactive') return accounts.filter((a) => !a.isActive);
    const live = accounts.filter((a) => a.isActive);
    if (tab === 'bank') return live.filter((a) => a.type === 'Bank');
    if (tab === 'cash') return live.filter((a) => a.type === 'Cash');
    return live;
  }, [accounts, tab]);

  return (
    <DocumentListShell
      title="Bank & Cash Accounts"
      description="View and manage all your bank and cash accounts."
      company={currentCompany}
      primary={
        onAddAccount ? (
          <button type="button" onClick={() => onAddAccount()} className="ui-btn ui-btn-primary">
            <Plus size={16} aria-hidden="true" /> Add Account
          </button>
        ) : null
      }
      cards={[
        { label: 'Total bank balance', value: summary.bank, tone: 'sent', Icon: Landmark },
        { label: 'Total cash balance', value: summary.cash, tone: 'paid', Icon: Banknote },
        { label: 'Total accounts', value: summary.total, count: true, tone: 'draft', Icon: ListChecks },
        { label: 'Active accounts', value: summary.active, count: true, tone: 'all', Icon: PieChart },
      ]}
      tabs={TABS}
      tabsLabel="Accounts"
      statusValue={tab}
      statusCounts={counts}
      onStatusChange={setTab}
    >
      <div className="ui-table-scroll">
        <table className="ui-table ui-table-wide ui-table-sticky">
          <thead>
            <tr>
              <th scope="col">Account name</th>
              <th scope="col">Type</th>
              <th scope="col">Bank name</th>
              <th scope="col">Account number</th>
              <th scope="col">Branch</th>
              <th scope="col" className="text-end">Current balance</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <EmptyState
                    title="No accounts here yet"
                    message="A bank or cash account is a ledger under Bank Accounts or Cash-in-Hand. Add one and it appears here with its balance."
                  />
                </td>
              </tr>
            ) : (
              rows.map((a) => (
                <tr key={a.id}>
                  <td>
                    {onOpenAccount ? (
                      <button
                        type="button"
                        onClick={() => onOpenAccount(a.id)}
                        className="text-start underline-offset-2 hover:underline"
                        style={{ color: 'rgb(var(--brand-ink))' }}
                      >
                        {a.name}
                      </button>
                    ) : (
                      a.name
                    )}
                  </td>
                  <td>
                    <StatusPill status={a.type} />
                  </td>
                  <td>{a.bankName || '—'}</td>
                  {/* An account number is read digit by digit against a
                      cheque book, so it is set in the same face as the money. */}
                  <td className="ui-mono">{a.accountNumber || '—'}</td>
                  <td>{a.branch || '—'}</td>
                  <td className="ui-money">{formatMoney(a.balance, currentCompany)}</td>
                  <td>
                    <StatusPill status={a.isActive ? 'Active' : 'Inactive'} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </DocumentListShell>
  );
}
