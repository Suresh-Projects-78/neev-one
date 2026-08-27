import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { notify } from '../ui/notify';
import Modal from '../ui/Modal';
import { createItem, listItems } from '../../api/masters';
import { useServerMasters, mirrorServerRows } from '../../hooks/useServerMasters';

const ItemPicker = ({ db, setDb, currentCompany, value, onChange, label = 'Item', autoFocus = false }) => {
  const serverItems = useServerMasters(
    useCallback((search) => listItems(search).then((d) => d?.items || []), []),
    (db?.items || []).filter((i) => Number(i.companyId) === Number(currentCompany?.id))
  );

  // Server rows feed the local collection; the picker itself lists ONLY local
  // rows, so every selection is a local numeric id (backendItemId rides along).
  useEffect(() => {
    if (serverItems.source !== 'server' || typeof setDb !== 'function') return;
    mirrorServerRows({
      setDb,
      collection: 'items',
      backendKey: 'backendItemId',
      serverRows: serverItems.rows,
      companyId: currentCompany?.id,
      mapRow: (srv) => ({
        name: srv.name || '',
        code: srv.code || '',
        unit: srv.unit || 'Pcs',
        hsnSac: srv.hsnSac || '',
        gstRate: Number(srv.gstRate ?? 0),
        salePrice: Number(srv.salePrice ?? srv.rate ?? 0),
        purchasePrice: Number(srv.purchasePrice ?? 0),
        trackBy: srv.trackBy || 'NONE',
        createdAt: srv.createdAt || new Date().toISOString(),
      }),
    });
  }, [serverItems.source, serverItems.rows, setDb, currentCompany?.id]);

  const items = (db?.items || []).filter((i) => Number(i.companyId) === Number(currentCompany?.id));
  const triggerRef = useRef(null);
  const [showItemPopup, setShowItemPopup] = useState(false);

  // autoFocus on a <button> is not honoured consistently across browsers, so a
  // newly added line focuses its item field explicitly.
  useEffect(() => {
    if (autoFocus) triggerRef.current?.focus();
  }, [autoFocus]);
  const [itemSearch, setItemSearch] = useState('');
  const [newUnitDraft, setNewUnitDraft] = useState(null); // null = closed, '' = typing
  const [mode, setMode] = useState('select');
  const canCreate = typeof setDb === 'function';

  const selectedItem = value
    ? items.find((i) => String(i.id) === String(value)) ||
      (db?.items || []).find((i) => String(i.id) === String(value)) ||
      null
    : null;
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

  const [newItem, setNewItem] = useState(() => ({
    code: `ITM${Date.now()}`,
    name: '',
    type: 'Goods',
    unit: 'Pcs',
    description: '',
    hsnSac: '',
    gstRate: 0,
    salePrice: 0,
    purchasePrice: 0,
    openingQty: 0,
  }));

  const resetNewItem = () => {
    setNewItem({
      code: `ITM${Date.now()}`,
      name: '',
      type: 'Goods',
      unit: 'Pcs',
      description: '',
      hsnSac: '',
      gstRate: 0,
      salePrice: 0,
      purchasePrice: 0,
      openingQty: 0,
    });
  };

  return (
    <>
      {label ? <label className="block text-xs font-medium mb-1">{label}</label> : null}
      <button
        type="button"
        ref={triggerRef}
        onClick={() => {
          setItemSearch('');
          resetNewItem();
          setShowItemPopup(true);
        }}
        className="ui-input text-left !py-1 !min-h-0"
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
                  className="ui-input w-full px-3 py-2"
                  placeholder="Search item (name, code, HSN/SAC)"
                  autoFocus
                />
                {canCreate ? (
                  <button
                    type="button"
                    onClick={() => setMode('create')}
                    className="px-3 py-2 rounded-lg border ui-surface ui-hover-sunken ui-border-c text-sm"
                  >
                    New
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold ui-fg">Create Item</div>
                <button
                  type="button"
                  onClick={() => setMode('select')}
                  className="px-3 py-2 rounded-lg border ui-surface ui-hover-sunken ui-border-c text-sm"
                >
                  Back
                </button>
              </div>
            )}

            {mode === 'select' ? (
              <div className="max-h-80 overflow-y-auto space-y-1">
                {filteredItems.length === 0 ? (
                  <div className="text-sm ui-muted">No items found.</div>
                ) : (
                  filteredItems.map((i) => (
                    <button
                      key={i.id}
                      type="button"
                      onClick={() => {
                        onChange(String(i.id), i);
                        closePopup();
                      }}
                      className={`w-full text-left px-3 py-2 rounded-lg border ui-hover-sunken ${ String(i.id) === String(value) ? 'ui-sunken ui-border-c' : 'ui-border-c'
                      }`}
                    >
                      <div className="text-sm font-medium ui-fg">{i.name}</div>
                      <div className="text-xs ui-muted truncate">
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
                onSubmit={async (e) => {
                  e.preventDefault();

                  const code = String(newItem.code || '').trim();
                  const name = String(newItem.name || '').trim();
                  if (!code) return notify.error('Item code is required');
                  if (!name) return notify.error('Item name is required');

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
                    // What is on the shelf right now. Hardcoding this to zero
                    // meant an item created from an invoice line could never be
                    // put on that invoice: the negative-stock guard refused it
                    // for having no stock, and this form offered no way to say
                    // otherwise. A new business's first sale hit that wall.
                    openingQty: parseFloat(newItem.openingQty) || 0,
                    openingWarehouseId: String(localStorage.getItem('activeWarehouseId') || '').trim(),
                    stock: parseFloat(newItem.openingQty) || 0,
                  };

                  setDb((prev) => {
                    const prevItems = Array.isArray(prev.items) ? prev.items : [];
                    return { ...prev, items: [...prevItems, created] };
                  });

                  // Write through to the server so the item exists for every
                  // device; fall back to the local record if that fails so a
                  // network problem does not interrupt data entry.
                  try {
                    const saved = await createItem({
                      code: code || undefined,
                      name,
                      itemType: String(newItem.type || 'Goods') === 'Service' ? 'SERVICE' : 'STOCK',
                      unit: String(newItem.unit || 'Pcs'),
                      hsnSac: String(newItem.hsnSac || '') || undefined,
                      description: String(newItem.description || '') || undefined,
                      gstRate: parseFloat(newItem.gstRate) || 0,
                      salePrice: parseFloat(newItem.salePrice) || 0,
                      purchasePrice: parseFloat(newItem.purchasePrice) || 0,
                    });
                    await serverItems.reload();
                    // Link the local record to its server twin so the mirror
                    // never duplicates it, then hand back the LOCAL id.
                    const serverItem = saved?.item;
                    if (serverItem?.id && typeof setDb === 'function') {
                      setDb((prev) => ({
                        ...prev,
                        items: (prev.items || []).map((it) =>
                          it.id === nextId ? { ...it, backendItemId: String(serverItem.id) } : it
                        ),
                      }));
                    }
                    onChange(String(nextId), created);
                  } catch {
                    onChange(String(nextId), created);
                  }
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
                      className="ui-input w-full px-3 py-2"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Name</label>
                    <input
                      type="text"
                      value={newItem.name}
                      onChange={(e) => setNewItem((p) => ({ ...p, name: e.target.value }))}
                      className="ui-input w-full px-3 py-2"
                      required
                      autoFocus
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium mb-1">Description</label>
                    <textarea
                      value={newItem.description || ''}
                      onChange={(e) => setNewItem((p) => ({ ...p, description: e.target.value }))}
                      rows={2}
                      className="ui-input w-full px-3 py-2"
                      placeholder="What this item is — copied onto document lines"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Type</label>
                    <select
                      value={newItem.type}
                      onChange={(e) => setNewItem((p) => ({ ...p, type: e.target.value }))}
                      className="ui-select w-full px-3 py-2"
                    >
                      <option>Goods</option>
                      <option>Service</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Unit</label>
                    <select
                      value={String(newItem.unit ?? '').trim()}
                      onChange={(e) => {
                        if (e.target.value === '__new__') {
                          setNewUnitDraft('');
                          return;
                        }
                        setNewItem((p) => ({ ...p, unit: e.target.value }));
                      }}
                      className="ui-select w-full px-3 py-2"
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
                      {canCreate ? <option value="__new__">+ New unit…</option> : null}
                    </select>
                    {newUnitDraft !== null ? (
                      <div className="mt-2 flex items-center gap-2">
                        <input
                          type="text"
                          value={newUnitDraft}
                          onChange={(e) => setNewUnitDraft(e.target.value)}
                          placeholder="e.g. Box, Kg, Hour"
                          className="ui-input flex-1 !h-8 !min-h-0 text-sm"
                          autoFocus
                        />
                        <button
                          type="button"
                          className="ui-btn ui-btn-primary ui-btn-sm text-xs"
                          onClick={() => {
                            const name = String(newUnitDraft || '').trim();
                            if (!name) return;
                            setDb((prev) => {
                              const prevUoms = Array.isArray(prev.uoms) ? prev.uoms : [];
                              if (prevUoms.some((u) => u.companyId === currentCompany.id && String(u.name).toLowerCase() === name.toLowerCase())) return prev;
                              const nextUomId = prevUoms.reduce((mx, u) => Math.max(mx, Number(u.id) || 0), 0) + 1;
                              return { ...prev, uoms: [...prevUoms, { id: nextUomId, companyId: currentCompany.id, name }] };
                            });
                            setNewItem((p) => ({ ...p, unit: name }));
                            setNewUnitDraft(null);
                          }}
                        >
                          Add
                        </button>
                        <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm text-xs" onClick={() => setNewUnitDraft(null)}>
                          Cancel
                        </button>
                      </div>
                    ) : null}
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">HSN/SAC</label>
                    <input
                      type="text"
                      value={newItem.hsnSac}
                      onChange={(e) => setNewItem((p) => ({ ...p, hsnSac: e.target.value }))}
                      className="ui-input w-full px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">GST %</label>
                    <select
                      value={String(newItem.gstRate ?? 0)}
                      onChange={(e) => setNewItem((p) => ({ ...p, gstRate: e.target.value }))}
                      className="ui-select w-full px-3 py-2"
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
                      className="ui-input w-full px-3 py-2"
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
                      className="ui-input w-full px-3 py-2"
                      min="0"
                      step="0.01"
                    />
                  </div>
                  {String(newItem.type || 'Goods') !== 'Service' ? (
                    <div>
                      <label className="block text-sm font-medium mb-1">Opening Stock</label>
                      <input
                        type="number"
                        value={newItem.openingQty}
                        onChange={(e) => setNewItem((p) => ({ ...p, openingQty: e.target.value }))}
                        className="ui-input w-full px-3 py-2"
                        min="0"
                        step="0.01"
                      />
                      <p className="ui-caption mt-1">
                        What is on the shelf now. Leave at zero and this item cannot be sold until a purchase records some.
                      </p>
                    </div>
                  ) : null}
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      resetNewItem();
                      setMode('select');
                    }}
                    className="px-3 py-2 rounded-lg text-sm border ui-surface ui-hover-sunken ui-border-c"
                  >
                    Cancel
                  </button>
                  <button type="submit" className="px-3 py-2 rounded-lg text-sm ui-primary-bg ">
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
