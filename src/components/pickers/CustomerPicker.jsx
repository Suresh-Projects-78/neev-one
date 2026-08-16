import { useEffect, useMemo, useState } from 'react';
import Modal from '../ui/Modal';
import { GST_STATE_BY_CODE, getGstStateFromGstin } from '../../utils/gst';
import { getCustomerDisplayName } from '../../utils/contacts';
import PopupSelect from './PopupSelect';

export const CustomerForm = ({ db, setDb, currentCompany, initialData = null, onCreated, onClose }) => {
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

  const sundryDebtorsGroup = useMemo(() => {
    return allGroups.find((g) => String(g.name || '').trim().toLowerCase() === 'sundry debtors') || null;
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
      groupId: sundryDebtorsGroup?.id ? String(sundryDebtorsGroup.id) : '',
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
    if (!sundryDebtorsGroup?.id) return;
    setFormData((p) => ({ ...p, groupId: String(sundryDebtorsGroup.id) }));
  }, [isEdit, formData.groupId, sundryDebtorsGroup?.id]);

  const customerGroupOptions = useMemo(() => {
    const rootId = sundryDebtorsGroup?.id ? String(sundryDebtorsGroup.id) : '';
    const byId = new Map(allGroups.map((g) => [String(g.id), g]));
    const childrenByParent = new Map();
    for (const g of allGroups) {
      const pid = g?.parentGroupId !== null && g?.parentGroupId !== undefined ? String(g.parentGroupId) : '';
      if (!pid) continue;
      const arr = childrenByParent.get(pid) || [];
      arr.push(g);
      childrenByParent.set(pid, arr);
    }

    const isCustomerCat = (g) => String(g?.groupCategory || '').trim() === 'Customer';

    const ids = new Set();
    if (rootId && byId.get(rootId) && isCustomerCat(byId.get(rootId))) ids.add(rootId);

    const queue = [];
    if (rootId) queue.push(rootId);
    while (queue.length) {
      const cur = queue.shift();
      const kids = childrenByParent.get(String(cur)) || [];
      for (const k of kids) {
        if (!isCustomerCat(k)) continue;
        const kidId = String(k.id);
        if (ids.has(kidId)) continue;
        ids.add(kidId);
        queue.push(kidId);
      }
    }

    if (isEdit && String(formData.groupId || '').trim()) {
      const current = byId.get(String(formData.groupId));
      if (current && isCustomerCat(current)) ids.add(String(current.id));
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
  }, [allGroups, sundryDebtorsGroup?.id, isEdit, formData.groupId]);

  const [groupCreateOpen, setGroupCreateOpen] = useState(false);
  const [groupDraftName, setGroupDraftName] = useState('');

  const createCustomerChildGroup = (nameRaw) => {
    const name = String(nameRaw || '').trim();
    if (!name) return;
    if (!sundryDebtorsGroup?.id) {
      alert('Sundry Debtors group is missing.');
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
      typeId: Number(sundryDebtorsGroup.typeId),
      name,
      parentGroupId: Number(sundryDebtorsGroup.id),
      groupCategory: 'Customer',
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

  const updateBilling = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      billingAddress: {
        ...prev.billingAddress,
        [field]: value,
      },
    }));
  };

  const updateShipping = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      shippingAddress: {
        ...prev.shippingAddress,
        [field]: value,
      },
    }));
  };

  const gstRegistrationRequiresGstinUi = ['Registered', 'Composition', 'SEZ'].includes(formData.gstRegistration);
  const gstStateAuto = getGstStateFromGstin(formData.gstin);

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
  const isIndiaShipping = String(formData.shippingAddress?.country || '').trim() === INDIA_COUNTRY;

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
      : sundryDebtorsGroup
        ? Number(sundryDebtorsGroup.id)
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
    const shippingCountry = String(formData.shippingAddress?.country || '').trim();
    const billingState = String(formData.billingAddress?.state || '').trim();
    const shippingState = String(formData.shippingAddress?.state || '').trim();

    if (billingCountry === INDIA_COUNTRY && !billingState) {
      alert('Billing state is required for India.');
      return;
    }

    if (!formData.shippingSameAsBilling && shippingCountry === INDIA_COUNTRY && !shippingState) {
      alert('Shipping state is required for India.');
      return;
    }

    if (gstRegistrationRequiresGstin) {
      const stateFromGstin = getGstinState(effectiveGstin);
      if (!stateFromGstin) {
        alert('Unable to derive State from GSTIN. Please check GSTIN.');
        return;
      }
      if (billingCountry === INDIA_COUNTRY && billingState && String(stateFromGstin).trim().toLowerCase() !== String(billingState).trim().toLowerCase()) {
        alert('Billing State does not match GSTIN State.');
        return;
      }
    }

    const billingStateFinal = String(gstStateAuto || formData.billingAddress.state || '').trim();
    const shippingStateFinal = String(formData.shippingSameAsBilling ? billingStateFinal : formData.shippingAddress.state || '').trim();

    const payloadBase = {
      companyId: currentCompany.id,
      ...formData,
      name: formData.displayName.trim(),
      gstin: effectiveGstin,
      pan: effectivePan,
      billingAddress: {
        ...formData.billingAddress,
        state: billingStateFinal,
        country: billingCountry || INDIA_COUNTRY,
      },
      shippingAddress: formData.shippingSameAsBilling
        ? {
            ...formData.billingAddress,
            state: billingStateFinal,
            country: billingCountry || INDIA_COUNTRY,
          }
        : {
            ...formData.shippingAddress,
            state: shippingStateFinal,
            country: shippingCountry || INDIA_COUNTRY,
          },
    };

    if (isEdit) {
      const existing = (db.customers || []).find(
        (c) => c.companyId === currentCompany.id && String(c.id) === String(initialData?.id)
      );
      if (!existing) {
        alert('Customer not found. It may have been removed.');
        onClose?.();
        return;
      }

      const updatedCustomer = {
        ...existing,
        ...payloadBase,
        balance: existing.balance || 0,
        groupId: effectiveGroupId,
      };

      const coa = Array.isArray(db.chartOfAccounts) ? db.chartOfAccounts : [];
      const groups = Array.isArray(db.accountGroups) ? db.accountGroups : [];
      const groupRow = effectiveGroupId ? groups.find((g) => Number(g.id) === Number(effectiveGroupId) && g.companyId === currentCompany.id) : null;
      const typeRow = groupRow ? accountTypeById.get(String(groupRow.typeId)) : null;

      const existingLedger = updatedCustomer?.accountId
        ? coa.find((a) => a.companyId === currentCompany.id && String(a.id) === String(updatedCustomer.accountId))
        : null;

      const nextCoaId = coa.reduce((m, a) => Math.max(m, Number(a?.id || 0)), 0) + 1;

      const ledgerName = getCustomerDisplayName(updatedCustomer);
      const ledgerCode = existingLedger?.code || `CUST-${updatedCustomer.id}`;

      const upsertLedger = existingLedger
        ? {
            ...existingLedger,
            code: ledgerCode,
            name: ledgerName,
            ledgerCategory: 'Customer',
            groupId: effectiveGroupId,
            type: String(typeRow?.accountClass || existingLedger.type || 'Asset'),
            subType: String(typeRow?.name || existingLedger.subType || ''),
            main: String(typeRow?.main || existingLedger.main || 'Balance Sheet'),
            updatedAt: new Date().toISOString(),
          }
        : {
            id: nextCoaId,
            companyId: currentCompany.id,
            code: ledgerCode,
            name: ledgerName,
            ledgerCategory: 'Customer',
            groupId: effectiveGroupId,
            type: String(typeRow?.accountClass || 'Asset'),
            subType: String(typeRow?.name || ''),
            main: String(typeRow?.main || 'Balance Sheet'),
            balance: 0,
            createdAt: new Date().toISOString(),
          };

      const nextChartOfAccounts = existingLedger
        ? coa.map((a) => (a.companyId === currentCompany.id && String(a.id) === String(existingLedger.id) ? upsertLedger : a))
        : [...coa, upsertLedger];

      const finalCustomer = {
        ...updatedCustomer,
        accountId: existingLedger ? existingLedger.id : upsertLedger.id,
      };

      setDb({
        ...db,
        chartOfAccounts: nextChartOfAccounts,
        customers: (db.customers || []).map((c) =>
          c.companyId === currentCompany.id && String(c.id) === String(existing.id) ? finalCustomer : c
        ),
      });

      if (typeof onCreated === 'function') onCreated(finalCustomer);
      if (typeof onClose === 'function') {
        onClose();
        return;
      }

      alert('Customer updated!');
      return;
    }

    const nextId = Math.max(0, ...(Array.isArray(db.customers) ? db.customers : []).map((c) => Number(c.id) || 0)) + 1;
    const newCustomer = {
      id: nextId,
      ...payloadBase,
      balance: 0,
      groupId: effectiveGroupId,
    };

    const coa = Array.isArray(db.chartOfAccounts) ? db.chartOfAccounts : [];
    const groups = Array.isArray(db.accountGroups) ? db.accountGroups : [];
    const groupRow = effectiveGroupId ? groups.find((g) => Number(g.id) === Number(effectiveGroupId) && g.companyId === currentCompany.id) : null;
    const typeRow = groupRow ? accountTypeById.get(String(groupRow.typeId)) : null;

    const nextCoaId = coa.reduce((m, a) => Math.max(m, Number(a?.id || 0)), 0) + 1;
    const ledger = {
      id: nextCoaId,
      companyId: currentCompany.id,
      code: `CUST-${newCustomer.id}`,
      name: getCustomerDisplayName(newCustomer),
      ledgerCategory: 'Customer',
      groupId: effectiveGroupId,
      type: String(typeRow?.accountClass || 'Asset'),
      subType: String(typeRow?.name || ''),
      main: String(typeRow?.main || 'Balance Sheet'),
      balance: 0,
      createdAt: new Date().toISOString(),
    };

    const finalCustomer = { ...newCustomer, accountId: ledger.id };

    setDb({ ...db, chartOfAccounts: [...coa, ledger], customers: [...(db.customers || []), finalCustomer] });

    if (typeof onCreated === 'function') onCreated(finalCustomer);
    if (typeof onClose === 'function') {
      onClose();
      return;
    }

    alert('Customer created!');
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
          options={customerGroupOptions}
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
                updateBilling('state', next);
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
        <div className="font-semibold">Billing Address</div>

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

      <div className="border rounded-lg p-3 space-y-3">
        <div className="flex items-center justify-between">
          <div className="font-semibold">Shipping Address</div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={formData.shippingSameAsBilling}
              onChange={(e) => setFormData((p) => ({ ...p, shippingSameAsBilling: e.target.checked }))}
            />
            Same as Billing
          </label>
        </div>

        {!formData.shippingSameAsBilling && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Address Line 1</label>
                <input
                  type="text"
                  value={formData.shippingAddress.line1}
                  onChange={(e) => updateShipping('line1', e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Address Line 2</label>
                <input
                  type="text"
                  value={formData.shippingAddress.line2}
                  onChange={(e) => updateShipping('line2', e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">City</label>
                <input
                  type="text"
                  value={formData.shippingAddress.city}
                  onChange={(e) => updateShipping('city', e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">District</label>
                <input
                  type="text"
                  value={formData.shippingAddress.district}
                  onChange={(e) => updateShipping('district', e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">State</label>
                <PopupSelect
                  label={null}
                  title="Select State"
                  value={formData.shippingAddress.state}
                  onChange={(next) => updateShipping('state', next)}
                  options={
                    isIndiaShipping
                      ? INDIA_STATES.map((s) => ({ value: s.name, label: s.name, code: s.code }))
                      : []
                  }
                  placeholder={isIndiaShipping ? 'Select state' : 'Select / type state'}
                  allowCustom
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Pincode</label>
                <input
                  type="text"
                  value={formData.shippingAddress.pincode}
                  onChange={(e) => updateShipping('pincode', e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Country</label>
              <PopupSelect
                label={null}
                title="Select Country"
                value={formData.shippingAddress.country}
                onChange={(next) => updateShipping('country', next)}
                options={[
                  { value: INDIA_COUNTRY, label: INDIA_COUNTRY },
                  { value: 'Overseas', label: 'Overseas' },
                ]}
                placeholder="Select country"
              />
            </div>
          </div>
        )}
      </div>

      <button type="submit" className="w-full px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700">
        {isEdit ? 'Update Customer' : 'Create Customer'}
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
              createCustomerChildGroup(groupDraftName);
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
                placeholder="e.g., Walk-in Customers"
                autoFocus
                required
              />
              <div className="text-xs text-gray-500 mt-1">This group will be created under Sundry Debtors.</div>
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
              <button type="submit" className="px-4 py-2 rounded-lg bg-violet-600 text-white hover:bg-violet-700">
                Create
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  );
};

const CustomerPicker = ({ db, setDb, currentCompany, value, onChange, label = 'Customer' }) => {
  const customers = db.customers.filter((c) => c.companyId === currentCompany.id);
  const [showCustomerPopup, setShowCustomerPopup] = useState(false);
  const [customerPopupMode, setCustomerPopupMode] = useState('select');
  const [customerSearch, setCustomerSearch] = useState('');

  const selectedCustomerName = value
    ? getCustomerDisplayName(customers.find((c) => c.id === parseInt(value)))
    : '';

  const normalizedCustomerSearch = customerSearch.trim().toLowerCase();
  const filteredCustomers = normalizedCustomerSearch
    ? customers.filter((c) => {
        const haystack = `${c.displayName || c.name || ''} ${c.contactPerson || ''} ${c.email || ''} ${c.mobile || c.phone || ''} ${c.gstin || ''} ${c.pan || ''}`.toLowerCase();
        return haystack.includes(normalizedCustomerSearch);
      })
    : customers;

  const closePopup = () => {
    setShowCustomerPopup(false);
    setCustomerPopupMode('select');
    setCustomerSearch('');
  };

  return (
    <>
      <label className="block text-sm font-medium mb-1">{label}</label>
      <button
        type="button"
        onClick={() => {
          setCustomerPopupMode('select');
          setCustomerSearch('');
          setShowCustomerPopup(true);
        }}
        className="w-full px-3 py-2 border rounded-lg bg-white text-left"
      >
        {selectedCustomerName || 'Select Customer'}
      </button>

      {showCustomerPopup && (
        <Modal
          onClose={closePopup}
          title={customerPopupMode === 'create' ? 'Create Customer' : 'Select Customer'}
          maxWidthClass="max-w-lg"
        >
          {customerPopupMode === 'select' ? (
            <div className="space-y-3">
              <input
                type="text"
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg"
                placeholder="Search customer (name, email, phone, GSTIN)"
              />

              <div className="max-h-80 overflow-y-auto space-y-1">
                {filteredCustomers.length === 0 ? (
                  <div className="text-sm text-gray-600">No customers found.</div>
                ) : (
                  filteredCustomers.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        onChange(String(c.id));
                        closePopup();
                      }}
                      className={`w-full text-left px-3 py-2 rounded-lg border hover:bg-gray-50 ${
                        String(c.id) === String(value) ? 'bg-gray-50 border-gray-300' : 'border-gray-200'
                      }`}
                    >
                      <div className="text-sm font-medium text-gray-900">{getCustomerDisplayName(c)}</div>
                      {(c.email || c.mobile || c.phone) && (
                        <div className="text-xs text-gray-500 truncate">
                          {[c.email, c.mobile || c.phone].filter(Boolean).join(' • ')}
                        </div>
                      )}
                    </button>
                  ))
                )}
              </div>

              {normalizedCustomerSearch && filteredCustomers.length === 0 && (
                <button
                  type="button"
                  onClick={() => setCustomerPopupMode('create')}
                  className="w-full px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700"
                >
                  Create new customer
                </button>
              )}
            </div>
          ) : (
            <CustomerForm
              db={db}
              setDb={setDb}
              currentCompany={currentCompany}
              onCreated={(customer) => onChange(String(customer.id))}
              onClose={closePopup}
            />
          )}
        </Modal>
      )}
    </>
  );
};

export default CustomerPicker;
