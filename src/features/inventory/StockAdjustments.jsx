import React, { useMemo, useRef, useState } from 'react';
import { Plus, Trash2, Upload } from 'lucide-react';

import { notify } from '../../components/ui/notify';
import { PageHeader } from '../../components/ui/Primitives';
import { ColumnHeader, useColumnFilters } from '../../components/ColumnFilters';
import ItemPicker from '../../components/pickers/ItemPicker';
import { formatMoney, round2 } from '../../utils/money';
import { isStockItem } from '../../utils/inventory';
import { generateVoucherNumber } from '../../utils/docSettings';

const safeArray = (v) => (Array.isArray(v) ? v : []);
const normalizeId = (v) => (v === undefined || v === null ? '' : String(v).trim());
const toNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Stock adjustments — the count against the books.
 *
 * An audit finds twelve fewer boxes than the system says. Something has to
 * record that, and it cannot be a quiet edit of a number: the difference is a
 * loss the business has taken, and it belongs in the accounts as one.
 *
 * These are movements, so nothing here posts a journal by hand. A negative
 * adjustment lowers closing stock, which lowers Stock-in-Hand on the balance
 * sheet and — because closing stock is what credits Purchase Accounts — raises
 * cost in the P&L by the same amount. A positive one does the reverse. The two
 * statements stay in agreement because they are reading one number.
 *
 * Every adjustment names a warehouse and a reason. Stock does not go missing
 * from a company in general, and "adjusted" is not an explanation anyone can
 * audit a year later.
 */

/** A row parsed out of an uploaded sheet, with whatever is wrong with it. */
const parseUploadRows = (text, { itemsByKey, warehousesByKey }) => {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return { rows: [], errors: ['The file is empty.'] };

  const splitRow = (line) => {
    // Tab-separated when it looks like it (what a spreadsheet copy gives),
    // comma otherwise. Quoted commas survive either way.
    const sep = line.includes('\t') ? '\t' : ',';
    const out = [];
    let cur = '';
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"') {
        if (quoted && line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else quoted = !quoted;
        continue;
      }
      if (ch === sep && !quoted) {
        out.push(cur);
        cur = '';
        continue;
      }
      cur += ch;
    }
    out.push(cur);
    return out.map((c) => c.trim());
  };

  const header = splitRow(lines[0]).map((h) => h.toLowerCase());
  const col = (...names) => {
    for (const n of names) {
      const i = header.indexOf(n);
      if (i >= 0) return i;
    }
    return -1;
  };

  const iItem = col('item', 'item code', 'code', 'item name');
  const iQty = col('qty', 'quantity', 'qtydelta', 'qty delta', 'adjustment');
  const iReason = col('reason', 'notes', 'remark', 'remarks');
  const iWarehouse = col('warehouse', 'warehouse name', 'wh');

  if (iItem < 0 || iQty < 0) {
    return {
      rows: [],
      errors: ['The sheet needs an Item column and a Qty column. Reason and Warehouse are optional columns.'],
    };
  }

  const rows = [];
  const errors = [];

  for (let n = 1; n < lines.length; n += 1) {
    const cells = splitRow(lines[n]);
    const rawItem = String(cells[iItem] || '').trim();
    const rawQty = String(cells[iQty] || '').trim();
    if (!rawItem && !rawQty) continue;

    const item = itemsByKey.get(rawItem.toLowerCase()) || null;
    const qty = Number(rawQty);
    const rawWarehouse = iWarehouse >= 0 ? String(cells[iWarehouse] || '').trim() : '';
    const warehouse = rawWarehouse ? warehousesByKey.get(rawWarehouse.toLowerCase()) || null : null;

    if (!item) {
      errors.push(`Row ${n + 1}: no item matches "${rawItem}".`);
      continue;
    }
    if (!Number.isFinite(qty) || qty === 0) {
      errors.push(`Row ${n + 1}: "${rawQty}" is not a quantity to adjust by.`);
      continue;
    }
    if (rawWarehouse && !warehouse) {
      errors.push(`Row ${n + 1}: no warehouse matches "${rawWarehouse}".`);
      continue;
    }

    rows.push({
      itemId: normalizeId(item.id),
      itemName: item.name,
      qtyDelta: round2(qty),
      reason: iReason >= 0 ? String(cells[iReason] || '').trim() : '',
      warehouseId: warehouse ? normalizeId(warehouse.id) : '',
      warehouseName: warehouse ? warehouse.name : '',
    });
  }

  return { rows, errors };
};

