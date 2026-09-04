import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StatusPill, TableSkeleton } from '../../components/ui/Primitives';
import { exportRows } from '../../components/ListToolbar';
import { confirmDialog } from '../../components/ui/notify';
import { listRoles, createRole, updateRole, deleteRole } from '../../api/admin';
import Popover from '../../components/ui/Popover';

// Matrix permissions UI inspired by the provided example.
// Backend actions supported: VIEW, CREATE, EDIT, DELETE, APPROVE, EXPORT.
// This UI shows columns: Full Access, View, Edit, Approve, Delete.
// - View => VIEW
// - Edit => CREATE + EDIT (closest match)
// - Approve => APPROVE
// - Delete => DELETE
// - Full Access => VIEW + CREATE + EDIT + DELETE (+ APPROVE when applicable)

const MATRIX_ACTIONS = {
  VIEW: 'VIEW',
  CREATE: 'CREATE',
  EDIT: 'EDIT',
  DELETE: 'DELETE',
  APPROVE: 'APPROVE',
};

function permKey(p) {
  const module = String(p?.module || '').trim();
  const subModule = String(p?.subModule || '').trim();
  const action = String(p?.action || '').trim();
  return `${module}::${subModule}::${action}`;
}

function permLabel(p) {
  const module = String(p?.module || '').trim();
  const sub = String(p?.subModule || '').trim();
  const action = String(p?.action || '').trim();
  return `${module}${sub ? ` / ${sub}` : ''} / ${action}`;
}

function normalizeRolePermissions(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => {
      if (!x) return null;
      // Backend shape: RolePermission include { permission: { module, subModule, action }, allowed }
      if (typeof x === 'object' && x.permission) {
        return {
          module: x.permission.module,
          subModule: x.permission.subModule ?? null,
          action: x.permission.action,
          allowed: x.allowed !== false,
        };
      }
      // Alternate acceptable shape
      if (typeof x === 'object' && x.module && x.action) {
        return {
          module: x.module,
          subModule: x.subModule ?? null,
          action: x.action,
          allowed: x.allowed !== false,
        };
      }
      return null;
    })
    .filter(Boolean);
}

// The matrix describes UI rows (group headings + items). Only items map to permissions.
// Keep module/subModule stable so it aligns with requirePermission() calls for implemented screens.
const PERMISSION_MATRIX = [
  {
    type: 'group',
    label: 'Sales',
    items: [
      { label: 'Invoices', module: 'SALES', subModule: 'Invoices', supports: { view: true, edit: true, del: true } },
      { label: 'Estimates / Quotes', module: 'SALES', subModule: 'Estimates / Quotes', supports: { view: true, edit: true, del: true } },
      { label: 'Credit Notes', module: 'SALES', subModule: 'Credit Notes', supports: { view: true, edit: true, del: true } },
    ],
  },
  {
    type: 'group',
    label: 'Purchase',
    items: [
      { label: 'Purchase Orders', module: 'PURCHASE', subModule: 'Purchase Orders', supports: { view: true, edit: true, del: true } },
      { label: 'Bills', module: 'PURCHASE', subModule: 'Bills', supports: { view: true, edit: true, del: true } },
      { label: 'Debit Notes', module: 'PURCHASE', subModule: 'Debit Notes', supports: { view: true, edit: true, del: true } },
    ],
  },
  {
    type: 'group',
    label: 'Payments',
    items: [
      { label: 'Receipts', module: 'PAYMENTS', subModule: 'Receipts', supports: { view: true, edit: true, del: false } },
      { label: 'Payments', module: 'PAYMENTS', subModule: 'Payments', supports: { view: true, edit: true, del: false } },
    ],
  },
  {
    type: 'group',
    label: 'Cash & Bank',
    items: [{ label: 'Cash & Bank', module: 'CASHBANK', subModule: 'Cash & Bank', supports: { view: true, edit: true, del: false } }],
  },
  {
    type: 'group',
    label: 'Inventory',
    items: [
      { label: 'Inventory (Masters/Items)', module: 'INVENTORY', subModule: 'Inventory', supports: { view: true, edit: true, del: true } },
      // Enforced by backend today
      { label: 'Inter-branch transfer', module: 'INVENTORY', subModule: 'Inter-branch transfer', supports: { view: true, edit: true, approve: true, del: false } },
      { label: 'Stock Adjustment', module: 'INVENTORY', subModule: 'Stock Adjustment', supports: { view: true, edit: true, del: false } },
    ],
  },
  {
    type: 'group',
    label: 'Reports',
    items: [
      { label: 'Financials', module: 'REPORTS', subModule: 'Financials', supports: { view: true, edit: false, del: false } },
      { label: 'GST', module: 'REPORTS', subModule: 'GST', supports: { view: true, edit: false, del: false } },
      { label: 'Sales', module: 'REPORTS', subModule: 'Sales', supports: { view: true, edit: false, del: false } },
      { label: 'Purchase', module: 'REPORTS', subModule: 'Purchase', supports: { view: true, edit: false, del: false } },
      { label: 'Inventory', module: 'REPORTS', subModule: 'Inventory', supports: { view: true, edit: false, del: false } },
    ],
  },
  {
    type: 'group',
    label: 'Settings',
    items: [
      // Enforced by backend today
      { label: 'Branches', module: 'MASTERS', subModule: 'Company/Branch setup', supports: { view: true, edit: true, del: true } },
      { label: 'Warehouses', module: 'MASTERS', subModule: 'Company/Branch setup', supports: { view: true, edit: true, del: true } },
      { label: 'Users', module: 'SETTINGS', subModule: 'Users', supports: { view: true, edit: true, del: true } },
      { label: 'Roles', module: 'SETTINGS', subModule: 'Roles', supports: { view: true, edit: true, del: true } },
    ],
  },
];

