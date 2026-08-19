import React, { useMemo, useState } from 'react';
import { notify } from '../../components/ui/notify';

import { Boxes, PackageX, TrendingDown, Warehouse } from 'lucide-react';

import { formatMoney, formatMoneyCompact, round2 } from '../../utils/money';
import { StatTile } from '../../components/ui/Primitives';
import { buildItemStockLedger, computeInventorySummaryByItemId, isStockItem } from '../../utils/inventory';

const safeArray = (v) => (Array.isArray(v) ? v : []);

const ItemLedgerView = ({ db, currentCompany, itemId, fromDate, toDate, warehouseId }) => {
  const companyId = currentCompany.id;

  const ledger = useMemo(
    () => buildItemStockLedger({ db, companyId, itemId, fromDate, toDate, warehouseId }),
    [db, companyId, itemId, fromDate, toDate, warehouseId]
  );

  if (!ledger.item) {
    return <div className="ui-muted">Item not found</div>;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <div className="ui-muted">Item</div>
          <div className="font-semibold">{ledger.item.name}</div>
        </div>
        <div>
          <div className="ui-muted">Opening Qty</div>
          <div className="font-semibold">
            {ledger.openingQty} {ledger.item.unit || ''}
          </div>
        </div>
      </div>

      <div className="ui-surface rounded-xl shadow-sm overflow-hidden border">
        <table className="ui-table w-full">
          <thead className="ui-sunken border-b">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium ui-muted uppercase">Date</th>
              <th className="px-4 py-3 text-left text-xs font-medium ui-muted uppercase">Voucher</th>
              <th className="px-4 py-3 text-left text-xs font-medium ui-muted uppercase">Number</th>
              <th className="px-4 py-3 text-right text-xs font-medium ui-muted uppercase">In</th>
              <th className="px-4 py-3 text-right text-xs font-medium ui-muted uppercase">Out</th>
              <th className="px-4 py-3 text-right text-xs font-medium ui-muted uppercase">Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {ledger.rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-10 text-center ui-muted">
                  No movements
                </td>
              </tr>
            ) : (
              ledger.rows.map((r, idx) => (
                <tr key={idx} className="ui-hover-sunken">
                  <td className="ui-col-date px-4 py-3">{r.date || '-'}</td>
                  <td className="ui-col-id px-4 py-3">
                    <div>{String(r.voucherType || '')}</div>
                    {r.voucherNote ? <div className="text-xs ui-muted">{String(r.voucherNote)}</div> : null}
                  </td>
                  <td className="ui-col-meta px-4 py-3">{r.voucherNumber || '-'}</td>
                  <td className="ui-col-meta px-4 py-3 text-right">{r.qtyIn ? r.qtyIn : '-'}</td>
                  <td className="ui-col-meta px-4 py-3 text-right">{r.qtyOut ? r.qtyOut : '-'}</td>
                  <td className="ui-col-meta px-4 py-3 text-right font-semibold">{r.balanceQty}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const InventoryModule = ({ db, openModal, currentCompany, warehouses = [] }) => {
  const companyId = currentCompany.id;

  const [viewMode, setViewMode] = useState('qty');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [warehouseId, setWarehouseId] = useState(''); // '' => All warehouses

  const warehouseOptions = useMemo(() => {
    const list = safeArray(warehouses);
    return list.slice().sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')));
  }, [warehouses]);

  const items = useMemo(() => {
    return safeArray(db.items)
      .filter((i) => i.companyId === companyId)
      .filter((i) => isStockItem(i))
      .slice()
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  }, [db.items, companyId]);

  const summaryByItemId = useMemo(() => {
    return computeInventorySummaryByItemId({ db, companyId, fromDate, toDate, warehouseId });
  }, [db, companyId, fromDate, toDate, warehouseId]);

  const columnTotals = useMemo(() => {
    const totals = {
      opening: 0,
      purchases: 0,
      sales: 0,
      dn: 0,
      cn: 0,
      closing: 0,
    };

    for (const it of items) {
      const row = summaryByItemId.get(String(it.id));
      if (!row) continue;

      const openingQty = Number(row.openingQty ?? 0);
      const purchasesQty = Number(row.purchasesQty ?? 0);
      const salesQty = Number(row.salesQty ?? 0);
      const dnQty = Number(row.debitNoteQty ?? 0);
      const cnQty = Number(row.creditNoteQty ?? 0);
      const closingQty = Number(row.closingQty ?? 0);

      if (viewMode === 'value') {
        const rate = Number(it.purchasePrice ?? 0);
        const safeRate = Number.isFinite(rate) ? rate : 0;
        totals.opening = round2(totals.opening + openingQty * safeRate);
        totals.purchases = round2(totals.purchases + purchasesQty * safeRate);
        totals.sales = round2(totals.sales + salesQty * safeRate);
        totals.dn = round2(totals.dn + dnQty * safeRate);
        totals.cn = round2(totals.cn + cnQty * safeRate);
        totals.closing = round2(totals.closing + closingQty * safeRate);
      } else {
        totals.opening = round2(totals.opening + openingQty);
        totals.purchases = round2(totals.purchases + purchasesQty);
        totals.sales = round2(totals.sales + salesQty);
        totals.dn = round2(totals.dn + dnQty);
        totals.cn = round2(totals.cn + cnQty);
        totals.closing = round2(totals.closing + closingQty);
      }
    }

    return totals;
  }, [items, summaryByItemId, viewMode]);

  const fmtTotal = (v) => {
    if (viewMode === 'value') return formatMoney(Number(v || 0), currentCompany);
    return String(Number(v || 0));
  };

  const openLedger = (item) => {
    openModal(
      <ItemLedgerView db={db} currentCompany={currentCompany} itemId={item.id} fromDate={fromDate} toDate={toDate} warehouseId={warehouseId} />,
      { title: 'Stock Ledger', maxWidthClass: 'max-w-5xl' }
    );
  };

  const exportCsv = () => {
    const colsQty = ['Item', 'Code', 'Unit', 'Opening Qty', 'Purchases Qty', 'Sales Qty', 'DN Qty', 'CN Qty', 'Closing Qty'];
    const colsVal = ['Item', 'Code', 'Unit', 'Opening Value', 'Purchases Value', 'Sales Value', 'DN Value', 'CN Value', 'Closing Value'];

    const header = viewMode === 'value' ? colsVal : colsQty;
    const rows = [header];

    for (const it of items) {
      const row = summaryByItemId.get(String(it.id));
      const unit = String(it.unit || '').trim();
      const rate = Number(it.purchasePrice ?? 0);
      const safeRate = Number.isFinite(rate) ? rate : 0;

      if (viewMode === 'value') {
        const opening = round2(Number(row?.openingQty ?? 0) * safeRate);
        const purchases = round2(Number(row?.purchasesQty ?? 0) * safeRate);
        const sales = round2(Number(row?.salesQty ?? 0) * safeRate);
        const dn = round2(Number(row?.debitNoteQty ?? 0) * safeRate);
        const cn = round2(Number(row?.creditNoteQty ?? 0) * safeRate);
        const closing = round2(Number(row?.closingQty ?? 0) * safeRate);
        rows.push([it.name || '', it.code || '', unit, opening, purchases, sales, dn, cn, closing]);
      } else {
        rows.push([
          it.name || '',
          it.code || '',
          unit,
          Number(row?.openingQty ?? 0),
          Number(row?.purchasesQty ?? 0),
          Number(row?.salesQty ?? 0),
          Number(row?.debitNoteQty ?? 0),
          Number(row?.creditNoteQty ?? 0),
          Number(row?.closingQty ?? 0),
        ]);
      }
    }

    const escape = (v) => {
      const s = String(v ?? '');
      return s.includes(',') || s.includes('\n') || s.includes('"') ? `"${s.replaceAll('"', '""')}"` : s;
    };
    const csv = rows.map((r) => r.map(escape).join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const name = `inventory_${viewMode}_${fromDate || 'all'}_${toDate || 'all'}.csv`;
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const exportPdf = () => {
    const title = `Inventory (${viewMode === 'value' ? 'Value' : 'Qty'})`;
    const subtitle = `Period: ${fromDate || 'Start'} to ${toDate || 'End'}`;

    const rows = items
      .map((it) => {
        const r = summaryByItemId.get(String(it.id));
        const unit = String(it.unit || '').trim();
        const rate = Number(it.purchasePrice ?? 0);
        const safeRate = Number.isFinite(rate) ? rate : 0;

        if (viewMode === 'value') {
          return {
            name: it.name || '',
            code: it.code || '',
            unit,
            opening: round2(Number(r?.openingQty ?? 0) * safeRate),
            purchases: round2(Number(r?.purchasesQty ?? 0) * safeRate),
            sales: round2(Number(r?.salesQty ?? 0) * safeRate),
            dn: round2(Number(r?.debitNoteQty ?? 0) * safeRate),
            cn: round2(Number(r?.creditNoteQty ?? 0) * safeRate),
            closing: round2(Number(r?.closingQty ?? 0) * safeRate),
          };
        }

        return {
          name: it.name || '',
          code: it.code || '',
          unit,
          opening: Number(r?.openingQty ?? 0),
          purchases: Number(r?.purchasesQty ?? 0),
          sales: Number(r?.salesQty ?? 0),
          dn: Number(r?.debitNoteQty ?? 0),
          cn: Number(r?.creditNoteQty ?? 0),
          closing: Number(r?.closingQty ?? 0),
        };
      })
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));

    const moneyOrNum = (v) => (viewMode === 'value' ? formatMoney(Number(v || 0), currentCompany) : String(v ?? ''));

    const html = `<!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${title}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 16px; }
            h1 { font-size: 18px; margin: 0 0 4px 0; }
            .sub { color: #555; font-size: 12px; margin: 0 0 12px 0; }
            table { border-collapse: collapse; width: 100%; font-size: 12px; }
            th, td { border: 1px solid #ddd; padding: 6px; }
            th { background: #f5f5f5; text-align: left; }
            td.num { text-align: right; }
          </style>
        </head>
        <body>
          <h1>${title}</h1>
          <div class="sub">${subtitle}</div>
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Code</th>
                <th>Unit</th>
                <th class="num">Opening</th>
                <th class="num">Purchases</th>
                <th class="num">Sales</th>
                <th class="num">DN</th>
                <th class="num">CN</th>
                <th class="num">Closing</th>
              </tr>
            </thead>
            <tbody>
              ${rows
                .map(
                  (r) => `
                    <tr>
                      <td className="ui-col-meta">${String(r.name).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</td>
                      <td className="ui-col-meta">${String(r.code).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</td>
                      <td className="ui-col-meta">${String(r.unit).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</td>
                      <td className="ui-col-meta" class="num">${moneyOrNum(r.opening)}</td>
                      <td className="ui-col-meta" class="num">${moneyOrNum(r.purchases)}</td>
                      <td className="ui-col-meta" class="num">${moneyOrNum(r.sales)}</td>
                      <td className="ui-col-meta" class="num">${moneyOrNum(r.dn)}</td>
                      <td className="ui-col-meta" class="num">${moneyOrNum(r.cn)}</td>
                      <td className="ui-col-meta" class="num">${moneyOrNum(r.closing)}</td>
                    </tr>
                  `
                )
                .join('')}
            </tbody>
          </table>
        </body>
      </html>`;

    const w = window.open('', '_blank');
    if (!w) {
      notify.error('Popup blocked. Please allow popups to export PDF.');
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  };

  const stockKpis = useMemo(() => {
    let stockValue = 0;
    let outOfStock = 0;
    let negative = 0;
    for (const it of items) {
      const row = summaryByItemId.get(String(it.id));
      const closing = Number(row?.closingQty ?? 0);
      const rate = Number(it.purchasePrice ?? 0);
      stockValue += closing * (Number.isFinite(rate) ? rate : 0);
      if (closing === 0) outOfStock += 1;
      if (closing < 0) negative += 1;
    }
    return { stockValue: round2(stockValue), outOfStock, negative };
  }, [items, summaryByItemId]);

  return (
    <div className="space-y-6">
      {items.length > 0 ? (
        <div className="ui-stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            label="Stock value"
            amount={stockKpis.stockValue}
            format={(v) => formatMoneyCompact(v, currentCompany)}
            title={formatMoney(stockKpis.stockValue, currentCompany)}
            hint="Closing quantity at purchase price"
            icon={Warehouse}
            tint="inventory"
          />
          <StatTile
            label="Stock items"
            value={String(items.length)}
            hint="Tracked for quantity"
            icon={Boxes}
            tint="inventory"
          />
          <StatTile
            label="Out of stock"
            value={String(stockKpis.outOfStock)}
            hint={stockKpis.outOfStock ? 'Closing quantity is zero' : 'Everything in stock'}
            tone={stockKpis.outOfStock ? 'neg' : 'neutral'}
            icon={PackageX}
            tint="inventory"
          />
          <StatTile
            label="Negative stock"
            value={String(stockKpis.negative)}
            hint={stockKpis.negative ? 'Sold below recorded stock — investigate' : 'None'}
            tone={stockKpis.negative ? 'neg' : 'neutral'}
            icon={TrendingDown}
            tint="inventory"
          />
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="text-sm font-medium">View:</div>
          <select
            value={viewMode}
            onChange={(e) => setViewMode(e.target.value)}
            className="ui-select px-3 py-2"
          >
            <option value="qty">Qty</option>
            <option value="value">Value</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <div className="text-sm font-medium">Warehouse:</div>
          <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className="ui-select px-3 py-2">
            <option value="">All Warehouses</option>
            {warehouseOptions.map((w) => (
              <option key={String(w.id)} value={String(w.id)}>
                {w.name || `Warehouse ${w.id}`}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="text-sm font-medium">Period:</div>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="ui-input !h-9 !min-h-0 !w-[9.5rem] px-2 text-sm" />
          <span className="ui-subtle">to</span>
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="ui-input !h-9 !min-h-0 !w-[9.5rem] px-2 text-sm" />
          <button
            type="button"
            onClick={() => {
              setFromDate('');
              setToDate('');
            }}
            className="px-3 py-2 border rounded-lg ui-hover-sunken"
          >
            Clear
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button type="button" onClick={exportPdf} className="px-3 py-2 border rounded-lg ui-hover-sunken">
            Export PDF
          </button>
          <button type="button" onClick={exportCsv} className="px-3 py-2 ui-btn ui-btn-primary rounded-lg ">
            Export Excel
          </button>
        </div>
      </div>
      <div className="ui-surface rounded-xl shadow-sm overflow-hidden border">
        <table className="ui-table w-full">
          <thead className="ui-sunken border-b">
            <tr>
              <th className="px-6 py-3 text-left">
                <div className="text-xs text-transparent">0</div>
                <div className="text-xs font-medium ui-muted uppercase">Item</div>
              </th>
              <th className="px-6 py-3 text-right">
                <div className="text-xs ui-subtle">{fmtTotal(columnTotals.opening)}</div>
                <div className="text-xs font-medium ui-muted uppercase">Opening</div>
              </th>
              <th className="px-6 py-3 text-right">
                <div className="text-xs ui-subtle">{fmtTotal(columnTotals.purchases)}</div>
                <div className="text-xs font-medium ui-muted uppercase">Purchases</div>
              </th>
              <th className="px-6 py-3 text-right">
                <div className="text-xs ui-subtle">{fmtTotal(columnTotals.sales)}</div>
                <div className="text-xs font-medium ui-muted uppercase">Sales</div>
              </th>
              <th className="px-6 py-3 text-right">
                <div className="text-xs ui-subtle">{fmtTotal(columnTotals.dn)}</div>
                <div className="text-xs font-medium ui-muted uppercase">DN (Return)</div>
              </th>
              <th className="px-6 py-3 text-right">
                <div className="text-xs ui-subtle">{fmtTotal(columnTotals.cn)}</div>
                <div className="text-xs font-medium ui-muted uppercase">CN (Return)</div>
              </th>
              <th className="px-6 py-3 text-right">
                <div className="text-xs ui-subtle">{fmtTotal(columnTotals.closing)}</div>
                <div className="text-xs font-medium ui-muted uppercase">Closing</div>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-6 py-12 text-center ui-muted">
                  No items yet
                </td>
              </tr>
            ) : null}

            {items.map((it) => {
              const row = summaryByItemId.get(String(it.id));
              const unit = String(it.unit || '').trim();
              const rate = Number(it.purchasePrice ?? 0);
              const safeRate = Number.isFinite(rate) ? rate : 0;

              const opening = Number(row?.openingQty ?? 0);
              const purchases = Number(row?.purchasesQty ?? 0);
              const sales = Number(row?.salesQty ?? 0);
              const dn = Number(row?.debitNoteQty ?? 0);
              const cn = Number(row?.creditNoteQty ?? 0);
              const closing = Number(row?.closingQty ?? 0);

              const fmt = (v) => {
                if (viewMode === 'value') return formatMoney(round2(Number(v || 0) * safeRate), currentCompany);
                return `${Number(v || 0)}${unit ? ` ${unit}` : ''}`;
              };

              return (
                <tr
                  key={it.id}
                  className="ui-hover-sunken cursor-pointer"
                  onClick={() => openLedger(it)}
                  title="Click to view ledger"
                >
                  <td className="ui-col-entity px-4 py-2.5">
                    <div className="font-medium">{it.name}</div>
                    <div className="text-xs ui-muted">{it.code || ''}</div>
                  </td>
                  <td className="ui-col-meta px-4 py-2.5 text-right">{fmt(opening)}</td>
                  <td className="ui-col-meta px-4 py-2.5 text-right">{fmt(purchases)}</td>
                  <td className="ui-col-meta px-4 py-2.5 text-right">{fmt(sales)}</td>
                  <td className="ui-col-meta px-4 py-2.5 text-right">{fmt(dn)}</td>
                  <td className="ui-col-meta px-4 py-2.5 text-right">{fmt(cn)}</td>
                  <td className="ui-col-meta px-4 py-2.5 text-right font-semibold">{fmt(closing)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

    </div>
  );
};

export default InventoryModule;
