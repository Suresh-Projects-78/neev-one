import React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFeatures } from '../../permissions/useFeatures';
import { nextItemCode, bumpItemCodeSeries } from '../../utils/itemCode';
import { notify } from '../ui/notify';
import Modal from '../ui/Modal';
import { createItem, listItems } from '../../api/masters';
import { useServerMasters, mirrorServerRows } from '../../hooks/useServerMasters';
import { rankedSearch, soleConfidentMatch } from '../../utils/rankedSearch';
import { useListboxKeys, openOnKey } from './useListboxKeys';
import { useRecentPicks } from './useRecentPicks';
import { useRemoteSearch } from './useRemoteSearch';

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
    // preventScroll: a new line is added at the bottom of a long form, and
    // letting the browser scroll it into view yanks the whole page — nav and
    // all — out from under whoever is typing.
    if (autoFocus) triggerRef.current?.focus({ preventScroll: true });
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
  const recents = useRecentPicks('item', currentCompany?.id);

  // Above the page the server returns, typing has to reach the server or the
  // SKU may simply not be in the browser to find.
  useRemoteSearch(serverItems.reload, itemSearch, {
    localSize: items.length,
    enabled: showItemPopup,
  });

  /*
   * A code is typed, a name is read.
   *
   * So "FG-100" matching an SKU outranks "FG-100" appearing somewhere inside
   * a description, and the shared ranking puts an exact hit above a
   * starts-with above a word inside the name. Unfiltered, the items this line
   * usually sells lead the list.
   */
  const filteredItems = normalizedSearch
    ? rankedSearch(items, normalizedSearch, {
        fields: (i) => [i.name, i.description],
        codes: (i) => [i.code, i.sku, i.barcode, i.hsnSac],
      })
    : recents.promote(items);

  // Focus goes back to the cell that opened this, so Tab carries on into the
  // description and quantity instead of restarting at the top of the page.
  const closePopup = () => {
    setShowItemPopup(false);
    setItemSearch('');
    setMode('select');
    requestAnimationFrame(() => triggerRef.current?.focus({ preventScroll: true }));
  };

  const chooseItem = (item) => {
    if (!item) return;
    recents.remember(item.id);
    onChange(String(item.id), item);
    closePopup();
  };

  const openPopup = () => {
    setItemSearch('');
    resetNewItem();
    setShowItemPopup(true);
  };

  const itemSearchOpts = {
    fields: (i) => [i.name, i.description],
    codes: (i) => [i.code, i.sku, i.barcode, i.hsnSac],
  };

  /*
   * Tab out of the search box takes the one match, when there is exactly one.
   *
   * Requirement 15 says highlight without auto-selecting while somebody is
   * still typing; section 9 says a full code should not have to be confirmed.
   * Both hold at once if the selection happens on the way out of the field
   * rather than on every keystroke.
   */
  const onItemSearchTab = (e) => {
    if (e.key !== 'Tab' || e.shiftKey) return;
    const sole = soleConfidentMatch(items, itemSearch, itemSearchOpts);
    if (sole) chooseItem(sole);
  };

  const itemRecentCount = normalizedSearch ? 0 : recents.recentCount(filteredItems);

  const {
    activeIndex: itemActiveIndex,
    setActiveIndex: setItemActiveIndex,
    listRef: itemListRef,
    onKeyDown: onItemListKeys,
  } = useListboxKeys({
    count: filteredItems.length,
    onChoose: (i) => chooseItem(filteredItems[i]),
    onCancel: closePopup,
  });

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

  const { isEnabled } = useFeatures();
  /**
   * Batch and expiry only exist if the company switched the capability on, and
   * only ever apply to goods — an hour of labour has no batch and does not go
   * off.
   */
  const batchCapable = isEnabled('batchExpiry') || isEnabled('batchSerial');

  const [newItem, setNewItem] = useState(() => ({
    code: nextItemCode(db, currentCompany, 'Goods'),
    name: '',
    type: 'Goods',
    trackingType: 'NONE',
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
      code: nextItemCode(db, currentCompany, 'Goods'),
      name: '',
      type: 'Goods',
      trackingType: 'NONE',
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
        onClick={openPopup}
        onKeyDown={openOnKey(openPopup)}
        aria-haspopup="listbox"
        aria-expanded={showItemPopup}
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
                  onKeyDown={(e) => {
                    onItemSearchTab(e);
                    onItemListKeys(e);
                  }}
                  role="combobox"
                  aria-expanded="true"
                  aria-controls="item-picker-list"
                  aria-activedescendant={
                    filteredItems[itemActiveIndex] ? `item-opt-${filteredItems[itemActiveIndex].id}` : undefined
                  }
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
              <div
                id="item-picker-list"
                ref={itemListRef}
                role="listbox"
                className="max-h-80 overflow-y-auto space-y-1"
              >
                {filteredItems.length === 0 ? (
                  <div className="text-sm ui-muted">No items found.</div>
                ) : (
                  filteredItems.map((i, n) => {
                    const on = n === itemActiveIndex;
                    return (
                      <React.Fragment key={i.id}>
                      {/* The habitual rows, called what they are. */}
                      {itemRecentCount && n === 0 ? (
                        <div className="ui-caption px-1 pt-1 pb-0.5">Recently used</div>
                      ) : null}
                      {itemRecentCount && n === itemRecentCount ? (
                        <div className="ui-caption px-1 pt-2 pb-0.5">All items</div>
                      ) : null}
                      <button
                        id={`item-opt-${i.id}`}
                        type="button"
                        role="option"
                        aria-selected={String(i.id) === String(value)}
                        data-active={on || undefined}
                        onMouseEnter={() => setItemActiveIndex(n)}
                        onClick={() => chooseItem(i)}
                        className={`w-full text-left px-3 py-2 rounded-lg border ui-hover-sunken ${
                          on || String(i.id) === String(value) ? 'ui-sunken ui-border-c' : 'ui-border-c'
                        }`}
                        style={on ? { borderColor: 'rgb(var(--brand))' } : undefined}
                      >
                        <div className="text-sm font-medium ui-fg">{i.name}</div>
                        <div className="text-xs ui-muted truncate">
                          {[i.code, i.hsnSac ? `HSN/SAC ${i.hsnSac}` : null, `GST ${Number(i.gstRate || 0)}%`]
                            .filter(Boolean)
                            .join(' • ')}
                        </div>
                      </button>
                      </React.Fragment>
                    );
                  })
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
                    // Services are never tracked, whatever the form last held.
                    trackingType: newItem.type === 'Service' ? 'NONE' : String(newItem.trackingType || 'NONE'),
                  };

                  setDb((prev) => {
                    const prevItems = Array.isArray(prev.items) ? prev.items : [];
                    return {
                      ...prev,
                      items: [...prevItems, created],
                      // Move the series on, so the next item of this type does
                      // not offer the number this one just took.
                      companies: bumpItemCodeSeries(prev, currentCompany, newItem.type, created.code),
                    };
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
                  {/*
                    Type comes first because everything under it depends on the
                    answer: which code series the item is numbered from, and
                    whether batch and expiry apply at all. Asked last, as it
                    used to be, the code was already minted from the wrong
                    series by the time you said what the thing was.
                  */}
                  <div className="col-span-2">
                    <label className="block text-sm font-medium mb-1">Type</label>
                    <select
                      value={newItem.type}
                      onChange={(e) => {
                        const type = e.target.value;
                        setNewItem((p) => ({
                          ...p,
                          type,
                          code: nextItemCode(db, currentCompany, type),
                          // A service cannot carry a batch or an expiry date.
                          trackingType: type === 'Service' ? 'NONE' : p.trackingType,
                        }));
                      }}
                      className="ui-select w-full px-3 py-2"
                      data-autofocus="true"
                    >
                      <option>Goods</option>
                      <option>Service</option>
                    </select>
                    <p className="ui-caption mt-1">
                      {newItem.type === 'Service'
                        ? 'A service is not stocked, so it has no opening quantity, batch or expiry.'
                        : 'Goods are stocked, and can be tracked by batch and expiry.'}
                    </p>
                  </div>
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

                  {/*
                    Only when the company has switched batch tracking on, and
                    only for goods. Offering it otherwise asks a question the
                    rest of the product cannot answer: nothing downstream
                    prompts for a batch unless the capability is enabled, and a
                    service has nothing to batch.
                  */}
                  {batchCapable && newItem.type === 'Goods' ? (
                    <div className="col-span-2">
                      <label className="block text-sm font-medium mb-1">Batch &amp; expiry</label>
                      <select
                        value={newItem.trackingType || 'NONE'}
                        onChange={(e) => setNewItem((p) => ({ ...p, trackingType: e.target.value }))}
                        className="ui-select w-full px-3 py-2"
                      >
                        <option value="NONE">Not tracked</option>
                        <option value="BATCH">Track batch</option>
                        <option value="BATCH_EXPIRY">Track batch and expiry</option>
                      </select>
                      <p className="ui-caption mt-1">
                        {newItem.trackingType === 'BATCH_EXPIRY'
                          ? 'Every receipt and sale of this item will ask which batch, and when it expires.'
                          : newItem.trackingType === 'BATCH'
                            ? 'Every receipt and sale of this item will ask which batch.'
                            : 'Stock is counted as one pool, with no batch on receipts or sales.'}
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
