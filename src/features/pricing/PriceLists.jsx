import React, { useMemo, useState } from 'react';
import { Plus, Trash2, Tags } from 'lucide-react';
import { PageHeader, EmptyState } from '../../components/ui/Primitives';
import { ListToolbar, exportRows, useListSearch } from '../../components/ListToolbar';
import { notify, confirmDialog } from '../../components/ui/notify';
import { formatMoney } from '../../utils/money';

/**
 * Price lists: named rate cards (Retail, Wholesale, a key account…) holding a
 * per-item rate. A customer (or a customer group) points at one; invoicing
 * resolves the rate from the list before the item master's sale price
 * (src/utils/pricing.js).
 */
export default function PriceLists({ db, setDb, currentCompany }) {
  const companyId = currentCompany.id;
  const lists = useMemo(
    () => (Array.isArray(db.priceLists) ? db.priceLists.filter((p) => p.companyId === companyId) : []),
    [db.priceLists, companyId]
  );
  const items = useMemo(() => (db.items || []).filter((i) => i.companyId === companyId), [db.items, companyId]);
  const customers = useMemo(() => (db.customers || []).filter((c) => c.companyId === companyId), [db.customers, companyId]);

  const [activeId, setActiveId] = useState(lists[0]?.id ?? null);
  const [newName, setNewName] = useState('');
  const [search, setSearch] = useState('');

  const active = lists.find((p) => Number(p.id) === Number(activeId)) || null;

  const createList = () => {
    const name = newName.trim();
    if (!name) {
      notify.error('Give the price list a name (Retail, Wholesale…)');
      return;
    }
    if (lists.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      notify.error('A price list with that name already exists.');
      return;
    }
    const nextId = (db.priceLists || []).reduce((m, p) => Math.max(m, Number(p.id) || 0), 0) + 1;
    setDb((prev) => ({
      ...prev,
      priceLists: [...(prev.priceLists || []), { id: nextId, companyId, name, rates: {}, createdAt: new Date().toISOString() }],
    }));
    setActiveId(nextId);
    setNewName('');
    notify.success(`Price list "${name}" created.`);
  };

  const removeList = async (list) => {
    const users = customers.filter((c) => Number(c.priceListId) === Number(list.id)).length;
    const ok = await confirmDialog({
      title: 'Delete price list',
      message: `Delete "${list.name}"?${users ? ` ${users} customer(s) currently use it and will fall back to standard rates.` : ''}`,
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    setDb((prev) => ({
      ...prev,
      priceLists: (prev.priceLists || []).filter((p) => Number(p.id) !== Number(list.id)),
      customers: (prev.customers || []).map((c) =>
        c.companyId === companyId && Number(c.priceListId) === Number(list.id) ? { ...c, priceListId: null } : c
      ),
    }));
    if (Number(activeId) === Number(list.id)) setActiveId(null);
  };

  const setRate = (itemId, value) => {
    setDb((prev) => ({
      ...prev,
      priceLists: (prev.priceLists || []).map((p) => {
        if (Number(p.id) !== Number(activeId)) return p;
        const rates = { ...(p.rates || {}) };
        const n = Number(value);
        if (!value || !Number.isFinite(n) || n <= 0) delete rates[String(itemId)];
        else rates[String(itemId)] = n;
        return { ...p, rates };
      }),
    }));
  };

  const assignCustomer = (customerId, listIdRaw) => {
    const listId = listIdRaw === '' ? null : Number(listIdRaw);
    setDb((prev) => ({
      ...prev,
      customers: (prev.customers || []).map((c) =>
        c.companyId === companyId && Number(c.id) === Number(customerId) ? { ...c, priceListId: listId } : c
      ),
    }));
  };

  const filteredItems = items.filter((i) => !search || String(i.name || '').toLowerCase().includes(search.toLowerCase()));

  const plSearch = useListSearch(lists, ['name', 'description']);
  const shownLists = plSearch.filtered;
  return (
    <div className="space-y-5">
      <PageHeader title="Price Lists" description="Rate cards per customer segment — Retail, Wholesale, key accounts. Invoicing picks the customer's list first." />

      <ListToolbar
        search={plSearch.query}
        onSearch={plSearch.setQuery}
        placeholder="Search price lists"
        count={shownLists.length}
        countLabel="lists"
        onExport={() =>
          exportRows({
            fileName: `PriceLists_${currentCompany?.name || 'company'}`,
            label: 'price list(s)',
            columns: [
              { key: 'name', label: 'Price list' },
              { key: 'description', label: 'Description' },
              { key: 'items', label: 'Items priced', value: (r) => (Array.isArray(r.rates) ? r.rates.length : 0) },
            ],
            rows: shownLists,
          })
        }
        exportTitle="Price Lists"
        exportFileName={`PriceLists_${currentCompany?.name || 'company'}`}
        exportSheetName="Price Lists"
        exportColumns={[
              { key: 'name', label: 'Price list' },
              { key: 'description', label: 'Description' },
              { key: 'items', label: 'Items priced', value: (r) => (Array.isArray(r.rates) ? r.rates.length : 0) },
        ]}
        exportRows={shownLists}
      />

      <div className="flex flex-wrap items-center gap-2">
        {shownLists.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setActiveId(p.id)}
            className={`ui-btn !h-9 text-sm ${Number(activeId) === Number(p.id) ? 'ui-btn-primary' : 'ui-btn-secondary'}`}
          >
            {p.name}
            <span className="ml-1 text-xs opacity-70">({Object.keys(p.rates || {}).length})</span>
          </button>
        ))}
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), createList())}
            className="ui-input !h-9 w-40 px-2 text-sm"
            placeholder="New list name"
          />
          <button type="button" onClick={createList} className="ui-btn ui-btn-secondary !h-9 text-sm">
            <Plus size={14} aria-hidden="true" /> Add
          </button>
        </div>
      </div>

      {!active ? (
        <div className="ui-card">
          <EmptyState icon={Tags} title="No price list selected" description="Create a list (Retail, Wholesale…) and set per-item rates." />
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="ui-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="ui-title text-base">{active.name} — item rates</h3>
              <button type="button" onClick={() => removeList(active)} className="ui-icon-btn ui-btn-sm !w-8" aria-label="Delete list">
                <Trash2 size={14} />
              </button>
            </div>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="ui-input mb-3 w-full px-3 py-2"
              placeholder="Search items"
            />
            <div className="max-h-96 overflow-y-auto">
              <table className="ui-table w-full text-sm">
                <thead>
                  <tr>
                    <th className="px-3 py-2 text-left text-xs">Item</th>
                    <th className="px-3 py-2 text-left text-xs">Standard</th>
                    <th className="px-3 py-2 text-left text-xs">{active.name} rate</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((i) => (
                    <tr key={i.id} className="border-t">
                      <td className="px-3 py-1.5">{i.name}</td>
                      <td className="ui-col-amount px-3 py-1.5">{formatMoney(Number(i.salePrice || 0), currentCompany)}</td>
                      <td className="px-3 py-1.5">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={active.rates?.[String(i.id)] ?? ''}
                          onChange={(e) => setRate(i.id, e.target.value)}
                          className="ui-input !h-8 w-28 px-2 text-sm"
                          placeholder="—"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="ui-card p-4">
            <h3 className="ui-title text-base mb-3">Customer assignment</h3>
            <div className="max-h-[28rem] overflow-y-auto">
              <table className="ui-table w-full text-sm">
                <thead>
                  <tr>
                    <th className="px-3 py-2 text-left text-xs">Customer</th>
                    <th className="px-3 py-2 text-left text-xs">Price list</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((c) => (
                    <tr key={c.id} className="border-t">
                      <td className="ui-col-entity px-3 py-1.5">{c.displayName || c.name}</td>
                      <td className="px-3 py-1.5">
                        <select
                          value={c.priceListId ?? ''}
                          onChange={(e) => assignCustomer(c.id, e.target.value)}
                          className="ui-select !h-8 w-40 px-2 text-sm"
                        >
                          <option value="">Standard rates</option>
                          {lists.map((p) => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
