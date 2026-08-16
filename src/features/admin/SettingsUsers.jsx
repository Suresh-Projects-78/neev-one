import React, { useEffect, useMemo, useState } from 'react';
import {
  listUsers,
  listRoles,
  createUser,
  deleteUser,
  assignUserRole,
  updateUser,
  setUserPrimaryRole,
  changeUserPassword,
  listBranches,
  assignUserBranches,
  getUserBranches,
} from '../../api/admin';
import Modal from '../../components/ui/Modal';

const normalizeId = (v) => String(v ?? '').trim();

const getBranchLabel = (b) => {
  if (!b) return '';
  const code = String(b.branchCode || b.code || '').trim();
  const name = String(b.branchName || b.name || '').trim();
  if (code && name) return `${code} - ${name}`;
  return name || code || `Branch ${String(b.id)}`;
};

export function SettingsUsers({ orgId }) {
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [openMenuForUserId, setOpenMenuForUserId] = useState(null);
  const [viewUserId, setViewUserId] = useState(null);
  const [editingUserId, setEditingUserId] = useState(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editForm, setEditForm] = useState({ fullName: '', email: '', roleId: '', isActive: true });
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    password: '',
    roleId: '',
  });

  const [createBranchIds, setCreateBranchIds] = useState([]);

  const [assignBranchesModalOpen, setAssignBranchesModalOpen] = useState(false);
  const [assignBranchesUser, setAssignBranchesUser] = useState(null);
  const [assignBranchesLoading, setAssignBranchesLoading] = useState(false);
  const [assignBranchesSaving, setAssignBranchesSaving] = useState(false);
  const [assignBranchIds, setAssignBranchIds] = useState([]);

  const activeBranchId = String(localStorage.getItem('activeBranchId') || localStorage.getItem('branchId') || '').trim();

  const assignableRoles = roles.filter((r) => !r.branchId);

  const branchesSorted = useMemo(() => {
    return (Array.isArray(branches) ? branches : [])
      .slice()
      .sort((a, b) => getBranchLabel(a).localeCompare(getBranchLabel(b)));
  }, [branches]);

  const loadData = async () => {
    if (!orgId) return;
    setLoading(true);
    setError('');
    try {
      let usersErr = null;
      let rolesErr = null;
      let branchesErr = null;

      try {
        const rRes = await listRoles(orgId);
        setRoles(Array.isArray(rRes.roles) ? rRes.roles : []);
      } catch (e) {
        rolesErr = e;
      }

      try {
        const uRes = await listUsers(orgId);
        setUsers(Array.isArray(uRes.users) ? uRes.users : []);
      } catch (e) {
        usersErr = e;
      }

      try {
        const bRes = await listBranches(orgId);
        setBranches(Array.isArray(bRes.branches) ? bRes.branches : []);
      } catch (e) {
        branchesErr = e;
        setBranches([]);
      }

      const msgs = [];
      if (rolesErr) msgs.push(`Roles: ${rolesErr.message || 'Failed to load'}`);
      if (usersErr) msgs.push(`Users: ${usersErr.message || 'Failed to load'}`);
      if (branchesErr) msgs.push(`Branches: ${branchesErr.message || 'Failed to load'}`);
      if (msgs.length) setError(msgs.join(' | '));
    } catch (err) {
      setError(err.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [orgId]);

  // Close row menu on outside click
  useEffect(() => {
    const onDocClick = (e) => {
      const el = e?.target;
      if (el?.closest?.('[data-user-actions]')) return;
      setOpenMenuForUserId(null);
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  const openCreate = () => {
    // default selection for branch mode
    const firstBranchId = branchesSorted?.[0]?.id != null ? String(branchesSorted[0].id) : '';
    const fallback = activeBranchId || firstBranchId;

    setForm({ fullName: '', email: '', password: '', roleId: '' });
    setCreateBranchIds(fallback ? [normalizeId(fallback)] : []);
    setShowForm(true);
    setError('');
  };

  const closeCreate = () => {
    setShowForm(false);
  };

  const allBranchIds = useMemo(() => {
    return (Array.isArray(branchesSorted) ? branchesSorted : []).map((b) => normalizeId(b?.id)).filter(Boolean);
  }, [branchesSorted]);

  const normalizeBranchIdArray = (ids) => Array.from(new Set((Array.isArray(ids) ? ids : []).map((x) => normalizeId(x)).filter(Boolean)));

  const isAllSelected = (ids) => {
    const set = new Set(normalizeBranchIdArray(ids));
    return allBranchIds.length > 0 && allBranchIds.every((id) => set.has(id));
  };

  const onChange = (k) => (e) => {
    setForm((p) => ({ ...p, [k]: e.target.value }));
    setError('');
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const selectedBranchIds = normalizeBranchIdArray(createBranchIds);
      if (selectedBranchIds.length === 0) {
        setError('Please select at least one branch');
        return;
      }

      const payload = {
        email: form.email,
        username: null,
        fullName: form.fullName,
        password: form.password,
        // attach the new user to the active org, and (if present) to the active branch
        orgIds: [orgId],
        branchIdsByOrg: {
          [orgId]: selectedBranchIds.length ? selectedBranchIds : activeBranchId ? [activeBranchId] : [],
        },
      };

      const res = await createUser(payload);

      if (form.roleId) {
        await assignUserRole(orgId, res.user.id, form.roleId, null);
      }

      setForm({ fullName: '', email: '', password: '', roleId: '' });
      closeCreate();
      await loadData();
    } catch (err) {
      setError(err.message || 'Failed to create user');
    } finally {
      setSaving(false);
    }
  };

  const openAssignBranches = async (u) => {
    if (!u?.id) return;
    setOpenMenuForUserId(null);
    setAssignBranchesUser(u);
    setAssignBranchesModalOpen(true);
    setAssignBranchesLoading(true);
    setAssignBranchesSaving(false);
    setError('');

    try {
      const res = await getUserBranches(orgId, u.id);
      const current = Array.isArray(res?.branchIds) ? res.branchIds.map((x) => normalizeId(x)).filter(Boolean) : [];
      setAssignBranchIds(current);
    } catch (e) {
      // If we can't read existing assignments, still allow setting new ones.
      const firstBranchId = branchesSorted?.[0]?.id != null ? String(branchesSorted[0].id) : '';
      const fallback = activeBranchId || firstBranchId;
      setAssignBranchIds(fallback ? [normalizeId(fallback)] : []);
      setError(e?.message || String(e));
    } finally {
      setAssignBranchesLoading(false);
    }
  };

  const closeAssignBranches = () => {
    setAssignBranchesModalOpen(false);
    setAssignBranchesUser(null);
    setAssignBranchesLoading(false);
    setAssignBranchesSaving(false);
    setAssignBranchIds([]);
  };

  const saveAssignBranches = async (e) => {
    e.preventDefault();
    if (!assignBranchesUser?.id) return;

    setAssignBranchesSaving(true);
    setError('');
    try {
      const branchIds = normalizeBranchIdArray(assignBranchIds);
      if (branchIds.length === 0) {
        setError('Please select at least one branch');
        return;
      }
      await assignUserBranches(orgId, assignBranchesUser.id, branchIds);
      closeAssignBranches();
    } catch (err) {
      setError(err?.message || 'Failed to assign branches');
    } finally {
      setAssignBranchesSaving(false);
    }
  };

  const removeUser = async (id) => {
    if (!window.confirm('Remove this user?')) return;
    try {
      await deleteUser(orgId, id);
      setUsers((prev) => prev.filter((u) => u.id !== id));
    } catch (err) {
      setError(err.message || 'Failed to remove user');
    }
  };

  const openView = (userId) => {
    setViewUserId(String(userId));
    setOpenMenuForUserId(null);
  };

  const closeView = () => {
    setViewUserId(null);
  };

  const beginEdit = (u) => {
    setEditingUserId(u.id);
    setEditForm({
      fullName: u.fullName || u.name || '',
      email: u.email || '',
      roleId: u.roleId || '',
      isActive: u.isActive !== false,
    });
    setOpenMenuForUserId(null);
    setError('');
  };

  const cancelEdit = () => {
    setEditingUserId(null);
    setEditForm({ fullName: '', email: '', roleId: '', isActive: true });
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    if (!editingUserId) return;

    setEditSaving(true);
    setError('');
    try {
      await updateUser(orgId, editingUserId, {
        fullName: editForm.fullName,
        email: editForm.email,
        isActive: Boolean(editForm.isActive),
      });
      await setUserPrimaryRole(orgId, editingUserId, editForm.roleId || null);
      await loadData();
      cancelEdit();
    } catch (err) {
      setError(err.message || 'Failed to update user');
    } finally {
      setEditSaving(false);
    }
  };

  const doChangePassword = async (u) => {
    setOpenMenuForUserId(null);
    const pwd = window.prompt(`Enter a new password for ${u.fullName || u.name || u.email}`);
    if (pwd === null) return; // cancelled
    if (String(pwd).trim().length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    try {
      await changeUserPassword(orgId, u.id, String(pwd));
    } catch (err) {
      setError(err.message || 'Failed to change password');
    }
  };

  const getRoleName = (roleId) => roles.find((r) => r.id === roleId)?.name || '—';

  const query = String(search || '').trim().toLowerCase();
  const filteredUsers = query
    ? users.filter((u) => {
        const name = String(u?.fullName || u?.name || '').toLowerCase();
        const email = String(u?.email || '').toLowerCase();
        const role = String(getRoleName(u?.roleId) || '').toLowerCase();
        return name.includes(query) || email.includes(query) || role.includes(query);
      })
    : users;

  const selectedUser = viewUserId ? users.find((u) => String(u.id) === String(viewUserId)) || null : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-xl font-bold">Users</div>
        <button
          type="button"
          onClick={openCreate}
          className="px-4 py-2 rounded-lg bg-violet-600 text-white hover:bg-violet-700"
        >
          + Create User
        </button>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="w-full max-w-sm">
          <div className="relative">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search"
              className="w-full pl-3 pr-3 py-2 border rounded-lg bg-white"
            />
          </div>
        </div>
        <div />
      </div>

      {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</div>}

      {selectedUser ? (
        <div className="bg-white border rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-lg font-semibold">User Details</div>
              <div className="text-xs text-gray-500">{selectedUser.fullName || selectedUser.name || selectedUser.email || ''}</div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => beginEdit(selectedUser)}
                className="px-4 py-2 rounded-lg border bg-white hover:bg-gray-50"
              >
                Edit
              </button>
              <button type="button" onClick={closeView} className="px-4 py-2 rounded-lg border bg-white hover:bg-gray-50">
                Close
              </button>
            </div>
          </div>

          <div className="grid grid-cols-12 gap-4 text-sm">
            <div className="col-span-12 sm:col-span-4">
              <div className="text-xs text-gray-500">Name</div>
              <div className="font-medium">{selectedUser.fullName || selectedUser.name || '—'}</div>
            </div>
            <div className="col-span-12 sm:col-span-4">
              <div className="text-xs text-gray-500">Email</div>
              <div className="font-medium">{selectedUser.email || '—'}</div>
            </div>
            <div className="col-span-12 sm:col-span-4">
              <div className="text-xs text-gray-500">Role</div>
              <div className="font-medium">{getRoleName(selectedUser.roleId)}</div>
            </div>

            <div className="col-span-12 sm:col-span-4">
              <div className="text-xs text-gray-500">Status</div>
              <div className="font-medium">{selectedUser.isActive !== false ? 'Active' : 'Inactive'}</div>
            </div>
            <div className="col-span-12 sm:col-span-8">
              <div className="text-xs text-gray-500">User ID</div>
              <div className="font-medium font-mono">{selectedUser.id || '—'}</div>
            </div>
          </div>
        </div>
      ) : null}

      {showForm ? (
        <Modal onClose={closeCreate} title="Create New User" maxWidthClass="max-w-4xl">
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Full Name *</label>
                <input className="w-full px-3 py-2 border rounded-lg" value={form.fullName} onChange={onChange('fullName')} required />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Email *</label>
                <input type="email" className="w-full px-3 py-2 border rounded-lg" value={form.email} onChange={onChange('email')} required />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Temp Password *</label>
                <input type="password" className="w-full px-3 py-2 border rounded-lg" value={form.password} onChange={onChange('password')} required />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Role</label>
                <select className="w-full px-3 py-2 border rounded-lg bg-white" value={form.roleId} onChange={onChange('roleId')}>
                  <option value="">— No role —</option>
                  {assignableRoles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="border rounded-lg p-4 space-y-3">
              <div>
                <div className="text-sm font-semibold">Branch Access</div>
                <div className="text-xs text-gray-500">Choose which branches this user can access</div>
              </div>

              <div className="border rounded-lg overflow-hidden">
                <div className="max-h-56 overflow-y-auto divide-y">
                  <label className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isAllSelected(createBranchIds)}
                      onChange={(e) => {
                        const wantAll = Boolean(e.target.checked);
                        setCreateBranchIds(wantAll ? allBranchIds : []);
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div>
                      <div className="font-medium text-gray-900">All branches</div>
                      <div className="text-xs text-gray-500">Give access to every branch</div>
                    </div>
                  </label>

                  {branchesSorted.length === 0 ? (
                    <div className="px-4 py-10 text-center text-gray-500">No branches</div>
                  ) : (
                    branchesSorted.map((b) => {
                      const id = normalizeId(b?.id);
                      const checked = normalizeBranchIdArray(createBranchIds).includes(id);
                      return (
                        <label key={id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              const want = Boolean(e.target.checked);
                              setCreateBranchIds((prev) => {
                                const cur = new Set(normalizeBranchIdArray(prev));
                                if (want) cur.add(id);
                                else cur.delete(id);
                                return Array.from(cur);
                              });
                            }}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <div className="font-medium text-gray-900">{getBranchLabel(b) || `Branch ${id}`}</div>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button type="button" onClick={closeCreate} className="px-4 py-2 rounded-lg border bg-white hover:bg-gray-50">
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50"
              >
                {saving ? 'Creating…' : 'Create User'}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {assignBranchesModalOpen ? (
        <Modal
          onClose={closeAssignBranches}
          title={`Assign Branches${assignBranchesUser?.fullName || assignBranchesUser?.name ? `: ${assignBranchesUser.fullName || assignBranchesUser.name}` : ''}`}
          maxWidthClass="max-w-3xl"
        >
          <form onSubmit={saveAssignBranches} className="space-y-4">
            {assignBranchesLoading ? <div className="text-sm text-gray-500">Loading…</div> : null}

            <div className="border rounded-lg overflow-hidden">
              <div className="max-h-56 overflow-y-auto divide-y">
                <label className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isAllSelected(assignBranchIds)}
                    onChange={(e) => {
                      const wantAll = Boolean(e.target.checked);
                      setAssignBranchIds(wantAll ? allBranchIds : []);
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <div>
                    <div className="font-medium text-gray-900">All branches</div>
                    <div className="text-xs text-gray-500">Give access to every branch</div>
                  </div>
                </label>

                {branchesSorted.length === 0 ? (
                  <div className="px-4 py-10 text-center text-gray-500">No branches</div>
                ) : (
                  branchesSorted.map((b) => {
                    const id = normalizeId(b?.id);
                    const checked = normalizeBranchIdArray(assignBranchIds).includes(id);
                    return (
                      <label key={id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const want = Boolean(e.target.checked);
                            setAssignBranchIds((prev) => {
                              const cur = new Set(normalizeBranchIdArray(prev));
                              if (want) cur.add(id);
                              else cur.delete(id);
                              return Array.from(cur);
                            });
                          }}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <div className="font-medium text-gray-900">{getBranchLabel(b) || `Branch ${id}`}</div>
                      </label>
                    );
                  })
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button type="button" onClick={closeAssignBranches} className="px-4 py-2 rounded-lg border bg-white hover:bg-gray-50">
                Cancel
              </button>
              <button
                type="submit"
                disabled={assignBranchesSaving || assignBranchesLoading}
                className="px-4 py-2 rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50"
              >
                {assignBranchesSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {editingUserId ? (
        <form onSubmit={saveEdit} className="bg-white border rounded-xl p-5 space-y-4">
          <div className="text-lg font-semibold">Edit User</div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Full Name *</label>
              <input
                className="w-full px-3 py-2 border rounded-lg"
                value={editForm.fullName}
                onChange={(e) => setEditForm((p) => ({ ...p, fullName: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Email *</label>
              <input
                type="email"
                className="w-full px-3 py-2 border rounded-lg"
                value={editForm.email}
                onChange={(e) => setEditForm((p) => ({ ...p, email: e.target.value }))}
                required
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Role</label>
              <select
                className="w-full px-3 py-2 border rounded-lg bg-white"
                value={editForm.roleId}
                onChange={(e) => setEditForm((p) => ({ ...p, roleId: e.target.value }))}
              >
                <option value="">— No role —</option>
                {assignableRoles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Status</label>
              <select
                className="w-full px-3 py-2 border rounded-lg bg-white"
                value={editForm.isActive ? 'active' : 'inactive'}
                onChange={(e) => setEditForm((p) => ({ ...p, isActive: e.target.value === 'active' }))}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={cancelEdit} className="px-4 py-2 rounded-lg border bg-white hover:bg-gray-50">
              Cancel
            </button>
            <button
              type="submit"
              disabled={editSaving}
              className="px-4 py-2 rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50"
            >
              {editSaving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      ) : null}

      <div className="bg-white border rounded-xl overflow-visible">
        {loading ? (
          <div className="px-6 py-10 text-center text-gray-500">Loading…</div>
        ) : users.length === 0 ? (
          <div className="px-6 py-10 text-center text-gray-500">No users yet. Click "Create User" to add one.</div>
        ) : filteredUsers.length === 0 ? (
          <div className="px-6 py-10 text-center text-gray-500">No users found.</div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredUsers.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    <button type="button" className="text-left hover:underline" onClick={() => openView(u.id)}>
                      {u.fullName || u.name}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">{u.email}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{getRoleName(u.roleId)}</td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${u.isActive !== false ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {u.isActive !== false ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="relative inline-block text-left" data-user-actions>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenMenuForUserId((prev) => (prev === u.id ? null : u.id));
                        }}
                        className="px-2 py-1 rounded-md border bg-white hover:bg-gray-50"
                        aria-label="User actions"
                      >
                        ⋯
                      </button>

                      {openMenuForUserId === u.id ? (
                        <div className="absolute right-0 mt-2 w-44 origin-top-right rounded-md border bg-white shadow-sm z-50">
                          <button
                            type="button"
                            onClick={() => openView(u.id)}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                          >
                            View
                          </button>
                          <button
                            type="button"
                            onClick={() => beginEdit(u)}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => openAssignBranches(u)}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                          >
                            Assign Branches
                          </button>
                          <button
                            type="button"
                            onClick={() => doChangePassword(u)}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                          >
                            Change Password
                          </button>
                          <button
                            type="button"
                            onClick={() => removeUser(u.id)}
                            className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                          >
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
