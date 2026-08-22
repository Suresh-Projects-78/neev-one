import { useCallback, useMemo, useState, useEffect } from 'react';
import { notify } from '../ui/notify';
import Modal from '../ui/Modal';
import { createVendor, listVendors } from '../../api/masters';
import { useServerMasters, mirrorServerRows } from '../../hooks/useServerMasters';
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
        paymentTermDays:
          initialData.paymentTermDays === undefined || initialData.paymentTermDays === null
            ? ''
            : String(initialData.paymentTermDays),
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
      openingBalance: isEdit ? Number(initialData?.openingBalance ?? 0) : 0,
      openingBalanceType: isEdit ? (initialData?.openingBalanceType || 'Cr') : 'Cr',
      contactPerson: '',
      mobile: '',
      email: '',
      alternatePhone: '',
      gstRegistration: 'Unregistered',
      gstin: '',
      pan: '',
      paymentTermDays: '',
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

  // Default group, adjusted during render when it resolves after mount —
  // an effect here fires a second render pass for the same result.
  if (!isEdit && !String(formData.groupId || '').trim() && sundryCreditorsGroup?.id) {
    setFormData((p) => ({ ...p, groupId: String(sundryCreditorsGroup.id) }));
  }

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
      notify.error('Sundry Creditors group is missing.');
      return;
    }

    const clash = allGroups.some((g) => String(g.name || '').trim().toLowerCase() === name.toLowerCase());
    if (clash) {
      notify.error('Group already exists');
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
      notify.error('Company name is required');
      return;
    }

    const gstinNormalized = normalizeGstin(formData.gstin);
    const panNormalized = normalizePan(formData.pan);

    const gstRegistrationRequiresGstin = ['Registered', 'Composition', 'SEZ'].includes(formData.gstRegistration);

    const effectiveGstin = gstRegistrationRequiresGstin ? gstinNormalized : '';
    const panFromGstin = effectiveGstin ? getPanFromGstin(effectiveGstin) : '';
    const effectivePan = gstRegistrationRequiresGstin ? (panNormalized || panFromGstin) : '';

    if (!gstRegistrationRequiresGstin && gstinNormalized) {
      notify.error('GSTIN is not allowed when GST Registration is Unregistered/Overseas.');
      return;
    }
    if (gstRegistrationRequiresGstin && !effectiveGstin) {
      notify.error('GSTIN is required for the selected GST registration type');
      return;
    }

    if (effectiveGstin && !isValidGstin(effectiveGstin)) {
      notify.error('Please enter a valid GSTIN.');
      return;
    }

    if (gstRegistrationRequiresGstin) {
      if (!effectivePan) {
        notify.error('PAN is required for the selected GST registration type.');
        return;
      }
      if (!isValidPan(effectivePan)) {
        notify.error('Please enter a valid PAN.');
        return;
      }
      if (panFromGstin && normalizePan(effectivePan) !== normalizePan(panFromGstin)) {
        notify.error('PAN does not match GSTIN.');
        return;
      }
    }

    const billingCountry = String(formData.billingAddress?.country || '').trim();
    const billingState = String(formData.billingAddress?.state || '').trim();

    if (billingCountry === INDIA_COUNTRY && !billingState) {
      notify.error('Billing state is required for India.');
      return;
    }

    if (gstRegistrationRequiresGstin) {
      const stateFromGstin = getGstinState(effectiveGstin);
      if (!stateFromGstin) {
        notify.error('Unable to derive State from GSTIN. Please check GSTIN.');
        return;
      }
      if (
        billingCountry === INDIA_COUNTRY &&
        billingState &&
        String(stateFromGstin).trim().toLowerCase() !== String(billingState).trim().toLowerCase()
      ) {
        notify.error('Billing State does not match GSTIN State.');
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
      // Stored as a number so the due-date maths never sees "30" as a string.
      paymentTermDays:
        String(formData.paymentTermDays ?? '').trim() === ''
          ? undefined
          : Math.min(365, Math.max(0, Math.trunc(Number(formData.paymentTermDays) || 0))),
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
        notify.error('Vendor not found. It may have been removed.');
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
      notify.success('Vendor updated!');
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
      openingBalance: Math.round((Number(formData.openingBalance) || 0) * 100) / 100,
      openingBalanceType: formData.openingBalanceType || 'Dr',
      createdAt: new Date().toISOString(),
    };

    const finalVendor = { ...newVendor, accountId: ledger.id };

    setDb({ ...db, chartOfAccounts: [...coa, ledger], vendors: [...(db.vendors || []), finalVendor] });

    if (typeof onCreated === 'function') onCreated(finalVendor);

    if (typeof onClose === 'function') {
      onClose();
      return;
    }

    notify.success('Vendor created!');
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
          className="ui-input w-full px-3 py-2"
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

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium mb-1">Opening Balance</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={formData.openingBalance}
            onChange={(e) => setFormData((p) => ({ ...p, openingBalance: e.target.value }))}
            className="ui-input w-full px-3 py-2"
            placeholder="0.00"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Dr / Cr</label>
          <select
            value={formData.openingBalanceType}
            onChange={(e) => setFormData((p) => ({ ...p, openingBalanceType: e.target.value }))}
            className="ui-select w-full px-3 py-2"
          >
            <option value="Dr">Dr — they owe us</option>
            <option value="Cr">Cr — we owe them</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Contact Person</label>
          <input
            type="text"
            value={formData.contactPerson}
            onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
            className="ui-input w-full px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Mobile</label>
          <input
            type="tel"
            value={formData.mobile}
            onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
            className="ui-input w-full px-3 py-2"
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
            className="ui-input w-full px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Alternate Phone</label>
          <input
            type="tel"
            value={formData.alternatePhone}
            onChange={(e) => setFormData({ ...formData, alternatePhone: e.target.value })}
            className="ui-input w-full px-3 py-2"
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
              className="ui-select w-full px-3 py-2"
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
              className={`w-full px-3 py-2 border rounded-lg ${gstRegistrationRequiresGstinUi ? '' : 'ui-sunken'}`}
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
              className="ui-input w-full px-3 py-2"
              placeholder={gstRegistrationRequiresGstinUi ? 'PAN required' : 'Optional'}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Credit period (days)</label>
            <input
              type="number"
              min="0"
              max="365"
              value={formData.paymentTermDays}
              onChange={(e) => setFormData({ ...formData, paymentTermDays: e.target.value })}
              className="ui-input w-full px-3 py-2"
              placeholder="30"
            />
            <p className="mt-1 text-xs ui-muted">
              Sets the due date on this vendor&apos;s bills. Blank uses 30 days; 0 means due on receipt.
            </p>
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
              className="ui-input w-full px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Address Line 2</label>
            <input
              type="text"
              value={formData.billingAddress.line2}
              onChange={(e) => updateBilling('line2', e.target.value)}
              className="ui-input w-full px-3 py-2"
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
              className="ui-input w-full px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">District</label>
            <input
              type="text"
              value={formData.billingAddress.district}
              onChange={(e) => updateBilling('district', e.target.value)}
              className="ui-input w-full px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Pincode</label>
            <input
              type="text"
              value={formData.billingAddress.pincode}
              onChange={(e) => updateBilling('pincode', e.target.value)}
              className="ui-input w-full px-3 py-2"
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

      <button type="submit" className="w-full px-4 py-2 ui-primary-bg rounded-lg ">
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
                className="ui-input w-full px-3 py-2"
                placeholder="e.g., Local Suppliers"
                autoFocus
                required
              />
              <div className="text-xs ui-muted mt-1">
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
                className="px-4 py-2 rounded-lg border ui-hover-sunken"
              >
                Cancel
              </button>
              <button type="submit" className="px-4 py-2 rounded-lg ui-primary-bg ">
                Create
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  );
};

