import { round2 } from './money';

const safeArray = (v) => (Array.isArray(v) ? v : []);

const safeNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export const isStockItem = (item) => {
  const t = String(item?.type || '').trim().toLowerCase();
  return t === 'goods' || t === 'good' || t === 'product' || t === 'inventory';
};

export const getItemOpeningQty = (item) => {
  if (item?.openingQty !== undefined && item?.openingQty !== null && item?.openingQty !== '') {
    return round2(Math.max(0, safeNum(item.openingQty)));
  }
  // Back-compat: older DB uses `stock` field
  return round2(Math.max(0, safeNum(item?.stock ?? 0)));
};

const shouldAffectStock = (voucherType, doc) => {
  const vt = String(voucherType || '').trim();
  const status = String(doc?.status || '').trim();

  // Cancelled documents should never affect stock.
  if (status === 'Cancelled') return false;

  // Invoices/Bills have explicit Drafts; don't affect stock
  if (vt === 'invoice' || vt === 'bill') return status !== 'Draft';

  // Credit/Debit notes currently default to Draft in this app,
  // but users expect them to affect stock.
  if (vt === 'creditNote' || vt === 'debitNote') return true;

  return true;
};

const normalizeMovement = (m) => {
  const qtyIn = round2(Math.max(0, safeNum(m.qtyIn)));
  const qtyOut = round2(Math.max(0, safeNum(m.qtyOut)));
  return {
    ...m,
    date: String(m.date || '').trim(),
    itemId: String(m.itemId || '').trim(),
    warehouseId: String(m.warehouseId || '').trim(),
    qtyIn,
    qtyOut,
  };
};

const isDateInRange = (dateStr, fromDate, toDate) => {
  const d = String(dateStr || '').trim();
  if (!d) return false;
  const from = String(fromDate || '').trim();
  const to = String(toDate || '').trim();

  // Dates are stored as YYYY-MM-DD in this app; lexicographic compare works.
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
};

const isBeforeDate = (dateStr, fromDate) => {
  const d = String(dateStr || '').trim();
  const from = String(fromDate || '').trim();
  if (!d || !from) return false;
  return d < from;
};

const isAfterDate = (dateStr, toDate) => {
  const d = String(dateStr || '').trim();
  const to = String(toDate || '').trim();
  if (!d || !to) return false;
  return d > to;
};