function itemAllKeys(item) {
  const keys = [];
  if (item.supports?.view) keys.push(permKey({ module: item.module, subModule: item.subModule, action: MATRIX_ACTIONS.VIEW }));
  if (item.supports?.edit) {
    keys.push(permKey({ module: item.module, subModule: item.subModule, action: MATRIX_ACTIONS.CREATE }));
    keys.push(permKey({ module: item.module, subModule: item.subModule, action: MATRIX_ACTIONS.EDIT }));
  }
  if (item.supports?.approve) keys.push(permKey({ module: item.module, subModule: item.subModule, action: MATRIX_ACTIONS.APPROVE }));
  if (item.supports?.del) keys.push(permKey({ module: item.module, subModule: item.subModule, action: MATRIX_ACTIONS.DELETE }));
  return keys;
}

function itemColumnKeys(item, column) {
  if (column === 'view') return item.supports?.view ? [permKey({ module: item.module, subModule: item.subModule, action: MATRIX_ACTIONS.VIEW })] : [];
  if (column === 'edit') {
    return item.supports?.edit
      ? [
          permKey({ module: item.module, subModule: item.subModule, action: MATRIX_ACTIONS.CREATE }),
          permKey({ module: item.module, subModule: item.subModule, action: MATRIX_ACTIONS.EDIT }),
        ]
      : [];
  }
  if (column === 'approve') {
    return item.supports?.approve ? [permKey({ module: item.module, subModule: item.subModule, action: MATRIX_ACTIONS.APPROVE })] : [];
  }
  if (column === 'del') return item.supports?.del ? [permKey({ module: item.module, subModule: item.subModule, action: MATRIX_ACTIONS.DELETE })] : [];
  if (column === 'full') return itemAllKeys(item);
  return [];
}


function permissionsToSet(perms) {
  const s = new Set();
  for (const p of perms || []) {
    if (p && p.allowed !== false) s.add(permKey(p));
  }
  return s;
}

function setToPermissions(s) {
  // Convert selection set back into backend payload objects.
  const out = [];
  for (const key of s) {
    const [module, subModule, action] = String(key).split('::');
    out.push({ module, subModule: subModule || null, action, allowed: true });
  }
  return out;
}

