import React, { useMemo, useState } from 'react';
import { createRole } from '../../api/admin';

const MODULES = [
  { module: 'MASTERS', subModules: ['Ledger', 'Customer', 'Supplier', 'Items / Inventory', 'Tax settings', 'Company/Branch setup'] },
  { module: 'SALES', subModules: ['Estimates / Quotes', 'Sales Invoices', 'Sales Returns'] },
  { module: 'PURCHASES', subModules: ['Purchase Orders', 'Purchase Bills', 'Purchase Returns'] },
  { module: 'EXPENSES', subModules: ['Expenses'] },
  { module: 'INVENTORY', subModules: ['Stock In', 'Stock Out', 'Adjustments', 'Inter-branch transfer'] },
  { module: 'ACCOUNTING', subModules: ['Journal Entries', 'Payments', 'Receipts', 'Contra', 'Credit Note', 'Debit Note'] },
  { module: 'REPORTS', subModules: ['Trial Balance', 'P&L', 'Balance Sheet', 'GST Reports', 'Sales / Purchase Registers'] },
  { module: 'SETTINGS', subModules: ['Users', 'Roles'] },
];

const ACTIONS = ['VIEW', 'CREATE', 'EDIT', 'DELETE', 'APPROVE', 'EXPORT'];

export function RoleCreateForm({ orgId, onCreated }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [roleType, setRoleType] = useState('CUSTOM');

  const [selected, setSelected] = useState(() => new Set());

  const toggle = (module, subModule, action) => {
    const key = `${module}::${subModule}::${action}`;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const permissions = useMemo(() => {
    return [...selected].map((k) => {
      const [module, subModule, action] = k.split('::');
      return { module, subModule, action, allowed: true };
    });
  }, [selected]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await createRole(orgId, {
        name,
        description: description || null,
        roleType,
        permissions,
      });
      onCreated?.(res.role);
      setName('');
      setDescription('');
      setSelected(new Set());
    } catch (err) {
      setError(err.message || 'Failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="ui-surface border rounded-xl p-5 space-y-4">
      <div className="ui-t-sec">Create Role</div>
      {error ? <div className="text-sm text-[rgb(var(--neg))]">{error}</div> : null}

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2">
          <label className="block text-sm font-medium mb-1">Role Name</label>
          <input className="ui-input w-full px-3 py-2" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Role Type</label>
          <select className="ui-select w-full px-3 py-2" value={roleType} onChange={(e) => setRoleType(e.target.value)}>
            <option value="ADMIN">Admin</option>
            <option value="ACCOUNTANT">Accountant</option>
            <option value="SALES">Sales</option>
            <option value="CUSTOM">Custom</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Description</label>
        <input className="ui-input w-full px-3 py-2" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>

      <div className="border rounded-xl overflow-hidden">
        <div className="px-4 py-2 ui-sunken border-b font-semibold">Permissions</div>
        <div className="p-4 space-y-4">
          {MODULES.map((m) => (
            <div key={m.module} className="space-y-2">
              <div className="font-semibold">{m.module}</div>
              {m.subModules.map((sm) => (
                <div key={sm} className="border rounded-lg p-3">
                  <div className="text-sm font-medium mb-2">{sm}</div>
                  <div className="grid grid-cols-6 gap-2">
                    {ACTIONS.map((a) => {
                      const key = `${m.module}::${sm}::${a}`;
                      const checked = selected.has(key);
                      return (
                        <label key={a} className="flex items-center gap-2 text-xs border rounded-lg px-2 py-1">
                          <input type="checkbox" checked={checked} onChange={() => toggle(m.module, sm, a)} />
                          {a}
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg ui-btn ui-btn-primary disabled:opacity-50">
          {saving ? 'Saving…' : 'Create Role'}
        </button>
      </div>
    </form>
  );
}
