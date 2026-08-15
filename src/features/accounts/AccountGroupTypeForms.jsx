import React, { useMemo, useState } from 'react';

const safeArray = (v) => (Array.isArray(v) ? v : []);

const PARENT_OPTIONS = [
  { value: 'Assets', label: 'Assets' },
  { value: 'Liabilities', label: 'Liabilities' },
  { value: 'Income', label: 'Income' },
  { value: 'Expenses', label: 'Expenses' },
];

const parentToMainAndClass = (parent) => {
  const v = String(parent || '').trim();
  if (v === 'Liabilities' || v === 'Liability') return { main: 'Balance Sheet', accountClass: 'Liability' };
  if (v === 'Expenses' || v === 'Expense') return { main: 'P&L', accountClass: 'Expense' };
  if (v === 'Assets') return { main: 'Balance Sheet', accountClass: 'Asset' };
  if (v === 'Income') return { main: 'P&L', accountClass: 'Income' };
  return { main: 'Balance Sheet', accountClass: 'Asset' };
};

const mainAndClassToParent = ({ main, accountClass }) => {
  const m = String(main || '').trim();
  const c = String(accountClass || '').trim();
  if (m === 'Balance Sheet' && c === 'Asset') return 'Assets';
  if (m === 'Balance Sheet' && c === 'Liability') return 'Liabilities';
  if (m === 'P&L' && c === 'Income') return 'Income';
  if (m === 'P&L' && c === 'Expense') return 'Expenses';
  return 'Assets';
};

