import React, { useEffect, useState } from 'react';
import { listRoles } from '../../api/admin';
import { RoleCreateForm } from './RoleCreateForm';
import { UserCreateForm } from './UserCreateForm';

export function SettingsUsersRoles({ orgId }) {
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await listRoles(orgId);
      setRoles(Array.isArray(res.roles) ? res.roles : []);
    } catch (err) {
      setError(err.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!orgId) return;
    load();
  }, [orgId]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-2xl font-bold">Users & Roles</div>
          <div className="text-sm text-gray-500">Create users and define role permissions</div>
        </div>
      </div>

      {error ? <div className="text-sm text-red-600">{error}</div> : null}
      {loading ? <div className="text-sm text-gray-500">Loading…</div> : null}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <RoleCreateForm orgId={orgId} onCreated={load} />
        <div className="bg-white border rounded-xl p-4">
          <div className="text-lg font-semibold mb-2">Existing Roles</div>
          <div className="divide-y">
            {roles.map((r) => (
              <div key={r.id} className="py-3">
                <div className="font-semibold">{r.name}</div>
                <div className="text-xs text-gray-500">{r.description || 'No description'}</div>
              </div>
            ))}
            {!roles.length ? <div className="text-sm text-gray-500 py-3">No roles yet</div> : null}
          </div>
        </div>
      </div>

      <UserCreateForm onCreated={() => {}} />
    </div>
  );
}
