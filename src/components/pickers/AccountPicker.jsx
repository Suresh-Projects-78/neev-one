import { useMemo, useState } from 'react';

import Modal from '../ui/Modal';
import { CustomerForm } from './CustomerPicker';
import { VendorForm } from './VendorPicker';
import PopupSelect from './PopupSelect';

const safeArray = (v) => (Array.isArray(v) ? v : []);

export const AccountForm = ({ db, setDb, currentCompany, initialData = null, excludeGroupCategories = [], onCreated, onClose }) => {
  const isEdit = Boolean(initialData && initialData.id);
  const selectedGroupId = isEdit && initialData?.groupId ? String(initialData.groupId) : '';

  const excludedCats = new Set((Array.isArray(excludeGroupCategories) ? excludeGroupCategories : []).map((x) => String(x || '').trim()));

  const groups = useMemo(() => {
    return safeArray(db.accountGroups)
      .filter((g) => g.companyId === currentCompany.id)
      .filter((g) => !g.isLegacy || (selectedGroupId && String(g.id) === selectedGroupId))
      .filter((g) => !excludedCats.has(String(g.groupCategory || '').trim()) || (selectedGroupId && String(g.id) === selectedGroupId))
      .slice()
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  }, [db.accountGroups, currentCompany.id, selectedGroupId, excludeGroupCategories]);

  const typeById = useMemo(() => {
    const m = new Map();
    for (const t of safeArray(db.accountTypes).filter((t) => t.companyId === currentCompany.id)) {
      m.set(String(t.id), t);
    }
    return m;
  }, [db.accountTypes, currentCompany.id]);

  const types = useMemo(() => {
    return safeArray(db.accountTypes)
      .filter((t) => t.companyId === currentCompany.id)
      .slice();
  }, [db.accountTypes, currentCompany.id]);

  const groupById = useMemo(() => {
    const m = new Map();
    for (const g of groups) m.set(String(g.id), g);
    return m;
  }, [groups]);

  const groupByNameLower = useMemo(() => {
    const m = new Map();
    for (const g of groups) m.set(String(g.name || '').trim().toLowerCase(), g);
    return m;
  }, [groups]);

  const groupOptions = useMemo(() => {
    return groups.map((g) => ({ value: String(g.id), label: String(g.name || '').trim() }));
  }, [groups]);

  const typeRowToParent = (t) => {
    const main = String(t?.main || '').trim();
    const cls = String(t?.accountClass || '').trim();
    if (main === 'P&L') {
      if (cls === 'Expense') return 'Expenses';
      return 'Income';
    }
    if (cls === 'Liability' || cls === 'Equity') return 'Liabilities';
    return 'Assets';
  };

  const deriveParentFromLedger = (ledger) => {
    const main = String(ledger?.main || '').trim();
    const t = String(ledger?.type || '').trim();
    if (main === 'P&L') return t === 'Expense' ? 'Expenses' : 'Income';
    if (t === 'Liability' || t === 'Equity') return 'Liabilities';
    return 'Assets';
  };

  const getDefaultGroupId = (category) => {
    const c = String(category || '').trim();
    if (c === 'Customer') {
      const g = groups.find((x) => String(x.name || '').trim().toLowerCase() === 'sundry debtors');
      return g ? String(g.id) : '';
    }
    if (c === 'Vendor') {
      const g = groups.find((x) => String(x.name || '').trim().toLowerCase() === 'sundry creditors');
      return g ? String(g.id) : '';
    }
    if (c === 'Expense') {
      const g = groups.find((x) => String(x.name || '').trim().toLowerCase() === 'indirect expenses');
      return g ? String(g.id) : '';
    }

    const cash = groups.find((x) => String(x.name || '').trim().toLowerCase() === 'cash-in-hand');
    if (cash) return String(cash.id);

    const g = groups.find((x) => String(x.name || '').trim().toLowerCase() === 'primary');
    return g ? String(g.id) : '';
  };

  const groupCategoryToLedgerCategory = (groupCategory) => {
    const c = String(groupCategory || '').trim();
    if (c === 'Customer') return 'Customer';
    if (c === 'Vendor') return 'Vendor';
    if (c === 'Expense') return 'Expense';
    return 'General';
  };

  const [formData, setFormData] = useState(() => {
    if (isEdit) {
      return {
        name: String(initialData?.name || ''),
        groupId: initialData?.groupId ? String(initialData.groupId) : '',
        parent: deriveParentFromLedger(initialData),
        openingBalance: Number(initialData?.balance || 0),
      };
    }

    return {
      name: '',
      groupId: getDefaultGroupId('General'),
      parent: 'Assets',
      openingBalance: 0,
    };
  });

  const filteredGroupOptions = useMemo(() => {
    const selectedId = String(formData.groupId || '').trim();
    const parent = String(formData.parent || '').trim();
    const out = [];
    for (const g of groups) {
      const t = typeById.get(String(g.typeId)) || null;
      const p = t ? typeRowToParent(t) : '';
      if (String(g.id) === selectedId || !parent || p === parent) {
        out.push({ value: String(g.id), label: String(g.name || '').trim() });
      }
    }
    out.sort((a, b) => String(a.label || '').localeCompare(String(b.label || '')));
    return out;
  }, [groups, typeById, formData.groupId, formData.parent]);

  const handleSubmit = (e) => {
    e.preventDefault();

    const name = String(formData.name || '').trim();
    const groupValue = String(formData.groupId || '').trim();
    const openingBalance = Number(formData.openingBalance || 0);

    if (!name) {
      alert('Account name is required');
      return;
    }
    if (!groupValue) {
      alert('Group is required');
      return;
    }

    const group = groupById.get(groupValue) || null;
    if (!group) {
      alert('Please select a valid group.');
      return;
    }

    const typeRow = typeById.get(String(group.typeId));
    if (!typeRow) {
      alert('Parent mapping not found for selected group');
      return;
    }

    const derivedType = String(typeRow.accountClass || '').trim();
    const derivedSubType = String(typeRow.name || '').trim();
    const derivedMain = String(typeRow.main || '').trim();

    const derivedLedgerCategory = groupCategoryToLedgerCategory(group.groupCategory);

    const existing = safeArray(db.chartOfAccounts).filter((a) => a.companyId === currentCompany.id);

    const existingCodes = new Set(existing.map((a) => String(a.code || '').trim().toLowerCase()).filter(Boolean));
    const prefix = derivedLedgerCategory === 'Customer' ? 'CUST' : derivedLedgerCategory === 'Vendor' ? 'VEND' : derivedLedgerCategory === 'Expense' ? 'EXP' : 'LED';

    const makeAutoCode = (seed) => {
      let c = `${prefix}-${seed}`;
      while (existingCodes.has(String(c).toLowerCase())) {
        c = `${prefix}-${Math.floor(Math.random() * 1000000)}`;
      }
      return c;
    };

    if (isEdit) {
      const nextCode = String(initialData?.code || '').trim() || makeAutoCode(initialData?.id || Date.now());
      const updated = {
        ...initialData,
        code: nextCode,
        name,
        ledgerCategory: derivedLedgerCategory,
        groupId: Number(group.id),
        type: derivedType,
        subType: derivedSubType,
        main: derivedMain,
        balance: Number.isFinite(openingBalance) ? openingBalance : 0,
        updatedAt: new Date().toISOString(),
      };

      setDb({
        ...db,
        chartOfAccounts: safeArray(db.chartOfAccounts).map((a) =>
          a.companyId === currentCompany.id && String(a.id) === String(initialData.id) ? updated : a
        ),
      });

      onCreated?.(updated);
      onClose?.();
      return;
    }

    const nextId =
      safeArray(db.chartOfAccounts).reduce((m, a) => Math.max(m, Number(a?.id || 0)), 0) + 1;

    const autoCode = makeAutoCode(nextId);

    const newAccount = {
      id: nextId,
      companyId: currentCompany.id,
      code: autoCode,
      name,
      ledgerCategory: derivedLedgerCategory,
      groupId: Number(group.id),
      type: derivedType,
      subType: derivedSubType,
      main: derivedMain,
      balance: Number.isFinite(openingBalance) ? openingBalance : 0,
      createdAt: new Date().toISOString(),
    };

    setDb({
      ...db,
      chartOfAccounts: [...safeArray(db.chartOfAccounts), newAccount],
    });

    onCreated?.(newAccount);
    onClose?.();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Ledger Name</label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
          className="w-full px-3 py-2 border rounded-lg"
          placeholder="e.g., ABC Traders"
          required
        />
      </div>

      <div>
        <PopupSelect
          label="Parent"
          value={formData.parent}
          onChange={(val) => setFormData((p) => ({ ...p, parent: String(val || '').trim() }))}
          options={['Assets', 'Liabilities', 'Income', 'Expenses'].map((p) => ({ value: p, label: p }))}
          placeholder="Select parent"
          title="Select Parent"
          showValueSubtext={false}
        />
      </div>

      <div>
        <PopupSelect
          label="Group"
          value={formData.groupId}
          onChange={(val) => {
            const raw = String(val || '').trim();
            if (!raw) {
              setFormData((p) => ({ ...p, groupId: '' }));
              return;
            }

            const byId = groupById.get(raw);
            if (byId) {
              setFormData((p) => ({ ...p, groupId: String(byId.id) }));
              return;
            }

            const byName = groupByNameLower.get(raw.toLowerCase());
            if (byName) {
              setFormData((p) => ({ ...p, groupId: String(byName.id) }));
              return;
            }

            setFormData((p) => ({ ...p, groupId: '' }));
          }}
          options={filteredGroupOptions}
          placeholder="Select group"
          title="Select Group"
          showValueSubtext={false}
          maxWidthClass="max-w-2xl"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Opening Balance</label>
        <input
          type="number"
          value={formData.openingBalance}
          onChange={(e) => setFormData((p) => ({ ...p, openingBalance: e.target.value }))}
          className="w-full px-3 py-2 border rounded-lg"
          step="0.01"
        />
      </div>

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border ui-hover-sunken">
          Cancel
        </button>
        <button type="submit" className="px-4 py-2 rounded-lg ui-primary-bg ">
          {isEdit ? 'Update' : 'Create'}
        </button>
      </div>
    </form>
  );
};

