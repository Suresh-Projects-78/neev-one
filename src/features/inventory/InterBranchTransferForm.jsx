import React, { useState } from 'react';
import { createTransfer } from '../../api/transfers';

export function InterBranchTransferForm({ orgId, branches = [], items = [], onCreated }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [sourceBranchId, setSourceBranchId] = useState('');
  const [targetBranchId, setTargetBranchId] = useState('');
  const [lines, setLines] = useState([{ itemId: '', qty: 1 }]);

  const updateLine = (idx, patch) => {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };

  const addLine = () => setLines((prev) => [...prev, { itemId: '', qty: 1 }]);
  const removeLine = (idx) => setLines((prev) => prev.filter((_, i) => i !== idx));

  const onSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        sourceBranchId,
        targetBranchId,
        lines: lines
          .filter((l) => l.itemId)
          .map((l) => ({ itemId: l.itemId, qty: Number(l.qty || 0) })),
      };
      const res = await createTransfer(orgId, payload);
      onCreated?.(res.transfer);
      setLines([{ itemId: '', qty: 1 }]);
    } catch (err) {
      setError(err.message || 'Failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="ui-surface border rounded-xl p-5 space-y-4">
      <div className="ui-title text-base">Inter-branch Transfer</div>
      {error ? <div className="text-sm text-red-600">{error}</div> : null}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Source Branch</label>
          <select className="ui-select w-full px-3 py-2" value={sourceBranchId} onChange={(e) => setSourceBranchId(e.target.value)} required>
            <option value="">Select</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.branchCode} - {b.branchName}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Destination Branch</label>
          <select className="ui-select w-full px-3 py-2" value={targetBranchId} onChange={(e) => setTargetBranchId(e.target.value)} required>
            <option value="">Select</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.branchCode} - {b.branchName}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="border rounded-xl overflow-hidden">
        <div className="px-4 py-2 ui-sunken border-b font-semibold">Items</div>
        <div className="p-4 space-y-3">
          {lines.map((l, idx) => (
            <div key={idx} className="grid grid-cols-12 gap-3 items-end">
              <div className="col-span-8">
                <label className="block text-xs ui-muted mb-1">Item</label>
                <select className="ui-select w-full px-3 py-2" value={l.itemId} onChange={(e) => updateLine(idx, { itemId: e.target.value })}>
                  <option value="">Select</option>
                  {items.map((it) => (
                    <option key={it.id} value={it.id}>
                      {it.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-span-3">
                <label className="block text-xs ui-muted mb-1">Qty</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  className="ui-input w-full px-3 py-2"
                  value={l.qty}
                  onChange={(e) => updateLine(idx, { qty: e.target.value })}
                />
              </div>
              <div className="col-span-1">
                <button type="button" onClick={() => removeLine(idx)} className="w-full px-2 py-2 border rounded-lg ui-hover-sunken">
                  ×
                </button>
              </div>
            </div>
          ))}

          <button type="button" onClick={addLine} className="px-3 py-2 border rounded-lg ui-hover-sunken text-sm">
            + Add line
          </button>
        </div>
      </div>

      <div className="flex justify-end">
        <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg ui-primary-bg disabled:opacity-50">
          {saving ? 'Creating…' : 'Create Transfer'}
        </button>
      </div>
    </form>
  );
}
