import React, { useEffect, useState } from 'react';
import { BranchCreateForm } from './BranchCreateForm';
import { WarehouseCreateForm } from './WarehouseCreateForm';
import { listBranches, listWarehouses, deleteBranch, deleteWarehouse } from '../../api/admin';

export function SettingsWarehousesBranches({ orgId }) {
  const [tab, setTab] = useState('branches');
  const [branches, setBranches] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadAll = async () => {
    setLoading(true);
    setError('');
    try {
      const [b, w] = await Promise.all([listBranches(orgId), listWarehouses(orgId)]);
      setBranches(Array.isArray(b.branches) ? b.branches : []);
      setWarehouses(Array.isArray(w.warehouses) ? w.warehouses : []);
    } catch (err) {
      setError(err.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!orgId) return;
    loadAll();
  }, [orgId]);

  const onBranchCreated = (branch) => {
    setBranches((prev) => [...prev, branch]);
  };

  const onWarehouseCreated = (wh) => {
    setWarehouses((prev) => [...prev, wh]);
  };

  const removeBranch = async (id) => {
    if (!window.confirm('Delete this branch?')) return;
    await deleteBranch(orgId, id);
    setBranches((prev) => prev.filter((b) => b.id !== id));
  };

  const removeWarehouse = async (id) => {
    if (!window.confirm('Delete this warehouse?')) return;
    await deleteWarehouse(orgId, id);
    setWarehouses((prev) => prev.filter((w) => w.id !== id));
  };

  const branchLookup = Object.fromEntries(branches.map((b) => [b.id, b]));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-2xl font-bold">Warehouse & Branches</div>
          <div className="text-sm text-gray-500">Manage branches and warehouses with GST validation</div>
        </div>
        <div className="flex gap-2">
          {['branches', 'warehouses'].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-2 rounded-lg border ${tab === t ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
            >
              {t === 'branches' ? 'Branches' : 'Warehouses'}
            </button>
          ))}
        </div>
      </div>

      {error ? <div className="text-sm text-red-600">{error}</div> : null}
      {loading ? <div className="text-sm text-gray-500">Loading…</div> : null}

      {tab === 'branches' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-white border rounded-xl p-4">
            <div className="text-lg font-semibold mb-2">Branches</div>
            <div className="divide-y">
              {branches.map((b) => (
                <div key={b.id} className="py-3 flex items-center justify-between">
                  <div>
                    <div className="font-semibold">{b.branchName}</div>
                    <div className="text-xs text-gray-500">Code: {b.branchCode}</div>
                    {b.gstin ? <div className="text-xs text-gray-500">GSTIN: {b.gstin}</div> : null}
                  </div>
                  <button onClick={() => removeBranch(b.id)} className="text-red-600 text-sm">Delete</button>
                </div>
              ))}
              {!branches.length ? <div className="text-sm text-gray-500 py-3">No branches yet</div> : null}
            </div>
          </div>
          <BranchCreateForm orgId={orgId} onCreated={onBranchCreated} />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-white border rounded-xl p-4">
            <div className="text-lg font-semibold mb-2">Warehouses</div>
            <div className="divide-y">
              {warehouses.map((w) => (
                <div key={w.id} className="py-3 flex items-center justify-between">
                  <div>
                    <div className="font-semibold">{w.name}</div>
                    <div className="text-xs text-gray-500">Branch: {branchLookup[w.branchId]?.branchName || branchLookup[w.branchId]?.name || '—'}</div>
                    {w.gstin ? <div className="text-xs text-gray-500">GSTIN: {w.gstin}</div> : null}
                  </div>
                  <button onClick={() => removeWarehouse(w.id)} className="text-red-600 text-sm">Delete</button>
                </div>
              ))}
              {!warehouses.length ? <div className="text-sm text-gray-500 py-3">No warehouses yet</div> : null}
            </div>
          </div>
          <WarehouseCreateForm orgId={orgId} branches={branches} onCreated={onWarehouseCreated} />
        </div>
      )}
    </div>
  );
}
