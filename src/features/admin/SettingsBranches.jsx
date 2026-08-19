import React, { useMemo, useEffect, useState } from 'react';
import { TableSkeleton } from '../../components/ui/Primitives';
import { confirmDialog, notify } from '../../components/ui/notify';
import { listBranches, createBranch, updateBranch, deleteBranch } from '../../api/admin';
import PopupSelect from '../../components/pickers/PopupSelect';
import { GST_STATE_BY_CODE, getGstStateFromGstin } from '../../utils/gst';

export function SettingsBranches({ orgId, onBranchesChanged }) {
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [openMenuForBranchId, setOpenMenuForBranchId] = useState(null);
  const [viewBranchId, setViewBranchId] = useState(null);
  const [editingBranchId, setEditingBranchId] = useState(null);
  const [editSaving, setEditSaving] = useState(false);
  const [form, setForm] = useState({
    branchCode: '',
    branchName: '',
    addressLine1: '',
    city: '',
    state: '',
    country: 'India',
    gstRegistrationType: 'UNREGISTERED',
    gstin: '',
  });

  const [editForm, setEditForm] = useState({
    branchCode: '',
    branchName: '',
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

  const loadBranches = async () => {
    if (!orgId) return;
    setLoading(true);
    setError('');
    try {
      const res = await listBranches(orgId);
      setBranches(Array.isArray(res.branches) ? res.branches : []);
    } catch (err) {
      setError(err.message || 'Failed to load branches');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBranches();
  }, [orgId]);

  // Close row menu on outside click
  useEffect(() => {
    const onDocClick = (e) => {
      const el = e?.target;
      if (el?.closest?.('[data-branch-actions]')) return;
      setOpenMenuForBranchId(null);
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

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
    if (!String(form.state || '').trim()) {
      setError('State is required — pick the branch state.');
      notify.error('State is required — pick the branch state.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...form,
        gstin: form.gstin || null,
      };
      const res = await createBranch(orgId, payload);
      setBranches((prev) => [...prev, res.branch]);
      setForm({ branchCode: '', branchName: '', addressLine1: '', city: '', state: '', country: 'India', gstRegistrationType: 'UNREGISTERED', gstin: '' });
      setShowForm(false);
      notify.success(`Branch "${res.branch?.branchName || payload.branchName}" created.`);
      onBranchesChanged?.();
    } catch (err) {
      setError(err.message || 'Failed to create branch');
      notify.error(err.message || 'Failed to create branch');
    } finally {
      setSaving(false);
    }
  };

  const removeBranch = async (id) => {
    if (!await confirmDialog({ title: 'Please confirm', message: 'Delete this branch?', confirmLabel: 'Yes, continue' })) return;
    try {
      await deleteBranch(orgId, id);
      setBranches((prev) => prev.filter((b) => b.id !== id));
      onBranchesChanged?.();
    } catch (err) {
      setError(err.message || 'Failed to delete');
    }
  };

  const openView = (id) => {
    setViewBranchId(String(id));
    setEditingBranchId(null);
    setOpenMenuForBranchId(null);
  };

  const closeView = () => {
    setViewBranchId(null);
    setEditingBranchId(null);
  };

  const beginEdit = (b) => {
    setViewBranchId(String(b.id));
    setEditingBranchId(String(b.id));
    setEditForm({
      branchCode: String(b.branchCode || ''),
      branchName: String(b.branchName || ''),
      addressLine1: String(b.addressLine1 || ''),
      addressLine2: String(b.addressLine2 || ''),
      city: String(b.city || ''),
      state: String(b.state || ''),
      country: String(b.country || 'India'),
      gstRegistrationType: String(b.gstRegistrationType || 'UNREGISTERED'),
      gstin: String(b.gstin || ''),
      contactPerson: String(b.contactPerson || ''),
      phone: String(b.phone || ''),
      email: String(b.email || ''),
    });
    setOpenMenuForBranchId(null);
    setError('');
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    if (!editingBranchId) return;
    setEditSaving(true);
    setError('');
    try {
      const payload = {
        branchCode: String(editForm.branchCode || '').trim(),
        branchName: String(editForm.branchName || '').trim(),
        addressLine1: String(editForm.addressLine1 || '').trim(),
        addressLine2: String(editForm.addressLine2 || '').trim() || null,
        city: String(editForm.city || '').trim() || null,
        state: String(editForm.state || '').trim(),
        country: String(editForm.country || '').trim() || 'India',
        gstRegistrationType: String(editForm.gstRegistrationType || 'UNREGISTERED').trim(),
        gstin: String(editForm.gstin || '').trim() || null,
        contactPerson: String(editForm.contactPerson || '').trim() || null,
        phone: String(editForm.phone || '').trim() || null,
        email: String(editForm.email || '').trim() || null,
      };

      if (!payload.branchCode) throw new Error('Branch code is required');
      if (!payload.branchName) throw new Error('Branch name is required');
      if (!payload.addressLine1) throw new Error('Address is required');
      if (!payload.state) throw new Error('State is required');
      if (payload.gstRegistrationType !== 'UNREGISTERED' && !payload.gstin) {
        throw new Error('GSTIN is required for registered branches');
      }

      const res = await updateBranch(orgId, editingBranchId, payload);
      const updated = res?.branch;
      if (updated) {
        setBranches((prev) => prev.map((x) => (String(x.id) === String(updated.id) ? updated : x)));
      } else {
        await loadBranches();
      }
      setEditingBranchId(null);
    } catch (err) {
      setError(err.message || 'Failed to update branch');
    } finally {
      setEditSaving(false);
    }
  };

  const query = String(search || '').trim().toLowerCase();
  const filteredBranches = query
    ? branches.filter((b) => {
        const code = String(b?.branchCode || '').toLowerCase();
        const name = String(b?.branchName || '').toLowerCase();
        const city = String(b?.city || '').toLowerCase();
        const state = String(b?.state || '').toLowerCase();
        const addr = String(b?.addressLine1 || '').toLowerCase();
        const gstin = String(b?.gstin || '').toLowerCase();
        const phone = String(b?.phone || '').toLowerCase();
        const email = String(b?.email || '').toLowerCase();
        return [code, name, city, state, addr, gstin, phone, email].some((s) => s.includes(query));
      })
    : branches;

  const selectedBranch = viewBranchId ? branches.find((b) => String(b.id) === String(viewBranchId)) || null : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="ui-title text-lg">Branches</div>
        <button
          type="button"
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 rounded-lg ui-btn ui-btn-primary "
        >
          + Create Branch
        </button>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="w-full max-w-sm">
          <div className="relative">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search"
              className="ui-input w-full pl-3 pr-3 py-2 ui-surface"
            />
          </div>
        </div>
        <div />
      </div>

      {error && <div className="text-sm text-[rgb(var(--neg))] bg-[rgb(var(--neg-soft))] border border-[rgb(var(--neg)/0.35)] rounded-lg p-3">{error}</div>}

      {selectedBranch ? (
        <div className="ui-surface border rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-lg font-semibold">Branch Details</div>
              <div className="text-xs ui-muted">{selectedBranch.branchCode || ''}</div>
            </div>
            <div className="flex gap-2">
              {editingBranchId ? null : (
                <button
                  type="button"
                  onClick={() => beginEdit(selectedBranch)}
                  className="px-4 py-2 rounded-lg border ui-surface ui-hover-sunken"
                >
                  Edit
                </button>
              )}
              <button type="button" onClick={closeView} className="px-4 py-2 rounded-lg border ui-surface ui-hover-sunken">
                Close
              </button>
            </div>
          </div>

          {editingBranchId ? (
            <form onSubmit={saveEdit} className="space-y-4">
              <div className="grid grid-cols-12 gap-4">
                <div className="col-span-12 sm:col-span-4">
                  <label className="block text-sm font-medium mb-1">Branch Code *</label>
                  <input className="ui-input w-full max-w-40 px-3 py-2" value={editForm.branchCode} onChange={(e) => setEditForm((p) => ({ ...p, branchCode: e.target.value }))} required />
                </div>
                <div className="col-span-12 sm:col-span-8">
                  <label className="block text-sm font-medium mb-1">Branch Name *</label>
                  <input className="ui-input w-full px-3 py-2" value={editForm.branchName} onChange={(e) => setEditForm((p) => ({ ...p, branchName: e.target.value }))} required />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Address *</label>
                <input className="ui-input w-full px-3 py-2" value={editForm.addressLine1} onChange={(e) => setEditForm((p) => ({ ...p, addressLine1: e.target.value }))} required />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Address Line 2</label>
                <input className="ui-input w-full px-3 py-2" value={editForm.addressLine2} onChange={(e) => setEditForm((p) => ({ ...p, addressLine2: e.target.value }))} />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">City</label>
                  <input className="ui-input w-full px-3 py-2" value={editForm.city} onChange={(e) => setEditForm((p) => ({ ...p, city: e.target.value }))} />
                </div>
                <div>
                  <PopupSelect
                    label="State *"
                    value={editForm.state}
                    onChange={(v) => {
                      setEditForm((p) => ({ ...p, state: v }));
                      setError('');
                    }}
                    options={stateOptions}
                    placeholder="Select state"
                    title="Select State"
                    maxWidthClass="max-w-2xl"
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
                    <option value="REGULAR">Regular</option>
                    <option value="COMPOSITION">Composition</option>
                    <option value="UNREGISTERED">Unregistered</option>
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
                    placeholder="15-char GSTIN"
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
                <button type="button" onClick={() => setEditingBranchId(null)} className="px-4 py-2 rounded-lg border ui-surface ui-hover-sunken">
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
                <div className="text-xs ui-muted">Branch Code</div>
                <div className="font-medium font-mono">{selectedBranch.branchCode || '—'}</div>
              </div>
              <div className="col-span-12 sm:col-span-8">
                <div className="text-xs ui-muted">Branch Name</div>
                <div className="font-medium">{selectedBranch.branchName || '—'}</div>
              </div>

              <div className="col-span-12 sm:col-span-6">
                <div className="text-xs ui-muted">Address</div>
                <div className="font-medium">{[selectedBranch.addressLine1, selectedBranch.addressLine2].filter(Boolean).join(', ') || '—'}</div>
              </div>
              <div className="col-span-12 sm:col-span-6">
                <div className="text-xs ui-muted">Location</div>
                <div className="font-medium">{[selectedBranch.city, selectedBranch.state, selectedBranch.country].filter(Boolean).join(', ') || '—'}</div>
              </div>

              <div className="col-span-12 sm:col-span-4">
                <div className="text-xs ui-muted">GST Registration</div>
                <div className="font-medium">{selectedBranch.gstRegistrationType || 'UNREGISTERED'}</div>
              </div>
              <div className="col-span-12 sm:col-span-4">
                <div className="text-xs ui-muted">GSTIN</div>
                <div className="font-medium font-mono">{selectedBranch.gstin || '—'}</div>
              </div>
              <div className="col-span-12 sm:col-span-4">
                <div className="text-xs ui-muted">Status</div>
                <div className="font-medium">{selectedBranch.isActive !== false ? 'Active' : 'Inactive'}</div>
              </div>

              <div className="col-span-12 sm:col-span-4">
                <div className="text-xs ui-muted">Contact Person</div>
                <div className="font-medium">{selectedBranch.contactPerson || '—'}</div>
              </div>
              <div className="col-span-12 sm:col-span-4">
                <div className="text-xs ui-muted">Phone</div>
                <div className="font-medium">{selectedBranch.phone || '—'}</div>
              </div>
              <div className="col-span-12 sm:col-span-4">
                <div className="text-xs ui-muted">Email</div>
                <div className="font-medium">{selectedBranch.email || '—'}</div>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {showForm && (
        <form onSubmit={onSubmit} className="ui-surface border rounded-xl p-5 space-y-4">
          <div className="text-lg font-semibold">New Branch</div>
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-12 sm:col-span-4">
              <label className="block text-sm font-medium mb-1">Branch Code *</label>
              <input className="ui-input w-full max-w-40 px-3 py-2" value={form.branchCode} onChange={onChange('branchCode')} required />
            </div>
            <div className="col-span-12 sm:col-span-8">
              <label className="block text-sm font-medium mb-1">Branch Name *</label>
              <input className="ui-input w-full px-3 py-2" value={form.branchName} onChange={onChange('branchName')} required />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Address *</label>
            <input className="ui-input w-full px-3 py-2" value={form.addressLine1} onChange={onChange('addressLine1')} required />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">City</label>
              <input className="ui-input w-full px-3 py-2" value={form.city} onChange={onChange('city')} />
            </div>
            <div>
              <PopupSelect
                label="State *"
                value={form.state}
                onChange={(v) => {
                  setForm((p) => ({ ...p, state: v }));
                  setError('');
                }}
                options={stateOptions}
                placeholder="Select state"
                title="Select State"
                maxWidthClass="max-w-2xl"
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
                <option value="REGULAR">Regular</option>
                <option value="COMPOSITION">Composition</option>
                <option value="UNREGISTERED">Unregistered</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">GSTIN</label>
              <input className="ui-input w-full px-3 py-2" value={form.gstin} onChange={onChange('gstin')} placeholder="15-char GSTIN" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg border ui-surface ui-hover-sunken">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg ui-btn ui-btn-primary disabled:opacity-50">
              {saving ? 'Creating…' : 'Create Branch'}
            </button>
          </div>
        </form>
      )}

      <div className="ui-surface border rounded-xl overflow-hidden">
        {loading ? (
          <TableSkeleton rows={6} cols={4} />
        ) : branches.length === 0 ? (
          <div className="px-6 py-10 text-center ui-muted">No branches yet. Click "Create Branch" to add one.</div>
        ) : filteredBranches.length === 0 ? (
          <div className="px-6 py-10 text-center ui-muted">No branches found.</div>
        ) : (
          <table className="ui-table w-full">
            <thead className="ui-sunken border-b">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium ui-muted uppercase w-32">Branch Code</th>
                <th className="px-4 py-3 text-left text-xs font-medium ui-muted uppercase">Location</th>
                <th className="px-4 py-3 text-left text-xs font-medium ui-muted uppercase">Address</th>
                <th className="px-4 py-3 text-left text-xs font-medium ui-muted uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium ui-muted uppercase">GSTIN</th>
                <th className="px-4 py-3 text-right text-xs font-medium ui-muted uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredBranches.map((b) => (
                <tr key={b.id} className="ui-hover-sunken">
                  <td className="px-4 py-3 text-sm ui-fg">
                    <button type="button" className="text-left hover:underline" onClick={() => openView(b.id)}>
                      <div className="font-mono">{b.branchCode || '—'}</div>
                      <div className="text-xs ui-muted">{b.branchName || ''}</div>
                    </button>
                  </td>
                  <td className="ui-col-meta px-4 py-3 text-sm ui-fg">{[b.city, b.state].filter(Boolean).join(', ') || '—'}</td>
                  <td className="ui-col-meta px-4 py-3 text-sm ui-fg">{b.addressLine1 || '—'}</td>
                  <td className="ui-col-meta px-4 py-3 text-sm">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${b.isActive !== false ? 'bg-[rgb(var(--pos-soft))] text-[rgb(var(--pos))]' : 'bg-[rgb(var(--neg-soft))] text-[rgb(var(--neg))]'}`}>
                      {b.isActive !== false ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="ui-col-id px-4 py-3 text-sm ui-fg font-mono">{b.gstin || '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="relative inline-block text-left" data-branch-actions>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenMenuForBranchId((prev) => (prev === b.id ? null : b.id));
                        }}
                        className="px-2 py-1 rounded-md border ui-surface ui-hover-sunken"
                        aria-label="Branch actions"
                      >
                        ⋯
                      </button>

                      {openMenuForBranchId === b.id ? (
                        <div className="absolute right-0 mt-2 w-44 origin-top-right rounded-md border ui-surface shadow-sm z-50">
                          <button type="button" onClick={() => openView(b.id)} className="w-full text-left px-3 py-2 text-sm ui-hover-sunken">
                            View
                          </button>
                          <button type="button" onClick={() => beginEdit(b)} className="w-full text-left px-3 py-2 text-sm ui-hover-sunken">
                            Edit
                          </button>
                          <button type="button" onClick={() => removeBranch(b.id)} className="w-full text-left px-3 py-2 text-sm text-[rgb(var(--neg))] hover:bg-[rgb(var(--neg-soft))]">
                            Delete
                          </button>
                        </div>
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
