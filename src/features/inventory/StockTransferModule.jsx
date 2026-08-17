import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, MoreVertical, Pencil, Plus, Trash2, X } from 'lucide-react';

import { computeInventorySummaryByItemId, isStockItem } from '../../utils/inventory';
import { bumpCompanyNextNumber, generateVoucherNumber, getDocSettings } from '../../utils/docSettings';
import ItemPicker from '../../components/pickers/ItemPicker';

const safeArray = (v) => (Array.isArray(v) ? v : []);

const makeId = () => {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const toNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const normalizeId = (v) => String(v ?? '').trim();

const getBranchLabel = (b) => {
  if (!b) return '';
  const code = String(b.branchCode || b.code || '').trim();
  const name = String(b.branchName || b.name || '').trim();
  if (code && name) return `${code} - ${name}`;
  return name || code || `Branch ${String(b.id)}`;
};

const getWarehouseLabel = (w) => {
  if (!w) return '';
  const name = String(w.name || '').trim();
  return name || `Warehouse ${String(w.id)}`;
};

const getStatusPillClass = (status) => {
  const s = String(status || '').trim();
  if (s === 'Approved') return 'bg-green-100 text-green-700';
  if (s === 'Rejected') return 'bg-red-100 text-red-700';
  if (s === 'Cancelled') return 'ui-sunken ui-fg';
  if (s === 'Submitted') return 'bg-stone-100 ui-fg';
  return 'ui-sunken ui-fg';
};

export const StockTransferEditor = ({
  db,
  setDb,
  currentCompany,
  branches,
  warehouses,
  initial,
  mode = 'warehouse',
  onBack,
}) => {
  const isEdit = Boolean(initial);

  const voucherKey = mode === 'branch' ? 'branchTransfer' : 'warehouseTransfer';

  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState(() => {
    const today = new Date().toISOString().slice(0, 10);
    const activeBranchId = normalizeId(localStorage.getItem('activeBranchId') || localStorage.getItem('branchId') || '');
    const base = {
      id: makeId(),
      companyId: currentCompany?.id,
      number: '',
      date: today,
      status: 'Draft',
      sourceBranchId: activeBranchId,
      sourceWarehouseId: normalizeId(localStorage.getItem('activeWarehouseId') || ''),
      targetBranchId: mode === 'warehouse' ? activeBranchId : '',
      targetWarehouseId: '',
      reason: '',
      lines: [{ itemId: '', description: '', qty: 1 }],
    };

    if (!initial) return base;

    return {
      ...base,
      ...initial,
      id: normalizeId(initial.id) || base.id,
      companyId: initial.companyId ?? base.companyId,
      number: String(initial.number || '').trim(),
      date: String(initial.date || '').trim() || base.date,
      status: String(initial.status || '').trim() || 'Draft',
      sourceBranchId: normalizeId(initial.sourceBranchId),
      sourceWarehouseId: normalizeId(initial.sourceWarehouseId),
      targetBranchId: normalizeId(initial.targetBranchId),
      targetWarehouseId: normalizeId(initial.targetWarehouseId),
      reason: String(initial.reason || '').trim(),
      lines: safeArray(initial.lines).length
        ? safeArray(initial.lines).map((l) => ({
            itemId: normalizeId(l?.itemId),
            description: String(l?.description || '').trim(),
            qty: toNum(l?.qty || 0) || 0,
          }))
        : base.lines,
    };
  });

  const items = useMemo(() => {
    const companyId = currentCompany?.id;
    return safeArray(db?.items)
      .filter((it) => Number(it?.companyId) === Number(companyId))
      .filter((it) => isStockItem(it))
      .slice()
      .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')));
  }, [db?.items, currentCompany?.id]);

  const branchById = useMemo(() => new Map(safeArray(branches).map((b) => [normalizeId(b?.id), b])), [branches]);
  const warehouseById = useMemo(() => new Map(safeArray(warehouses).map((w) => [normalizeId(w?.id), w])), [warehouses]);

  const branchOptions = useMemo(() => {
    return safeArray(branches)
      .slice()
      .sort((a, b) => getBranchLabel(a).localeCompare(getBranchLabel(b)))
      .map((b) => ({ value: normalizeId(b?.id), label: getBranchLabel(b) || `Branch ${normalizeId(b?.id)}` }));
  }, [branches]);

  const itemById = useMemo(() => {
    const map = new Map();
    for (const it of safeArray(items)) {
      map.set(normalizeId(it?.id), it);
    }
    return map;
  }, [items]);

  const warehouseOptions = useMemo(() => {
    return safeArray(warehouses)
      .slice()
      .sort((a, b) => getWarehouseLabel(a).localeCompare(getWarehouseLabel(b)))
      .map((w) => ({
        value: normalizeId(w?.id),
        label: getWarehouseLabel(w),
        branchId: normalizeId(w?.branchId),
      }));
  }, [warehouses]);

  const warehouseOptionsForBranch = useMemo(() => {
    const map = new Map();
    for (const o of warehouseOptions) {
      const bid = normalizeId(o.branchId);
      if (!bid) continue;
      const cur = map.get(bid) || [];
      cur.push(o);
      map.set(bid, cur);
    }
    return map;
  }, [warehouseOptions]);

  const sourceBranchWarehouseOptions = useMemo(() => {
    const bid = normalizeId(form.sourceBranchId);
    if (!bid) return [];
    return warehouseOptionsForBranch.get(bid) || [];
  }, [form.sourceBranchId, warehouseOptionsForBranch]);

  const targetBranchWarehouseOptions = useMemo(() => {
    const bid = normalizeId(mode === 'warehouse' ? form.sourceBranchId : form.targetBranchId);
    if (!bid) return [];
    return warehouseOptionsForBranch.get(bid) || [];
  }, [form.sourceBranchId, form.targetBranchId, mode, warehouseOptionsForBranch]);

  useEffect(() => {
    // Derive branchIds from selected warehouses
    const sw = warehouseById.get(normalizeId(form.sourceWarehouseId)) || null;
    const tw = warehouseById.get(normalizeId(form.targetWarehouseId)) || null;

    const nextSourceBranchId = sw ? normalizeId(sw.branchId) : '';
    const nextTargetBranchId = tw ? normalizeId(tw.branchId) : '';

    setForm((p) => {
      const patch = {};
      if (nextSourceBranchId && normalizeId(p.sourceBranchId) !== nextSourceBranchId) patch.sourceBranchId = nextSourceBranchId;
      if (nextTargetBranchId && normalizeId(p.targetBranchId) !== nextTargetBranchId) patch.targetBranchId = nextTargetBranchId;
      return Object.keys(patch).length ? { ...p, ...patch } : p;
    });
  }, [form.sourceWarehouseId, form.targetWarehouseId, warehouseById]);

  useEffect(() => {
    if (mode !== 'warehouse') return;
    setForm((p) => {
      const sb = normalizeId(p.sourceBranchId);
      const tb = normalizeId(p.targetBranchId);
      if (sb && sb !== tb) {
        return { ...p, targetBranchId: sb, targetWarehouseId: '' };
      }
      if (!sb && tb) {
        return { ...p, targetBranchId: '' };
      }
      return p;
    });
  }, [mode, form.sourceBranchId]);

  const updateLine = (idx, patch, pickedItem = null) => {
    setForm((prev) => {
      const nextLines = safeArray(prev.lines).map((l, i) => {
        if (i !== idx) return l;

        const next = { ...l, ...patch };
        if (Object.prototype.hasOwnProperty.call(patch || {}, 'itemId')) {
          const itemId = normalizeId(patch?.itemId);
          const master = pickedItem || (itemId ? itemById.get(itemId) : null);
          if (master) {
            if (!String(next.description || '').trim()) {
              next.description = String(master?.name || '').trim();
            }
          } else if (!itemId) {
            next.description = '';
          }
        }

        return next;
      });

      return { ...prev, lines: nextLines };
    });
  };

  const addLine = () => {
    setForm((prev) => ({ ...prev, lines: [...safeArray(prev.lines), { itemId: '', description: '', qty: 1 }] }));
  };

  const removeLine = (idx) => {
    setForm((prev) => ({ ...prev, lines: safeArray(prev.lines).filter((_, i) => i !== idx) }));
  };

  const validate = () => {
    const date = String(form.date || '').trim();
    const sourceWarehouseId = normalizeId(form.sourceWarehouseId);
    const targetWarehouseId = normalizeId(form.targetWarehouseId);
    const sourceBranchIdFromForm = normalizeId(form.sourceBranchId);
    const targetBranchIdFromForm = normalizeId(mode === 'warehouse' ? form.sourceBranchId : form.targetBranchId);

    if (!date) return 'Date is required';

    if (mode === 'warehouse' && !sourceBranchIdFromForm) return 'Branch is required';
    if (mode === 'branch' && !sourceBranchIdFromForm) return 'From Branch is required';
    if (mode === 'branch' && !targetBranchIdFromForm) return 'To Branch is required';
    if (mode === 'branch' && sourceBranchIdFromForm && targetBranchIdFromForm && sourceBranchIdFromForm === targetBranchIdFromForm) {
      return 'From Branch and To Branch cannot be the same';
    }

    if (!sourceWarehouseId) return 'From Warehouse is required';
    if (!targetWarehouseId) return 'To Warehouse is required';
    if (sourceWarehouseId === targetWarehouseId) {
      return 'From and To warehouse cannot be the same';
    }

    const sw = warehouseById.get(sourceWarehouseId) || null;
    const tw = warehouseById.get(targetWarehouseId) || null;
    const sourceBranchId = sw ? normalizeId(sw.branchId) : '';
    const targetBranchId = tw ? normalizeId(tw.branchId) : '';
    const isBranchTransfer = sourceBranchId && targetBranchId && sourceBranchId !== targetBranchId;

    if (mode === 'warehouse' && sourceBranchId && targetBranchId && isBranchTransfer) {
      return 'Warehouse transfer must be within the same branch';
    }

    if (mode === 'branch' && sourceBranchId && targetBranchId && !isBranchTransfer) {
      return 'Branch transfer must be between different branches';
    }

    // Ensure selected warehouses belong to selected branches (branch-first)
    if (sourceBranchIdFromForm && sourceBranchId && sourceBranchIdFromForm !== sourceBranchId) {
      return 'From Warehouse does not belong to the selected From Branch';
    }

    if (targetBranchIdFromForm && targetBranchId && targetBranchIdFromForm !== targetBranchId) {
      return 'Receiver Warehouse does not belong to the selected To Branch';
    }

    const lines = safeArray(form.lines)
      .map((l) => ({ itemId: normalizeId(l?.itemId), qty: toNum(l?.qty || 0) }))
      .filter((l) => l.itemId);

    if (lines.length === 0) return 'At least 1 item line is required';

    for (const l of lines) {
      if (l.qty <= 0) return 'Qty must be greater than 0';
      const item = safeArray(items).find((it) => normalizeId(it?.id) === l.itemId) || null;
      if (!item) return 'Invalid item in lines';
      if (!isStockItem(item)) return 'Only stock items can be transferred';
    }

    return '';
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const msg = validate();
    if (msg) {
      setError(msg);
      return;
    }

    setSaving(true);
    try {
      const cleanLines = safeArray(form.lines)
        .map((l) => ({
          itemId: normalizeId(l?.itemId),
          description: String(l?.description || '').trim(),
          qty: toNum(l?.qty || 0),
        }))
        .filter((l) => l.itemId && l.qty > 0);

      const next = {
        ...form,
        id: normalizeId(form.id) || makeId(),
        companyId: currentCompany?.id,
        number: String(form.number || '').trim(),
        date: String(form.date || '').trim(),
        status: String(form.status || 'Draft').trim() || 'Draft',
        sourceBranchId: normalizeId(form.sourceBranchId),
        sourceWarehouseId: normalizeId(form.sourceWarehouseId),
        targetBranchId: normalizeId(form.targetBranchId),
        targetWarehouseId: normalizeId(form.targetWarehouseId),
        reason: String(form.reason || '').trim(),
        lines: cleanLines,
      };

      let transferNumber = String(next.number || '').trim();
      if (isTransferAuto) {
        if (lockTransferNumberOnCreate) transferNumber = String(generatedTransferNumber || '').trim();
        else if (!transferNumber) transferNumber = String(generatedTransferNumber || '').trim();
      }

      if (!transferNumber) {
        setError('Transfer number is required');
        return;
      }

      const existingSameNo = safeArray(db?.stockTransfers)
        .filter((t) => Number(t?.companyId) === Number(currentCompany?.id))
        .some((t) => normalizeId(t?.id) !== normalizeId(next.id) && String(t?.number || '').trim() === transferNumber);
      if (existingSameNo) {
        setError('Transfer number already exists. Please change the number or update numbering settings.');
        return;
      }

      next.number = transferNumber;

      // Helpful denormalized labels for snapshots
      const sb = branchById.get(next.sourceBranchId) || null;
      const tb = branchById.get(next.targetBranchId) || null;
      const sw = warehouseById.get(next.sourceWarehouseId) || null;
      const tw = warehouseById.get(next.targetWarehouseId) || null;
      next.sourceBranchName = getBranchLabel(sb) || null;
      next.targetBranchName = getBranchLabel(tb) || null;
      next.sourceWarehouseName = getWarehouseLabel(sw) || null;
      next.targetWarehouseName = getWarehouseLabel(tw) || null;

      setDb((prev) => {
        const list = safeArray(prev?.stockTransfers);
        const exists = list.some((t) => normalizeId(t?.id) === normalizeId(next.id));
        const nextList = exists ? list.map((t) => (normalizeId(t?.id) === normalizeId(next.id) ? next : t)) : [...list, next];
        const companies = bumpCompanyNextNumber({
          db: prev,
          companyId: currentCompany?.id,
          voucherKey,
          usedNumber: next.number,
          branchId: normalizeId(next.sourceBranchId) || null,
        });
        return { ...prev, stockTransfers: nextList, companies };
      });

      onBack?.();
    } catch (err) {
      setError(String(err?.message || err));
    } finally {
      setSaving(false);
    }
  };

  const readOnly = String(form.status || '').trim() !== 'Draft';

  const numberingBranchId = normalizeId(form.sourceBranchId) || null;
  const transferDocSettings = getDocSettings(db, currentCompany, { branchId: numberingBranchId });
  const transferNumbering = transferDocSettings?.numbering?.[voucherKey];
  const isTransferAuto = String(transferNumbering?.mode || '').toLowerCase() === 'auto';
  const lockTransferNumberOnCreate = !isEdit && isTransferAuto && !transferNumbering?.allowManualOverride;
  const generatedTransferNumber = !isEdit
    ? generateVoucherNumber({ db, company: currentCompany, voucherKey, branchId: numberingBranchId })
    : '';

  const selectedSourceWarehouse = warehouseById.get(normalizeId(form.sourceWarehouseId)) || null;
  const selectedTargetWarehouse = warehouseById.get(normalizeId(form.targetWarehouseId)) || null;

  const selectedSourceBranch = branchById.get(normalizeId(form.sourceBranchId)) || null;
  const selectedTargetBranch = branchById.get(normalizeId(form.targetBranchId)) || null;

  const sourceState = String(selectedSourceWarehouse?.state || '').trim();
  const targetState = String(selectedTargetWarehouse?.state || '').trim();
  const sameState = Boolean(sourceState && targetState && sourceState.toLowerCase() === targetState.toLowerCase());

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm ui-muted">
            {mode === 'branch'
              ? isEdit
                ? 'Edit Branch Transfer'
                : 'New Branch Transfer'
              : isEdit
                ? 'Edit Warehouse Transfer'
                : 'New Warehouse Transfer'}
          </div>
          <div className="text-xl font-bold">{String(form.number || '').trim() || 'Draft'}</div>
        </div>
        <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusPillClass(String(form.status || '').trim() || 'Draft')}`}>{String(form.status || '').trim() || 'Draft'}</span>
      </div>

      {error ? <div className="text-sm text-red-600">{error}</div> : null}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Transfer Number</label>
          <input
            type="text"
            value={form.number}
            onChange={(e) => setForm((p) => ({ ...p, number: e.target.value }))}
            className={`w-full px-3 py-2 border rounded-lg ${!isEdit && lockTransferNumberOnCreate ? 'ui-sunken' : ''}`}
            placeholder="Auto"
            disabled={readOnly || (!isEdit && lockTransferNumberOnCreate)}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Transfer Date</label>
          <input
            type="date"
            value={form.date}
            onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))}
            className="w-full px-3 py-2 border rounded-lg"
            required
            disabled={readOnly}
          />
        </div>

        {mode === 'warehouse' ? (
          <div>
            <label className="block text-sm font-medium mb-1">Branch *</label>
            <select
              value={form.sourceBranchId}
              onChange={(e) => {
                const nextBranchId = String(e.target.value || '').trim();
                setForm((p) => ({
                  ...p,
                  sourceBranchId: nextBranchId,
                  targetBranchId: nextBranchId,
                  sourceWarehouseId: '',
                  targetWarehouseId: '',
                }));
              }}
              className="w-full px-3 py-2 border rounded-lg ui-surface"
              required
              disabled={readOnly}
            >
              <option value="">Select Branch</option>
              {branchOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <>
            <div>
              <label className="block text-sm font-medium mb-1">From Branch *</label>
              <select
                value={form.sourceBranchId}
                onChange={(e) => {
                  const nextBranchId = String(e.target.value || '').trim();
                  setForm((p) => ({
                    ...p,
                    sourceBranchId: nextBranchId,
                    sourceWarehouseId: '',
                  }));
                }}
                className="w-full px-3 py-2 border rounded-lg ui-surface"
                required
                disabled={readOnly}
              >
                <option value="">Select Branch</option>
                {branchOptions.map((o) => (
                  <option key={o.value} value={o.value} disabled={normalizeId(o.value) === normalizeId(form.targetBranchId)}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">To Branch *</label>
              <select
                value={form.targetBranchId}
                onChange={(e) => {
                  const nextBranchId = String(e.target.value || '').trim();
                  setForm((p) => ({
                    ...p,
                    targetBranchId: nextBranchId,
                    targetWarehouseId: '',
                  }));
                }}
                className="w-full px-3 py-2 border rounded-lg ui-surface"
                required
                disabled={readOnly}
              >
                <option value="">Select Branch</option>
                {branchOptions.map((o) => (
                  <option key={o.value} value={o.value} disabled={normalizeId(o.value) === normalizeId(form.sourceBranchId)}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}

        <div>
          <label className="block text-sm font-medium mb-1">From Warehouse *</label>
          <select
            value={form.sourceWarehouseId}
            onChange={(e) => {
              const nextId = String(e.target.value || '').trim();
              setForm((p) => {
                const sameAsTarget = nextId && normalizeId(p.targetWarehouseId) === normalizeId(nextId);
                return {
                  ...p,
                  sourceWarehouseId: nextId,
                  targetWarehouseId: sameAsTarget ? '' : p.targetWarehouseId,
                };
              });
            }}
            className="w-full px-3 py-2 border rounded-lg ui-surface"
            required
            disabled={readOnly || !normalizeId(form.sourceBranchId)}
          >
            <option value="">{normalizeId(form.sourceBranchId) ? 'Select Warehouse' : 'Select Branch first'}</option>
            {sourceBranchWarehouseOptions.map((o) => (
              <option key={o.value} value={o.value} disabled={normalizeId(o.value) === normalizeId(form.targetWarehouseId)}>
                {o.label}
              </option>
            ))}
          </select>
          <div className="mt-1 text-xs ui-muted">
            Branch: <span className="font-medium">{getBranchLabel(selectedSourceBranch) || '-'}</span> · State:{' '}
            <span className="font-medium">{sourceState || '-'}</span>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Receiver Warehouse *</label>
          <select
            value={form.targetWarehouseId}
            onChange={(e) => {
              const nextId = String(e.target.value || '').trim();
              setForm((p) => {
                const sameAsSource = nextId && normalizeId(p.sourceWarehouseId) === normalizeId(nextId);
                return {
                  ...p,
                  targetWarehouseId: nextId,
                  sourceWarehouseId: sameAsSource ? '' : p.sourceWarehouseId,
                };
              });
            }}
            className="w-full px-3 py-2 border rounded-lg ui-surface"
            required
            disabled={readOnly || !normalizeId(mode === 'warehouse' ? form.sourceBranchId : form.targetBranchId)}
          >
            <option value="">{normalizeId(mode === 'warehouse' ? form.sourceBranchId : form.targetBranchId) ? 'Select Warehouse' : 'Select Branch first'}</option>
            {targetBranchWarehouseOptions.map((o) => (
              <option key={o.value} value={o.value} disabled={normalizeId(o.value) === normalizeId(form.sourceWarehouseId)}>
                {o.label}
              </option>
            ))}
          </select>
          <div className="mt-1 text-xs ui-muted">
            Branch: <span className="font-medium">{getBranchLabel(selectedTargetBranch) || '-'}</span> · State:{' '}
            <span className="font-medium">{targetState || '-'}</span>
          </div>
        </div>

        <div className="lg:col-span-2">
          <label className="block text-sm font-medium mb-1">Reason / Notes</label>
          <input
            type="text"
            value={form.reason}
            onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))}
            className="w-full px-3 py-2 border rounded-lg"
            placeholder="Optional"
            disabled={readOnly}
          />
        </div>
      </div>

      <div className="ui-surface border rounded-lg p-3 text-sm">
        <div className="font-semibold mb-1">GST</div>
        <div className="ui-muted">
          {sameState
            ? 'No GST for transfers within same state (stock movement only).'
            : 'No GST is applied in transfer entry (stock movement only).'}
        </div>
      </div>

      <div>
        <div className="flex justify-between items-center mb-2">
          <label className="block text-sm font-medium">Line Items</label>
          <button
            type="button"
            onClick={addLine}
            className="ui-fg ui-hover-fg text-sm flex items-center gap-1"
            disabled={readOnly}
          >
            <Plus size={16} /> Add Item
          </button>
        </div>

        <div className="border rounded-lg overflow-hidden">
          <table className="w-full table-fixed">
            <thead className="ui-sunken">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium w-[55%]">Item</th>
                <th className="px-3 py-2 text-left text-xs font-medium w-[30%]">Description</th>
                <th className="px-3 py-2 text-left text-xs font-medium w-[10%]">Qty</th>
                <th className="px-3 py-2 w-[5%]"></th>
              </tr>
            </thead>
            <tbody>
              {safeArray(form.lines).map((l, idx) => (
                <tr key={idx} className="border-t">
                  <td className="px-3 py-2">
                    <ItemPicker
                      db={db}
                      setDb={setDb}
                      currentCompany={currentCompany}
                      value={l.itemId}
                      onChange={(val, picked) => updateLine(idx, { itemId: val }, picked)}
                      label={null}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={String(l.description || '')}
                      onChange={(e) => updateLine(idx, { description: e.target.value })}
                      className="w-full px-2 py-1 border rounded"
                      disabled={readOnly}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      value={l.qty}
                      onChange={(e) => updateLine(idx, { qty: e.target.value })}
                      className="w-20 px-2 py-1 border rounded"
                      min="1"
                      step="1"
                      disabled={readOnly}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => removeLine(idx)}
                      className="text-red-600 hover:text-red-700"
                      disabled={readOnly}
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

      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => onBack?.()} className="px-3 py-2 rounded-lg text-sm border ui-surface ui-hover-sunken ui-border-c">
          Back
        </button>
        <button type="submit" disabled={saving || readOnly} className="px-3 py-2 rounded-lg text-sm ui-primary-bg disabled:opacity-50">
          {saving ? 'Saving…' : isEdit ? 'Save' : 'Create'}
        </button>
      </div>
    </form>
  );
};

const StockTransferDetails = ({ transfer, branches, warehouses, db, currentCompany, onAction }) => {
  const branchById = useMemo(() => new Map(safeArray(branches).map((b) => [normalizeId(b?.id), b])), [branches]);
  const warehouseById = useMemo(() => new Map(safeArray(warehouses).map((w) => [normalizeId(w?.id), w])), [warehouses]);

  const status = String(transfer?.status || '').trim() || 'Draft';

  const sb = branchById.get(normalizeId(transfer?.sourceBranchId)) || null;
  const tb = branchById.get(normalizeId(transfer?.targetBranchId)) || null;
  const sw = warehouseById.get(normalizeId(transfer?.sourceWarehouseId)) || null;
  const tw = warehouseById.get(normalizeId(transfer?.targetWarehouseId)) || null;

  const itemsById = useMemo(() => {
    const companyId = currentCompany?.id;
    const map = new Map();
    for (const it of safeArray(db?.items)) {
      if (Number(it?.companyId) !== Number(companyId)) continue;
      map.set(normalizeId(it?.id), it);
    }
    return map;
  }, [db?.items, currentCompany?.id]);

  const lines = safeArray(transfer?.lines).map((l) => {
    const it = itemsById.get(normalizeId(l?.itemId)) || null;
    return {
      itemId: normalizeId(l?.itemId),
      name: it?.name || `Item ${normalizeId(l?.itemId)}`,
      unit: String(it?.unit || '').trim(),
      qty: toNum(l?.qty || 0),
    };
  });

  const canSubmit = status === 'Draft';
  const canApprove = status === 'Submitted';
  const canReject = status === 'Submitted';
  const canCancel = status === 'Draft' || status === 'Submitted';

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-lg font-semibold">{transfer?.number || 'Stock Transfer'}</div>
          <div className="text-sm ui-muted">{transfer?.date || '-'}</div>
        </div>
        <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusPillClass(status)}`}>{status}</span>
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <div className="ui-muted">From</div>
          <div className="font-semibold">{getBranchLabel(sb) || transfer?.sourceBranchName || '-'}</div>
          <div className="ui-fg">{getWarehouseLabel(sw) || transfer?.sourceWarehouseName || '-'}</div>
        </div>
        <div>
          <div className="ui-muted">To</div>
          <div className="font-semibold">{getBranchLabel(tb) || transfer?.targetBranchName || '-'}</div>
          <div className="ui-fg">{getWarehouseLabel(tw) || transfer?.targetWarehouseName || '-'}</div>
        </div>
      </div>

      {transfer?.reason ? (
        <div className="text-sm">
          <div className="ui-muted">Reason / Notes</div>
          <div className="ui-fg whitespace-pre-wrap">{String(transfer.reason)}</div>
        </div>
      ) : null}

      <div className="ui-surface rounded-xl shadow-sm overflow-hidden border">
        <table className="w-full">
          <thead className="ui-sunken border-b">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium ui-muted uppercase">Item</th>
              <th className="px-4 py-3 text-right text-xs font-medium ui-muted uppercase">Qty</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {lines.length === 0 ? (
              <tr>
                <td colSpan={2} className="px-4 py-8 text-center ui-muted">
                  No lines
                </td>
              </tr>
            ) : (
              lines.map((l, idx) => (
                <tr key={idx} className="ui-hover-sunken">
                  <td className="px-4 py-3">
                    <div className="font-medium">{l.name}</div>
                    <div className="text-xs ui-muted">{l.itemId}</div>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">
                    {l.qty}{l.unit ? ` ${l.unit}` : ''}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex gap-2 flex-wrap">
        {canSubmit ? (
          <button
            type="button"
            onClick={() => onAction?.('submit')}
            className="px-3 py-2 rounded-lg text-sm ui-primary-bg "
          >
            Submit
          </button>
        ) : null}

        {canApprove ? (
          <button
            type="button"
            onClick={() => onAction?.('approve')}
            className="px-3 py-2 rounded-lg text-sm bg-green-600 text-white hover:bg-green-700 flex items-center gap-2"
          >
            <Check size={16} /> Approve
          </button>
        ) : null}

        {canReject ? (
          <button
            type="button"
            onClick={() => onAction?.('reject')}
            className="px-3 py-2 rounded-lg text-sm border ui-surface ui-hover-sunken ui-border-c flex items-center gap-2"
          >
            <X size={16} /> Reject
          </button>
        ) : null}

        {canCancel ? (
          <button
            type="button"
            onClick={() => onAction?.('cancel')}
            className="px-3 py-2 rounded-lg text-sm border ui-surface ui-hover-sunken ui-border-c"
          >
            Cancel
          </button>
        ) : null}
      </div>
    </div>
  );
};

export const StockTransfersList = ({ db, setDb, currentCompany, branches = [], warehouses = [], mode = 'warehouse', onNew, onEdit }) => {
  const companyId = currentCompany?.id;

  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [openMenu, setOpenMenu] = useState(null);
  const menuRef = useRef(null);

  const branchById = useMemo(() => new Map(safeArray(branches).map((b) => [normalizeId(b?.id), b])), [branches]);
  const warehouseById = useMemo(() => new Map(safeArray(warehouses).map((w) => [normalizeId(w?.id), w])), [warehouses]);

  const getBranchIdFromWarehouseId = (warehouseId) => {
    const w = warehouseById.get(normalizeId(warehouseId)) || null;
    return normalizeId(w?.branchId);
  };

  const transfers = useMemo(() => {
    return safeArray(db?.stockTransfers)
      .filter((t) => Number(t?.companyId) === Number(companyId))
      .filter((t) => {
        const sb = getBranchIdFromWarehouseId(t?.sourceWarehouseId);
        const tb = getBranchIdFromWarehouseId(t?.targetWarehouseId);
        if (!sb || !tb) return true;
        const isBranchTransfer = sb !== tb;
        if (mode === 'branch') return isBranchTransfer;
        return !isBranchTransfer;
      })
      .slice()
      .sort((a, b) => {
        const da = String(a?.date || '');
        const dbb = String(b?.date || '');
        if (da !== dbb) return da < dbb ? 1 : -1;
        return String(a?.number || '').localeCompare(String(b?.number || ''));
      });
  }, [db?.stockTransfers, companyId, mode, warehouseById]);

  const filteredTransfers = useMemo(() => {
    const q = String(searchText || '').trim().toLowerCase();
    const wantStatus = String(statusFilter || '').trim();

    const matchesSearch = (t) => {
      if (!q) return true;
      const hay = [t?.number, t?.sourceBranchName, t?.sourceWarehouseName, t?.targetBranchName, t?.targetWarehouseName]
        .map((x) => String(x || '').trim().toLowerCase())
        .filter(Boolean)
        .join(' ');
      return hay.includes(q);
    };

    return transfers
      .filter((t) => matchesSearch(t))
      .filter((t) => {
        if (!wantStatus) return true;
        return String(t?.status || '').trim() === wantStatus;
      });
  }, [searchText, statusFilter, transfers]);

  useEffect(() => {
    if (!openMenu?.id) return;

    const onMouseDown = (e) => {
      if (menuRef.current && menuRef.current.contains(e.target)) return;
      const btn = e.target?.closest?.('[data-transfer-menu-button]');
      if (btn && String(btn.getAttribute('data-transfer-menu-button')) === String(openMenu.id)) return;
      setOpenMenu(null);
    };

    const onScrollOrResize = () => setOpenMenu(null);

    document.addEventListener('mousedown', onMouseDown);
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);

    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [openMenu?.id]);

  const openCreate = () => onNew?.();
  const openEdit = (transfer) => onEdit?.(transfer);

  const removeTransfer = (transfer) => {
    const ok = window.confirm(`Delete stock transfer ${transfer?.number || ''}?`);
    if (!ok) return;

    setDb((prev) => {
      const list = safeArray(prev?.stockTransfers);
      const next = list.filter((t) => normalizeId(t?.id) !== normalizeId(transfer?.id));
      return { ...prev, stockTransfers: next };
    });
  };

  const updateStatus = (transfer, status) => {
    const nextStatus = String(status || '').trim();
    setDb((prev) => {
      const list = safeArray(prev?.stockTransfers);
      return {
        ...prev,
        stockTransfers: list.map((t) => {
          if (normalizeId(t?.id) !== normalizeId(transfer?.id)) return t;
          return { ...t, status: nextStatus };
        }),
      };
    });
  };

  const approveWithStockCheck = (transfer) => {
    const sourceWarehouseId = normalizeId(transfer?.sourceWarehouseId);
    const date = String(transfer?.date || '').trim();

    const lines = safeArray(transfer?.lines)
      .map((l) => ({ itemId: normalizeId(l?.itemId), qty: toNum(l?.qty || 0) }))
      .filter((l) => l.itemId && l.qty > 0);

    if (!sourceWarehouseId) {
      alert('From Warehouse is required');
      return;
    }

    const summary = computeInventorySummaryByItemId({ db, companyId: currentCompany?.id, fromDate: '', toDate: date, warehouseId: sourceWarehouseId });

    for (const l of lines) {
      const row = summary.get(l.itemId);
      const available = toNum(row?.closingQty ?? 0);
      if (available + 0.0001 < l.qty) {
        alert(`Not enough stock for item ${l.itemId} in the source warehouse. Available: ${available}, trying to transfer: ${l.qty}`);
        return;
      }
    }

    updateStatus(transfer, 'Approved');
  };

  const MENU_WIDTH = 224; // w-56
  const MENU_HEIGHT_ESTIMATE = 340;

  const openRowMenu = (id, anchorEl) => {
    if (!anchorEl) {
      setOpenMenu({ id, left: 0, top: 0 });
      return;
    }

    const rect = anchorEl.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const padding = 8;

    let left = rect.right - MENU_WIDTH;
    left = Math.max(padding, Math.min(left, vw - MENU_WIDTH - padding));

    let top = rect.bottom + 8;
    if (top + MENU_HEIGHT_ESTIMATE > vh - padding) {
      top = rect.top - MENU_HEIGHT_ESTIMATE - 8;
    }

    setOpenMenu({ id, left, top });
  };

  return (
    <div className="space-y-4">
        <div className="flex justify-between items-center gap-3 flex-wrap">
          <div>
          <h3 className="text-xl font-bold">{mode === 'branch' ? 'Branch Transfers' : 'Warehouse Transfers'}</h3>
          <div className="text-sm ui-muted">{mode === 'branch' ? 'Between branches' : 'Within the same branch'}</div>
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="flex items-center gap-2 ui-primary-bg px-4 py-2 rounded-lg "
          >
          <Plus size={18} /> New Transfer
          </button>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="text-sm font-medium">Search:</div>
            <input
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="px-3 py-2 border rounded-lg text-sm"
              placeholder="Transfer #, branch, warehouse"
            />
          </div>

          <div className="flex items-center gap-2">
            <div className="text-sm font-medium">Status:</div>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-2 border rounded-lg text-sm">
              <option value="">All</option>
              <option value="Draft">Draft</option>
              <option value="Submitted">Submitted</option>
              <option value="Approved">Approved</option>
              <option value="Rejected">Rejected</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </div>
        </div>

        <div className="ui-surface rounded-xl shadow-sm overflow-hidden border">
          <table className="w-full">
            <thead className="ui-sunken border-b">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium ui-muted uppercase">Transfer #</th>
                <th className="px-6 py-3 text-left text-xs font-medium ui-muted uppercase">From</th>
                <th className="px-6 py-3 text-left text-xs font-medium ui-muted uppercase">To</th>
                <th className="px-6 py-3 text-left text-xs font-medium ui-muted uppercase">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium ui-muted uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium ui-muted uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredTransfers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center ui-muted">
                    No stock transfers found
                  </td>
                </tr>
              ) : (
                filteredTransfers.map((t) => {
                  const status = String(t?.status || '').trim() || 'Draft';

                  const sb = branchById.get(normalizeId(t?.sourceBranchId)) || null;
                  const tb = branchById.get(normalizeId(t?.targetBranchId)) || null;
                  const sw = warehouseById.get(normalizeId(t?.sourceWarehouseId)) || null;
                  const tw = warehouseById.get(normalizeId(t?.targetWarehouseId)) || null;

                  const fromLabel = [getBranchLabel(sb) || t?.sourceBranchName, getWarehouseLabel(sw) || t?.sourceWarehouseName]
                    .map((x) => String(x || '').trim())
                    .filter(Boolean)
                    .join(' / ');

                  const toLabel = [getBranchLabel(tb) || t?.targetBranchName, getWarehouseLabel(tw) || t?.targetWarehouseName]
                    .map((x) => String(x || '').trim())
                    .filter(Boolean)
                    .join(' / ');

                  return (
                    <tr
                      key={normalizeId(t?.id)}
                      className="ui-hover-sunken cursor-pointer"
                      onClick={(e) => {
                        const el = e.target;
                        if (el?.closest?.('[data-transfer-menu-button]')) return;
                        if (el?.closest?.('[data-transfer-menu]')) return;
                        openEdit(t);
                      }}
                    >
                      <td className="px-6 py-4 font-medium">{t?.number || '-'}</td>
                      <td className="px-6 py-4">{fromLabel || '-'}</td>
                      <td className="px-6 py-4">{toLabel || '-'}</td>
                      <td className="px-6 py-4">{t?.date || '-'}</td>
                      <td className="px-6 py-4">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusPillClass(status)}`}>{status}</span>
                      </td>
                      <td
                        className="px-6 py-4 relative"
                        onMouseDown={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onMouseDown={(e) => e.stopPropagation()}
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (openMenu?.id === normalizeId(t?.id)) {
                              setOpenMenu(null);
                            } else {
                              openRowMenu(normalizeId(t?.id), e.currentTarget);
                            }
                          }}
                          className="p-2 rounded-lg border ui-surface ui-hover-sunken ui-border-c"
                          aria-label="Transfer actions"
                          data-transfer-menu-button={normalizeId(t?.id)}
                        >
                          <MoreVertical size={18} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {openMenu?.id ? (
          <div
            ref={menuRef}
            className="fixed w-56 ui-surface border ui-border-c rounded-xl shadow-lg overflow-hidden z-[9999]"
            style={{ left: openMenu.left, top: openMenu.top }}
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            data-transfer-menu
          >
            {(() => {
              const t = transfers.find((x) => normalizeId(x?.id) === normalizeId(openMenu?.id));
              if (!t) return null;
              const status = String(t?.status || '').trim() || 'Draft';
              const editable = status === 'Draft';
              const canSubmit = status === 'Draft';
              const canApprove = status === 'Submitted';
              const canReject = status === 'Submitted';
              const canCancel = status === 'Draft' || status === 'Submitted';

              return (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setOpenMenu(null);
                      openEdit(t);
                    }}
                    className="w-full px-4 py-2 text-left text-sm ui-hover-sunken"
                  >
                    View
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setOpenMenu(null);
                      if (editable) openEdit(t);
                    }}
                    disabled={!editable}
                    className={`w-full px-4 py-2 text-left text-sm flex items-center gap-2 ${ editable ? 'ui-hover-sunken' : 'ui-subtle cursor-not-allowed ui-surface'
                    }`}
                  >
                    <Pencil size={16} className={editable ? 'ui-muted' : 'ui-subtle'} />
                    <span>Edit</span>
                  </button>

                  {canSubmit ? (
                    <button
                      type="button"
                      onClick={() => {
                        setOpenMenu(null);
                        updateStatus(t, 'Submitted');
                      }}
                      className="w-full px-4 py-2 text-left text-sm ui-hover-sunken"
                    >
                      Submit
                    </button>
                  ) : null}

                  {canApprove ? (
                    <button
                      type="button"
                      onClick={() => {
                        setOpenMenu(null);
                        approveWithStockCheck(t);
                      }}
                      className="w-full px-4 py-2 text-left text-sm ui-hover-sunken flex items-center gap-2"
                    >
                      <Check size={16} className="ui-muted" />
                      <span>Approve</span>
                    </button>
                  ) : null}

                  {canReject ? (
                    <button
                      type="button"
                      onClick={() => {
                        setOpenMenu(null);
                        const ok = window.confirm('Reject this transfer?');
                        if (!ok) return;
                        updateStatus(t, 'Rejected');
                      }}
                      className="w-full px-4 py-2 text-left text-sm ui-hover-sunken flex items-center gap-2"
                    >
                      <X size={16} className="ui-muted" />
                      <span>Reject</span>
                    </button>
                  ) : null}

                  {canCancel ? (
                    <button
                      type="button"
                      onClick={() => {
                        setOpenMenu(null);
                        const ok = window.confirm('Cancel this transfer?');
                        if (!ok) return;
                        updateStatus(t, 'Cancelled');
                      }}
                      className="w-full px-4 py-2 text-left text-sm ui-hover-sunken"
                    >
                      Cancel
                    </button>
                  ) : null}

                  <div className="border-t ui-border-c" />

                  <button
                    type="button"
                    onClick={() => {
                      setOpenMenu(null);
                      if (editable) removeTransfer(t);
                    }}
                    disabled={!editable}
                    className={`w-full px-4 py-2 text-left text-sm flex items-center gap-2 ${ editable ? 'ui-hover-sunken text-red-600' : 'ui-subtle cursor-not-allowed ui-surface'
                    }`}
                  >
                    <Trash2 size={16} className={editable ? 'text-red-600' : 'ui-subtle'} />
                    <span>Delete</span>
                  </button>
                </>
              );
            })()}
          </div>
        ) : null}
    </div>
  );
};

export default StockTransfersList;
