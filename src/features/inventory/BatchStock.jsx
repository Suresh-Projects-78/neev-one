import React, { useMemo, useState } from 'react';
import { Boxes } from 'lucide-react';
import { PageHeader, EmptyState, StatusPill } from '../../components/ui/Primitives';
import { batchStockRows } from '../../utils/batches';

/**
 * Batch-wise stock and expiry report.
 *
 * Rows come straight from bills (in) and invoices (out) — nothing stored.
 * Expiry chips: Expired, ≤30d, ≤60d, ≤90d. The filter buttons answer the
 * daily warehouse question: "what do I have to move first?"
 */
export default function BatchStock({ db, currentCompany }) {
  const rows = useMemo(() => batchStockRows(db, currentCompany.id), [db, currentCompany.id]);
  const [filter, setFilter] = useState('ALL'); // ALL | EXPIRED | 30 | 60 | 90 | INSTOCK

  const chip = (b) => {
    if (b.days == null) return null;
    if (b.days < 0) return 'Expired';
    if (b.days <= 30) return 'Expiring ≤30d';
    if (b.days <= 60) return 'Expiring ≤60d';
    if (b.days <= 90) return 'Expiring ≤90d';
    return null;
  };

  const shown = rows.filter((b) => {
    if (filter === 'INSTOCK') return b.remaining > 0;
    if (filter === 'EXPIRED') return b.days != null && b.days < 0 && b.remaining > 0;
    if (filter === '30' || filter === '60' || filter === '90') {
      const lim = Number(filter);
      return b.days != null && b.days >= 0 && b.days <= lim && b.remaining > 0;
    }
    return true;
  });

  const counts = {
    expired: rows.filter((b) => b.days != null && b.days < 0 && b.remaining > 0).length,
    d30: rows.filter((b) => b.days != null && b.days >= 0 && b.days <= 30 && b.remaining > 0).length,
    d60: rows.filter((b) => b.days != null && b.days >= 0 && b.days <= 60 && b.remaining > 0).length,
    d90: rows.filter((b) => b.days != null && b.days >= 0 && b.days <= 90 && b.remaining > 0).length,
  };

  const filters = [
    ['ALL', `All (${rows.length})`],
    ['INSTOCK', 'In stock'],
    ['EXPIRED', `Expired (${counts.expired})`],
    ['30', `≤30 days (${counts.d30})`],
    ['60', `≤60 days (${counts.d60})`],
    ['90', `≤90 days (${counts.d90})`],
  ];

  return (
    <div className="space-y-5">
      <PageHeader title="Batch Stock & Expiry" description="Every batch received via bills, consumed by invoices — with what expires when." />

      <div className="flex flex-wrap gap-2">
        {filters.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`ui-btn !h-8 text-xs ${filter === key ? 'ui-btn-primary' : 'ui-btn-secondary'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="ui-card">
          <EmptyState icon={Boxes} title="No batches" description="Receive a batch-tracked item through a purchase bill — the batch appears here." />
        </div>
      ) : (
        <div className="ui-card overflow-x-auto">
          <table className="ui-table w-full">
            <thead>
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-medium ui-muted uppercase">Item</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium ui-muted uppercase">Batch</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium ui-muted uppercase">Mfg</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium ui-muted uppercase">Expiry</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium ui-muted uppercase">In</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium ui-muted uppercase">Out</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium ui-muted uppercase">Balance</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium ui-muted uppercase">Source</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium ui-muted uppercase">Alert</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((b) => (
                <tr key={b.id} className="border-t">
                  <td className="ui-col-entity px-4 py-2.5">{b.itemName}</td>
                  <td className="ui-col-id px-4 py-2.5 font-mono text-sm">{b.batchNo}</td>
                  <td className="ui-col-date px-4 py-2.5">{b.mfgDate || '—'}</td>
                  <td className="ui-col-date px-4 py-2.5">
                    {b.expiryDate || '—'}
                    {b.days != null ? <span className="ui-caption block">{b.days < 0 ? `${-b.days}d ago` : `in ${b.days}d`}</span> : null}
                  </td>
                  <td className="px-4 py-2.5 text-right">{b.qtyIn}</td>
                  <td className="px-4 py-2.5 text-right">{b.qtyOut}</td>
                  <td className="ui-col-amount px-4 py-2.5 text-right font-semibold">{b.remaining}</td>
                  <td className="ui-col-meta px-4 py-2.5 text-sm">{b.sourceBillNumber || '—'}</td>
                  <td className="px-4 py-2.5">{chip(b) ? <StatusPill status={chip(b)} /> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
