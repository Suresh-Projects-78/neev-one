import React, { useMemo, useState } from 'react';
import { createBranch } from '../../api/admin';
import PopupSelect from '../../components/pickers/PopupSelect';
import { GST_STATE_BY_CODE, getGstStateFromGstin } from '../../utils/gst';

export function BranchCreateForm({ orgId, onCreated }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    branchCode: '',
    branchName: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    country: 'India',
    gstRegistrationType: 'UNREGISTERED',
    gstin: '',
    phone: '',
    email: '',
    contactPerson: '',
    parentBranchId: '',
    shareHeadOfficeSettings: false,
  });

  const onChange = (k) => (e) => {
    const v = e?.target?.type === 'checkbox' ? e.target.checked : e.target.value;
    if (k === 'gstin') {
      const maybeState = getGstStateFromGstin(String(v || '').trim());
      setForm((p) => ({ ...p, gstin: v, state: maybeState ? maybeState : p.state }));
      setError('');
      return;
    }
    setForm((p) => ({ ...p, [k]: v }));
    setError('');
  };

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

  const onSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...form,
        parentBranchId: form.parentBranchId ? form.parentBranchId : null,
        gstin: form.gstin ? form.gstin : null,
        email: form.email ? form.email : null,
        phone: form.phone ? form.phone : null,
        contactPerson: form.contactPerson ? form.contactPerson : null,
      };
      const res = await createBranch(orgId, payload);
      onCreated?.(res.branch);
      setForm((p) => ({ ...p, branchCode: '', branchName: '' }));
    } catch (err) {
      setError(err.message || 'Failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="bg-white border rounded-xl p-5 space-y-4">
      <div className="text-lg font-bold">Create Branch</div>

      {error ? <div className="text-sm text-red-600">{error}</div> : null}

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 sm:col-span-4">
          <label className="block text-sm font-medium mb-1">Branch Code</label>
          <input className="w-full max-w-40 px-3 py-2 border rounded-lg" value={form.branchCode} onChange={onChange('branchCode')} required />
        </div>
        <div className="col-span-12 sm:col-span-8">
          <label className="block text-sm font-medium mb-1">Branch Name</label>
          <input className="w-full px-3 py-2 border rounded-lg" value={form.branchName} onChange={onChange('branchName')} required />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Address</label>
        <input className="w-full px-3 py-2 border rounded-lg" value={form.addressLine1} onChange={onChange('addressLine1')} required />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">City</label>
          <input className="w-full px-3 py-2 border rounded-lg" value={form.city} onChange={onChange('city')} />
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
            title="Select State"
            maxWidthClass="max-w-2xl"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Country</label>
          <input className="w-full px-3 py-2 border rounded-lg" value={form.country} onChange={onChange('country')} required />
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

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={form.shareHeadOfficeSettings} onChange={onChange('shareHeadOfficeSettings')} />
        Share ledgers and settings of head office
      </label>

      <div className="flex justify-end">
        <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50">
          {saving ? 'Saving…' : 'Create Branch'}
        </button>
      </div>
    </form>
  );
}