export const buildStockMovements = ({ db, companyId, warehouseId = '' }) => {
  const items = safeArray(db?.items).filter((i) => Number(i?.companyId) === Number(companyId));
  const itemsById = new Map(items.map((i) => [String(i.id), i]));
  const whFilter = String(warehouseId || '').trim();

  const movements = [];

  const pushFromDoc = ({
    voucherType,
    list,
    numberField = 'number',
    direction, // 'IN' | 'OUT'
  }) => {
    for (const doc of safeArray(list)) {
      if (Number(doc?.companyId) !== Number(companyId)) continue;
      if (!shouldAffectStock(voucherType, doc)) continue;

      const docWarehouseId = String(doc?.warehouseId || '').trim();
      if (whFilter && docWarehouseId !== whFilter) continue;

      const date = doc?.date || '';
      const voucherId = doc?.id;
      const voucherNumber = doc?.[numberField] || doc?.number || '';
      const lines = safeArray(doc?.items);

      for (const l of lines) {
        const itemId = l?.itemId !== undefined && l?.itemId !== null && l?.itemId !== '' ? String(l.itemId) : '';
        if (!itemId) continue;
        const item = itemsById.get(itemId);
        if (!item) continue;
        if (!isStockItem(item)) continue;

        const qty = round2(Math.max(0, safeNum(l?.quantity ?? 0)));
        if (qty <= 0) continue;

        movements.push(
          normalizeMovement({
            companyId,
            date,
            voucherType,
            voucherId,
            voucherNumber,
            warehouseId: docWarehouseId,
            itemId,
            qtyIn: direction === 'IN' ? qty : 0,
            qtyOut: direction === 'OUT' ? qty : 0,
          })
        );
      }
    }
  };

  pushFromDoc({ voucherType: 'bill', list: db?.bills, direction: 'IN' });
  pushFromDoc({ voucherType: 'invoice', list: db?.invoices, direction: 'OUT' });
  pushFromDoc({ voucherType: 'debitNote', list: db?.debitNotes, direction: 'OUT' });
  pushFromDoc({ voucherType: 'creditNote', list: db?.creditNotes, direction: 'IN' });

  // Stock Transfers (inter-warehouse / inter-branch). Only Approved affects stock.
  for (const t of safeArray(db?.stockTransfers)) {
    if (Number(t?.companyId) !== Number(companyId)) continue;
    const status = String(t?.status || '').trim();
    if (status !== 'Approved') continue;

    const date = String(t?.date || '').trim();
    const voucherId = t?.id;
    const voucherNumber = t?.number || '';

    const sourceWarehouseId = String(t?.sourceWarehouseId || '').trim();
    const targetWarehouseId = String(t?.targetWarehouseId || '').trim();

    const sourceLabel = String(t?.sourceWarehouseName || '').trim() || (sourceWarehouseId ? `Warehouse ${sourceWarehouseId}` : '');
    const targetLabel = String(t?.targetWarehouseName || '').trim() || (targetWarehouseId ? `Warehouse ${targetWarehouseId}` : '');

    const lines = safeArray(t?.lines);
    for (const l of lines) {
      const itemId = l?.itemId !== undefined && l?.itemId !== null && l?.itemId !== '' ? String(l.itemId) : '';
      if (!itemId) continue;
      const item = itemsById.get(itemId);
      if (!item) continue;
      if (!isStockItem(item)) continue;

      const qty = round2(Math.max(0, safeNum(l?.qty ?? l?.quantity ?? 0)));
      if (qty <= 0) continue;

      if (whFilter) {
        if (sourceWarehouseId && sourceWarehouseId === whFilter) {
          movements.push(
            normalizeMovement({
              companyId,
              date,
              voucherType: 'stockTransfer',
              voucherId,
              voucherNumber,
              warehouseId: sourceWarehouseId,
              itemId,
              qtyIn: 0,
              qtyOut: qty,
              voucherNote: targetLabel ? `To: ${targetLabel}` : 'To: -',
            })
          );
        }

        if (targetWarehouseId && targetWarehouseId === whFilter) {
          movements.push(
            normalizeMovement({
              companyId,
              date,
              voucherType: 'stockTransfer',
              voucherId,
              voucherNumber,
              warehouseId: targetWarehouseId,
              itemId,
              qtyIn: qty,
              qtyOut: 0,
              voucherNote: sourceLabel ? `From: ${sourceLabel}` : 'From: -',
            })
          );
        }
      } else {
        // No warehouse filter => include both legs (net zero on totals, but visible in ledger).
        if (sourceWarehouseId) {
          movements.push(
            normalizeMovement({
              companyId,
              date,
              voucherType: 'stockTransfer',
              voucherId,
              voucherNumber,
              warehouseId: sourceWarehouseId,
              itemId,
              qtyIn: 0,
              qtyOut: qty,
              voucherNote: targetLabel ? `To: ${targetLabel}` : 'To: -',
            })
          );
        }
        if (targetWarehouseId) {
          movements.push(
            normalizeMovement({
              companyId,
              date,
              voucherType: 'stockTransfer',
              voucherId,
              voucherNumber,
              warehouseId: targetWarehouseId,
              itemId,
              qtyIn: qty,
              qtyOut: 0,
              voucherNote: sourceLabel ? `From: ${sourceLabel}` : 'From: -',
            })
          );
        }
      }
    }
  }

  // Sort by date asc, then voucherId asc for stable running balance
  movements.sort((a, b) => {
    const da = String(a.date || '');
    const dbb = String(b.date || '');
    if (da !== dbb) return da < dbb ? -1 : 1;

    const va = safeNum(a.voucherId);
    const vb = safeNum(b.voucherId);
    if (va !== vb) return va - vb;

    const ta = String(a.voucherType || '');
    const tb = String(b.voucherType || '');
    return ta.localeCompare(tb);
  });

  return { items, itemsById, movements };
};

