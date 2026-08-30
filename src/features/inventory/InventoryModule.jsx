import React, { useMemo, useRef, useState } from 'react';
import { notify } from '../../components/ui/notify';

import { Download, Printer, Share2 } from 'lucide-react';

import { formatMoney, round2 } from '../../utils/money';
import { PageHeader } from '../../components/ui/Primitives';
import Popover from '../../components/ui/Popover';
import { ColumnHeader, useColumnFilters } from '../../components/ColumnFilters';
import { useListSearch } from '../../components/ListToolbar';
import { buildItemStockLedger, computeInventorySummaryByItemId, isStockItem } from '../../utils/inventory';

const safeArray = (v) => (Array.isArray(v) ? v : []);

const escapeHtml = (v) =>
  String(v ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');

/**
 * One way to put a table on paper.
 *
 * Export PDF and Print are the same document; the only difference is which
 * word the person clicked. Keeping one builder means the printed page and the
 * PDF can never drift apart.
 */
const printableDocument = ({ title, subtitle, head, rows }) => `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title>${escapeHtml(title)}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 16px; color: #111; }
        h1 { font-size: 18px; margin: 0 0 4px 0; }
        .sub { color: #555; font-size: 12px; margin: 0 0 12px 0; }
        table { border-collapse: collapse; width: 100%; font-size: 12px; }
        th, td { border: 1px solid #ddd; padding: 6px; }
        th { background: #f5f5f5; text-align: left; }
        td.num, th.num { text-align: right; }
      </style>
    </head>
    <body>
      <h1>${escapeHtml(title)}</h1>
      <div class="sub">${escapeHtml(subtitle)}</div>
      <table>
        <thead><tr>${head.map((h) => `<th class="${h.num ? 'num' : ''}">${escapeHtml(h.label)}</th>`).join('')}</tr></thead>
        <tbody>
          ${rows
            .map(
              (r) =>
                `<tr>${r
                  .map((cell, i) => `<td class="${head[i]?.num ? 'num' : ''}">${escapeHtml(cell)}</td>`)
                  .join('')}</tr>`
            )
            .join('')}
        </tbody>
      </table>
    </body>
  </html>`;

const openPrintWindow = (html) => {
  const w = window.open('', '_blank');
  if (!w) {
    notify.error('Popup blocked. Allow popups for this site to print or export a PDF.');
    return false;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  w.print();
  return true;
};

const downloadCsv = (filename, rows) => {
  const escape = (v) => {
    const s = String(v ?? '');
    return s.includes(',') || s.includes('\n') || s.includes('"') ? `"${s.replaceAll('"', '""')}"` : s;
  };
  const csv = rows.map((r) => r.map(escape).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

/**
 * The period, as a period rather than two dates.
 *
 * Two empty date boxes asked everybody to know the first of the month and
 * type it. These are the four answers people actually want, with the two
 * boxes kept for the fifth.
 */
const PERIOD_OPTIONS = [
  { id: 'last30', label: 'Last 30 days' },
  { id: 'thisMonth', label: 'This month' },
  { id: 'thisYear', label: 'This year' },
  { id: 'custom', label: 'Custom' },
];

const iso = (d) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/**
 * "This year" means the financial year the business keeps, not January.
 *
 * The company carries its own start as MM-DD, so a book running April to March
 * gets April to March; only a company that has never said otherwise falls back
 * to the calendar.
 */
const periodRange = (id, company) => {
  const today = new Date();
  if (id === 'last30') {
    const from = new Date(today);
    from.setDate(from.getDate() - 29);
    return { from: iso(from), to: iso(today) };
  }
  if (id === 'thisMonth') {
    return { from: iso(new Date(today.getFullYear(), today.getMonth(), 1)), to: iso(today) };
  }
  if (id === 'thisYear') {
    const raw = String(company?.fiscalYearStart || '').trim();
    const [mm, dd] = raw.includes('-') ? raw.split('-').map((x) => Number(x)) : [1, 1];
    const month = Number.isFinite(mm) && mm >= 1 && mm <= 12 ? mm - 1 : 0;
    const day = Number.isFinite(dd) && dd >= 1 && dd <= 31 ? dd : 1;
    let start = new Date(today.getFullYear(), month, day);
    if (start > today) start = new Date(today.getFullYear() - 1, month, day);
    return { from: iso(start), to: iso(today) };
  }
  return { from: '', to: '' };
};

const ItemLedgerView = ({ db, currentCompany, itemId, fromDate, toDate, warehouseId, warehouseName = '' }) => {
  const companyId = currentCompany.id;

  const ledger = useMemo(
    () => buildItemStockLedger({ db, companyId, itemId, fromDate, toDate, warehouseId }),
    [db, companyId, itemId, fromDate, toDate, warehouseId]
  );

  if (!ledger.item) {
    return <div className="ui-muted">Item not found</div>;
  }

  const unit = String(ledger.item.unit || '').trim();
  const title = `Stock ledger — ${ledger.item.name}`;
  const subtitle = `Period: ${fromDate || 'Start'} to ${toDate || 'End'}${
    warehouseName ? ` · ${warehouseName}` : ''
  } · Opening ${ledger.openingQty}${unit ? ` ${unit}` : ''}`;

  const HEAD = [
    { label: 'Date' },
    { label: 'Voucher' },
    { label: 'Number' },
    { label: 'In', num: true },
    { label: 'Out', num: true },
    { label: 'Balance', num: true },
  ];

  const bodyRows = ledger.rows.map((r) => [
    r.date || '',
    String(r.voucherType || ''),
    r.voucherNumber || '',
    r.qtyIn || '',
    r.qtyOut || '',
    r.balanceQty,
  ]);

  const paper = () => printableDocument({ title, subtitle, head: HEAD, rows: bodyRows });

  const onPrint = () => openPrintWindow(paper());
  const onExportPdf = () => openPrintWindow(paper());
  const onExportExcel = () =>
    downloadCsv(
      `stock_ledger_${String(ledger.item.code || ledger.item.name || 'item').replace(/[^A-Za-z0-9_-]+/g, '_')}.csv`,
      [HEAD.map((h) => h.label), ...bodyRows]
    );

  /**
   * Share hands over the movements as text.
   *
   * The device sheet where there is one; otherwise the clipboard, which is
   * what every desktop browser can actually do. Silently doing nothing is the
   * one option not on the table.
   */
  const onShare = async () => {
    const text = [
      title,
      subtitle,
      '',
      ...bodyRows.map((r) => r.join('\t')),
    ].join('\n');
    try {
      if (navigator.share) {
        await navigator.share({ title, text });
        return;
      }
      await navigator.clipboard.writeText(text);
      notify.success('Stock ledger copied to the clipboard.');
    } catch (err) {
      if (String(err?.name) === 'AbortError') return;
      notify.error('Could not share this ledger.');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid grid-cols-2 gap-4 text-sm min-w-0">
          <div>
            <div className="ui-muted">Item</div>
            <div className="font-semibold">{ledger.item.name}</div>
          </div>
          <div>
            <div className="ui-muted">Opening Qty</div>
            <div className="font-semibold">
              {ledger.openingQty} {unit}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button type="button" onClick={onShare} className="ui-btn ui-btn-secondary ui-btn-sm">
            <Share2 size={14} aria-hidden="true" /> Share
          </button>
          <button type="button" onClick={onPrint} className="ui-btn ui-btn-secondary ui-btn-sm">
            <Printer size={14} aria-hidden="true" /> Print
          </button>
          <button type="button" onClick={onExportPdf} className="ui-btn ui-btn-secondary ui-btn-sm">
            <Download size={14} aria-hidden="true" /> PDF
          </button>
          <button type="button" onClick={onExportExcel} className="ui-btn ui-btn-secondary ui-btn-sm">
            <Download size={14} aria-hidden="true" /> Excel
          </button>
        </div>
      </div>

      <div className="ui-surface rounded-xl shadow-sm overflow-hidden border">
        <table className="ui-table w-full">
          <thead className="ui-sunken border-b">
            <tr>
              <th className="ui-th">Date</th>
              <th className="ui-th">Voucher</th>
              <th className="ui-th">Number</th>
              <th className="ui-th ui-num">In</th>
              <th className="ui-th ui-num">Out</th>
              <th className="ui-th ui-num">Balance</th>
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
  const [period, setPeriod] = useState('last30');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [warehouseId, setWarehouseId] = useState(''); // '' => All warehouses
  const [exportOpen, setExportOpen] = useState(false);
  const exportBtnRef = useRef(null);
  const colFilters = useColumnFilters();

  const { fromDate, toDate } = useMemo(() => {
    if (period === 'custom') return { fromDate: customFrom, toDate: customTo };
    const r = periodRange(period, currentCompany);
    return { fromDate: r.from, toDate: r.to };
  }, [period, customFrom, customTo, currentCompany]);

  const warehouseOptions = useMemo(() => {
    const list = safeArray(warehouses);
    return list.slice().sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')));
  }, [warehouses]);

  const allStockItems = useMemo(() => {
    return safeArray(db.items)
      .filter((i) => i.companyId === companyId)
      .filter((i) => isStockItem(i))
      .slice()
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  }, [db.items, companyId]);

  const itemSearch = useListSearch(allStockItems, ['name', 'code', 'hsnSac', 'barcode', 'category'], 'inventory');

  const summaryByItemId = useMemo(() => {
    return computeInventorySummaryByItemId({ db, companyId, fromDate, toDate, warehouseId });
  }, [db, companyId, fromDate, toDate, warehouseId]);

  /**
   * The same column filters the invoice list uses.
   *
   * Each extractor hands back the value in that column for the period on
   * screen, so a filter on Closing filters on the closing figure being shown
   * and not on some other reading of the row. Numbers are given as numbers —
   * the filter compares them numerically, which is why 100 sorts after 9.
   */
  const cellValue = (it, key) => {
    const row = summaryByItemId.get(String(it.id));
    const rate = Number(it.purchasePrice ?? 0);
    const safeRate = Number.isFinite(rate) ? rate : 0;
    const qty = {
      opening: Number(row?.openingQty ?? 0),
      purchases: Number(row?.purchasesQty ?? 0),
      sales: Number(row?.salesQty ?? 0),
      dn: Number(row?.debitNoteQty ?? 0),
      cn: Number(row?.creditNoteQty ?? 0),
      closing: Number(row?.closingQty ?? 0),
    };
    if (key === 'item') return String(it.name || '');
    const n = qty[key] ?? 0;
    return viewMode === 'value' ? round2(n * safeRate) : n;
  };

  const items = useMemo(
    () =>
      colFilters.apply(itemSearch.filtered, {
        item: (it) => cellValue(it, 'item'),
        opening: (it) => cellValue(it, 'opening'),
        purchases: (it) => cellValue(it, 'purchases'),
        sales: (it) => cellValue(it, 'sales'),
        dn: (it) => cellValue(it, 'dn'),
        cn: (it) => cellValue(it, 'cn'),
        closing: (it) => cellValue(it, 'closing'),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [itemSearch.filtered, colFilters, summaryByItemId, viewMode]
  );

  const openLedger = (item) => {
    const wh = warehouseOptions.find((w) => String(w.id) === String(warehouseId));
    openModal(
      <ItemLedgerView
        db={db}
        currentCompany={currentCompany}
        itemId={item.id}
        fromDate={fromDate}
        toDate={toDate}
        warehouseId={warehouseId}
        warehouseName={wh?.name || ''}
      />,
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
    <div className="space-y-4">
      {/*
        The totals lead, above the heading and small.
        They were four large cards between the title and the list, which
        pushed the items — the thing the screen is for — most of the way down
        the page. As one quiet strip they still say what the stock is worth
        without taking the room.
      */}
      {items.length > 0 ? (
        <div className="ui-in-fade flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
          <span className="ui-muted">
            Stock value{' '}
            <span className="ui-num font-semibold ui-fg" title={formatMoney(stockKpis.stockValue, currentCompany)}>
              {formatMoney(stockKpis.stockValue, currentCompany)}
            </span>
          </span>
          <span className="ui-muted">
            Items <span className="ui-num font-semibold ui-fg">{items.length}</span>
          </span>
          <span className="ui-muted">
            Out of stock{' '}
            <span className={`ui-num font-semibold ${stockKpis.outOfStock ? 'ui-amount-neg' : 'ui-fg'}`}>
              {stockKpis.outOfStock}
            </span>
          </span>
          <span className="ui-muted">
            Negative{' '}
            <span className={`ui-num font-semibold ${stockKpis.negative ? 'ui-amount-neg' : 'ui-fg'}`}>
              {stockKpis.negative}
            </span>
          </span>
        </div>
      ) : null}

      <PageHeader
        title="Inventory"
        description="Opening, movement and closing stock for the period, by item."
        actions={
          <>
            {/* One export. Which file it is, is a question, not two buttons. */}
            <button
              ref={exportBtnRef}
              type="button"
              onClick={() => setExportOpen((v) => !v)}
              className="ui-btn ui-btn-secondary whitespace-nowrap"
              aria-haspopup="menu"
              aria-expanded={exportOpen}
            >
              <Download size={15} aria-hidden="true" /> Export
            </button>
            {exportOpen ? (
              <Popover anchorRef={exportBtnRef} onClose={() => setExportOpen(false)} minWidth={180} maxWidth={220}>
                <button
                  type="button"
                  onClick={() => {
                    setExportOpen(false);
                    exportPdf();
                  }}
                  className="w-full text-left px-3 py-2 text-sm ui-hover-sunken"
                >
                  Download PDF
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setExportOpen(false);
                    exportCsv();
                  }}
                  className="w-full text-left px-3 py-2 text-sm ui-hover-sunken"
                >
                  Download Excel
                </button>
              </Popover>
            ) : null}
          </>
        }
      />

      {/* View and warehouse sit under the heading, on the left, where the
          screen is read from. */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium" htmlFor="inv-view">View</label>
          <select
            id="inv-view"
            value={viewMode}
            onChange={(e) => setViewMode(e.target.value)}
            className="ui-select !h-9 !min-h-0 px-2 text-sm"
          >
            <option value="qty">Qty</option>
            <option value="value">Value</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm font-medium" htmlFor="inv-warehouse">Warehouse</label>
          <select
            id="inv-warehouse"
            value={warehouseId}
            onChange={(e) => setWarehouseId(e.target.value)}
            className="ui-select !h-9 !min-h-0 px-2 text-sm"
          >
            <option value="">All Warehouses</option>
            {warehouseOptions.map((w) => (
              <option key={String(w.id)} value={String(w.id)}>
                {w.name || `Warehouse ${w.id}`}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <label className="text-sm font-medium" htmlFor="inv-period">Period</label>
          <select
            id="inv-period"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="ui-select !h-9 !min-h-0 px-2 text-sm"
          >
            {PERIOD_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
          {period === 'custom' ? (
            <>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="ui-input !h-9 !min-h-0 !w-[9.5rem] px-2 text-sm"
                aria-label="From date"
              />
              <span className="ui-subtle">to</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="ui-input !h-9 !min-h-0 !w-[9.5rem] px-2 text-sm"
                aria-label="To date"
              />
            </>
          ) : null}
        </div>

        <div className="ms-auto flex items-center gap-2">
          <input
            type="text"
            value={itemSearch.query}
            onChange={(e) => itemSearch.setQuery(e.target.value)}
            className="ui-input !h-9 !min-h-0 px-3 text-sm"
            placeholder="Search items (name, code, HSN, barcode)"
            aria-label="Search items"
          />
        </div>
      </div>

      <div className="ui-surface rounded-xl shadow-sm overflow-hidden border">
        <table className="ui-table w-full">
          {/*
            Plain headings with the same filter control the invoice list uses.
            Each column used to carry its own total stacked above the label,
            which read as a second header row and repeated what the strip above
            the heading now says once.
          */}
          <thead className="ui-sunken border-b">
            <tr>
              <ColumnHeader label="Item" col="item" state={colFilters} className="ui-th" />
              <ColumnHeader label="Opening" col="opening" state={colFilters} className="ui-th" align="right" />
              <ColumnHeader label="Purchases" col="purchases" state={colFilters} className="ui-th" align="right" />
              <ColumnHeader label="Sales" col="sales" state={colFilters} className="ui-th" align="right" />
              <ColumnHeader label="DN (Return)" col="dn" state={colFilters} className="ui-th" align="right" />
              <ColumnHeader label="CN (Return)" col="cn" state={colFilters} className="ui-th" align="right" />
              <ColumnHeader label="Closing" col="closing" state={colFilters} className="ui-th" align="right" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center ui-muted">
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