const AccountPicker = ({ db, setDb, currentCompany, value, onChange, label = 'Account' }) => {
  const accounts = useMemo(() => {
    return safeArray(db.chartOfAccounts)
      .filter((a) => a.companyId === currentCompany.id)
      .slice()
      .sort((a, b) => String(a.code || '').localeCompare(String(b.code || '')));
  }, [db.chartOfAccounts, currentCompany.id]);

  const [showPopup, setShowPopup] = useState(false);
  const [mode, setMode] = useState('select');
  const [search, setSearch] = useState('');

  const modalTitle =
    mode === 'choose'
      ? 'Create'
      : mode === 'createOther'
        ? 'Create Ledger'
        : mode === 'createCustomer'
          ? 'New Customer'
          : mode === 'createVendor'
            ? 'New Vendor'
            : mode === 'create'
              ? 'Create Account'
              : 'Select Account';

  const selected = value ? accounts.find((a) => String(a.id) === String(value)) : null;
  const selectedLabel = selected ? `${selected.code ? `${selected.code} - ` : ''}${selected.name}` : '';

  const normalizedSearch = String(search || '').trim().toLowerCase();
  const filtered = normalizedSearch
    ? accounts.filter((a) => {
        const haystack = `${a.code || ''} ${a.name || ''} ${a.type || ''} ${a.subType || ''} ${a.ledgerCategory || ''}`.toLowerCase();
        return haystack.includes(normalizedSearch);
      })
    : accounts;

  const closePopup = () => {
    setShowPopup(false);
    setMode('select');
    setSearch('');
  };

  // A plain render function, not a component defined during render: the
  // latter gets a fresh component type on every parent render, so React
  // unmounts and remounts the whole subtree (and any state in it) each time.
  const renderCreateChooser = () => {
    return (
      <div className="space-y-4">
        <div className="text-sm ui-muted">Choose what you want to create:</div>
        <div className="grid grid-cols-1 gap-3">
          <button
            type="button"
            onClick={() => setMode('createVendor')}
            className="w-full text-left px-4 py-3 rounded-lg border ui-surface ui-hover-sunken ui-border-c"
          >
            <div className="font-semibold">1. Vendor</div>
            <div className="text-xs ui-muted">Opens vendor creation form</div>
          </button>

          <button
            type="button"
            onClick={() => setMode('createCustomer')}
            className="w-full text-left px-4 py-3 rounded-lg border ui-surface ui-hover-sunken ui-border-c"
          >
            <div className="font-semibold">2. Customer</div>
            <div className="text-xs ui-muted">Opens customer creation form</div>
          </button>

          <button
            type="button"
            onClick={() => setMode('createOther')}
            className="w-full text-left px-4 py-3 rounded-lg border ui-surface ui-hover-sunken ui-border-c"
          >
            <div className="font-semibold">3. Others</div>
            <div className="text-xs ui-muted">Create any ledger other than Vendor/Customer ledgers</div>
          </button>
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => setMode('select')} className="px-4 py-2 rounded-lg border ui-hover-sunken">
            Back
          </button>
        </div>
      </div>
    );
  };

  return (
    <>
      {label ? <label className="block text-sm font-medium mb-1">{label}</label> : null}
      <button
        type="button"
        onClick={() => {
          setMode('select');
          setSearch('');
          setShowPopup(true);
        }}
        className="w-full px-3 py-2 border rounded-lg ui-surface text-left"
      >
        {selectedLabel || 'Select Account'}
      </button>

      {showPopup && (
        <Modal onClose={closePopup} title={modalTitle} maxWidthClass={mode === 'choose' ? 'max-w-lg' : 'max-w-2xl'}>
          {mode === 'select' ? (
            <div className="space-y-3">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg"
                placeholder="Search account (code, name, type)"
                autoFocus
              />

              <div className="max-h-80 overflow-y-auto space-y-1">
                {filtered.length === 0 ? (
                  <div className="text-sm ui-muted">No accounts found.</div>
                ) : (
                  filtered.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => {
                        onChange?.(String(a.id));
                        closePopup();
                      }}
                      className={`w-full text-left px-3 py-2 rounded-lg border ui-hover-sunken ${ String(a.id) === String(value) ? 'ui-sunken ui-border-c' : 'ui-border-c'
                      }`}
                    >
                      <div className="text-sm font-medium ui-fg">{a.code ? `${a.code} - ` : ''}{a.name}</div>
                      {(a.type || a.subType || a.ledgerCategory) && (
                        <div className="text-xs ui-muted truncate">{[a.ledgerCategory, a.type, a.subType].filter(Boolean).join(' • ')}</div>
                      )}
                    </button>
                  ))
                )}
              </div>

              {normalizedSearch && filtered.length === 0 && (
                <button
                  type="button"
                  onClick={() => setMode('choose')}
                  className="w-full px-4 py-2 ui-primary-bg rounded-lg "
                >
                  Create new account
                </button>
              )}
            </div>
          ) : mode === 'choose' ? (
            renderCreateChooser()
          ) : mode === 'createVendor' ? (
            <VendorForm
              db={db}
              setDb={setDb}
              currentCompany={currentCompany}
              onCreated={(vendor) => {
                const ledgerId = vendor?.accountId ? String(vendor.accountId) : '';
                if (ledgerId) onChange?.(ledgerId);
                closePopup();
              }}
              onClose={closePopup}
            />
          ) : mode === 'createCustomer' ? (
            <CustomerForm
              db={db}
              setDb={setDb}
              currentCompany={currentCompany}
              onCreated={(customer) => {
                const ledgerId = customer?.accountId ? String(customer.accountId) : '';
                if (ledgerId) onChange?.(ledgerId);
                closePopup();
              }}
              onClose={closePopup}
            />
          ) : (
            <AccountForm
              db={db}
              setDb={setDb}
              currentCompany={currentCompany}
              excludeGroupCategories={['Customer', 'Vendor']}
              onCreated={(acc) => onChange?.(String(acc.id))}
              onClose={closePopup}
            />
          )}
        </Modal>
      )}
    </>
  );
};

export default AccountPicker;
