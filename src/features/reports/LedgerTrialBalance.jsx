import React, { useEffect, useState } from 'react';
import { BookOpen, RefreshCw } from 'lucide-react';

import { getTrialBalance } from '../../api/ledger';
import { EmptyState, PageHeader, Spinner } from '../../components/ui/Primitives';
import { formatMoney } from '../../utils/money';

/**
 * Trial balance from the general ledger.
 *
 * Distinct from the older report of the same name, which recomputes from
 * vouchers held in the browser. This reads posted journal lines, so it is the
 * one that must foot to zero.
 */
export const LedgerTrialBalance = ({ currentCompany }) => {
  const [data, setData] = useState(null);
  const [allBranches, setAllBranches] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = (scope = allBranches) => {
    setLoading(true);
    setError('');
    return getTrialBalance(scope)
      .then(setData)
      .catch((e) => setError(String(e?.message || e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load(allBranches);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allBranches]);

  const totals = data?.totals;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Trial Balance"
        description="From posted journal entries. Debits and credits must agree exactly."
        actions={
          <>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={allBranches} onChange={(e) => setAllBranches(e.target.checked)} />
              All branches
            </label>
            <button type="button" className="ui-btn ui-btn-secondary" onClick={() => load()}>
              <RefreshCw size={15} aria-hidden="true" /> Refresh
            </button>
          </>
        }
      />

      {error ? (
        <div
          className="ui-card p-3 text-sm"
          role="alert"
          style={{ borderColor: 'rgb(var(--neg))', color: 'rgb(var(--neg))' }}
        >
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="ui-card p-8 flex items-center justify-center gap-3">
          <Spinner />
          <span className="ui-muted text-sm">Loading…</span>
        </div>
      ) : !data?.rows?.length ? (
        <div className="ui-card">
          <EmptyState
            icon={BookOpen}
            title="Nothing posted yet"
            description="Once a document posts to the ledger its accounts appear here."
          />
        </div>
      ) : (
        <>
          <div className="ui-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="ui-table">
                <thead>
                  <tr>
                    <th scope="col">Code</th>
                    <th scope="col">Account</th>
                    <th scope="col">Type</th>
                    <th scope="col" className="ui-num">Debit</th>
                    <th scope="col" className="ui-num">Credit</th>
                    <th scope="col" className="ui-num">Closing</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.accountId}>
                      <td className="ui-mono">{r.code}</td>
                      <td className="font-medium">{r.name}</td>
                      <td className="ui-muted text-xs">{r.accountType}</td>
                      <td className="ui-num ui-amount">{r.debit ? formatMoney(r.debit, currentCompany) : '—'}</td>
                      <td className="ui-num ui-amount">{r.credit ? formatMoney(r.credit, currentCompany) : '—'}</td>
                      <td className="ui-num ui-amount">
                        {r.closingDebit
                          ? `${formatMoney(r.closingDebit, currentCompany)} Dr`
                          : r.closingCredit
                          ? `${formatMoney(r.closingCredit, currentCompany)} Cr`
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="ui-card p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-6 text-sm">
              <span>
                <span className="ui-muted">Total debit </span>
                <span className="ui-amount">{formatMoney(totals.debit, currentCompany)}</span>
              </span>
              <span>
                <span className="ui-muted">Total credit </span>
                <span className="ui-amount">{formatMoney(totals.credit, currentCompany)}</span>
              </span>
            </div>
            {totals.balanced ? (
              <span className="ui-pill ui-pill-pos">Balanced</span>
            ) : (
              <span className="ui-pill ui-pill-neg">
                Out by {formatMoney(Math.abs(totals.difference), currentCompany)}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default LedgerTrialBalance;
