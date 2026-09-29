import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StatusPill, TableSkeleton } from '@ui/components/ui/Primitives';
import { exportRows } from '@ui/components/ListToolbar';
import { confirmDialog } from '@ui/components/ui/notify';
import { listRoles, createRole, updateRole, deleteRole } from '../../api/admin';
import Popover from '@ui/components/ui/Popover';
import { getPermissionCatalog } from '@ui/api/permissions';
import { rbacErrorMessage } from '@ui/permissions/rbacErrors';
import PermissionMatrix from './PermissionMatrix';
import { catalogKeys, permissionLabel } from './permissionKeys';
import { PermissionButton } from '@ui/permissions/ActionGuard';

function permKey(p) {
  const module = String(p?.module || '').trim();
  const subModule = String(p?.subModule || '').trim();
  const action = String(p?.action || '').trim();
  return `${module}::${subModule}::${action}`;
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

function permissionsToSet(perms) {
  const s = new Set();
  for (const p of perms || []) {
    if (p && p.allowed !== false) s.add(permKey(p));
  }
  return s;
}

export function SettingsRoles({ orgId }) {
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editRole, setEditRole] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', ownDocumentsOnly: false, permissions: new Set() });
  /** The server's permission catalogue: the only list the form may offer. */
  const [catalog, setCatalog] = useState({ modules: [], presets: [] });
  /** Grants the role holds that the catalogue has since retired; dropped on save. */
  const [retired, setRetired] = useState(0);
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
      const [res, cat] = await Promise.all([listRoles(orgId), getPermissionCatalog().catch(() => null)]);
      const modules = cat?.modules || catalog.modules;
      if (cat) setCatalog(cat);
      const next = (Array.isArray(res.roles) ? res.roles : []).map((r) => {
        const normalized = normalizeRolePermissions(r.permissions);
        return {
          ...r,
          _normalizedPermissions: normalized,
          _permissionLabels: normalized.filter((p) => p.allowed !== false).map((p) => permissionLabel(modules, permKey(p))),
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
    setForm({ name: '', description: '', ownDocumentsOnly: false, permissions: new Set() });
    setRetired(0);
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
    const held = permissionsToSet(normalized);
    // Keep only what the catalogue still offers. Older roles can hold keys from
    // the list this screen used to keep; they never granted anything.
    const known = catalogKeys(catalog.modules);
    const kept = new Set([...held].filter((k) => known.has(k)));
    setRetired(held.size - kept.size);
    setForm({
      name: r.name,
      description: r.description || '',
      ownDocumentsOnly: Boolean(r.ownDocumentsOnly),
      permissions: kept,
    });
    setShowForm(true);
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        name: String(form.name || '').trim(),
        description: String(form.description || '').trim() || null,
        ownDocumentsOnly: Boolean(form.ownDocumentsOnly),
        // Catalogue wire keys, which the server accepts as they are.
        permissions: Array.from(form.permissions),
      };
      if (editRole) {
        const res = await updateRole(orgId, editRole.id, payload);
        const normalized = normalizeRolePermissions(res.role?.permissions);
        const nextRole = {
          ...res.role,
          _normalizedPermissions: normalized,
          _permissionLabels: normalized.filter((p) => p.allowed !== false).map((p) => permissionLabel(catalog.modules, permKey(p))),
        };
        setRoles((prev) => prev.map((r) => (r.id === editRole.id ? nextRole : r)));
      } else {
        const res = await createRole(orgId, payload);
        const normalized = normalizeRolePermissions(res.role?.permissions);
        const nextRole = {
          ...res.role,
          assignedUsersCount: res.role?.assignedUsersCount ?? 0,
          _normalizedPermissions: normalized,
          _permissionLabels: normalized.filter((p) => p.allowed !== false).map((p) => permissionLabel(catalog.modules, permKey(p))),
        };
        setRoles((prev) => [...prev, nextRole]);
      }
      setShowForm(false);
    } catch (err) {
      const perm = err?.data?.permission;
      const permHint = perm?.module && perm?.action ? ` (missing: ${perm.module}${perm.subModule ? ` / ${perm.subModule}` : ''} / ${perm.action})` : '';
      setError(err?.data?.code ? rbacErrorMessage(err) : (err.message || 'Failed to save role') + permHint);
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
      setError(rbacErrorMessage(err, 'Failed to delete role'));
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="ui-t-sec">User Roles &amp; Permissions</div>
        <PermissionButton permission="SETTINGS::Roles::CREATE"
          type="button"
          onClick={openCreate}
          className="px-4 py-2 rounded-lg ui-btn ui-btn-primary"
        >
          + Create Role
        </PermissionButton>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="w-full max-w-sm">
          <div className="relative">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search roles"
              className="ui-input w-full ui-surface"
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
              <div className="ui-detail-label">Role Name</div>
              <div className="ui-detail-value">{selectedRole.name || '—'}</div>
            </div>
            <div className="col-span-12 sm:col-span-6">
              <div className="ui-detail-label">Assigned Users</div>
              <div className="ui-detail-value">{Number(selectedRole.assignedUsersCount || 0)}</div>
            </div>
            <div className="col-span-12">
              <div className="ui-detail-label">Description</div>
              <div className="ui-detail-value">{selectedRole.description || '—'}</div>
            </div>
            <div className="col-span-12">
              <div className="ui-detail-label">Permissions</div>
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
            <label className="ui-label" htmlFor="settingsroles-role-name">Role Name *</label>
            <input id="settingsroles-role-name" className="ui-input w-full" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required />
          </div>
          <div>
            <label className="ui-label" htmlFor="settingsroles-role-description">Description</label>
            <input
              id="settingsroles-role-description"
              className="ui-input w-full"
              maxLength={300}
              placeholder="What people with this role do, in one line. Shown when picking a role for someone."
              value={form.description || ''}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
            />
          </div>
          <label className="flex items-start gap-2 text-sm ui-fg" htmlFor="settingsroles-own-docs">
            <input
              id="settingsroles-own-docs"
              type="checkbox"
              className="mt-0.5"
              checked={Boolean(form.ownDocumentsOnly)}
              onChange={(e) => setForm((p) => ({ ...p, ownDocumentsOnly: e.target.checked }))}
            />
            <span>
              Own documents only
              <span className="block ui-subtle text-xs">Holders see and edit only the invoices, bills, quotes and payments they raised themselves.</span>
            </span>
          </label>
          <div>
            <div className="ui-label">Permissions</div>
            {retired > 0 ? (
              <div className="ui-subtle text-xs mb-2" role="status">
                {retired} old permission{retired === 1 ? '' : 's'} on this role no longer exist and will be removed when you save.
                They never granted anything.
              </div>
            ) : null}
            {catalog.modules.length ? (
              <PermissionMatrix
                key={editRole?.id || 'new'}
                modules={catalog.modules}
                granted={form.permissions}
                initiallyOpen={1}
                onToggle={(k) =>
                  setForm((prev) => {
                    const next = new Set(prev.permissions);
                    if (next.has(k)) next.delete(k);
                    else next.add(k);
                    return { ...prev, permissions: next };
                  })
                }
                onSetMany={(keys, on) =>
                  setForm((prev) => {
                    const next = new Set(prev.permissions);
                    for (const k of keys) {
                      if (on) next.add(k);
                      else next.delete(k);
                    }
                    return { ...prev, permissions: next };
                  })
                }
              />
            ) : (
              <div className="ui-subtle text-sm">Loading the permission list…</div>
            )}
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
          <table className="ui-table w-full ui-settled">
            <thead className="ui-sunken border-b">
              <tr>
                <th className="ui-th">Role Name</th>
                <th className="ui-th">Description</th>
                <th className="ui-th">Assigned Users</th>
                <th className="ui-th ui-col-h-center">Status</th>
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
                          <PermissionButton permission="SETTINGS::Roles::DELETE"
                            type="button"
                            className="w-full text-left px-3 py-2 text-sm text-[rgb(var(--neg))] ui-hover-sunken"
                            onClick={() => {
                              setOpenMenuForRoleId(null);
                              removeRole(r.id);
                            }}
                          >
                            Delete
                          </PermissionButton>
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
