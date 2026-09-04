import React, { useMemo, useState } from 'react';
import { Boxes } from 'lucide-react';
import { PageHeader, EmptyState, StatusPill } from '../../components/ui/Primitives';
import { ListToolbar, exportRows, useListSearch } from '../../components/ListToolbar';
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

  const bsSearch = useListSearch(shown, ['itemName', 'batchNo', 'expiryDate', 'source']);
  const bsSearchRows = bsSearch.filtered;
  return (
    <div className="space-y-5">
      <PageHeader title="Batch Stock & Expiry" description="Every batch received via bills, consumed by invoices — with what expires when." />

      <div className="flex flex-wrap gap-2">
        {filters.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`ui-btn ui-btn-sm ${filter === key ? 'ui-btn-primary' : 'ui-btn-secondary'}`}
          >
            {label}
          </button>
        ))}
      </div>

      <ListToolbar
        search={bsSearch.query}
        onSearch={bsSearch.setQuery}
        placeholder="Search batches (item, batch no, expiry)"
        count={bsSearchRows.length}
        countLabel="batches"
        onExport={() =>
          exportRows({
            fileName: `BatchStock_${currentCompany?.name || 'company'}`,
            label: 'batch(es)',
            columns: [
              { key: 'itemName', label: 'Item' },
              { key: 'batchNo', label: 'Batch' },
              { key: 'mfgDate', label: 'Mfg' },
              { key: 'expiryDate', label: 'Expiry' },
              { key: 'inQty', label: 'In', value: (r) => Number(r.inQty || 0) },
              { key: 'outQty', label: 'Out', value: (r) => Number(r.outQty || 0) },
              { key: 'balance', label: 'Balance', value: (r) => Number(r.balance ?? r.remaining ?? 0) },
            ],
            rows: bsSearchRows,
          })
        }
        exportTitle="Batch Stock"
        exportFileName={`BatchStock_${currentCompany?.name || 'company'}`}
        exportSheetName="Batch Stock"
        exportColumns={[
              { key: 'itemName', label: 'Item' },
              { key: 'batchNo', label: 'Batch' },
              { key: 'mfgDate', label: 'Mfg' },
              { key: 'expiryDate', label: 'Expiry' },
              { key: 'inQty', label: 'In', value: (r) => Number(r.inQty || 0) },
              { key: 'outQty', label: 'Out', value: (r) => Number(r.outQty || 0) },
              { key: 'balance', label: 'Balance', value: (r) => Number(r.balance ?? r.remaining ?? 0) },
        ]}
        exportRows={bsSearchRows}
      />

      {shown.length === 0 ? (
        <div className="ui-card">
          <EmptyState icon={Boxes} title="No batches" description="Receive a batch-tracked item through a purchase bill — the batch appears here." />
        </div>
      ) : (
        <div className="ui-card overflow-x-auto">
          <table className="ui-table w-full">
            <thead>
              <tr>
                <th className="ui-th">Item</th>
                <th className="ui-th">Batch</th>
                <th className="ui-th">Mfg</th>
                <th className="ui-th">Expiry</th>
                <th className="ui-th ui-num">In</th>
                <th className="ui-th ui-num">Out</th>
                <th className="ui-th ui-num">Balance</th>
                <th className="ui-th">Source</th>
                <th className="ui-th">Alert</th>
              </tr>
            </thead>
            <tbody>
              {bsSearchRows.map((b) => (
                <tr key={b.id} className="border-t">
                  <td className="ui-col-entity px-4 py-2.5">{b.itemName}</td>
                  <td className="ui-col-id px-4 py-2.5 font-mono">{b.batchNo}</td>
                  <td className="ui-col-date px-4 py-2.5">{b.mfgDate || '—'}</td>
                  <td className="ui-col-date px-4 py-2.5">
                    {b.expiryDate || '—'}
                    {b.days != null ? <span className="ui-caption block">{b.days < 0 ? `${-b.days}d ago` : `in ${b.days}d`}</span> : null}
                  </td>
                  <td className="px-4 py-2.5 text-right">{b.qtyIn}</td>
                  <td className="px-4 py-2.5 text-right">{b.qtyOut}</td>
                  <td className="ui-col-amount px-4 py-2.5 text-right">{b.remaining}</td>
                  <td className="ui-col-meta px-4 py-2.5">{b.sourceBillNumber || '—'}</td>
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
