import React, { useEffect, useMemo, useRef, useState } from 'react';
import { TableSkeleton } from '../../components/ui/Primitives';
import { exportRows } from '../../components/ListToolbar';
import { confirmDialog } from '../../components/ui/notify';
import { listBranches, listWarehouses, createWarehouse, updateWarehouse, deleteWarehouse } from '../../api/admin';
import PopupSelect from '../../components/pickers/PopupSelect';
import { GST_STATE_BY_CODE, getGstStateFromGstin } from '../../utils/gst';
import Popover from '../../components/ui/Popover';

export function SettingsWarehouses({ orgId, branchId, onWarehousesChanged }) {
  const [warehouses, setWarehouses] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [openMenuForWarehouseId, setOpenMenuForWarehouseId] = useState(null);
  /** The trigger the open menu hangs from; only one row's menu is open. */
  const menuAnchorRef = useRef(null);
  const [viewWarehouseId, setViewWarehouseId] = useState(null);
  const [editingWarehouseId, setEditingWarehouseId] = useState(null);
  const [editSaving, setEditSaving] = useState(false);
  const [form, setForm] = useState({
    branchId: branchId ? String(branchId) : '',
    name: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    country: 'India',
    gstRegistrationType: 'UNREGISTERED',
    gstin: '',
    contactPerson: '',
    phone: '',
    email: '',
  });

  const [editForm, setEditForm] = useState({
    branchId: branchId ? String(branchId) : '',
    name: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    country: 'India',
    gstRegistrationType: 'UNREGISTERED',
    gstin: '',
    contactPerson: '',
    phone: '',
    email: '',
  });

  const stateOptions = useMemo(() => {
    return Object.keys(GST_STATE_BY_CODE || {})
      .sort()
      .map((code) => ({
        code,
        value: String(GST_STATE_BY_CODE[code] || '').trim(),
        label: String(GST_STATE_BY_CODE[code] || '').trim(),
      }))
      .filter((o) => o.value);
  }, []);

  const branchOptions = useMemo(() => {
    return (Array.isArray(branches) ? branches : [])
      .map((b) => ({
        value: String(b.id),
        label: String(b.branchName || b.name || '').trim() || `Branch ${String(b.id)}`,
        code: b.branchCode ? String(b.branchCode) : undefined,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [branches]);

  const branchLookup = useMemo(() => {
    const map = new Map();
    (Array.isArray(branches) ? branches : []).forEach((b) => map.set(String(b.id), b));
    return map;
  }, [branches]);

  const loadBranches = async () => {
    if (!orgId) return;
    try {
      setError('');
      const res = await listBranches(orgId);
      setBranches(Array.isArray(res.branches) ? res.branches : []);
    } catch (err) {
      setBranches([]);
      setError(err.message || 'Failed to load branches');
    }
  };

  const loadWarehouses = async () => {
    if (!orgId) return;
    setLoading(true);
    setError('');
    try {
      const res = await listWarehouses(orgId);
      const all = Array.isArray(res.warehouses) ? res.warehouses : [];
      // Filter by branchId if provided
      const filtered = branchId ? all.filter((w) => String(w.branchId) === String(branchId)) : all;
      setWarehouses(filtered);
    } catch (err) {
      setError(err.message || 'Failed to load warehouses');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBranches();
    loadWarehouses();
  }, [orgId, branchId]);

  const onChange = (k) => (e) => {
    const next = e.target.value;
    if (k === 'gstin') {
      const maybeState = getGstStateFromGstin(String(next || '').trim());
      setForm((p) => ({ ...p, gstin: next, state: maybeState ? maybeState : p.state }));
      setError('');
      return;
    }
    setForm((p) => ({ ...p, [k]: next }));
    setError('');
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const selectedBranchId = String(form.branchId || '').trim();
      if (!selectedBranchId) {
        setError('Branch is required');
        return;
      }

      const payload = {
        branchId: selectedBranchId,
        name: String(form.name || '').trim(),
        addressLine1: String(form.addressLine1 || '').trim() || null,
        addressLine2: String(form.addressLine2 || '').trim() || null,
        city: String(form.city || '').trim() || null,
        state: String(form.state || '').trim() || null,
        country: String(form.country || '').trim() || null,
        gstRegistrationType: String(form.gstRegistrationType || 'UNREGISTERED').trim(),
        gstin: String(form.gstin || '').trim() || null,
        contactPerson: String(form.contactPerson || '').trim() || null,
        phone: String(form.phone || '').trim() || null,
        email: String(form.email || '').trim() || null,
      };

      if (!payload.name) {
        setError('Warehouse name is required');
        return;
      }

      if (payload.gstRegistrationType !== 'UNREGISTERED' && !payload.gstin) {
        setError('GSTIN is required for registered warehouses');
        return;
      }

      const res = await createWarehouse(orgId, payload);
      setWarehouses((prev) => [...prev, res.warehouse]);
      if (typeof onWarehousesChanged === 'function') onWarehousesChanged();
      setForm({
        branchId: branchId ? String(branchId) : '',
        name: '',
        addressLine1: '',
        addressLine2: '',
        city: '',
        state: '',
        country: 'India',
        gstRegistrationType: 'UNREGISTERED',
        gstin: '',
        contactPerson: '',
        phone: '',
        email: '',
      });
      setShowForm(false);
    } catch (err) {
      setError(err.message || 'Failed to create warehouse');
    } finally {
      setSaving(false);
    }
  };

  const openView = (warehouseId) => {
    setViewWarehouseId(String(warehouseId));
    setEditingWarehouseId(null);
    setOpenMenuForWarehouseId(null);
  };

  const closeDetails = () => {
    setViewWarehouseId(null);
    setEditingWarehouseId(null);
  };

  const beginEdit = (w) => {
    setEditingWarehouseId(String(w.id));
    setViewWarehouseId(String(w.id));
    setEditForm({
      branchId: String(w.branchId || ''),
      name: String(w.name || '').trim(),
      addressLine1: String(w.addressLine1 || ''),
      addressLine2: String(w.addressLine2 || ''),
      city: String(w.city || ''),
      state: String(w.state || ''),
      country: String(w.country || 'India'),
      gstRegistrationType: String(w.gstRegistrationType || 'UNREGISTERED'),
      gstin: String(w.gstin || ''),
      contactPerson: String(w.contactPerson || ''),
      phone: String(w.phone || ''),
      email: String(w.email || ''),
    });
    setOpenMenuForWarehouseId(null);
    setError('');
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    if (!editingWarehouseId) return;
    setEditSaving(true);
    setError('');
    try {
      const payload = {
        branchId: String(editForm.branchId || '').trim(),
        name: String(editForm.name || '').trim(),
        addressLine1: String(editForm.addressLine1 || '').trim() || null,
        addressLine2: String(editForm.addressLine2 || '').trim() || null,
        city: String(editForm.city || '').trim() || null,
        state: String(editForm.state || '').trim() || null,
        country: String(editForm.country || '').trim() || null,
        gstRegistrationType: String(editForm.gstRegistrationType || 'UNREGISTERED').trim(),
        gstin: String(editForm.gstin || '').trim() || null,
        contactPerson: String(editForm.contactPerson || '').trim() || null,
        phone: String(editForm.phone || '').trim() || null,
        email: String(editForm.email || '').trim() || null,
      };

      if (!payload.branchId) throw new Error('Branch is required');
      if (!payload.name) throw new Error('Warehouse name is required');
      if (payload.gstRegistrationType !== 'UNREGISTERED' && !payload.gstin) {
        throw new Error('GSTIN is required for registered warehouses');
      }

      const res = await updateWarehouse(orgId, editingWarehouseId, payload);
      const updated = res?.warehouse;
      if (updated) {
        setWarehouses((prev) => prev.map((x) => (String(x.id) === String(updated.id) ? updated : x)));
      } else {
        await loadWarehouses();
      }
      if (typeof onWarehousesChanged === 'function') onWarehousesChanged();
      setEditingWarehouseId(null);
    } catch (err) {
      setError(err.message || 'Failed to update warehouse');
    } finally {
      setEditSaving(false);
    }
  };

  const removeWarehouse = async (id) => {
    if (!await confirmDialog({ title: 'Please confirm', message: 'Delete this warehouse?', confirmLabel: 'Yes, continue' })) return;
    try {
      await deleteWarehouse(orgId, id);
      setWarehouses((prev) => prev.filter((w) => w.id !== id));
      if (typeof onWarehousesChanged === 'function') onWarehousesChanged();
    } catch (err) {
      setError(err.message || 'Failed to delete');
    }
  };

  const query = String(search || '').trim().toLowerCase();
  const filteredWarehouses = query
    ? warehouses.filter((w) => {
        const b = branchLookup.get(String(w.branchId || ''));
        const branchName = String((b && (b.branchName || b.name)) || '').toLowerCase();
        const name = String(w?.name || '').toLowerCase();
        const gstin = String(w?.gstin || '').toLowerCase();
        const city = String(w?.city || '').toLowerCase();
        const state = String(w?.state || '').toLowerCase();
        const phone = String(w?.phone || '').toLowerCase();
        const email = String(w?.email || '').toLowerCase();
        return [branchName, name, gstin, city, state, phone, email].some((s) => s.includes(query));
      })
    : warehouses;

  const selectedWarehouse = useMemo(() => {
    if (!viewWarehouseId) return null;
    return warehouses.find((w) => String(w.id) === String(viewWarehouseId)) || null;
  }, [warehouses, viewWarehouseId]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="ui-t-sec">Warehouses</div>
        <button
          type="button"
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 rounded-lg ui-btn ui-btn-primary "
        >
          + Create Warehouse
        </button>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="w-full max-w-sm">
          <div className="relative">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search warehouses"
              className="ui-input w-full pl-3 pr-3 py-2 ui-surface"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs ui-muted whitespace-nowrap">{filteredWarehouses.length} rows</span>
          <button
            type="button"
            onClick={() =>
              exportRows({
                fileName: 'Warehouses',
                label: 'warehouse(s)',
                columns: [
              { key: 'name', label: 'Warehouse' },
              { key: 'code', label: 'Code' },
              { key: 'branchName', label: 'Branch' },
              { key: 'city', label: 'City' },
                ],
                rows: filteredWarehouses,
              })
            }
            className="ui-btn ui-btn-secondary"
          >
            Export
          </button>
        </div>
      </div>

      {error && <div className="text-sm text-[rgb(var(--neg))] bg-[rgb(var(--neg-soft))] border border-[rgb(var(--neg)/0.35)] rounded-lg p-3">{error}</div>}

      {selectedWarehouse ? (
        <div className="ui-surface border rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="ui-t-sec">Warehouse Details</div>
              <div className="text-xs ui-muted">{selectedWarehouse.name || ''}</div>
            </div>
            <div className="flex gap-2">
              {editingWarehouseId ? null : (
                <button
                  type="button"
                  onClick={() => beginEdit(selectedWarehouse)}
                  className="px-4 py-2 rounded-lg border ui-surface ui-hover-sunken"
                >
                  Edit
                </button>
              )}
              <button type="button" onClick={closeDetails} className="px-4 py-2 rounded-lg border ui-surface ui-hover-sunken">
                Close
              </button>
            </div>
          </div>

          {editingWarehouseId ? (
            <form onSubmit={saveEdit} className="space-y-4">
              <div className="grid grid-cols-12 gap-4">
                <div className="col-span-12 sm:col-span-6">
                  <PopupSelect
                    label="Branch *"
                    value={editForm.branchId}
                    onChange={(v) => {
                      setEditForm((p) => ({ ...p, branchId: v }));
                      setError('');
                    }}
                    options={branchOptions}
                    placeholder="Select branch"
                  />
                </div>
                <div className="col-span-12 sm:col-span-6">
                  <label className="block text-sm font-medium mb-1">Warehouse Name *</label>
                  <input className="ui-input w-full px-3 py-2" value={editForm.name} onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))} required />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Address Line 1</label>
                  <input className="ui-input w-full px-3 py-2" value={editForm.addressLine1} onChange={(e) => setEditForm((p) => ({ ...p, addressLine1: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Address Line 2</label>
                  <input className="ui-input w-full px-3 py-2" value={editForm.addressLine2} onChange={(e) => setEditForm((p) => ({ ...p, addressLine2: e.target.value }))} />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">City</label>
                  <input className="ui-input w-full px-3 py-2" value={editForm.city} onChange={(e) => setEditForm((p) => ({ ...p, city: e.target.value }))} />
                </div>
                <div>
                  <PopupSelect
                    label="State"
                    value={editForm.state}
                    onChange={(v) => {
                      setEditForm((p) => ({ ...p, state: v }));
                      setError('');
                    }}
                    options={stateOptions}
                    placeholder="Select state"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Country</label>
                  <input className="ui-input w-full px-3 py-2" value={editForm.country} onChange={(e) => setEditForm((p) => ({ ...p, country: e.target.value }))} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">GST Registration</label>
                  <select className="ui-select w-full px-3 py-2 ui-surface" value={editForm.gstRegistrationType} onChange={(e) => setEditForm((p) => ({ ...p, gstRegistrationType: e.target.value }))}>
                    <option value="UNREGISTERED">Unregistered</option>
                    <option value="REGULAR">Regular</option>
                    <option value="COMPOSITION">Composition</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">GSTIN</label>
                  <input
                    className="ui-input w-full px-3 py-2"
                    value={editForm.gstin}
                    onChange={(e) => {
                      const next = e.target.value;
                      const maybeState = getGstStateFromGstin(String(next || '').trim());
                      setEditForm((p) => ({ ...p, gstin: next, state: maybeState ? maybeState : p.state }));
                      setError('');
                    }}
                    placeholder="15 characters"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Contact Person</label>
                  <input className="ui-input w-full px-3 py-2" value={editForm.contactPerson} onChange={(e) => setEditForm((p) => ({ ...p, contactPerson: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Phone</label>
                  <input className="ui-input w-full px-3 py-2" value={editForm.phone} onChange={(e) => setEditForm((p) => ({ ...p, phone: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Email</label>
                  <input type="email" className="ui-input w-full px-3 py-2" value={editForm.email} onChange={(e) => setEditForm((p) => ({ ...p, email: e.target.value }))} />
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setEditingWarehouseId(null)} className="px-4 py-2 rounded-lg border ui-surface ui-hover-sunken">
                  Cancel
                </button>
                <button type="submit" disabled={editSaving} className="px-4 py-2 rounded-lg ui-btn ui-btn-primary disabled:opacity-50">
                  {editSaving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
          ) : (
            <div className="grid grid-cols-12 gap-4 text-sm">
              <div className="col-span-12 sm:col-span-4">
                <div className="text-xs ui-muted">Branch</div>
                <div className="font-medium">
                  {(() => {
                    const b = branchLookup.get(String(selectedWarehouse.branchId || ''));
                    return (b && (b.branchName || b.name)) ? String(b.branchName || b.name) : '—';
                  })()}
                </div>
              </div>
              <div className="col-span-12 sm:col-span-4">
                <div className="text-xs ui-muted">GST Registration</div>
                <div className="font-medium">{selectedWarehouse.gstRegistrationType || 'UNREGISTERED'}</div>
              </div>
              <div className="col-span-12 sm:col-span-4">
                <div className="text-xs ui-muted">GSTIN</div>
                <div className="font-medium">{selectedWarehouse.gstin || '—'}</div>
              </div>

              <div className="col-span-12 sm:col-span-6">
                <div className="text-xs ui-muted">Address</div>
                <div className="font-medium">
                  {[selectedWarehouse.addressLine1, selectedWarehouse.addressLine2].filter(Boolean).join(', ') || '—'}
                </div>
              </div>
              <div className="col-span-12 sm:col-span-6">
                <div className="text-xs ui-muted">Location</div>
                <div className="font-medium">
                  {[selectedWarehouse.city, selectedWarehouse.state, selectedWarehouse.country].filter(Boolean).join(', ') || '—'}
                </div>
              </div>

              <div className="col-span-12 sm:col-span-4">
                <div className="text-xs ui-muted">Contact Person</div>
                <div className="font-medium">{selectedWarehouse.contactPerson || '—'}</div>
              </div>
              <div className="col-span-12 sm:col-span-4">
                <div className="text-xs ui-muted">Phone</div>
                <div className="font-medium">{selectedWarehouse.phone || '—'}</div>
              </div>
              <div className="col-span-12 sm:col-span-4">
                <div className="text-xs ui-muted">Email</div>
                <div className="font-medium">{selectedWarehouse.email || '—'}</div>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {showForm && (
        <form onSubmit={onSubmit} className="ui-surface border rounded-xl p-5 space-y-4">
          <div className="ui-t-sec">New Warehouse</div>

          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-12 sm:col-span-6">
              <PopupSelect
                label="Branch *"
                value={form.branchId}
                onChange={(v) => {
                  setForm((p) => ({ ...p, branchId: v }));
                  setError('');
                }}
                options={branchOptions}
                placeholder="Select branch"
              />
            </div>
            <div className="col-span-12 sm:col-span-6">
              <label className="block text-sm font-medium mb-1">Warehouse Name *</label>
              <input className="ui-input w-full px-3 py-2" value={form.name} onChange={onChange('name')} required />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Address Line 1</label>
              <input className="ui-input w-full px-3 py-2" value={form.addressLine1} onChange={onChange('addressLine1')} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Address Line 2</label>
              <input className="ui-input w-full px-3 py-2" value={form.addressLine2} onChange={onChange('addressLine2')} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">City</label>
              <input className="ui-input w-full px-3 py-2" value={form.city} onChange={onChange('city')} />
            </div>
            <div>
              <PopupSelect
                label="State"
                value={form.state}
                onChange={(v) => {
                  setForm((p) => ({ ...p, state: v }));
                  setError('');
                }}
                options={stateOptions}
                placeholder="Select state"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Country</label>
              <input className="ui-input w-full px-3 py-2" value={form.country} onChange={onChange('country')} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">GST Registration</label>
              <select className="ui-select w-full px-3 py-2 ui-surface" value={form.gstRegistrationType} onChange={onChange('gstRegistrationType')}>
                <option value="UNREGISTERED">Unregistered</option>
                <option value="REGULAR">Regular</option>
                <option value="COMPOSITION">Composition</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">GSTIN</label>
              <input
                className="ui-input w-full px-3 py-2"
                value={form.gstin}
                onChange={onChange('gstin')}
                placeholder="15 characters"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Contact Person</label>
              <input className="ui-input w-full px-3 py-2" value={form.contactPerson} onChange={onChange('contactPerson')} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Phone</label>
              <input className="ui-input w-full px-3 py-2" value={form.phone} onChange={onChange('phone')} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <input type="email" className="ui-input w-full px-3 py-2" value={form.email} onChange={onChange('email')} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg border ui-surface ui-hover-sunken">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg ui-btn ui-btn-primary disabled:opacity-50">
              {saving ? 'Creating…' : 'Create Warehouse'}
            </button>
          </div>
        </form>
      )}

      <div className="ui-surface border rounded-xl overflow-hidden">
        {loading ? (
          <TableSkeleton rows={6} cols={5} />
        ) : warehouses.length === 0 ? (
          <div className="px-6 py-10 text-center ui-muted">No warehouses yet. Click "Create Warehouse" to add one.</div>
        ) : filteredWarehouses.length === 0 ? (
          <div className="px-6 py-10 text-center ui-muted">No warehouses found.</div>
        ) : (
          <table className="ui-table w-full">
            <thead className="ui-sunken border-b">
              <tr>
                <th className="ui-th">Branch</th>
                <th className="ui-th">Warehouse</th>
                <th className="ui-th">Location</th>
                <th className="ui-th">Address</th>
                <th className="ui-th">GST</th>
                <th className="ui-th ui-num">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredWarehouses.map((w) => (
                <tr key={w.id} className="ui-hover-sunken">
                  <td className="ui-col-meta px-4 py-3 ui-fg">
                    {(() => {
                      const b = branchLookup.get(String(w.branchId || ''));
                      return (b && (b.branchName || b.name)) ? String(b.branchName || b.name) : '—';
                    })()}
                  </td>
                  <td className="px-4 py-3 font-medium ui-fg">
                    <button type="button" className="text-left hover:underline" onClick={() => openView(w.id)}>
                      {w.name || '—'}
                    </button>
                  </td>
                  <td className="ui-col-meta px-4 py-3 ui-fg">{[w.city, w.state].filter(Boolean).join(', ') || '—'}</td>
                  <td className="ui-col-meta px-4 py-3 ui-fg">{[w.addressLine1, w.addressLine2].filter(Boolean).join(', ') || '—'}</td>
                  <td className="ui-col-id px-4 py-3 ui-fg">{w.gstin || '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="relative inline-block text-left" data-warehouse-actions>
                      <button
                        type="button"
                        ref={openMenuForWarehouseId === w.id ? menuAnchorRef : null}
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenMenuForWarehouseId((prev) => (prev === w.id ? null : w.id));
                        }}
                        className="px-2 py-1 rounded-lg border ui-surface ui-hover-sunken"
                        aria-label="Warehouse actions"
                      >
                        ⋯
                      </button>

                      {openMenuForWarehouseId === w.id ? (
                        <Popover
                          anchorRef={menuAnchorRef}
                          onClose={() => setOpenMenuForWarehouseId(null)}
                          minWidth={176}
                          maxWidth={240}
                        >
                          <button type="button" onClick={() => openView(w.id)} className="w-full text-left px-3 py-2 text-sm ui-hover-sunken">
                            View
                          </button>
                          <button type="button" onClick={() => beginEdit(w)} className="w-full text-left px-3 py-2 text-sm ui-hover-sunken">
                            Edit
                          </button>
                          <button type="button" onClick={() => removeWarehouse(w.id)} className="w-full text-left px-3 py-2 text-sm text-[rgb(var(--neg))] hover:bg-[rgb(var(--neg-soft))]">
                            Delete
                          </button>
                        </Popover>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
