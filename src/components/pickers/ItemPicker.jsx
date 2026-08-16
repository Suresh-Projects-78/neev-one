import { useMemo, useState } from 'react';
import Modal from '../ui/Modal';

const ItemPicker = ({ db, setDb, currentCompany, value, onChange, label = 'Item' }) => {
  const items = db.items.filter((i) => i.companyId === currentCompany.id);
  const [showItemPopup, setShowItemPopup] = useState(false);
  const [itemSearch, setItemSearch] = useState('');
  const [mode, setMode] = useState('select');
  const canCreate = typeof setDb === 'function';

  const selectedItem = value ? items.find((i) => i.id === parseInt(value)) : null;
  const selectedItemName = selectedItem ? selectedItem.name : '';

  const normalizedSearch = itemSearch.trim().toLowerCase();
  const filteredItems = normalizedSearch
    ? items.filter((i) => {
        const haystack = `${i.code || ''} ${i.name || ''} ${i.hsnSac || ''}`.toLowerCase();
        return haystack.includes(normalizedSearch);
      })
    : items;

  const closePopup = () => {
    setShowItemPopup(false);
    setItemSearch('');
    setMode('select');
  };

  const uoms = useMemo(
    () =>
      (db.uoms || [])
        .filter((u) => u.companyId === currentCompany.id)
        .slice()
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))),
    [db.uoms, currentCompany.id]
  );
  const uomNames = useMemo(() => uoms.map((u) => String(u.name || '').trim()).filter(Boolean), [uoms]);

  const gstRates = useMemo(
    () =>
      (db.gstRates || [])
        .filter((r) => r.companyId === currentCompany.id)
        .slice()
        .sort((a, b) => Number(a.rate) - Number(b.rate)),
    [db.gstRates, currentCompany.id]
  );
  const gstRateValues = useMemo(() => gstRates.map((r) => String(Number(r.rate))), [gstRates]);

  const [newItem, setNewItem] = useState({
    code: `ITM${Date.now()}`,
    name: '',
    type: 'Goods',
    unit: 'Pcs',
    hsnSac: '',
    gstRate: 0,
    salePrice: 0,
    purchasePrice: 0,
  });

  const resetNewItem = () => {
    setNewItem({
      code: `ITM${Date.now()}`,
      name: '',
      type: 'Goods',
      unit: 'Pcs',
      hsnSac: '',
      gstRate: 0,
      salePrice: 0,
      purchasePrice: 0,
    });
  };

  return (
    <>
      {label ? <label className="block text-xs font-medium mb-1">{label}</label> : null}
      <button
        type="button"
        onClick={() => {
          setItemSearch('');
          resetNewItem();
          setShowItemPopup(true);
        }}
        className="w-full px-2 py-1 border rounded bg-white text-left"
      >
        {selectedItemName || 'Select Item'}
      </button>

      {showItemPopup && (
        <Modal onClose={closePopup} title="Select Item" maxWidthClass="max-w-lg">
          <div className="space-y-3">
            {mode === 'select' ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={itemSearch}
                  onChange={(e) => setItemSearch(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="Search item (name, code, HSN/SAC)"
                  autoFocus
                />
                {canCreate ? (
                  <button
                    type="button"
                    onClick={() => setMode('create')}
                    className="px-3 py-2 rounded-lg border bg-white hover:bg-gray-50 border-gray-200 text-sm"
                  >
                    New
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-gray-900">Create Item</div>
                <button
                  type="button"
                  onClick={() => setMode('select')}
                  className="px-3 py-2 rounded-lg border bg-white hover:bg-gray-50 border-gray-200 text-sm"
                >
                  Back
                </button>
              </div>
            )}

            {mode === 'select' ? (
              <div className="max-h-80 overflow-y-auto space-y-1">
                {filteredItems.length === 0 ? (
                  <div className="text-sm text-gray-600">No items found.</div>
                ) : (
                  filteredItems.map((i) => (
                    <button
                      key={i.id}
                      type="button"
                      onClick={() => {
                        onChange(String(i.id), i);
                        closePopup();
                      }}
                      className={`w-full text-left px-3 py-2 rounded-lg border hover:bg-gray-50 ${
                        String(i.id) === String(value) ? 'bg-gray-50 border-gray-300' : 'border-gray-200'
                      }`}
                    >
                      <div className="text-sm font-medium text-gray-900">{i.name}</div>
                      <div className="text-xs text-gray-500 truncate">
                        {[i.code, i.hsnSac ? `HSN/SAC ${i.hsnSac}` : null, `GST ${Number(i.gstRate || 0)}%`]
                          .filter(Boolean)
                          .join(' • ')}
                      </div>
                    </button>
                  ))
                )}
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();

                  const code = String(newItem.code || '').trim();
                  const name = String(newItem.name || '').trim();
                  if (!code) return alert('Item code is required');
                  if (!name) return alert('Item name is required');

                  const nextId = (items || []).reduce((m, i) => Math.max(m, Number(i.id) || 0), 0) + 1;
                  const created = {
                    id: nextId,
                    companyId: currentCompany.id,
                    code,
                    name,
                    type: String(newItem.type || 'Goods'),
                    unit: String(newItem.unit || 'Pcs'),
                    hsnSac: String(newItem.hsnSac || ''),
                    gstRate: parseFloat(newItem.gstRate) || 0,
                    salePrice: parseFloat(newItem.salePrice) || 0,
                    purchasePrice: parseFloat(newItem.purchasePrice) || 0,
                    stock: 0,
                  };

                  setDb((prev) => {
                    const prevItems = Array.isArray(prev.items) ? prev.items : [];
                    return { ...prev, items: [...prevItems, created] };
                  });

                  // Pick it immediately.
                  onChange(String(nextId), created);
                  closePopup();
                }}
                className="space-y-3"
              >
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">Code</label>
                    <input
                      type="text"
                      value={newItem.code}
                      onChange={(e) => setNewItem((p) => ({ ...p, code: e.target.value }))}
                      className="w-full px-3 py-2 border rounded-lg"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Name</label>
                    <input
                      type="text"
                      value={newItem.name}
                      onChange={(e) => setNewItem((p) => ({ ...p, name: e.target.value }))}
                      className="w-full px-3 py-2 border rounded-lg"
                      required
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Type</label>
                    <select
                      value={newItem.type}
                      onChange={(e) => setNewItem((p) => ({ ...p, type: e.target.value }))}
                      className="w-full px-3 py-2 border rounded-lg"
                    >
                      <option>Goods</option>
                      <option>Service</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Unit</label>
                    <select
                      value={String(newItem.unit ?? '').trim()}
                      onChange={(e) => setNewItem((p) => ({ ...p, unit: e.target.value }))}
                      className="w-full px-3 py-2 border rounded-lg"
                    >
                      {String(newItem.unit ?? '').trim() && !uomNames.includes(String(newItem.unit ?? '').trim()) ? (
                        <option value={String(newItem.unit ?? '').trim()}>{String(newItem.unit ?? '').trim()} (legacy)</option>
                      ) : null}
                      {uoms.length === 0 ? <option value={String(newItem.unit ?? 'Pcs')}>{String(newItem.unit ?? 'Pcs')}</option> : null}
                      {uoms.map((u) => (
                        <option key={u.id} value={u.name}>
                          {u.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">HSN/SAC</label>
                    <input
                      type="text"
                      value={newItem.hsnSac}
                      onChange={(e) => setNewItem((p) => ({ ...p, hsnSac: e.target.value }))}
                      className="w-full px-3 py-2 border rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">GST %</label>
                    <select
                      value={String(newItem.gstRate ?? 0)}
                      onChange={(e) => setNewItem((p) => ({ ...p, gstRate: e.target.value }))}
                      className="w-full px-3 py-2 border rounded-lg"
                    >
                      {!gstRateValues.includes(String(newItem.gstRate ?? 0)) ? (
                        <option value={String(newItem.gstRate ?? 0)}>{String(newItem.gstRate ?? 0)}% (legacy)</option>
                      ) : null}
                      {gstRates.length === 0 ? (
                        <option value="0">0%</option>
                      ) : (
                        gstRates.map((r) => (
                          <option key={r.id} value={String(Number(r.rate))}>
                            {Number(r.rate)}%
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Sale Price</label>
                    <input
                      type="number"
                      value={newItem.salePrice}
                      onChange={(e) => setNewItem((p) => ({ ...p, salePrice: e.target.value }))}
                      className="w-full px-3 py-2 border rounded-lg"
                      min="0"
                      step="0.01"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Purchase Price</label>
                    <input
                      type="number"
                      value={newItem.purchasePrice}
                      onChange={(e) => setNewItem((p) => ({ ...p, purchasePrice: e.target.value }))}
                      className="w-full px-3 py-2 border rounded-lg"
                      min="0"
                      step="0.01"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      resetNewItem();
                      setMode('select');
                    }}
                    className="px-3 py-2 rounded-lg text-sm border bg-white hover:bg-gray-50 border-gray-200"
                  >
                    Cancel
                  </button>
                  <button type="submit" className="px-3 py-2 rounded-lg text-sm bg-violet-600 text-white hover:bg-violet-700">
                    Create
                  </button>
                </div>
              </form>
            )}
          </div>
        </Modal>
      )}
    </>
  );
};

export default ItemPicker;
