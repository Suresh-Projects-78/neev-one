import React, { useState } from 'react';
import { createWarehouse } from '../../api/admin';

export function WarehouseCreateForm({ orgId, branches = [], onCreated }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    branchId: '',
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

  const onChange = (k) => (e) => {
    const v = e?.target?.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((p) => ({ ...p, [k]: v }));
    setError('');
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...form,
        gstin: form.gstin ? form.gstin : null,
        contactPerson: form.contactPerson ? form.contactPerson : null,
        phone: form.phone ? form.phone : null,
        email: form.email ? form.email : null,
        state: form.state || null,
        city: form.city || null,
        addressLine1: form.addressLine1 || null,
        addressLine2: form.addressLine2 || null,
        country: form.country || null,
      };
      const res = await createWarehouse(orgId, payload);
      onCreated?.(res.warehouse);
      setForm((p) => ({ ...p, name: '', gstin: '' }));
    } catch (err) {
      setError(err.message || 'Failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="bg-white border rounded-xl p-5 space-y-4">
      <div className="text-lg font-bold">Create Warehouse</div>
      {error ? <div className="text-sm text-red-600">{error}</div> : null}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Branch</label>
          <select className="w-full px-3 py-2 border rounded-lg" value={form.branchId} onChange={onChange('branchId')} required>
            <option value="">Select branch</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.branchName || b.name || b.code || 'Branch'}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Warehouse Name</label>
          <input className="w-full px-3 py-2 border rounded-lg" value={form.name} onChange={onChange('name')} required />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Address</label>
        <input className="w-full px-3 py-2 border rounded-lg" value={form.addressLine1} onChange={onChange('addressLine1')} />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">City</label>
          <input className="w-full px-3 py-2 border rounded-lg" value={form.city} onChange={onChange('city')} />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">State</label>
          <input className="w-full px-3 py-2 border rounded-lg" value={form.state} onChange={onChange('state')} />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Country</label>
          <input className="w-full px-3 py-2 border rounded-lg" value={form.country} onChange={onChange('country')} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">GST Registration</label>
          <select className="w-full px-3 py-2 border rounded-lg" value={form.gstRegistrationType} onChange={onChange('gstRegistrationType')}>
            <option value="REGULAR">Regular</option>
            <option value="COMPOSITION">Composition</option>
            <option value="UNREGISTERED">Unregistered</option>
          </select>
        </div>
        <div className="col-span-2">
          <label className="block text-sm font-medium mb-1">GSTIN</label>
          <input className="w-full px-3 py-2 border rounded-lg" value={form.gstin} onChange={onChange('gstin')} placeholder="15-char GSTIN" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Phone</label>
          <input className="w-full px-3 py-2 border rounded-lg" value={form.phone} onChange={onChange('phone')} />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Email</label>
          <input className="w-full px-3 py-2 border rounded-lg" value={form.email} onChange={onChange('email')} />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Contact Person</label>
          <input className="w-full px-3 py-2 border rounded-lg" value={form.contactPerson} onChange={onChange('contactPerson')} />
        </div>
      </div>

      <div className="flex justify-end">
        <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50">
          {saving ? 'Saving…' : 'Create Warehouse'}
        </button>
      </div>
    </form>
  );
}