export const AccountTypeForm = ({ db, setDb, currentCompany, initialData = null, onClose }) => {
  const isEdit = Boolean(initialData && initialData.id);

  const [formData, setFormData] = useState(() => {
    if (isEdit) {
      return {
        parent: mainAndClassToParent({ main: initialData?.main, accountClass: initialData?.accountClass }),
        name: String(initialData?.name || ''),
      };
    }
    return {
      parent: 'Assets',
      name: '',
    };
  });

  const handleSubmit = (e) => {
    e.preventDefault();

    const parent = String(formData.parent || '').trim();
    const { main, accountClass } = parentToMainAndClass(parent);
    const name = String(formData.name || '').trim();

    if (!parent) {
      alert('Parent is required');
      return;
    }
    if (!name) {
      alert('Group name is required');
      return;
    }

    const existing = safeArray(db.accountTypes).filter((t) => t.companyId === currentCompany.id);
    const clash = existing.some(
      (t) =>
        String(t.name || '').trim().toLowerCase() === name.toLowerCase() &&
        String(t.main || '').trim() === main &&
        String(t.accountClass || '').trim() === accountClass &&
        (!isEdit || String(t.id) !== String(initialData.id))
    );
    if (clash) {
      alert('Group already exists under this Parent');
      return;
    }

    const nextId = safeArray(db.accountTypes).reduce((m, t) => Math.max(m, Number(t?.id || 0)), 0) + 1;

    if (isEdit) {
      const updated = {
        ...initialData,
        main,
        accountClass,
        name,
        updatedAt: new Date().toISOString(),
      };

      setDb({
        ...db,
        accountTypes: safeArray(db.accountTypes).map((t) =>
          t.companyId === currentCompany.id && String(t.id) === String(initialData.id) ? updated : t
        ),
      });

      onClose?.();
      return;
    }

    const newType = {
      id: nextId,
      companyId: currentCompany.id,
      main,
      accountClass,
      name,
      isUserDefined: true,
      createdAt: new Date().toISOString(),
    };

    setDb({
      ...db,
      accountTypes: [...safeArray(db.accountTypes), newType],
    });

    onClose?.();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Parent</label>
        <select
          value={formData.parent}
          onChange={(e) => setFormData((p) => ({ ...p, parent: e.target.value }))}
          className="w-full px-3 py-2 border rounded-lg"
        >
          {PARENT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Group Name</label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
          className="w-full px-3 py-2 border rounded-lg"
          placeholder="e.g., Current Liabilities"
          required
        />
      </div>

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border hover:bg-gray-50">
          Cancel
        </button>
        <button type="submit" className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700">
          {isEdit ? 'Update' : 'Create'}
        </button>
      </div>
    </form>
  );
};

export const AccountGroupForm = ({ db, setDb, currentCompany, initialData = null, onClose }) => {
  const isEdit = Boolean(initialData && initialData.id);

  const accountTypes = useMemo(() => {
    return safeArray(db.accountTypes)
      .filter((t) => t.companyId === currentCompany.id)
      .slice()
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  }, [db.accountTypes, currentCompany.id]);

  const groups = useMemo(() => {
    return safeArray(db.accountGroups)
      .filter((g) => g.companyId === currentCompany.id)
      .slice()
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  }, [db.accountGroups, currentCompany.id]);

  const [formData, setFormData] = useState(() => {
    if (isEdit) {
      return {
        typeId: String(initialData?.typeId || ''),
        name: String(initialData?.name || ''),
        groupCategory: String(initialData?.groupCategory || 'General'),
      };
    }

    const defaultType = accountTypes[0]?.id ? String(accountTypes[0].id) : '';
    return {
      typeId: defaultType,
      name: '',
      groupCategory: 'General',
    };
  });

  const handleSubmit = (e) => {
    e.preventDefault();

    const typeId = String(formData.typeId || '').trim();
    const name = String(formData.name || '').trim();
    const groupCategory = String(formData.groupCategory || 'General').trim() || 'General';

    if (!typeId) {
      alert('Group is required');
      return;
    }
    if (!name) {
      alert('Group name is required');
      return;
    }

    const existing = groups.filter((g) => String(g.typeId) === typeId);
    const clash = existing.some(
      (g) =>
        String(g.name || '').trim().toLowerCase() === name.toLowerCase() &&
        (!isEdit || String(g.id) !== String(initialData.id))
    );
    if (clash) {
      alert('Group already exists under this Parent');
      return;
    }

    const nextId = groups.reduce((m, g) => Math.max(m, Number(g?.id || 0)), 0) + 1;

    if (isEdit) {
      const updated = {
        ...initialData,
        typeId: Number(typeId),
        name,
        parentGroupId: null,
        groupCategory,
        updatedAt: new Date().toISOString(),
      };

      setDb({
        ...db,
        accountGroups: safeArray(db.accountGroups).map((g) =>
          g.companyId === currentCompany.id && String(g.id) === String(initialData.id) ? updated : g
        ),
      });

      onClose?.();
      return;
    }

    const newGroup = {
      id: nextId,
      companyId: currentCompany.id,
      typeId: Number(typeId),
      name,
      parentGroupId: null,
      groupCategory,
      isUserDefined: true,
      createdAt: new Date().toISOString(),
    };

    setDb({
      ...db,
      accountGroups: [...safeArray(db.accountGroups), newGroup],
    });

    onClose?.();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Group</label>
          <select
            value={formData.typeId}
            onChange={(e) => setFormData((p) => ({ ...p, typeId: e.target.value, parentGroupId: '' }))}
            className="w-full px-3 py-2 border rounded-lg"
          >
            <option value="">Select</option>
            {accountTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.main} • {t.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Group Category</label>
          <select
            value={formData.groupCategory}
            onChange={(e) => setFormData((p) => ({ ...p, groupCategory: e.target.value }))}
            className="w-full px-3 py-2 border rounded-lg"
          >
            <option value="Customer">Customer Group</option>
            <option value="Vendor">Vendor Group</option>
            <option value="General">General Group</option>
            <option value="Expense">Expense Group</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Group Name</label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
          className="w-full px-3 py-2 border rounded-lg"
          placeholder="e.g., Sundry Debtors"
          required
        />
      </div>

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border hover:bg-gray-50">
          Cancel
        </button>
        <button type="submit" className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700">
          {isEdit ? 'Update' : 'Create'}
        </button>
      </div>
    </form>
  );
};
