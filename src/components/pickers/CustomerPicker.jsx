import React from 'react';
import { Search } from 'lucide-react';
import { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import { notify } from '../ui/notify';
import PartyFormLayout from './PartyFormLayout';
import { CUSTOMER_CFG } from './partyFormConfig';
import { useFeatures } from '../../permissions/useFeatures';
import { AddressTab, ContactsTab, CURRENCY_OPTIONS, CUSTOMER_TABS, FormRow } from './customerFormParts';
import Modal from '../ui/Modal';
import { createCustomer, listCustomers, lookupGstin, toServerCustomer } from '../../api/masters';
import { useServerMasters, mirrorServerRows } from '../../hooks/useServerMasters';
import { GST_STATE_BY_CODE, getGstStateFromGstin } from '../../utils/gst';
import { activePriceListOptions, mergeGstinFetch, validateParty } from '../../utils/partyMaster';
import { getCustomerDisplayName } from '../../utils/contacts';
import PopupSelect from './PopupSelect';
import { rankedSearch, soleConfidentMatch } from '../../utils/rankedSearch';
import { useListboxKeys, openOnKey, focusNextAfter } from './useListboxKeys';
import { useRecentPicks } from './useRecentPicks';
import { useRemoteSearch } from './useRemoteSearch';

export const CustomerForm = ({ db, setDb, currentCompany, initialData = null, seedData = null, onDuplicate = null, onCreated, onClose }) => {
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
        contacts: Array.isArray(initialData.contacts) && initialData.contacts.length
          ? initialData.contacts
          : [{ name: '', position: '', email: '', mobile: '' }],
        currency: String(initialData.currency || 'INR'),
        priceListId: String(initialData.priceListId || ''),
        msmeNumber: String(initialData.msmeNumber || ''),
        statutoryOther: String(initialData.statutoryOther || ''),
        code: String(initialData.code || ''),
        notes: String(initialData.notes || ''),
        isActive: initialData.isActive !== false,
        openingBalance: Number(initialData.openingBalance ?? 0),
        openingBalanceType: String(initialData.openingBalanceType || 'Dr'),
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

    /*
     * "Duplicate this customer": everything that describes the trading
     * relationship, none of the identity. A copied GSTIN or customer code is a
     * second customer claiming to be the first one.
     */
    if (seedData) {
      const billing = { ...emptyAddress, ...(seedData.billingAddress || {}) };
      return {
        ...seedData,
        id: undefined,
        accountId: undefined,
        backendPartyId: undefined,
        displayName: `${String(seedData.displayName || seedData.name || '').trim()} (copy)`.trim(),
        gstin: '',
        pan: '',
        code: '',
        openingBalance: 0,
        openingBalanceType: String(seedData.openingBalanceType || 'Dr'),
        creditLimit:
          seedData.creditLimit === undefined || seedData.creditLimit === null ? '' : String(seedData.creditLimit),
        contacts: Array.isArray(seedData.contacts) && seedData.contacts.length
          ? seedData.contacts
          : [{ name: '', position: '', email: '', mobile: '' }],
        billingAddress: { ...billing, country: String(billing.country || INDIA_COUNTRY) },
        shippingSameAsBilling: true,
        shippingAddress: { ...billing, country: String(billing.country || INDIA_COUNTRY) },
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
      /*
       * Registered is the default because most customers a GST business bills
       * are, and because the field that follows — the GSTIN — decides how tax
       * splits on every invoice they are ever sent. Adding an unregistered
       * customer is the rarer and more deliberate act, so it is the one that
       * takes a click.
       */
      gstRegistration: 'Registered',
      gstin: '',
      pan: '',
      paymentTermDays: '',
      creditLimit: '',
      shipToAddresses: [],
      // One line ready to type into: the commonest customer has exactly one contact.
      contacts: [{ name: '', position: '', email: '', mobile: '' }],
      currency: 'INR',
      priceListId: '',
      msmeNumber: '',
      statutoryOther: '',
      code: '',
      notes: '',
      isActive: true,
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

  /*
   * The per-address updaters are gone. The address table edits rows through
   * `updateAddressRow`, which knows row 0 is billing, row 1 is shipping and
   * everything after is `shipToAddresses`.
   */
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


  const [tab, setTab] = useState('address');
  const saveAndNewRef = useRef(false);

  /* The lists in force today. Same rule as the vendor form, same source. */
  const priceListOptions = useMemo(
    () => activePriceListOptions({ db, companyId: currentCompany.id, onDate: new Date().toISOString().slice(0, 10) }),
    [db, currentCompany.id]
  );
  const { isEnabled: featureOn } = useFeatures();
  const codesEnabled = featureOn('partyCodes');

  /* Shared by "Clear the form" and by Save and add another. */
  const resetForm = () =>
    setFormData((p) => ({
      ...p,
      displayName: '', gstin: '', pan: '', code: '', openingBalance: 0,
      msmeNumber: '', statutoryOther: '', priceListId: '',
      contacts: [], shipToAddresses: [],
      billingAddress: { line1: '', line2: '', city: '', district: '', state: '', pincode: '', country: INDIA_COUNTRY },
      shippingAddress: { line1: '', line2: '', city: '', district: '', state: '', pincode: '', country: INDIA_COUNTRY },
    }));
  const [gstinFetching, setGstinFetching] = useState(false);

  /*
   * One list for the form, two stores underneath.
   *
   * Billing and shipping are columns on the party — every invoice reads them —
   * and everything past those two is a row. The form should not have to know
   * that, so the rows are assembled here in the order the master asks for and
   * taken apart again on save.
   */
  const addressRows = useMemo(
    () => [
      { key: 'BILLING', label: 'Billing', builtIn: true, ...formData.billingAddress },
      { key: 'SHIPPING', label: 'Shipping', builtIn: true, ...formData.shippingAddress },
      ...(formData.shipToAddresses || []).map((a, i) => ({
        key: `EXTRA-${i}`,
        builtIn: false,
        label: a.label || '',
        line1: a.line1 || '',
        line2: a.line2 || '',
        city: a.city || '',
        district: a.district || '',
        state: a.state || '',
        pincode: a.pincode || '',
        country: a.country || INDIA_COUNTRY,
      })),
    ],
    [formData.billingAddress, formData.shippingAddress, formData.shipToAddresses, INDIA_COUNTRY]
  );

  const updateAddressRow = (i, key, value) =>
    setFormData((p) => {
      if (i === 0) return { ...p, billingAddress: { ...p.billingAddress, [key]: value } };
      if (i === 1) return { ...p, shippingAddress: { ...p.shippingAddress, [key]: value }, shippingSameAsBilling: false };
      const idx = i - 2;
      return { ...p, shipToAddresses: p.shipToAddresses.map((a, j) => (j === idx ? { ...a, [key]: value } : a)) };
    });

  const addAddressRow = () =>
    setFormData((p) => ({
      ...p,
      shipToAddresses: [
        ...(p.shipToAddresses || []),
        {
          label: `Shipping ${(p.shipToAddresses || []).length + 2}`,
          line1: '', line2: '', city: '', district: '', state: '', pincode: '', country: INDIA_COUNTRY,
        },
      ],
    }));

  const removeAddressRow = (i) =>
    setFormData((p) => ({ ...p, shipToAddresses: (p.shipToAddresses || []).filter((_, j) => j !== i - 2) }));

  /* Shipping is the billing address far more often than not, and retyping it
     is how the two quietly diverge by a door number. */
  const copyBillingToShipping = () =>
    setFormData((p) => ({ ...p, shippingAddress: { ...p.billingAddress }, shippingSameAsBilling: true }));

  const updateContactRow = (i, key, value) =>
    setFormData((p) => ({ ...p, contacts: p.contacts.map((c, j) => (j === i ? { ...c, [key]: value } : c)) }));

  const addContactRow = () =>
    setFormData((p) => ({ ...p, contacts: [...(p.contacts || []), { name: '', position: '', email: '', mobile: '' }] }));

  const removeContactRow = (i) => setFormData((p) => ({ ...p, contacts: p.contacts.filter((_, j) => j !== i) }));

  /* One primary, or none. The flag is what a reminder is addressed to. */
  const setPrimaryContact = (i) =>
    setFormData((p) => ({
      ...p,
      contacts: (p.contacts || []).map((c, j) => ({ ...c, isPrimary: j === i })),
    }));

  /*
   * What the GSTIN itself encodes is filled without asking anybody: the first
   * two digits are the state and characters 3-12 are the PAN. A configured
   * portal adds the legal name and address on top; without one the derived
   * fields still land, which is most of what the button is for.
   */
  const fetchFromGstin = async () => {
    const gstin = String(formData.gstin || '').trim().toUpperCase();
    if (gstin.length !== 15) {
      notify.error('Enter the 15-character GSTIN first.');
      return;
    }
    setGstinFetching(true);
    try {
      const data = await lookupGstin(gstin);
      /* Fills blanks, keeps what was typed — the same rule the vendor form
         follows, from the same place, so the two cannot drift apart. */
      const { next, kept } = mergeGstinFetch({ prev: formData, data: { ...data, gstin } });
      setFormData(next);
      notify.success(data?.source === 'derived' ? 'State and PAN filled from the GSTIN.' : 'Fetched from the GST portal.');
      if (kept.length) {
        notify.info(`Kept what you had typed for the ${kept.join(', ')}. Clear a field and fetch again to take the portal's version.`);
      }
    } catch (e) {
      notify.error(String(e?.message || 'Could not fetch that GSTIN.'));
    } finally {
      setGstinFetching(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    /*
     * Which button was pressed. "Save and New" clears the form and keeps it
     * open, which is what somebody entering a list wants; Save closes. Read
     * from the submitter rather than held in state, so the two buttons cannot
     * disagree with what actually happened.
     */
    const saveAndNew = saveAndNewRef.current;
    saveAndNewRef.current = false;

    const selectedGroupIdRaw = String(formData.groupId || '').trim();
    const effectiveGroupId = selectedGroupIdRaw
      ? Number(selectedGroupIdRaw)
      : sundryDebtorsGroup
        ? Number(sundryDebtorsGroup.id)
        : null;

    const complaint = validateParty({
      values: { ...formData, groupId: selectedGroupIdRaw || (sundryDebtorsGroup ? String(sundryDebtorsGroup.id) : '') },
      noun: 'Customer',
      priceListOptions,
    });
    if (complaint) {
      if (complaint.tab) setTab(complaint.tab);
      notify.error(complaint.message);
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
      // A contact row with no name is an empty row somebody added and left.
      contacts: (formData.contacts || []).filter((c) => String(c.name || '').trim()),
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

    /*
     * Write through to the server, then keep what it allotted.
     *
     * This used to happen only when a customer was created from inside an
     * invoice, and even there it sent six fields. Created from the Customers
     * screen it never happened at all: the record lived in one browser, the
     * contacts and extra addresses reached nothing, and the customer code the
     * server allots — the "auto generated" the master asks for — was never
     * asked for, so it stayed blank.
     *
     * Failure is not fatal. A customer entered offline stays local and usable;
     * losing the whole entry because the network went would be the worse
     * trade.
     */
    let serverPatch = {};
    try {
      const created = await createCustomer(toServerCustomer(finalCustomer));
      const party = created?.party;
      if (party?.id) serverPatch = { backendPartyId: String(party.id), code: party.code || finalCustomer.code || '' };
    } catch (e) {
      notify.error(`Saved on this device only — the server refused it: ${String(e?.message || e)}`);
    }

    const storedCustomer = { ...finalCustomer, ...serverPatch };
    setDb({ ...db, chartOfAccounts: [...coa, ledger], customers: [...(db.customers || []), storedCustomer] });

    if (typeof onCreated === 'function') onCreated(storedCustomer);
    if (saveAndNew) {
      setFormData((p) => ({
        ...p,
        displayName: '', gstin: '', pan: '', code: '', openingBalance: 0,
        contacts: [{ name: '', position: '', email: '', mobile: '' }], shipToAddresses: [],
        billingAddress: { line1: '', line2: '', city: '', district: '', state: '', pincode: '', country: INDIA_COUNTRY },
        shippingAddress: { line1: '', line2: '', city: '', district: '', state: '', pincode: '', country: INDIA_COUNTRY },
      }));
      setTab('address');
      notify.success('Customer created. Ready for the next one.');
      return;
    }
    if (typeof onClose === 'function') {
      onClose();
      return;
    }

    notify.success('Customer created!');
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="flex min-h-0 flex-col">
        {/*
          The same header the invoice uses, not a second one that looks like
          it. Title on the left, every way out of the screen on the right —
          Back, Cancel, Save, and a three-dot menu for the rest. Sticky, so Save
          is reachable from the bottom of a long address table.

          At the top rather than the bottom because a form with tabs has no
          single bottom: the page ends wherever the open tab ends, so a bar down
          there moved as you switched between Address and Others.
        */}
        <PartyFormLayout
          cfg={CUSTOMER_CFG}
          formData={formData}
          setFormData={setFormData}
          isEdit={isEdit}
          subtitle={isEdit ? getCustomerDisplayName(initialData) || '' : ''}
          onClose={onClose}
          resetForm={resetForm}
          saveAndNewRef={saveAndNewRef}
          tab={tab}
          setTab={setTab}
          tabs={CUSTOMER_TABS}
          groupOptions={customerGroupOptions}
          onCreateGroup={(typed) => {
            setGroupDraftName(typed);
            setGroupCreateOpen(true);
          }}
          codesEnabled={codesEnabled}
          priceListOptions={priceListOptions}
          onDuplicate={isEdit && onDuplicate ? () => onDuplicate(formData) : null}
          gstinFetching={gstinFetching}
          fetchFromGstin={fetchFromGstin}
          addressRows={addressRows}
          onCopyBilling={copyBillingToShipping}
          updateAddressRow={updateAddressRow}
          addAddressRow={addAddressRow}
          removeAddressRow={removeAddressRow}
          updateContactRow={updateContactRow}
          addContactRow={addContactRow}
          removeContactRow={removeContactRow}
          setPrimaryContact={setPrimaryContact}
        />
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
              <label className="ui-label">Group Name</label>
              <input
                type="text"
                value={groupDraftName}
                onChange={(e) => setGroupDraftName(e.target.value)}
                className="ui-input w-full"
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
              <button type="submit" className="px-4 py-2 rounded-lg ui-primary-bg">
                Create
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  );
};

const CustomerPicker = ({ db, setDb, currentCompany, value, onChange, label = 'Customer', disabled = false, disabledHint = '' }) => {
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
  const triggerRef = useRef(null);
  const [showCustomerPopup, setShowCustomerPopup] = useState(false);
  const [customerPopupMode, setCustomerPopupMode] = useState('select');
  const [customerSearch, setCustomerSearch] = useState('');

  const selectedCustomerName = value ? getCustomerDisplayName(findCustomer(value)) : '';

  const normalizedCustomerSearch = customerSearch.trim().toLowerCase();
  const recents = useRecentPicks('customer', currentCompany?.id);

  // Above the page the server returns, typing has to reach the server or the
  // name may simply not be in the browser to find.
  useRemoteSearch(serverCustomers.reload, customerSearch, {
    localSize: customers.length,
    enabled: showCustomerPopup,
  });

  /*
   * Ranked, not merely filtered.
   *
   * A substring match put "Sundaram Traders" above "Ram Kumar" for the query
   * "ram", because that was the order the array happened to be in. The shared
   * ranking puts an exact hit first, then a name that starts with what was
   * typed, then a word inside it, then a GSTIN or phone, then a loose
   * subsequence.
   *
   * With nothing typed the list leads with whoever this operator actually
   * invoices, which for most shops is the same fifteen names all week.
   */
  const filteredCustomers = normalizedCustomerSearch
    ? rankedSearch(customers, normalizedCustomerSearch, {
        fields: (c) => [
          getCustomerDisplayName(c),
          c.contactPerson,
          c.email,
          c.mobile || c.phone,
        ],
        codes: (c) => [c.gstin, c.pan, c.mobile || c.phone],
      })
    : recents.promote(customers);

  /*
   * Closing puts focus back on the field that opened it.
   *
   * Without this the dialog unmounts and focus falls to the document body, so
   * the Tab after a selection starts again from the top of the page instead
   * of moving to the next field — which breaks the whole point of picking
   * without the mouse.
   */
  const closePopup = ({ advance = false } = {}) => {
    setShowCustomerPopup(false);
    setCustomerPopupMode('select');
    setCustomerSearch('');
    requestAnimationFrame(() => {
      // Choosing moves on; cancelling stays put. See focusNextAfter.
      if (advance) focusNextAfter(triggerRef.current);
      else triggerRef.current?.focus({ preventScroll: true });
    });
  };

  const chooseCustomer = (customer) => {
    if (!customer) return;
    recents.remember(customer.id);
    onChange(String(customer.id));
    closePopup({ advance: true });
  };

  const openPopup = () => {
    if (disabled) return;
    setCustomerPopupMode('select');
    setCustomerSearch('');
    setShowCustomerPopup(true);
  };

  const customerSearchOpts = {
    fields: (c) => [getCustomerDisplayName(c), c.contactPerson, c.email, c.mobile || c.phone],
    codes: (c) => [c.gstin, c.pan, c.mobile || c.phone],
  };

  /*
   * Tab out of the search box takes the one match, when there is exactly one.
   *
   * Requirement 15 says highlight without auto-selecting while somebody is
   * still typing; section 9 says a full code should not have to be confirmed.
   * Both hold at once if the selection happens on the way out of the field
   * rather than on every keystroke.
   */
  const onCustomerSearchTab = (e) => {
    if (e.key !== 'Tab' || e.shiftKey) return;
    const sole = soleConfidentMatch(customers, customerSearch, customerSearchOpts);
    if (!sole) return;
    // Swallow the Tab: the dialog's focus trap would otherwise move focus
    // inside a dialog that is closing on this very keystroke.
    e.preventDefault();
    e.stopPropagation();
    chooseCustomer(sole);
  };

  const customerRecentCount = normalizedCustomerSearch ? 0 : recents.recentCount(filteredCustomers);

  const {
    activeIndex: customerActiveIndex,
    setActiveIndex: setCustomerActiveIndex,
    listRef: customerListRef,
    onKeyDown: onCustomerListKeys,
  } = useListboxKeys({
    count: filteredCustomers.length,
    onChoose: (i) => chooseCustomer(filteredCustomers[i]),
    onCancel: () => closePopup(),
    // Tab off a list nobody drove: leave the value alone and carry on,
    // rather than snapping back to the field just left.
    onTabOut: () => closePopup({ advance: true }),
  });

  return (
    <>
      <label className="ui-label">{label}</label>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        title={disabled ? disabledHint || 'Locked' : undefined}
        onClick={openPopup}
        onKeyDown={openOnKey(openPopup)}
        aria-haspopup="listbox"
        aria-expanded={showCustomerPopup}
        className={`w-full px-3 py-2 border rounded-lg ui-surface text-left${disabled ? ' opacity-60 cursor-not-allowed' : ''}`}
      >
        {selectedCustomerName || 'Select Customer'}
      </button>
      {disabled && disabledHint ? <div className="text-xs ui-muted mt-1">{disabledHint}</div> : null}

      {showCustomerPopup && (
        <Modal
          onClose={() => closePopup()}
          title={customerPopupMode === 'create' ? 'Create Customer' : 'Select Customer'}
          /*
            The picker is a short list and wants a small box; the creation form
            is the full customer master with tabs and an eight-column address
            table, and at max-w-lg it was the same cramped form the standalone
            screen had already outgrown. Same form, same room, wherever it is
            opened from.
          */
          maxWidthClass={customerPopupMode === 'create' ? 'max-w-[80vw]' : 'max-w-lg'}
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
                  onKeyDown={(e) => {
                    /*
                     * Alt+C — make the master you are missing without leaving
                     * the field. Tally's reflex, and the biggest saving in the
                     * whole keyboard: hitting a name that is not on file
                     * otherwise means abandoning a half-typed document to go
                     * and create one. Same New button, for hands that never
                     * left the keys.
                     */
                    if (e.altKey && (e.key === 'c' || e.key === 'C')) {
                      e.preventDefault();
                      e.stopPropagation();
                      setCustomerPopupMode('create');
                      return;
                    }
                    onCustomerSearchTab(e);
                    onCustomerListKeys(e);
                  }}
                  role="combobox"
                  aria-expanded="true"
                  aria-controls="customer-picker-list"
                  aria-activedescendant={
                    filteredCustomers[customerActiveIndex]
                      ? `customer-opt-${filteredCustomers[customerActiveIndex].id}`
                      : undefined
                  }
                  className="ui-input"
                                    /*
                  * The dialog decides who gets the caret, and it looks for
                  * this attribute. React's own autoFocus runs first and is
                  * then overruled: the dialog found nothing claiming focus
                  * and took it for the panel itself, so every keystroke went
                  * to a div. The arrows moved nothing and Enter chose
                  * nothing, while Escape still worked — because the dialog
                  * listens for that one on the window.
                  */
                  data-autofocus="true"
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

              <div
                id="customer-picker-list"
                ref={customerListRef}
                role="listbox"
                className="max-h-80 overflow-y-auto space-y-1"
              >
                {filteredCustomers.length === 0 ? (
                  <div className="text-sm ui-muted">No customers found.</div>
                ) : (
                  filteredCustomers.map((c, i) => {
                    const on = i === customerActiveIndex;
                    return (
                      <React.Fragment key={c.id}>
                      {/* The habitual names, called what they are. */}
                      {customerRecentCount && i === 0 ? (
                        <div className="ui-caption px-1 pt-1 pb-0.5">Recently used</div>
                      ) : null}
                      {customerRecentCount && i === customerRecentCount ? (
                        <div className="ui-caption px-1 pt-2 pb-0.5">All customers</div>
                      ) : null}
                      <button
                        id={`customer-opt-${c.id}`}
                        type="button"
                        role="option"
                        aria-selected={String(c.id) === String(value)}
                        data-active={on || undefined}
                        onMouseEnter={() => setCustomerActiveIndex(i)}
                        onClick={() => chooseCustomer(c)}
                        className={`w-full text-left px-3 py-2 rounded-lg border ${
                          on ? '' : 'ui-hover-sunken '
                        }${String(c.id) === String(value) && !on ? 'ui-sunken ui-border-c' : 'ui-border-c'}`}
                        /* Filled, not outlined: the cursor row shared `ui-sunken`
                           with the already-chosen row and differed only by border
                           colour, so pressing the down arrow looked like nothing
                           had happened. */
                        style={
                          on
                            ? {
                                backgroundColor: 'rgb(var(--brand))',
                                borderColor: 'rgb(var(--brand))',
                                color: 'rgb(var(--on-brand))',
                              }
                            : undefined
                        }
                      >
                        <div className={`text-sm font-medium ${on ? '' : 'ui-fg'}`}>{getCustomerDisplayName(c)}</div>
                        {(c.email || c.mobile || c.phone) && (
                          <div className={`text-xs truncate ${on ? 'opacity-80' : 'ui-muted'}`}>
                            {[c.email, c.mobile || c.phone].filter(Boolean).join(' • ')}
                          </div>
                        )}
                      </button>
                      </React.Fragment>
                    );
                  })
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
                /*
                 * The form has already written the customer to the server and
                 * carries the id it came back with. This used to do its own
                 * create with six of the fields, which — now that the form does
                 * it properly — would have made a second, thinner row for the
                 * same customer.
                 */
                if (customer?.backendPartyId) {
                  await serverCustomers.reload();
                }
                onChange(String(customer.id));
              }}
              onClose={() => closePopup()}
            />
          )}
        </Modal>
      )}
    </>
  );
};

export default CustomerPicker;