export const computeInventorySummaryByItemId = ({ db, companyId, fromDate = '', toDate = '', warehouseId = '' }) => {
  const whFilter = String(warehouseId || '').trim();
  const { items, movements } = buildStockMovements({ db, companyId, warehouseId: whFilter });

  const map = new Map();
  for (const item of items) {
    const itemId = String(item.id);
    map.set(itemId, {
      itemId,
      openingQty: 0,
      purchasesQty: 0,
      salesQty: 0,
      debitNoteQty: 0,
      creditNoteQty: 0,
      closingQty: 0,
    });
  }

  // 1) Opening qty as-of fromDate
  for (const item of items) {
    const itemId = String(item.id);
    const row = map.get(itemId);
    if (!row) continue;
    // Opening stock in this app is not warehouse-scoped. When filtering by warehouse,
    // start from 0 and apply only warehouse movements.
    row.openingQty = whFilter ? 0 : getItemOpeningQty(item);
    row.closingQty = row.openingQty;
  }

  // Apply movements before fromDate to opening
  if (String(fromDate || '').trim()) {
    for (const m of movements) {
      if (!isBeforeDate(m.date, fromDate)) continue;
      const row = map.get(String(m.itemId));
      if (!row) continue;
      row.openingQty = round2(row.openingQty + m.qtyIn - m.qtyOut);
      row.closingQty = row.openingQty;
    }
  }

  // 2) Period movements and closing as-of toDate
  for (const m of movements) {
    if (String(toDate || '').trim() && isAfterDate(m.date, toDate)) continue;

    const row = map.get(String(m.itemId));
    if (!row) continue;

    const inPeriod = isDateInRange(m.date, fromDate, toDate);
    if (inPeriod) {
      if (m.voucherType === 'bill') row.purchasesQty = round2(row.purchasesQty + m.qtyIn);
      if (m.voucherType === 'invoice') row.salesQty = round2(row.salesQty + m.qtyOut);
      if (m.voucherType === 'debitNote') row.debitNoteQty = round2(row.debitNoteQty + m.qtyOut);
      if (m.voucherType === 'creditNote') row.creditNoteQty = round2(row.creditNoteQty + m.qtyIn);
    }

    // Closing is opening-as-of-from plus all movements up to toDate
    row.closingQty = round2(row.closingQty + m.qtyIn - m.qtyOut);
  }

  return map;
};

export const buildItemStockLedger = ({ db, companyId, itemId, fromDate = '', toDate = '', warehouseId = '' }) => {
  const whFilter = String(warehouseId || '').trim();
  const { itemsById, movements } = buildStockMovements({ db, companyId, warehouseId: whFilter });
  const item = itemsById.get(String(itemId));
  if (!item) return { item: null, openingQty: 0, rows: [] };

  // Opening as-of fromDate (openingQty + net movements before fromDate)
  let openingQty = whFilter ? 0 : getItemOpeningQty(item);
  if (String(fromDate || '').trim()) {
    for (const m of movements) {
      if (String(m.itemId) !== String(itemId)) continue;
      if (!isBeforeDate(m.date, fromDate)) continue;
      openingQty = round2(openingQty + m.qtyIn - m.qtyOut);
    }
  }

  let running = openingQty;

  const rows = movements
    .filter((m) => String(m.itemId) === String(itemId))
    .filter((m) => isDateInRange(m.date, fromDate, toDate))
    .map((m) => {
      running = round2(running + m.qtyIn - m.qtyOut);
      return {
        ...m,
        balanceQty: running,
      };
    });

  return {
    item,
    openingQty,
    rows,
  };
};