const StockAdjustments = ({
  db,
  setDb,
  currentCompany,
  warehouses = [],
  branches = [],
  activeWarehouseId = '',
  activeBranchId = '',
}) => {
  const companyId = currentCompany?.id;
  const fileRef = useRef(null);
  const colFilters = useColumnFilters();

  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(() => ({
    date: today(),
    warehouseId: normalizeId(activeWarehouseId),
    reason: '',
    lines: [{ itemId: '', qtyDelta: '' }],
  }));

  const stockItems = useMemo(
    () => safeArray(db?.items).filter((i) => Number(i?.companyId) === Number(companyId) && isStockItem(i)),
    [db?.items, companyId]
  );

  const itemById = useMemo(() => new Map(stockItems.map((i) => [normalizeId(i.id), i])), [stockItems]);

  const warehouseById = useMemo(
    () => new Map(safeArray(warehouses).map((w) => [normalizeId(w?.id), w])),
    [warehouses]
  );

  const branchOfWarehouse = (warehouseId) => normalizeId(warehouseById.get(normalizeId(warehouseId))?.branchId);

  const branchLabel = (branchId) => {
    const b = safeArray(branches).find((x) => normalizeId(x?.id) === normalizeId(branchId));
    if (!b) return '';
    const code = String(b.branchCode || '').trim();
    const name = String(b.branchName || b.name || '').trim();
    return code ? `${code} — ${name}` : name;
  };

  const adjustments = useMemo(() => {
    const rows = safeArray(db?.stockAdjustments)
      .filter((a) => Number(a?.companyId) === Number(companyId))
      .slice()
      .sort((a, b) => String(b?.date || '').localeCompare(String(a?.date || '')));

    // The header selector scopes the list the same way it scopes every other
    // stock screen: a warehouse shows its own adjustments, "All" shows the lot.
    const wh = normalizeId(activeWarehouseId);
    return wh ? rows.filter((a) => normalizeId(a.warehouseId) === wh) : rows;
  }, [db?.stockAdjustments, companyId, activeWarehouseId]);

  const shown = colFilters.apply(adjustments, {
    date: (a) => a.date || '',
    number: (a) => a.number || '',
    warehouse: (a) => warehouseById.get(normalizeId(a.warehouseId))?.name || '',
    branch: (a) => branchLabel(branchOfWarehouse(a.warehouseId)),
    item: (a) => itemById.get(normalizeId(a.itemId))?.name || '',
    qty: (a) => toNum(a.qtyDelta),
    value: (a) => toNum(a.valueDelta),
    reason: (a) => a.reason || '',
  });

  const valueOf = (itemId, qtyDelta) => {
    const item = itemById.get(normalizeId(itemId));
    const rate = toNum(item?.purchasePrice);
    return round2(toNum(qtyDelta) * rate);
  };

  const totals = useMemo(() => {
    let up = 0;
    let down = 0;
    for (const a of shown) {
      const v = toNum(a.valueDelta);
      if (v >= 0) up = round2(up + v);
      else down = round2(down + v);
    }
    return { up, down, net: round2(up + down) };
  }, [shown]);

  const resetForm = () =>
    setForm({
      date: today(),
      warehouseId: normalizeId(activeWarehouseId),
      reason: '',
      lines: [{ itemId: '', qtyDelta: '' }],
    });

  const updateLine = (idx, patch) =>
    setForm((p) => ({
      ...p,
      lines: safeArray(p.lines).map((l, i) => (i === idx ? { ...l, ...patch } : l)),
    }));

  const addLine = () => setForm((p) => ({ ...p, lines: [...safeArray(p.lines), { itemId: '', qtyDelta: '' }] }));

  const removeLine = (idx) =>
    setForm((p) => {
      const next = safeArray(p.lines).filter((_, i) => i !== idx);
      return { ...p, lines: next.length ? next : [{ itemId: '', qtyDelta: '' }] };
    });

  /** Writes a batch of adjustment rows into the book as separate movements. */
  const commit = (rows, { date, reason, warehouseId }) => {
    setDb((prev) => {
      const existing = safeArray(prev.stockAdjustments);
      let nextId = existing.reduce((m, a) => Math.max(m, Number(a?.id || 0)), 0);
      const stamp = new Date().toISOString();

      const created = rows.map((r) => {
        const wh = normalizeId(r.warehouseId) || normalizeId(warehouseId);
        return {
          id: ++nextId,
          companyId,
          number:
            generateVoucherNumber({
              db: prev,
              company: currentCompany,
              voucherKey: 'stockAdjustment',
              branchId: branchOfWarehouse(wh) || activeBranchId || null,
              offset: nextId,
            }) || `ADJ-${nextId}`,
          date: r.date || date,
          warehouseId: wh,
          branchId: branchOfWarehouse(wh),
          itemId: normalizeId(r.itemId),
          qtyDelta: round2(toNum(r.qtyDelta)),
          valueDelta: valueOf(r.itemId, r.qtyDelta),
          reason: String(r.reason || reason || '').trim(),
          createdAt: stamp,
        };
      });

      return { ...prev, stockAdjustments: [...existing, ...created] };
    });
  };

  const saveForm = (e) => {
    e.preventDefault();

    const warehouseId = normalizeId(form.warehouseId);
    const reason = String(form.reason || '').trim();
    const lines = safeArray(form.lines).filter((l) => normalizeId(l.itemId) && toNum(l.qtyDelta) !== 0);

    if (!warehouseId) {
      notify.error('Choose the warehouse the stock is in.');
      return;
    }
    if (!reason) {
      // Deliberately not optional. An adjustment with no reason is a number
      // nobody can defend in an audit, which is when it will be read.
      notify.error('Give a reason — an adjustment without one cannot be explained later.');
      return;
    }
    if (!lines.length) {
      notify.error('Add at least one item with a quantity to adjust by.');
      return;
    }

    commit(lines, { date: form.date, reason, warehouseId });
    notify.success(`${lines.length} adjustment${lines.length === 1 ? '' : 's'} recorded.`);
    resetForm();
    setCreating(false);
  };

  const onUpload = async (file) => {
    if (!file) return;
    const warehouseId = normalizeId(form.warehouseId) || normalizeId(activeWarehouseId);
    if (!warehouseId) {
      notify.error('Choose a warehouse before uploading — every row has to land somewhere.');
      return;
    }

    let text = '';
    try {
      text = await file.text();
    } catch {
      notify.error('That file could not be read.');
      return;
    }

    if (/^PK/.test(text.slice(0, 2))) {
      notify.error('That is an .xlsx workbook. Save it as CSV and upload that.');
      return;
    }

    const itemsByKey = new Map();
    for (const i of stockItems) {
      itemsByKey.set(String(i.name || '').trim().toLowerCase(), i);
      if (i.code) itemsByKey.set(String(i.code).trim().toLowerCase(), i);
    }
    const warehousesByKey = new Map(
      safeArray(warehouses).map((w) => [String(w?.name || '').trim().toLowerCase(), w])
    );

    const { rows, errors } = parseUploadRows(text, { itemsByKey, warehousesByKey });

    const missingReason = rows.filter((r) => !String(r.reason || '').trim()).length;
    if (missingReason && !String(form.reason || '').trim()) {
      notify.error(
        `${missingReason} row(s) have no reason. Add a Reason column, or type one above to apply to the whole upload.`
      );
      return;
    }

    if (!rows.length) {
      notify.error(errors[0] || 'Nothing in that file could be read as an adjustment.');
      return;
    }

    commit(rows, { date: form.date, reason: form.reason, warehouseId });

    if (errors.length) {
      notify.info(`${rows.length} row(s) recorded. ${errors.length} skipped — ${errors[0]}`);
    } else {
      notify.success(`${rows.length} adjustment${rows.length === 1 ? '' : 's'} uploaded.`);
    }
    resetForm();
    setCreating(false);
  };

  const removeAdjustment = (id) => {
    setDb((prev) => ({
      ...prev,
      stockAdjustments: safeArray(prev.stockAdjustments).filter((a) => String(a.id) !== String(id)),
    }));
    notify.info('Adjustment removed — the stock it moved goes back.');
  };

  const warehouseOptions = safeArray(warehouses)
    .slice()
    .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')));

  return (
    <div className="space-y-4">
      {adjustments.length > 0 ? (
        <div className="ui-in-fade flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
          <span className="ui-muted">
            Written up <span className="ui-num font-semibold ui-amount-pos">{formatMoney(totals.up, currentCompany)}</span>
          </span>
          <span className="ui-muted">
            Written off{' '}
            <span className="ui-num font-semibold ui-amount-neg">{formatMoney(Math.abs(totals.down), currentCompany)}</span>
          </span>
          <span className="ui-muted">
            Net effect on stock <span className="ui-num font-semibold ui-fg">{formatMoney(totals.net, currentCompany)}</span>
          </span>
        </div>
      ) : null}

      <PageHeader
        title="Stock Adjustments"
        description="What a count found that the books did not. Each one moves stock, so the balance sheet and the P&L move with it."
        actions={
          creating ? null : (
            <button type="button" onClick={() => setCreating(true)} className="ui-btn ui-btn-primary">
              <Plus size={15} aria-hidden="true" /> New Adjustment
            </button>
          )
        }
      />

      {creating ? (
        <form onSubmit={saveForm} className="ui-card p-4 space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="adj-date">Date</label>
              <input
                id="adj-date"
                type="date"
                value={form.date}
                onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))}
                className="ui-input w-full px-3 py-2"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="adj-warehouse">
                Warehouse <span className="text-[rgb(var(--neg))]">*</span>
              </label>
              <select
                id="adj-warehouse"
                value={form.warehouseId}
                onChange={(e) => setForm((p) => ({ ...p, warehouseId: e.target.value }))}
                className="ui-select ui-surface w-full px-3 py-2"
                required
              >
                <option value="">Select warehouse</option>
                {warehouseOptions.map((w) => (
                  <option key={String(w.id)} value={String(w.id)}>
                    {w.name || `Warehouse ${w.id}`}
                  </option>
                ))}
              </select>
              <div className="ui-caption mt-1">
                Branch: {branchLabel(branchOfWarehouse(form.warehouseId)) || '—'}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="adj-reason">
                Reason <span className="text-[rgb(var(--neg))]">*</span>
              </label>
              <input
                id="adj-reason"
                type="text"
                value={form.reason}
                onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))}
                className="ui-input w-full px-3 py-2"
                placeholder="Damaged in transit, audit shortfall…"
                required
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Items</span>
              <button type="button" onClick={addLine} className="text-sm flex items-center gap-1 ui-fg">
                <Plus size={16} /> Add item
              </button>
            </div>

            <div className="border rounded-lg overflow-hidden">
              <table className="ui-table w-full">
                <thead className="ui-sunken">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium w-1/2">Item</th>
                    <th className="px-3 py-2 text-left text-xs font-medium">Adjust by</th>
                    <th className="px-3 py-2 text-right text-xs font-medium">Value</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {safeArray(form.lines).map((l, idx) => (
                    <tr key={idx} className="border-t">
                      <td className="ui-col-entity px-3 py-2 w-1/2">
                        <ItemPicker
                          db={db}
                          setDb={setDb}
                          currentCompany={currentCompany}
                          value={l.itemId}
                          onChange={(val) => updateLine(idx, { itemId: val })}
                          label={null}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          value={l.qtyDelta}
                          onChange={(e) => updateLine(idx, { qtyDelta: e.target.value })}
                          className="ui-input w-28 px-2 py-1"
                          step="any"
                          placeholder="-12"
                        />
                        <div className="ui-caption">Minus for stock gone</div>
                      </td>
                      <td className="ui-col-meta px-3 py-2 text-right">
                        {formatMoney(valueOf(l.itemId, l.qtyDelta), currentCompany)}
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => removeLine(idx)}
                          className="text-[rgb(var(--neg))]"
                          aria-label="Remove line"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv,text/plain"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  onUpload(f);
                }}
              />
              <button type="button" onClick={() => fileRef.current?.click()} className="ui-btn ui-btn-secondary">
                <Upload size={15} aria-hidden="true" /> Upload from Excel
              </button>
              <span className="ui-caption">Columns: Item, Qty, Reason, Warehouse. Save the sheet as CSV.</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  resetForm();
                  setCreating(false);
                }}
                className="ui-btn ui-btn-secondary"
              >
                Cancel
              </button>
              <button type="submit" className="ui-btn ui-btn-primary">
                Record adjustment
              </button>
            </div>
          </div>
        </form>
      ) : null}

      <div className="ui-surface rounded-xl shadow-sm overflow-hidden border">
        <table className="ui-table w-full">
          <thead className="ui-sunken border-b">
            <tr>
              <ColumnHeader label="Date" col="date" state={colFilters} className="ui-th" />
              <ColumnHeader label="Number" col="number" state={colFilters} className="ui-th" />
              <ColumnHeader label="Branch" col="branch" state={colFilters} className="ui-th" />
              <ColumnHeader label="Warehouse" col="warehouse" state={colFilters} className="ui-th" />
              <ColumnHeader label="Item" col="item" state={colFilters} className="ui-th" />
              <ColumnHeader label="Qty" col="qty" state={colFilters} className="ui-th" align="right" />
              <ColumnHeader label="Value" col="value" state={colFilters} className="ui-th" align="right" />
              <ColumnHeader label="Reason" col="reason" state={colFilters} className="ui-th" />
              <th className="ui-th" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {shown.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-6 py-12 text-center ui-muted">
                  No adjustments yet. Record one when a count disagrees with the books.
                </td>
              </tr>
            ) : (
              shown.map((a) => {
                const item = itemById.get(normalizeId(a.itemId));
                const qty = toNum(a.qtyDelta);
                const value = toNum(a.valueDelta);
                return (
                  <tr key={a.id} className="ui-hover-sunken">
                    <td className="ui-col-date px-4 py-2.5">{a.date || '—'}</td>
                    <td className="ui-col-id px-4 py-2.5">{a.number || '—'}</td>
                    <td className="ui-col-meta px-4 py-2.5">{branchLabel(a.branchId) || '—'}</td>
                    <td className="ui-col-meta px-4 py-2.5">
                      {warehouseById.get(normalizeId(a.warehouseId))?.name || '—'}
                    </td>
                    <td className="ui-col-entity px-4 py-2.5">{item?.name || `Item ${a.itemId}`}</td>
                    <td className={`ui-col-meta px-4 py-2.5 text-right ${qty < 0 ? 'ui-amount-neg' : 'ui-amount-pos'}`}>
                      {qty > 0 ? `+${qty}` : qty}
                      {item?.unit ? ` ${item.unit}` : ''}
                    </td>
                    <td className={`ui-col-meta px-4 py-2.5 text-right ${value < 0 ? 'ui-amount-neg' : ''}`}>
                      {formatMoney(value, currentCompany)}
                    </td>
                    <td className="ui-col-meta px-4 py-2.5">{a.reason || '—'}</td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => removeAdjustment(a.id)}
                        className="text-[rgb(var(--neg))]"
                        aria-label="Remove adjustment"
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default StockAdjustments;