export function SettingsRoles({ orgId }) {
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editRole, setEditRole] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', permissions: new Set() });
  const [search, setSearch] = useState('');
  const [openMenuForRoleId, setOpenMenuForRoleId] = useState(null);
  /** The trigger the open menu hangs from; only one row's menu is open. */
  const menuAnchorRef = useRef(null);
  const [viewRoleId, setViewRoleId] = useState(null);

  const loadRoles = async () => {
    if (!orgId) return;
    setLoading(true);
    setError('');
    try {
      const res = await listRoles(orgId);
      const next = (Array.isArray(res.roles) ? res.roles : []).map((r) => {
        const normalized = normalizeRolePermissions(r.permissions);
        return {
          ...r,
          _normalizedPermissions: normalized,
          _permissionLabels: normalized.filter((p) => p.allowed !== false).map(permLabel),
        };
      });
      setRoles(next);
    } catch (err) {
      setError(err.message || 'Failed to load roles');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRoles();
  }, [orgId]);

  const openCreate = () => {
    setEditRole(null);
    setForm({ name: '', permissions: new Set() });
    setViewRoleId(null);
    setShowForm(true);
  };

  const openView = (roleId) => {
    setViewRoleId(String(roleId));
    setOpenMenuForRoleId(null);
  };

  const closeView = () => {
    setViewRoleId(null);
  };

  const openEdit = (r) => {
    setEditRole(r);
    setViewRoleId(null);
    const normalized = normalizeRolePermissions(r.permissions || r._normalizedPermissions);
    setForm({
      name: r.name,
      permissions: permissionsToSet(normalized),
    });
    setShowForm(true);
  };

  const toggleItemColumn = (item, column, checked) => {
    const keys = itemColumnKeys(item, column);
    setForm((prev) => {
      const next = new Set(prev.permissions);
      for (const k of keys) {
        if (checked) next.add(k);
        else next.delete(k);
      }
      return { ...prev, permissions: next };
    });
  };

  const isItemColumnChecked = (item, column) => {
    const keys = itemColumnKeys(item, column);
    if (keys.length === 0) return false;
    for (const k of keys) {
      if (!form.permissions.has(k)) return false;
    }
    return true;
  };

  const toggleGroup = (group, column, checked) => {
    const items = Array.isArray(group.items) ? group.items : [];
    setForm((prev) => {
      const next = new Set(prev.permissions);
      for (const item of items) {
        const keys = itemColumnKeys(item, column);
        for (const k of keys) {
          if (checked) next.add(k);
          else next.delete(k);
        }
      }
      return { ...prev, permissions: next };
    });
  };

  const isGroupChecked = async (group, column) => {
    const items = Array.isArray(group.items) ? group.items : [];
    if (items.length === 0) return false;
    let any = false;
    for (const item of items) {
      const keys = itemColumnKeys(item, column);
      if (keys.length === 0) continue;
      any = true;
      for (const k of keys) {
        if (!form.permissions.has(k)) return false;
      }
    }
    return any;
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        name: String(form.name || '').trim(),
        permissions: setToPermissions(form.permissions),
      };
      if (editRole) {
        const res = await updateRole(orgId, editRole.id, payload);
        const normalized = normalizeRolePermissions(res.role?.permissions);
        const nextRole = {
          ...res.role,
          _normalizedPermissions: normalized,
          _permissionLabels: normalized.filter((p) => p.allowed !== false).map(permLabel),
        };
        setRoles((prev) => prev.map((r) => (r.id === editRole.id ? nextRole : r)));
      } else {
        const res = await createRole(orgId, payload);
        const normalized = normalizeRolePermissions(res.role?.permissions);
        const nextRole = {
          ...res.role,
          assignedUsersCount: res.role?.assignedUsersCount ?? 0,
          _normalizedPermissions: normalized,
          _permissionLabels: normalized.filter((p) => p.allowed !== false).map(permLabel),
        };
        setRoles((prev) => [...prev, nextRole]);
      }
      setShowForm(false);
    } catch (err) {
      const perm = err?.data?.permission;
      const permHint = perm?.module && perm?.action ? ` (missing: ${perm.module}${perm.subModule ? ` / ${perm.subModule}` : ''} / ${perm.action})` : '';
      setError((err.message || 'Failed to save role') + permHint);
    } finally {
      setSaving(false);
    }
  };

  const removeRole = async (id) => {
    if (!await confirmDialog({ title: 'Please confirm', message: 'Delete this role?', confirmLabel: 'Yes, continue' })) return;
    try {
      await deleteRole(orgId, id);
      setRoles((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      setError(err.message || 'Failed to delete role');
    }
  };

  const query = String(search || '').trim().toLowerCase();
  const filteredRoles = query
    ? roles.filter((r) => {
        const name = String(r?.name || '').toLowerCase();
        const desc = String(r?.description || '').toLowerCase();
        return name.includes(query) || desc.includes(query);
      })
    : roles;

  const selectedRole = useMemo(() => {
    if (!viewRoleId) return null;
    return roles.find((r) => String(r.id) === String(viewRoleId)) || null;
  }, [roles, viewRoleId]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="ui-t-sec">User Roles &amp; Permissions</div>
        <button
          type="button"
          onClick={openCreate}
          className="px-4 py-2 rounded-lg ui-btn ui-btn-primary "
        >
          + Create Role
        </button>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="w-full max-w-sm">
          <div className="relative">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search roles"
              className="ui-input w-full pl-3 pr-3 py-2 ui-surface"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs ui-muted whitespace-nowrap">{filteredRoles.length} rows</span>
          <button
            type="button"
            onClick={() =>
              exportRows({
                fileName: 'Roles',
                label: 'role(s)',
                columns: [
              { key: 'name', label: 'Role' },
              { key: 'description', label: 'Description' },
              { key: 'roleType', label: 'Type' },
                ],
                rows: filteredRoles,
              })
            }
            className="ui-btn ui-btn-secondary"
          >
            Export
          </button>
        </div>
      </div>

      {error && <div className="text-sm text-[rgb(var(--neg))] bg-[rgb(var(--neg-soft))] border border-[rgb(var(--neg)/0.35)] rounded-lg p-3">{error}</div>}

      {selectedRole ? (
        <div className="ui-surface border rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="ui-t-sec">Role Details</div>
              <div className="text-xs ui-muted">{selectedRole.name || ''}</div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  closeView();
                  openEdit(selectedRole);
                }}
                className="px-4 py-2 rounded-lg border ui-surface ui-hover-sunken"
              >
                Edit
              </button>
              <button type="button" onClick={closeView} className="px-4 py-2 rounded-lg border ui-surface ui-hover-sunken">
                Close
              </button>
            </div>
          </div>

          <div className="grid grid-cols-12 gap-4 text-sm">
            <div className="col-span-12 sm:col-span-6">
              <div className="text-xs ui-muted">Role Name</div>
              <div className="font-medium">{selectedRole.name || '—'}</div>
            </div>
            <div className="col-span-12 sm:col-span-6">
              <div className="text-xs ui-muted">Assigned Users</div>
              <div className="font-medium">{Number(selectedRole.assignedUsersCount || 0)}</div>
            </div>
            <div className="col-span-12">
              <div className="text-xs ui-muted">Description</div>
              <div className="font-medium">{selectedRole.description || '—'}</div>
            </div>
            <div className="col-span-12">
              <div className="text-xs ui-muted">Permissions</div>
              {Array.isArray(selectedRole._permissionLabels) && selectedRole._permissionLabels.length ? (
                <div className="border rounded-lg p-3 ui-surface max-h-56 overflow-auto">
                  <div className="text-xs ui-muted mb-2">{selectedRole._permissionLabels.length} allowed permissions</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                    {selectedRole._permissionLabels.map((lbl) => (
                      <div key={lbl} className="text-sm ui-fg">{lbl}</div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="font-medium">—</div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {showForm && (
        <form onSubmit={onSubmit} className="ui-surface border rounded-xl p-5 space-y-4">
          <div className="ui-t-sec">{editRole ? 'Edit Role' : 'New Role'}</div>
          <div>
            <label className="block text-sm font-medium mb-1">Role Name *</label>
            <input className="ui-input w-full px-3 py-2" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Permissions</label>
            <div className="border rounded-lg overflow-hidden">
              <div className="grid grid-cols-12 ui-sunken border-b">
                <div className="col-span-6 px-3 py-2 text-xs font-semibold ui-muted uppercase">Particulars</div>
                <div className="col-span-2 px-3 py-2 text-xs font-semibold ui-muted uppercase text-center">Full Access</div>
                <div className="col-span-1 px-3 py-2 text-xs font-semibold ui-muted uppercase text-center">View</div>
                <div className="col-span-1 px-3 py-2 text-xs font-semibold ui-muted uppercase text-center">Edit</div>
                <div className="col-span-1 px-3 py-2 text-xs font-semibold ui-muted uppercase text-center">Approve</div>
                <div className="col-span-1 px-3 py-2 text-xs font-semibold ui-muted uppercase text-center">Delete</div>
              </div>

              {PERMISSION_MATRIX.map((group) => {
                return (
                  <div key={group.label} className="border-b last:border-b-0">
                    <div className="grid grid-cols-12">
                      <div className="col-span-6 px-3 py-2 font-semibold">{group.label}</div>
                      <div className="col-span-2 px-3 py-2 flex justify-center">
                        <input
                          type="checkbox"
                          className="ui-checkbox"
                          checked={isGroupChecked(group, 'full')}
                          onChange={(e) => toggleGroup(group, 'full', e.target.checked)}
                        />
                      </div>
                      <div className="col-span-1 px-3 py-2 flex justify-center">
                        <input
                          type="checkbox"
                          className="ui-checkbox"
                          checked={isGroupChecked(group, 'view')}
                          onChange={(e) => toggleGroup(group, 'view', e.target.checked)}
                        />
                      </div>
                      <div className="col-span-1 px-3 py-2 flex justify-center">
                        <input
                          type="checkbox"
                          className="ui-checkbox"
                          checked={isGroupChecked(group, 'edit')}
                          onChange={(e) => toggleGroup(group, 'edit', e.target.checked)}
                        />
                      </div>
                      <div className="col-span-1 px-3 py-2 flex justify-center">
                        <input
                          type="checkbox"
                          className="ui-checkbox"
                          checked={isGroupChecked(group, 'approve')}
                          onChange={(e) => toggleGroup(group, 'approve', e.target.checked)}
                        />
                      </div>
                      <div className="col-span-1 px-3 py-2 flex justify-center">
                        <input
                          type="checkbox"
                          className="ui-checkbox"
                          checked={isGroupChecked(group, 'del')}
                          onChange={(e) => toggleGroup(group, 'del', e.target.checked)}
                        />
                      </div>
                    </div>

                    {(group.items || []).map((item) => {
                      const rowKey = `${group.label}::${item.label}`;
                      return (
                        <div key={rowKey} className="grid grid-cols-12 ui-surface">
                          <div className="col-span-6 px-3 py-2 pl-8 text-sm">{item.label}</div>
                          <div className="col-span-2 px-3 py-2 flex justify-center">
                            <input
                              type="checkbox"
                              className="ui-checkbox"
                              checked={isItemColumnChecked(item, 'full')}
                              onChange={(e) => toggleItemColumn(item, 'full', e.target.checked)}
                            />
                          </div>
                          <div className="col-span-1 px-3 py-2 flex justify-center">
                            <input
                              type="checkbox"
                              className="ui-checkbox"
                              disabled={!item.supports?.view}
                              checked={isItemColumnChecked(item, 'view')}
                              onChange={(e) => toggleItemColumn(item, 'view', e.target.checked)}
                            />
                          </div>
                          <div className="col-span-1 px-3 py-2 flex justify-center">
                            <input
                              type="checkbox"
                              className="ui-checkbox"
                              disabled={!item.supports?.edit}
                              checked={isItemColumnChecked(item, 'edit')}
                              onChange={(e) => toggleItemColumn(item, 'edit', e.target.checked)}
                            />
                          </div>
                          <div className="col-span-1 px-3 py-2 flex justify-center">
                            <input
                              type="checkbox"
                              className="ui-checkbox"
                              disabled={!item.supports?.approve}
                              checked={isItemColumnChecked(item, 'approve')}
                              onChange={(e) => toggleItemColumn(item, 'approve', e.target.checked)}
                            />
                          </div>
                          <div className="col-span-1 px-3 py-2 flex justify-center">
                            <input
                              type="checkbox"
                              className="ui-checkbox"
                              disabled={!item.supports?.del}
                              checked={isItemColumnChecked(item, 'del')}
                              onChange={(e) => toggleItemColumn(item, 'del', e.target.checked)}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg border ui-surface ui-hover-sunken">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg ui-btn ui-btn-primary disabled:opacity-50">
              {saving ? 'Saving…' : editRole ? 'Update Role' : 'Create Role'}
            </button>
          </div>
        </form>
      )}

      <div className="ui-surface border rounded-xl overflow-hidden">
        {loading ? (
          <TableSkeleton rows={6} cols={4} />
        ) : roles.length === 0 ? (
          <div className="px-6 py-10 text-center ui-muted">No roles yet. Click "Create Role" to add one.</div>
        ) : filteredRoles.length === 0 ? (
          <div className="px-6 py-10 text-center ui-muted">No roles found.</div>
        ) : (
          <table className="ui-table w-full">
            <thead className="ui-sunken border-b">
              <tr>
                <th className="ui-th">Role Name</th>
                <th className="ui-th">Description</th>
                <th className="ui-th">Assigned Users</th>
                <th className="ui-th">Status</th>
                <th className="ui-th ui-num">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredRoles.map((r) => (
                <tr key={r.id} className="ui-hover-sunken">
                  <td className="px-4 py-3 font-medium ui-fg">
                    <button type="button" className="text-left hover:underline" onClick={() => openView(r.id)}>
                      {r.name}
                    </button>
                  </td>
                  <td className="ui-col-meta px-4 py-3 ui-fg">{r.description || '-'}</td>
                  <td className="ui-col-meta px-4 py-3 ui-fg">{Number(r.assignedUsersCount || 0)}</td>
                  <td className="ui-col-meta px-4 py-3">
                    <StatusPill status="Active" />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="relative inline-block text-left">
                      <button
                        type="button"
                        ref={openMenuForRoleId === r.id ? menuAnchorRef : null}
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenMenuForRoleId((prev) => (prev === r.id ? null : r.id));
                        }}
                        className="px-2 py-1 rounded-lg ui-hover-sunken"
                        aria-label="Actions"
                      >
                        ...
                      </button>

                      {openMenuForRoleId === r.id && (
                        <Popover
                          anchorRef={menuAnchorRef}
                          onClose={() => setOpenMenuForRoleId(null)}
                          minWidth={160}
                          maxWidth={220}
                        >
                          <button
                            type="button"
                            className="w-full text-left px-3 py-2 text-sm ui-hover-sunken"
                            onClick={() => {
                              setOpenMenuForRoleId(null);
                              openView(r.id);
                            }}
                          >
                            View
                          </button>
                          <button
                            type="button"
                            className="w-full text-left px-3 py-2 text-sm ui-hover-sunken"
                            onClick={() => {
                              setOpenMenuForRoleId(null);
                              openEdit(r);
                            }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="w-full text-left px-3 py-2 text-sm text-[rgb(var(--neg))] ui-hover-sunken"
                            onClick={() => {
                              setOpenMenuForRoleId(null);
                              removeRole(r.id);
                            }}
                          >
                            Delete
                          </button>
                        </Popover>
                      )}
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
