import { useCallback, useMemo, useState, useEffect } from 'react';
import { notify } from '../ui/notify';
import Modal from '../ui/Modal';
import { createCustomer, listCustomers } from '../../api/masters';
import { useServerMasters, mirrorServerRows } from '../../hooks/useServerMasters';
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
        paymentTermDays:
          initialData.paymentTermDays === undefined || initialData.paymentTermDays === null
            ? ''
            : String(initialData.paymentTermDays),
        creditLimit:
          initialData.creditLimit === undefined || initialData.creditLimit === null ? '' : String(initialData.creditLimit),
        shipToAddresses: Array.isArray(initialData.shipToAddresses) ? initialData.shipToAddresses : [],
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
      openingBalance: isEdit ? Number(initialData?.openingBalance ?? 0) : 0,
      openingBalanceType: isEdit ? (initialData?.openingBalanceType || 'Dr') : 'Dr',
      contactPerson: '',
      mobile: '',
      email: '',
      alternatePhone: '',
      gstRegistration: 'Unregistered',
      gstin: '',
      pan: '',
      paymentTermDays: '',
      creditLimit: '',
      shipToAddresses: [],
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
  if (!isEdit && !String(formData.groupId || '').trim() && sundryDebtorsGroup?.id) {
    setFormData((p) => ({ ...p, groupId: String(sundryDebtorsGroup.id) }));
  }

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
      notify.error('Sundry Debtors group is missing.');
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


  const handleSubmit = (e) => {
    e.preventDefault();

    const selectedGroupIdRaw = String(formData.groupId || '').trim();
    const effectiveGroupId = selectedGroupIdRaw
      ? Number(selectedGroupIdRaw)
      : sundryDebtorsGroup
        ? Number(sundryDebtorsGroup.id)
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
    const shippingCountry = String(formData.shippingAddress?.country || '').trim();
    const billingState = String(formData.billingAddress?.state || '').trim();
    const shippingState = String(formData.shippingAddress?.state || '').trim();

    if (billingCountry === INDIA_COUNTRY && !billingState) {
      notify.error('Billing state is required for India.');
      return;
    }

    if (!formData.shippingSameAsBilling && shippingCountry === INDIA_COUNTRY && !shippingState) {
      notify.error('Shipping state is required for India.');
      return;
    }

    if (gstRegistrationRequiresGstin) {
      const stateFromGstin = getGstinState(effectiveGstin);
      if (!stateFromGstin) {
        notify.error('Unable to derive State from GSTIN. Please check GSTIN.');
        return;
      }
      if (billingCountry === INDIA_COUNTRY && billingState && String(stateFromGstin).trim().toLowerCase() !== String(billingState).trim().toLowerCase()) {
        notify.error('Billing State does not match GSTIN State.');
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
      // Stored as a number so the due-date maths never sees "30" as a string.
      // Blank stays undefined, which the due-date helper reads as the default.
      paymentTermDays:
        String(formData.paymentTermDays ?? '').trim() === ''
          ? undefined
          : Math.min(365, Math.max(0, Math.trunc(Number(formData.paymentTermDays) || 0))),
      creditLimit:
        String(formData.creditLimit ?? '').trim() === '' ? undefined : Math.max(0, Number(formData.creditLimit) || 0),
      shipToAddresses: (formData.shipToAddresses || []).filter((a) => String(a.line1 || a.label || '').trim()),
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
        notify.error('Customer not found. It may have been removed.');
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

      notify.success('Customer updated!');
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
      openingBalance: Math.round((Number(formData.openingBalance) || 0) * 100) / 100,
      openingBalanceType: formData.openingBalanceType || 'Dr',
      createdAt: new Date().toISOString(),
    };

    const finalCustomer = { ...newCustomer, accountId: ledger.id };

    setDb({ ...db, chartOfAccounts: [...coa, ledger], customers: [...(db.customers || []), finalCustomer] });

    if (typeof onCreated === 'function') onCreated(finalCustomer);
    if (typeof onClose === 'function') {
      onClose();
      return;
    }

    notify.success('Customer created!');
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
              Sets the due date on this customer&apos;s invoices. Blank uses 30 days; 0 means due on receipt.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Credit limit</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={formData.creditLimit}
              onChange={(e) => setFormData({ ...formData, creditLimit: e.target.value })}
              className="ui-input w-full px-3 py-2"
              placeholder="0 = no limit"
            />
            <p className="mt-1 text-xs ui-muted">New invoices warn when outstanding would cross this.</p>
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
                  className="ui-input w-full px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Address Line 2</label>
                <input
                  type="text"
                  value={formData.shippingAddress.line2}
                  onChange={(e) => updateShipping('line2', e.target.value)}
                  className="ui-input w-full px-3 py-2"
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
                  className="ui-input w-full px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">District</label>
                <input
                  type="text"
                  value={formData.shippingAddress.district}
                  onChange={(e) => updateShipping('district', e.target.value)}
                  className="ui-input w-full px-3 py-2"
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
                  className="ui-input w-full px-3 py-2"
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

      <div className="border-t pt-4">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">Ship-to addresses</div>
            <div className="text-xs ui-muted">Extra delivery addresses, each with its own code for tracking. Pick one on the invoice.</div>
          </div>
          <button
            type="button"
            onClick={() =>
              setFormData((p) => ({
                ...p,
                shipToAddresses: [
                  ...(p.shipToAddresses || []),
                  { code: `SHIP-${(p.shipToAddresses || []).length + 1}`, label: '', line1: '', city: '', state: '', pincode: '' },
                ],
              }))
            }
            className="ui-btn ui-btn-secondary !h-8 text-xs"
          >
            + Add ship-to
          </button>
        </div>
        {(formData.shipToAddresses || []).map((a, ai) => {
          const upd = (k, v) =>
            setFormData((p) => ({
              ...p,
              shipToAddresses: p.shipToAddresses.map((x, i) => (i === ai ? { ...x, [k]: v } : x)),
            }));
          return (
            <div key={ai} className="mb-2 flex flex-wrap items-center gap-2">
              <span className="ui-caption w-14 font-mono">{a.code}</span>
              <input type="text" value={a.label} onChange={(e) => upd('label', e.target.value)} className="ui-input !h-9 w-32 px-2 text-sm" placeholder="Label (Godown)" />
              <input type="text" value={a.line1} onChange={(e) => upd('line1', e.target.value)} className="ui-input !h-9 flex-1 min-w-40 px-2 text-sm" placeholder="Address" />
              <input type="text" value={a.city} onChange={(e) => upd('city', e.target.value)} className="ui-input !h-9 w-28 px-2 text-sm" placeholder="City" />
              <input type="text" value={a.state} onChange={(e) => upd('state', e.target.value)} className="ui-input !h-9 w-28 px-2 text-sm" placeholder="State" />
              <input type="text" value={a.pincode} onChange={(e) => upd('pincode', e.target.value)} className="ui-input !h-9 w-20 px-2 text-sm" placeholder="PIN" />
              <button
                type="button"
                onClick={() => setFormData((p) => ({ ...p, shipToAddresses: p.shipToAddresses.filter((_, i) => i !== ai) }))}
                className="ui-icon-btn !h-8 !w-8"
                aria-label="Remove ship-to"
              >
                ×
              </button>
            </div>
          );
        })}
      </div>

      <button type="submit" className="w-full px-4 py-2 ui-primary-bg rounded-lg ">
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
                className="ui-input w-full px-3 py-2"
                placeholder="e.g., Walk-in Customers"
                autoFocus
                required
              />
              <div className="text-xs ui-muted mt-1">This group will be created under Sundry Debtors.</div>
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

const CustomerPicker = ({ db, setDb, currentCompany, value, onChange, label = 'Customer' }) => {
  // Customers live on the server now. The local list stays as a fallback so a
  // network failure does not empty the picker in the middle of an invoice.
  const serverCustomers = useServerMasters(
    useCallback((search) => listCustomers(search).then((d) => d?.customers || []), []),
    (db?.customers || []).filter((c) => Number(c.companyId) === Number(currentCompany?.id))
  );

  // Server rows mirror into the local collection; the picker lists ONLY local
  // rows so every selection is a local numeric id (backendPartyId rides
  // along). This is what makes Number(partyId) checks downstream valid again.
  useEffect(() => {
    if (serverCustomers.source !== 'server' || typeof setDb !== 'function') return;
    mirrorServerRows({
      setDb,
      collection: 'customers',
      backendKey: 'backendPartyId',
      serverRows: serverCustomers.rows,
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
  }, [serverCustomers.source, serverCustomers.rows, setDb, currentCompany?.id]);

  const customers = (db?.customers || []).filter((c) => Number(c.companyId) === Number(currentCompany?.id));

  // Server ids are strings; documents written before the migration hold numbers.
  const findCustomer = (id) =>
    customers.find((c) => String(c.id) === String(id)) ||
    (db?.customers || []).find((c) => String(c.id) === String(id));
  const [showCustomerPopup, setShowCustomerPopup] = useState(false);
  const [customerPopupMode, setCustomerPopupMode] = useState('select');
  const [customerSearch, setCustomerSearch] = useState('');

  const selectedCustomerName = value ? getCustomerDisplayName(findCustomer(value)) : '';

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
        className="w-full px-3 py-2 border rounded-lg ui-surface text-left"
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
              {/* Create is always available, not only after a fruitless search:
                  the operator usually knows the customer is new. */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  className="ui-input"
                  placeholder="Search customer (name, email, phone, GSTIN)"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setCustomerPopupMode('create')}
                  className="ui-btn ui-btn-secondary"
                >
                  New
                </button>
              </div>

              <div className="max-h-80 overflow-y-auto space-y-1">
                {filteredCustomers.length === 0 ? (
                  <div className="text-sm ui-muted">No customers found.</div>
                ) : (
                  filteredCustomers.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        onChange(String(c.id));
                        closePopup();
                      }}
                      className={`w-full text-left px-3 py-2 rounded-lg border ui-hover-sunken ${ String(c.id) === String(value) ? 'ui-sunken ui-border-c' : 'ui-border-c'
                      }`}
                    >
                      <div className="text-sm font-medium ui-fg">{getCustomerDisplayName(c)}</div>
                      {(c.email || c.mobile || c.phone) && (
                        <div className="text-xs ui-muted truncate">
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
                  className="ui-btn ui-btn-primary w-full"
                >
                  Create &ldquo;{customerSearch.trim()}&rdquo;
                </button>
              )}
            </div>
          ) : (
            <CustomerForm
              db={db}
              setDb={setDb}
              currentCompany={currentCompany}
              onCreated={async (customer) => {
                // Write through to the server so the record exists for every
                // device, then record the server id ON the local row.
                //
                // Selecting the server id directly (what this used to do) broke
                // every screen that resolves the selection with
                // Number(customerId) against db.customers: a cuid is NaN there,
                // so a customer created from this picker came back as
                // "Party (Customer) is required" and could not be used. Keeping
                // the local numeric id as the selection and carrying
                // backendPartyId alongside satisfies both the local lookups and
                // the API calls that need a real server party.
                try {
                  const created = await createCustomer({
                    name: getCustomerDisplayName(customer) || customer.name || 'Customer',
                    gstin: customer.gstin || undefined,
                    phone: customer.mobile || customer.phone || undefined,
                    email: customer.email || undefined,
                    billingState: customer.billingAddress?.state || undefined,
                    // The server recomputes invoice due dates from this, so it
                    // has to travel with the record rather than staying a
                    // browser-only field.
                    paymentTermDays:
                      customer.paymentTermDays === undefined || customer.paymentTermDays === null
                        ? undefined
                        : Number(customer.paymentTermDays),
                  });
                  await serverCustomers.reload();

                  const serverId = String(created?.party?.id || '').trim();
                  if (serverId && typeof setDb === 'function') {
                    setDb((prev) => ({
                      ...prev,
                      customers: (Array.isArray(prev?.customers) ? prev.customers : []).map((c) =>
                        String(c.id) === String(customer.id) ? { ...c, backendPartyId: serverId } : c
                      ),
                    }));
                  }
                } catch {
                  // Offline or refused: keep the local record so entry continues.
                }
                onChange(String(customer.id));
              }}
              onClose={closePopup}
            />
          )}
        </Modal>
      )}
    </>
  );
};

export default CustomerPicker;
