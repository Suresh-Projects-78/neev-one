import React, { useState } from 'react';
import { createUser } from '../../api/admin';

export function UserCreateForm({ onCreated }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    email: '',
    username: '',
    fullName: '',
    password: '',
    orgIds: [],
    branchIdsByOrg: {},
  });

  const onChange = (k) => (e) => {
    setForm((p) => ({ ...p, [k]: e.target.value }));
    setError('');
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        email: form.email,
        username: form.username ? form.username : null,
        fullName: form.fullName,
        password: form.password,
        // Assign memberships later via separate UI (recommended)
        orgIds: form.orgIds,
        branchIdsByOrg: form.branchIdsByOrg,
      };
      const res = await createUser(payload);
      onCreated?.(res.user);
      setForm((p) => ({ ...p, email: '', username: '', fullName: '', password: '' }));
    } catch (err) {
      setError(err.message || 'Failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="ui-surface border rounded-xl p-5 space-y-4">
      <div className="text-lg font-bold">Create User</div>
      {error ? <div className="text-sm text-red-600">{error}</div> : null}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Email (User ID)</label>
          <input className="w-full px-3 py-2 border rounded-lg" value={form.email} onChange={onChange('email')} required />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Username (optional)</label>
          <input className="w-full px-3 py-2 border rounded-lg" value={form.username} onChange={onChange('username')} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Full Name</label>
          <input className="w-full px-3 py-2 border rounded-lg" value={form.fullName} onChange={onChange('fullName')} required />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Password</label>
          <input type="password" className="w-full px-3 py-2 border rounded-lg" value={form.password} onChange={onChange('password')} required />
        </div>
      </div>

      <div className="text-xs ui-muted">
        Assign orgs/branches/roles using dedicated screens (recommended), so UI stays simple and permissions are server-enforced.
      </div>

      <div className="flex justify-end">
        <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg ui-primary-bg disabled:opacity-50">
          {saving ? 'Saving…' : 'Create User'}
        </button>
      </div>
    </form>
  );
}
