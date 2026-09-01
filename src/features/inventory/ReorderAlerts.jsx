import React, { useMemo, useState } from 'react';
import { PackageSearch } from 'lucide-react';
import { PageHeader, EmptyState } from '../../components/ui/Primitives';
import { ListToolbar, exportRows, useListSearch } from '../../components/ListToolbar';
import { notify } from '../../components/ui/notify';
import { formatMoney } from '../../utils/money';
import { computeInventorySummaryByItemId, isStockItem } from '../../utils/inventory';
import { createDocApi, hasApiSession } from '../../api/purchaseDocs';
import { getVendorDisplayName } from '../../utils/contacts';

/**
 * Reorder alerts — inventory as buying decisions.
 *
 * Every stock item with a reorder level whose closing quantity has fallen to
 * or below it. Suggested order = enough to reach 2× the reorder level. One
 * click drafts a PO to the vendor who last supplied the item.
 */
export default function ReorderAlerts({ db, setDb, currentCompany }) {
  const companyId = currentCompany.id;
  const [busyId, setBusyId] = useState(null);

  const rows = useMemo(() => {
    const summary = computeInventorySummaryByItemId({ db, companyId });
    const items = (db.items || []).filter((i) => i.companyId === companyId && isStockItem(i) && Number(i.reorderLevel) > 0);

    /** Most recent bill line per item decides the "last vendor" and rate. */
    const lastByItem = new Map();
    const bills = (db.bills || [])
      .filter((b) => b.companyId === companyId && String(b.status || '').toLowerCase() !== 'cancelled')
      .slice()
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    for (const bill of bills) {
      for (const l of bill.items || []) {
        const k = String(l.itemId);
        if (!lastByItem.has(k)) lastByItem.set(k, { vendorId: bill.vendorId, vendorName: bill.vendorName, rate: Number(l.rate) || 0 });
      }
    }

    return items
      .map((i) => {
        const closing = Number(summary.get(String(i.id))?.closingQty ?? 0);
        const level = Number(i.reorderLevel);
        return {
          item: i,
          closing,
          level,
          suggestedQty: Math.max(1, Math.ceil(level * 2 - closing)),
          last: lastByItem.get(String(i.id)) || null,
        };
      })
      .filter((r) => r.closing <= r.level)
      .sort((a, b) => a.closing - b.closing);
  }, [db, companyId]);

  const draftPo = async (row) => {
    const vendor = row.last
      ? (db.vendors || []).find((v) => v.companyId === companyId && Number(v.id) === Number(row.last.vendorId))
      : null;
    const vendorName = vendor ? getVendorDisplayName(vendor) : row.last?.vendorName || 'To be decided';
    const rate = row.last?.rate || Number(row.item.purchasePrice) || 0;
    const line = {
      itemId: String(row.item.id),
      description: row.item.name,
      quantity: row.suggestedQty,
      rate,
      gstRate: Number(row.item.gstRate) || 0,
      hsnSac: row.item.hsnSac || '',
      taxableAmount: row.suggestedQty * rate,
      lineTotal: row.suggestedQty * rate,
    };

    setBusyId(row.item.id);
    try {
      let backendDocId = null;
      let serverNumber = '';
      if (hasApiSession()) {
        try {
          const saved = await createDocApi('purchaseOrder', {
            date: new Date().toISOString().slice(0, 10),
            partyId: vendor?.backendPartyId ? String(vendor.backendPartyId) : null,
            partyName: vendorName,
            subtotal: line.taxableAmount,
            gstTotal: 0,
            total: line.taxableAmount,
            status: 'Draft',
            notes: `Auto-drafted from reorder alert (stock ${row.closing} ≤ level ${row.level})`,
            items: [line],
          });
          backendDocId = saved?.id || null;
          serverNumber = String(saved?.number || '');
        } catch (err) {
          notify.error(String(err?.message || 'PO not saved to the server.'));
          return;
        }
      }
      const nextId = (db.purchaseOrders || []).reduce((m, p) => Math.max(m, Number(p.id) || 0), 0) + 1;
      setDb((prev) => ({
        ...prev,
        purchaseOrders: [
          ...(prev.purchaseOrders || []),
          {
            id: nextId,
            companyId,
            backendDocId,
            number: serverNumber || `PO-${nextId}`,
            date: new Date().toISOString().slice(0, 10),
            vendorId: row.last?.vendorId ?? '',
            vendorName,
            items: [line],
            subtotal: line.taxableAmount,
            gstTotal: 0,
            total: line.taxableAmount,
            status: 'Draft',
            notes: `Reorder: ${row.item.name}`,
            createdAt: new Date().toISOString(),
          },
        ],
      }));
      notify.success(`Draft PO ${serverNumber || `PO-${nextId}`} — ${row.suggestedQty} × ${row.item.name} to ${vendorName}.`);
    } finally {
      setBusyId(null);
    }
  };

  const raSearch = useListSearch(rows, ['name', 'lastVendorName']);
  const raSearchRows = raSearch.filtered;
  return (
    <div className="space-y-5">
      <PageHeader
        title="Reorder Alerts"
        description="Stock items at or below their reorder level. Suggested order refills to 2× the level; one click drafts the PO to the last supplier."
      />

      <ListToolbar
        search={raSearch.query}
        onSearch={raSearch.setQuery}
        placeholder="Search items (name, vendor)"
        count={raSearchRows.length}
        countLabel="items"
        onExport={() =>
          exportRows({
            fileName: `ReorderAlerts_${currentCompany?.name || 'company'}`,
            label: 'alert(s)',
            columns: [
              { key: 'name', label: 'Item' },
              { key: 'inStock', label: 'In stock', value: (r) => Number(r.inStock ?? r.stock ?? 0) },
              { key: 'reorderLevel', label: 'Reorder level', value: (r) => Number(r.reorderLevel || 0) },
              { key: 'suggestedQty', label: 'Suggested qty', value: (r) => Number(r.suggestedQty || 0) },
              { key: 'lastVendorName', label: 'Last vendor' },
              { key: 'lastRate', label: 'Last rate', value: (r) => Number(r.lastRate || 0) },
            ],
            rows: raSearchRows,
          })
        }
        exportTitle="Reorder Alerts"
        exportFileName={`ReorderAlerts_${currentCompany?.name || 'company'}`}
        exportSheetName="Reorder Alerts"
        exportColumns={[
              { key: 'name', label: 'Item' },
              { key: 'inStock', label: 'In stock', value: (r) => Number(r.inStock ?? r.stock ?? 0) },
              { key: 'reorderLevel', label: 'Reorder level', value: (r) => Number(r.reorderLevel || 0) },
              { key: 'suggestedQty', label: 'Suggested qty', value: (r) => Number(r.suggestedQty || 0) },
              { key: 'lastVendorName', label: 'Last vendor' },
              { key: 'lastRate', label: 'Last rate', value: (r) => Number(r.lastRate || 0) },
        ]}
        exportRows={raSearchRows}
      />

      {rows.length === 0 ? (
        <div className="ui-card">
          <EmptyState
            icon={PackageSearch}
            title="Nothing below reorder level"
            description="Set a reorder level on items (Items → Edit) — anything falling to it appears here."
          />
        </div>
      ) : (
        <div className="ui-card overflow-x-auto">
          <table className="ui-table w-full">
            <thead>
              <tr>
                <th className="ui-th">Item</th>
                <th className="ui-th ui-num">In stock</th>
                <th className="ui-th ui-num">Reorder level</th>
                <th className="ui-th ui-num">Suggested qty</th>
                <th className="ui-th">Last vendor</th>
                <th className="ui-th ui-num">Last rate</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {raSearchRows.map((r) => (
                <tr key={r.item.id} className="border-t">
                  <td className="ui-col-entity px-4 py-2.5 font-medium">{r.item.name}</td>
                  <td className={`px-4 py-2.5 text-right font-semibold ${r.closing <= 0 ? 'ui-amount-neg' : ''}`}>{r.closing}</td>
                  <td className="px-4 py-2.5 text-right">{r.level}</td>
                  <td className="px-4 py-2.5 text-right font-semibold">{r.suggestedQty}</td>
                  <td className="ui-col-entity px-4 py-2.5">{r.last?.vendorName || '—'}</td>
                  <td className="ui-col-amount px-4 py-2.5 text-right">{r.last ? formatMoney(r.last.rate, currentCompany) : '—'}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button type="button" onClick={() => draftPo(r)} disabled={busyId === r.item.id} className="ui-btn ui-btn-secondary ui-btn-sm text-xs">
                      {busyId === r.item.id ? 'Drafting…' : 'Draft PO'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