const VendorPicker = ({
  db,
  setDb,
  currentCompany,
  value,
  onChange,
  label = 'Vendor',
  disabled = false,
  disabledHint = '',
  // Renders a "New" button beside the trigger, so creating a vendor is one
  // click from the form rather than hidden inside the select popup.
  showCreateButton = false,
}) => {
  // Same pattern as the customer picker: server list, local fallback.
  const serverVendors = useServerMasters(
    useCallback((search) => listVendors(search).then((d) => d?.vendors || []), []),
    (db?.vendors || []).filter((v) => Number(v.companyId) === Number(currentCompany?.id))
  );

  // Server rows mirror into the local collection; the picker lists ONLY local
  // rows so every selection is a local numeric id (backendPartyId rides
  // along). This is what makes Number(partyId) checks downstream valid again.
  useEffect(() => {
    if (serverVendors.source !== 'server' || typeof setDb !== 'function') return;
    mirrorServerRows({
      setDb,
      collection: 'vendors',
      backendKey: 'backendPartyId',
      serverRows: serverVendors.rows,
      companyId: currentCompany?.id,
      mapRow: (srv) => ({
        name: srv.name || '',
        gstin: srv.gstin || '',
        gstRegistration: srv.gstRegistration || 'Unregistered',
        state: srv.state || srv.billingState || '',
        email: srv.email || '',
        mobile: srv.phone || srv.mobile || '',
        paymentTermDays: srv.paymentTermDays ?? null,
        createdAt: srv.createdAt || new Date().toISOString(),
      }),
    });
  }, [serverVendors.source, serverVendors.rows, setDb, currentCompany?.id]);

  const vendors = (db?.vendors || []).filter((c) => Number(c.companyId) === Number(currentCompany?.id));

  const findVendor = (id) =>
    vendors.find((v) => String(v.id) === String(id)) ||
    (db?.vendors || []).find((v) => String(v.id) === String(id));
  const [showVendorPopup, setShowVendorPopup] = useState(false);
  const [vendorPopupMode, setVendorPopupMode] = useState('select');
  const [vendorSearch, setVendorSearch] = useState('');

  const selectedVendorName = value ? getVendorDisplayName(findVendor(value)) : '';

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
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={disabled}
          title={disabled ? disabledHint || 'Locked' : undefined}
          onClick={() => {
            if (disabled) return;
            setVendorPopupMode('select');
            setVendorSearch('');
            setShowVendorPopup(true);
          }}
          className={`flex-1 px-3 py-2 border rounded-lg ui-surface text-left${disabled ? ' opacity-60 cursor-not-allowed' : ''}`}
        >
          {selectedVendorName || 'Select Vendor'}
        </button>
        {showCreateButton && !disabled ? (
          <button
            type="button"
            onClick={() => {
              setVendorPopupMode('create');
              setVendorSearch('');
              setShowVendorPopup(true);
            }}
            className="ui-btn ui-btn-secondary whitespace-nowrap"
          >
            + New Vendor
          </button>
        ) : null}
      </div>
      {disabled && disabledHint ? <div className="text-xs ui-muted mt-1">{disabledHint}</div> : null}

      {showVendorPopup && (
        <Modal
          onClose={closePopup}
          title={vendorPopupMode === 'create' ? 'Create Vendor' : 'Select Vendor'}
          maxWidthClass="max-w-lg"
        >
          {vendorPopupMode === 'select' ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={vendorSearch}
                  onChange={(e) => setVendorSearch(e.target.value)}
                  className="ui-input"
                  placeholder="Search vendor (name, phone, GSTIN)"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setVendorPopupMode('create')}
                  className="ui-btn ui-btn-secondary"
                >
                  New
                </button>
              </div>

              <div className="max-h-80 overflow-y-auto space-y-1">
                {filteredVendors.length === 0 ? (
                  <div className="text-sm ui-muted">No vendors found.</div>
                ) : (
                  filteredVendors.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => {
                        onChange(String(v.id));
                        closePopup();
                      }}
                      className={`w-full text-left px-3 py-2 rounded-lg border ui-hover-sunken ${ String(v.id) === String(value) ? 'ui-sunken ui-border-c' : 'ui-border-c'
                      }`}
                    >
                      <div className="text-sm font-medium ui-fg">{getVendorDisplayName(v)}</div>
                      {(v.phone || v.gstin) && (
                        <div className="text-xs ui-muted truncate">{[v.phone, v.gstin].filter(Boolean).join(' • ')}</div>
                      )}
                    </button>
                  ))
                )}
              </div>

              {normalizedVendorSearch && filteredVendors.length === 0 && (
                <button
                  type="button"
                  onClick={() => setVendorPopupMode('create')}
                  className="w-full px-4 py-2 ui-primary-bg rounded-lg "
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
              onCreated={async (vendor) => {
                // Selecting the server id here made the selection a cuid, which
                // is NaN to every screen that resolves it with
                // Number(vendorId) against db.vendors — the vendor came back as
                // "Party (Vendor) is required". The local numeric id stays the
                // selection; backendPartyId carries the server identity for API
                // calls.
                try {
                  const created = await createVendor({
                    name: getVendorDisplayName(vendor) || vendor.name || 'Vendor',
                    gstin: vendor.gstin || undefined,
                    phone: vendor.mobile || vendor.phone || undefined,
                    email: vendor.email || undefined,
                    billingState: vendor.billingAddress?.state || undefined,
                    paymentTermDays:
                      vendor.paymentTermDays === undefined || vendor.paymentTermDays === null
                        ? undefined
                        : Number(vendor.paymentTermDays),
                  });
                  await serverVendors.reload();

                  const serverId = String(created?.party?.id || '').trim();
                  if (serverId && typeof setDb === 'function') {
                    setDb((prev) => ({
                      ...prev,
                      vendors: (Array.isArray(prev?.vendors) ? prev.vendors : []).map((v) =>
                        String(v.id) === String(vendor.id) ? { ...v, backendPartyId: serverId } : v
                      ),
                    }));
                  }
                } catch {
                  // Offline or refused: keep the local record so entry continues.
                }
                onChange(String(vendor.id));
              }}
              onClose={closePopup}
            />
          )}
        </Modal>
      )}
    </>
  );
};

export default VendorPicker;
