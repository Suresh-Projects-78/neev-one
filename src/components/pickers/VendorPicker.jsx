import { useEffect, useMemo, useState } from 'react';
import Modal from '../ui/Modal';
import { GST_STATE_BY_CODE, getGstStateFromGstin } from '../../utils/gst';
import { getVendorDisplayName } from '../../utils/contacts';
import PopupSelect from './PopupSelect';

export const VendorForm = ({ db, setDb, currentCompany, initialData = null, onCreated, onClose }) => {
  const isEdit = Boolean(initialData);
  const INDIA_COUNTRY = 'India';
  const INDIA_STATES = Object.entries(GST_STATE_BY_CODE)
    .map(([code, name]) => ({ code, name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const allGroups = useMemo(() => {
    return (Array.isArray(db.accountGroups) ? db.accountGroups : [])
      .filter((g) => g.companyId === currentCompany.id)
      .filter((g) => !g.isLegacy)
      .slice();
  }, [db.accountGroups, currentCompany.id]);

  const sundryCreditorsGroup = useMemo(() => {
    return allGroups.find((g) => String(g.name || '').trim().toLowerCase() === 'sundry creditors') || null;
  }, [allGroups]);

  const [formData, setFormData] = useState(() => {
    const emptyAddress = {
      line1: '',
      line2: '',
      city: '',
      district: '',
      state: '',
      pincode: '',
      country: '',
    };

    if (initialData) {
      const billing = { ...emptyAddress, ...(initialData.billingAddress || {}) };
      const shipping = { ...emptyAddress, ...(initialData.shippingAddress || {}) };
      return {
        displayName: String(initialData.displayName || initialData.name || ''),
        groupId: initialData?.groupId ? String(initialData.groupId) : '',
        contactPerson: String(initialData.contactPerson || ''),
        mobile: String(initialData.mobile || initialData.phone || ''),
        email: String(initialData.email || ''),
        alternatePhone: String(initialData.alternatePhone || ''),
        gstRegistration: String(initialData.gstRegistration || 'Unregistered'),
        gstin: String(initialData.gstin || ''),
        pan: String(initialData.pan || ''),
        billingAddress: {
          ...billing,
          state: String(billing.state || ''),
          country: String(billing.country || INDIA_COUNTRY),
        },
        shippingSameAsBilling:
          typeof initialData.shippingSameAsBilling === 'boolean'
            ? initialData.shippingSameAsBilling
            : true,
        shippingAddress: {
          ...shipping,
          state: String(shipping.state || ''),
          country: String(shipping.country || INDIA_COUNTRY),
        },
      };
    }

    return {
      displayName: '',
      groupId: sundryCreditorsGroup?.id ? String(sundryCreditorsGroup.id) : '',
      contactPerson: '',
      mobile: '',
      email: '',
      alternatePhone: '',
      gstRegistration: 'Unregistered',
      gstin: '',
      pan: '',
      billingAddress: {
        ...emptyAddress,
        country: INDIA_COUNTRY,
      },
      shippingSameAsBilling: true,
      shippingAddress: {
        ...emptyAddress,
        country: INDIA_COUNTRY,
      },
    };
  });

  useEffect(() => {
    if (isEdit) return;
    if (String(formData.groupId || '').trim()) return;
    if (!sundryCreditorsGroup?.id) return;
    setFormData((p) => ({ ...p, groupId: String(sundryCreditorsGroup.id) }));
  }, [isEdit, formData.groupId, sundryCreditorsGroup?.id]);

  const vendorGroupOptions = useMemo(() => {
    const rootId = sundryCreditorsGroup?.id ? String(sundryCreditorsGroup.id) : '';
    const byId = new Map(allGroups.map((g) => [String(g.id), g]));
    const childrenByParent = new Map();
    for (const g of allGroups) {
      const pid = g?.parentGroupId !== null && g?.parentGroupId !== undefined ? String(g.parentGroupId) : '';
      if (!pid) continue;
      const arr = childrenByParent.get(pid) || [];
      arr.push(g);
      childrenByParent.set(pid, arr);
    }

    const isVendorCat = (g) => String(g?.groupCategory || '').trim() === 'Vendor';

    const ids = new Set();
    if (rootId && byId.get(rootId) && isVendorCat(byId.get(rootId))) ids.add(rootId);

    const queue = [];
    if (rootId) queue.push(rootId);
    while (queue.length) {
      const cur = queue.shift();
      const kids = childrenByParent.get(String(cur)) || [];
      for (const k of kids) {
        if (!isVendorCat(k)) continue;
        const kidId = String(k.id);
        if (ids.has(kidId)) continue;
        ids.add(kidId);
        queue.push(kidId);
      }
    }

    if (isEdit && String(formData.groupId || '').trim()) {
      const current = byId.get(String(formData.groupId));
      if (current && isVendorCat(current)) ids.add(String(current.id));
    }

    const rows = [...ids]
      .map((id) => byId.get(id))
      .filter(Boolean)
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));

    if (rootId) {
      const root = byId.get(rootId);
      if (root) {
        const idx = rows.findIndex((r) => String(r.id) === rootId);
        if (idx > 0) {
          rows.splice(idx, 1);
          rows.unshift(root);
        }
      }
    }

    return rows.map((g) => ({ value: String(g.id), label: String(g.name || '').trim() }));
  }, [allGroups, sundryCreditorsGroup?.id, isEdit, formData.groupId]);

  const [groupCreateOpen, setGroupCreateOpen] = useState(false);
  const [groupDraftName, setGroupDraftName] = useState('');

  const createVendorChildGroup = (nameRaw) => {
    const name = String(nameRaw || '').trim();
    if (!name) return;
    if (!sundryCreditorsGroup?.id) {
      alert('Sundry Creditors group is missing.');
      return;
    }

    const clash = allGroups.some((g) => String(g.name || '').trim().toLowerCase() === name.toLowerCase());
    if (clash) {
      alert('Group already exists');
      return;
    }

    const nextId = allGroups.reduce((m, g) => Math.max(m, Number(g?.id || 0)), 0) + 1;
    const newGroup = {
      id: nextId,
      companyId: currentCompany.id,
      typeId: Number(sundryCreditorsGroup.typeId),
      name,
      parentGroupId: Number(sundryCreditorsGroup.id),
      groupCategory: 'Vendor',
      isUserDefined: true,
      createdAt: new Date().toISOString(),
    };

    setDb({
      ...db,
      accountGroups: [...(Array.isArray(db.accountGroups) ? db.accountGroups : []), newGroup],
    });

    setFormData((p) => ({ ...p, groupId: String(newGroup.id) }));
    setGroupCreateOpen(false);
    setGroupDraftName('');
  };

  const accountTypes = (Array.isArray(db.accountTypes) ? db.accountTypes : [])
    .filter((t) => t.companyId === currentCompany.id)
    .slice();
  const accountTypeById = new Map(accountTypes.map((t) => [String(t.id), t]));

  const gstRegistrationRequiresGstinUi = ['Registered', 'Composition', 'SEZ'].includes(formData.gstRegistration);
  const gstStateAuto = getGstStateFromGstin(formData.gstin);

  const updateBilling = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      billingAddress: {
        ...prev.billingAddress,
        [field]: value,
      },
    }));
  };

  const normalizeGstin = (v) => String(v || '').trim().toUpperCase();
  const normalizePan = (v) => String(v || '').trim().toUpperCase();
  const getPanFromGstin = (gstin) => {
    const g = normalizeGstin(gstin);
    return g.length >= 12 ? g.slice(2, 12) : '';
  };
  const isValidPan = (pan) => /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(normalizePan(pan));
  const isValidGstin = (gstin) => /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(normalizeGstin(gstin));
  const getGstinState = (gstin) => getGstStateFromGstin(normalizeGstin(gstin));

  const isIndiaBilling = String(formData.billingAddress?.country || '').trim() === INDIA_COUNTRY;

  const billingStateFromDropdown = (codeOrName) => {
    const trimmed = String(codeOrName || '').trim();
    if (!trimmed) return '';
    const byCode = GST_STATE_BY_CODE[trimmed];
    return byCode || trimmed;
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    const selectedGroupIdRaw = String(formData.groupId || '').trim();
    const effectiveGroupId = selectedGroupIdRaw
      ? Number(selectedGroupIdRaw)
      : sundryCreditorsGroup
        ? Number(sundryCreditorsGroup.id)
        : null;

    if (!formData.displayName.trim()) {
      alert('Company name is required');
      return;
    }

    const gstinNormalized = normalizeGstin(formData.gstin);
    const panNormalized = normalizePan(formData.pan);

    const gstRegistrationRequiresGstin = ['Registered', 'Composition', 'SEZ'].includes(formData.gstRegistration);

    const effectiveGstin = gstRegistrationRequiresGstin ? gstinNormalized : '';
    const panFromGstin = effectiveGstin ? getPanFromGstin(effectiveGstin) : '';
    const effectivePan = gstRegistrationRequiresGstin ? (panNormalized || panFromGstin) : '';

    if (!gstRegistrationRequiresGstin && gstinNormalized) {
      alert('GSTIN is not allowed when GST Registration is Unregistered/Overseas.');
      return;
    }
    if (gstRegistrationRequiresGstin && !effectiveGstin) {
      alert('GSTIN is required for the selected GST registration type');
      return;
    }

    if (effectiveGstin && !isValidGstin(effectiveGstin)) {
      alert('Please enter a valid GSTIN.');
      return;
    }

    if (gstRegistrationRequiresGstin) {
      if (!effectivePan) {
        alert('PAN is required for the selected GST registration type.');
        return;
      }
      if (!isValidPan(effectivePan)) {
        alert('Please enter a valid PAN.');
        return;
      }
      if (panFromGstin && normalizePan(effectivePan) !== normalizePan(panFromGstin)) {
        alert('PAN does not match GSTIN.');
        return;
      }
    }

    const billingCountry = String(formData.billingAddress?.country || '').trim();
    const billingState = String(formData.billingAddress?.state || '').trim();

    if (billingCountry === INDIA_COUNTRY && !billingState) {
      alert('Billing state is required for India.');
      return;
    }

    if (gstRegistrationRequiresGstin) {
      const stateFromGstin = getGstinState(effectiveGstin);
      if (!stateFromGstin) {
        alert('Unable to derive State from GSTIN. Please check GSTIN.');
        return;
      }
      if (
        billingCountry === INDIA_COUNTRY &&
        billingState &&
        String(stateFromGstin).trim().toLowerCase() !== String(billingState).trim().toLowerCase()
      ) {
        alert('Billing State does not match GSTIN State.');
        return;
      }
    }

    const billingStateFinal = String(gstStateAuto || formData.billingAddress.state || '').trim();

    const payloadBase = {
      companyId: currentCompany.id,
      ...formData,
      name: formData.displayName.trim(),
      // keep backward-compatible `phone` while using Customer-like `mobile`
      phone: String(formData.mobile || '').trim(),
      gstin: effectiveGstin,
      pan: effectivePan,
      billingAddress: {
        ...formData.billingAddress,
        state: billingStateFinal,
        country: billingCountry || INDIA_COUNTRY,
      },
      shippingSameAsBilling: true,
      shippingAddress: {
        ...formData.billingAddress,
        state: billingStateFinal,
        country: billingCountry || INDIA_COUNTRY,
      },
    };

    if (isEdit) {
      const existing = (db.vendors || []).find(
        (v) => v.companyId === currentCompany.id && String(v.id) === String(initialData?.id)
      );
      if (!existing) {
        alert('Vendor not found. It may have been removed.');
        onClose?.();
        return;
      }

      const updatedVendor = {
        ...existing,
        ...payloadBase,
        balance: existing.balance || 0,
        groupId: effectiveGroupId,
      };

      const coa = Array.isArray(db.chartOfAccounts) ? db.chartOfAccounts : [];
      const groups = Array.isArray(db.accountGroups) ? db.accountGroups : [];
      const groupRow = effectiveGroupId
        ? groups.find((g) => Number(g.id) === Number(effectiveGroupId) && g.companyId === currentCompany.id)
        : null;
      const typeRow = groupRow ? accountTypeById.get(String(groupRow.typeId)) : null;

      const existingLedger = updatedVendor?.accountId
        ? coa.find((a) => a.companyId === currentCompany.id && String(a.id) === String(updatedVendor.accountId))
        : null;

      const nextCoaId = coa.reduce((m, a) => Math.max(m, Number(a?.id || 0)), 0) + 1;

      const ledgerName = getVendorDisplayName(updatedVendor);
      const ledgerCode = existingLedger?.code || `VEND-${updatedVendor.id}`;

      const upsertLedger = existingLedger
        ? {
            ...existingLedger,
            code: ledgerCode,
            name: ledgerName,
            ledgerCategory: 'Vendor',
            groupId: effectiveGroupId,
            type: String(typeRow?.accountClass || existingLedger.type || 'Liability'),
            subType: String(typeRow?.name || existingLedger.subType || ''),
            main: String(typeRow?.main || existingLedger.main || 'Balance Sheet'),
            updatedAt: new Date().toISOString(),
          }
        : {
            id: nextCoaId,
            companyId: currentCompany.id,
            code: ledgerCode,
            name: ledgerName,
            ledgerCategory: 'Vendor',
            groupId: effectiveGroupId,
            type: String(typeRow?.accountClass || 'Liability'),
            subType: String(typeRow?.name || ''),
            main: String(typeRow?.main || 'Balance Sheet'),
            balance: 0,
            createdAt: new Date().toISOString(),
          };

      const nextChartOfAccounts = existingLedger
        ? coa.map((a) => (a.companyId === currentCompany.id && String(a.id) === String(existingLedger.id) ? upsertLedger : a))
        : [...coa, upsertLedger];

      const finalVendor = {
        ...updatedVendor,
        accountId: existingLedger ? existingLedger.id : upsertLedger.id,
      };

      setDb({
        ...db,
        chartOfAccounts: nextChartOfAccounts,
        vendors: (db.vendors || []).map((v) =>
          v.companyId === currentCompany.id && String(v.id) === String(existing.id) ? finalVendor : v
        ),
      });

      if (typeof onCreated === 'function') onCreated(finalVendor);
      if (typeof onClose === 'function') {
        onClose();
        return;
      }
      alert('Vendor updated!');
      return;
    }

    const nextId = Math.max(0, ...(Array.isArray(db.vendors) ? db.vendors : []).map((v) => Number(v.id) || 0)) + 1;
    const newVendor = {
      id: nextId,
      ...payloadBase,
      balance: 0,
      groupId: effectiveGroupId,
    };

    const coa = Array.isArray(db.chartOfAccounts) ? db.chartOfAccounts : [];
    const groups = Array.isArray(db.accountGroups) ? db.accountGroups : [];
    const groupRow = effectiveGroupId
      ? groups.find((g) => Number(g.id) === Number(effectiveGroupId) && g.companyId === currentCompany.id)
      : null;
    const typeRow = groupRow ? accountTypeById.get(String(groupRow.typeId)) : null;

    const nextCoaId = coa.reduce((m, a) => Math.max(m, Number(a?.id || 0)), 0) + 1;
    const ledger = {
      id: nextCoaId,
      companyId: currentCompany.id,
      code: `VEND-${newVendor.id}`,
      name: getVendorDisplayName(newVendor),
      ledgerCategory: 'Vendor',
      groupId: effectiveGroupId,
      type: String(typeRow?.accountClass || 'Liability'),
      subType: String(typeRow?.name || ''),
      main: String(typeRow?.main || 'Balance Sheet'),
      balance: 0,
      createdAt: new Date().toISOString(),
    };

    const finalVendor = { ...newVendor, accountId: ledger.id };

    setDb({ ...db, chartOfAccounts: [...coa, ledger], vendors: [...(db.vendors || []), finalVendor] });

    if (typeof onCreated === 'function') onCreated(finalVendor);

    if (typeof onClose === 'function') {
      onClose();
      return;
    }

    alert('Vendor created!');
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Company Name</label>
        <input
          type="text"
          value={formData.displayName}
          onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
          className="w-full px-3 py-2 border rounded-lg"
          required
        />
      </div>

      <div>
        <PopupSelect
          label="Group"
          value={String(formData.groupId || '').trim()}
          onChange={(val) => setFormData((p) => ({ ...p, groupId: String(val || '').trim() }))}
          options={vendorGroupOptions}
          placeholder="Select group"
          title="Select Group"
          showValueSubtext={false}
          allowCustom
          customActionText="Create new Group"
          onCustomAction={(typed) => {
            setGroupDraftName(String(typed || '').trim());
            setGroupCreateOpen(true);
          }}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Contact Person</label>
          <input
            type="text"
            value={formData.contactPerson}
            onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Mobile</label>
          <input
            type="tel"
            value={formData.mobile}
            onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Email</label>
          <input
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Alternate Phone</label>
          <input
            type="tel"
            value={formData.alternatePhone}
            onChange={(e) => setFormData({ ...formData, alternatePhone: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg"
          />
        </div>
      </div>

      <div className="border rounded-lg p-3 space-y-3">
        <div className="font-semibold">GST Details</div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">GST Registration</label>
            <select
              value={formData.gstRegistration}
              onChange={(e) => {
                const nextReg = e.target.value;
                const requiresGstin = ['Registered', 'Composition', 'SEZ'].includes(nextReg);
                setFormData((prev) => ({
                  ...prev,
                  gstRegistration: nextReg,
                  gstin: requiresGstin ? prev.gstin : '',
                  pan: requiresGstin ? prev.pan : '',
                }));
              }}
              className="w-full px-3 py-2 border rounded-lg"
            >
              <option value="Registered">Registered</option>
              <option value="Unregistered">Unregistered</option>
              <option value="Composition">Composition</option>
              <option value="SEZ">SEZ</option>
              <option value="Overseas">Overseas</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">GSTIN</label>
            <input
              type="text"
              value={gstRegistrationRequiresGstinUi ? formData.gstin : ''}
              onChange={(e) => {
                if (!gstRegistrationRequiresGstinUi) return;
                const nextGstin = e.target.value;
                const nextAutoState = getGstStateFromGstin(nextGstin);
                setFormData((prev) => ({
                  ...prev,
                  gstin: nextGstin,
                  billingAddress: {
                    ...prev.billingAddress,
                    state: nextAutoState || prev.billingAddress.state,
                  },
                }));
              }}
              className={`w-full px-3 py-2 border rounded-lg ${gstRegistrationRequiresGstinUi ? '' : 'bg-gray-50'}`}
              placeholder={gstRegistrationRequiresGstinUi ? 'GSTIN (required)' : 'GSTIN (disabled)'}
              disabled={!gstRegistrationRequiresGstinUi}
              required={gstRegistrationRequiresGstinUi}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">PAN</label>
            <input
              type="text"
              value={formData.pan}
              onChange={(e) => setFormData({ ...formData, pan: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg"
              placeholder={gstRegistrationRequiresGstinUi ? 'PAN required' : 'Optional'}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">State</label>
            <PopupSelect
              label={null}
              title="Select State"
              value={formData.billingAddress.state}
              onChange={(next) => {
                if (gstStateAuto) return;
                updateBilling('state', billingStateFromDropdown(next));
              }}
              disabled={Boolean(gstStateAuto)}
              options={
                isIndiaBilling
                  ? INDIA_STATES.map((s) => ({ value: s.name, label: s.name, code: s.code }))
                  : []
              }
              placeholder={isIndiaBilling ? 'Select state' : 'Select / type state'}
              allowCustom
            />
          </div>
        </div>
      </div>

      <div className="border rounded-lg p-3 space-y-3">
        <div className="font-semibold">Address</div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Address Line 1</label>
            <input
              type="text"
              value={formData.billingAddress.line1}
              onChange={(e) => updateBilling('line1', e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Address Line 2</label>
            <input
              type="text"
              value={formData.billingAddress.line2}
              onChange={(e) => updateBilling('line2', e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">City</label>
            <input
              type="text"
              value={formData.billingAddress.city}
              onChange={(e) => updateBilling('city', e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">District</label>
            <input
              type="text"
              value={formData.billingAddress.district}
              onChange={(e) => updateBilling('district', e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Pincode</label>
            <input
              type="text"
              value={formData.billingAddress.pincode}
              onChange={(e) => updateBilling('pincode', e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Country</label>
          <PopupSelect
            label={null}
            title="Select Country"
            value={formData.billingAddress.country}
            onChange={(next) => updateBilling('country', next)}
            options={[
              { value: INDIA_COUNTRY, label: INDIA_COUNTRY },
              { value: 'Overseas', label: 'Overseas' },
            ]}
            placeholder="Select country"
          />
        </div>
      </div>

      <button type="submit" className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
        {isEdit ? 'Update Vendor' : 'Create Vendor'}
      </button>
      </form>

      {groupCreateOpen ? (
        <Modal
          onClose={() => {
            setGroupCreateOpen(false);
            setGroupDraftName('');
          }}
          title="New Group"
          maxWidthClass="max-w-xl"
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createVendorChildGroup(groupDraftName);
            }}
            className="space-y-4"
          >
            <div>
              <label className="block text-sm font-medium mb-1">Group Name</label>
              <input
                type="text"
                value={groupDraftName}
                onChange={(e) => setGroupDraftName(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg"
                placeholder="e.g., Local Suppliers"
                autoFocus
                required
              />
              <div className="text-xs text-gray-500 mt-1">
                This group will be created under Sundry Creditors.
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setGroupCreateOpen(false);
                  setGroupDraftName('');
                }}
                className="px-4 py-2 rounded-lg border hover:bg-gray-50"
              >
                Cancel
              </button>
              <button type="submit" className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700">
                Create
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  );
};

const VendorPicker = ({ db, setDb, currentCompany, value, onChange, label = 'Vendor' }) => {
  const vendors = db.vendors.filter((v) => v.companyId === currentCompany.id);
  const [showVendorPopup, setShowVendorPopup] = useState(false);
  const [vendorPopupMode, setVendorPopupMode] = useState('select');
  const [vendorSearch, setVendorSearch] = useState('');

  const selectedVendorName = value ? getVendorDisplayName(vendors.find((v) => v.id === parseInt(value))) : '';

  const normalizedVendorSearch = vendorSearch.trim().toLowerCase();
  const filteredVendors = normalizedVendorSearch
    ? vendors.filter((v) => {
        const haystack = `${v.displayName || v.name || ''} ${v.email || ''} ${v.phone || ''} ${v.gstin || ''}`.toLowerCase();
        return haystack.includes(normalizedVendorSearch);
      })
    : vendors;

  const closePopup = () => {
    setShowVendorPopup(false);
    setVendorPopupMode('select');
    setVendorSearch('');
  };

  return (
    <>
      <label className="block text-sm font-medium mb-1">{label}</label>
      <button
        type="button"
        onClick={() => {
          setVendorPopupMode('select');
          setVendorSearch('');
          setShowVendorPopup(true);
        }}
        className="w-full px-3 py-2 border rounded-lg bg-white text-left"
      >
        {selectedVendorName || 'Select Vendor'}
      </button>

      {showVendorPopup && (
        <Modal
          onClose={closePopup}
          title={vendorPopupMode === 'create' ? 'Create Vendor' : 'Select Vendor'}
          maxWidthClass="max-w-lg"
        >
          {vendorPopupMode === 'select' ? (
            <div className="space-y-3">
              <input
                type="text"
                value={vendorSearch}
                onChange={(e) => setVendorSearch(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg"
                placeholder="Search vendor (name, phone, GSTIN)"
              />

              <div className="max-h-80 overflow-y-auto space-y-1">
                {filteredVendors.length === 0 ? (
                  <div className="text-sm text-gray-600">No vendors found.</div>
                ) : (
                  filteredVendors.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => {
                        onChange(String(v.id));
                        closePopup();
                      }}
                      className={`w-full text-left px-3 py-2 rounded-lg border hover:bg-gray-50 ${
                        String(v.id) === String(value) ? 'bg-gray-50 border-gray-300' : 'border-gray-200'
                      }`}
                    >
                      <div className="text-sm font-medium text-gray-900">{getVendorDisplayName(v)}</div>
                      {(v.phone || v.gstin) && (
                        <div className="text-xs text-gray-500 truncate">{[v.phone, v.gstin].filter(Boolean).join(' • ')}</div>
                      )}
                    </button>
                  ))
                )}
              </div>

              {normalizedVendorSearch && filteredVendors.length === 0 && (
                <button
                  type="button"
                  onClick={() => setVendorPopupMode('create')}
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Create new vendor
                </button>
              )}
            </div>
          ) : (
            <VendorForm
              db={db}
              setDb={setDb}
              currentCompany={currentCompany}
              onCreated={(vendor) => onChange(String(vendor.id))}
              onClose={closePopup}
            />
          )}
        </Modal>
      )}
    </>
  );
};

export default VendorPicker;
