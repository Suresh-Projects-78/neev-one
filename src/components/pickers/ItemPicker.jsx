import React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Modal from '../ui/Modal';
import ItemForm from '../../features/masters/ItemForm';
import { listItems } from '../../api/masters';
import { useServerMasters, mirrorServerRows } from '../../hooks/useServerMasters';
import { rankedSearch, soleConfidentMatch } from '../../utils/rankedSearch';
import { useListboxKeys, openOnKey, focusNextAfter } from './useListboxKeys';
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

  /**
   * Where focus lands when the picker closes.
   *
   * Cancelling goes back to the cell that opened the picker — nothing was
   * chosen, so the hands are still on the item field. Choosing goes *forward*,
   * to the next control in the same line, because picking an item is the end
   * of that cell's business and the next thing anybody types is the
   * description or the quantity.
   *
   * Returning focus to the trigger on a choice was the bug behind "tab not
   * selecting properly": Tab picked the item, the dialog closed, and focus
   * snapped back to the field it had just left, so the row appeared to eat
   * the keystroke and the operator had to Tab a second time.
   */
  const closePopup = ({ advance = false } = {}) => {
    setShowItemPopup(false);
    setItemSearch('');
    setMode('select');
    requestAnimationFrame(() => {
      if (advance) focusNextAfter(triggerRef.current);
      else triggerRef.current?.focus({ preventScroll: true });
    });
  };

  const chooseItem = (item) => {
    if (!item) return;
    recents.remember(item.id);
    onChange(String(item.id), item);
    closePopup({ advance: true });
  };

  const openPopup = () => {
    setItemSearch('');
    setMode('select');
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
    if (!sole) return;
    /*
     * Swallow the Tab. The dialog's own focus trap would otherwise move focus
     * to the next control *inside the dialog* on the very keystroke that
     * closes the dialog, and the two would race — which is why the cursor
     * used to end up somewhere nobody asked for. We place focus ourselves.
     */
    e.preventDefault();
    e.stopPropagation();
    chooseItem(sole);
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
    onCancel: () => closePopup(),
    // Tab off a list nobody drove: leave the value alone and carry on,
    // rather than snapping back to the field just left.
    onTabOut: () => closePopup({ advance: true }),
  });

  /*
   * What the item form needs to ask where opening stock lands. The picker is
   * handed neither, so they come from the same place every other screen reads
   * them from.
   */
  const warehousesForCompany = useMemo(
    () => (db.warehouses || []).filter((w) => Number(w.companyId) === Number(currentCompany?.id)),
    [db.warehouses, currentCompany?.id]
  );
  const branchesForCompany = useMemo(
    () => (db.branches || []).filter((b) => Number(b.companyId) === Number(currentCompany?.id)),
    [db.branches, currentCompany?.id]
  );

  return (
    <>
      {label ? <label className="ui-label">{label}</label> : null}
      <button
        type="button"
        ref={triggerRef}
        onClick={openPopup}
        onKeyDown={openOnKey(openPopup)}
        aria-haspopup="listbox"
        aria-expanded={showItemPopup}
        className="ui-input text-left"
      >
        {selectedItemName || 'Select Item'}
      </button>

      {showItemPopup && (
        <Modal
          onClose={() => closePopup()}
          /* One dialog, two jobs: a list to pick from, and — when what you
             need is not on it — the item form itself, which needs the room. */
          title={mode === 'create' ? 'Create Item' : 'Select Item'}
          maxWidthClass={mode === 'create' ? 'max-w-4xl' : 'max-w-lg'}
        >
          <div className="space-y-3">
            {mode === 'select' ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={itemSearch}
                  onChange={(e) => setItemSearch(e.target.value)}
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
                      if (canCreate) setMode('create');
                      return;
                    }
                    onItemSearchTab(e);
                    onItemListKeys(e);
                  }}
                  role="combobox"
                  aria-expanded="true"
                  aria-controls="item-picker-list"
                  aria-activedescendant={
                    filteredItems[itemActiveIndex] ? `item-opt-${filteredItems[itemActiveIndex].id}` : undefined
                  }
                  className="ui-input w-full"
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
              <div className="flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => setMode('select')}
                  className="px-3 py-2 rounded-lg border ui-surface ui-hover-sunken ui-border-c text-sm"
                >
                  Back to the list
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
                        className={`w-full text-left px-3 py-2 rounded-lg border ${
                          on ? '' : 'ui-hover-sunken '
                        }${String(i.id) === String(value) && !on ? 'ui-sunken ui-border-c' : 'ui-border-c'}`}
                        /*
                         * The cursor row is filled, not merely outlined. It
                         * previously shared `ui-sunken` with the already-chosen
                         * row and differed only by border colour, so pressing ↓
                         * looked like nothing had happened.
                         */
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
                        <div className={`text-sm font-medium ${on ? '' : 'ui-fg'}`}>{i.name}</div>
                        <div className={`text-xs truncate ${on ? 'opacity-80' : 'ui-muted'}`}>
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
              <ItemForm
                db={db}
                setDb={setDb}
                currentCompany={currentCompany}
                warehouses={warehousesForCompany}
                branches={branchesForCompany}
                defaultName={itemSearch}
                onCreated={(created) => {
                  // Straight onto the line that asked for it, the way the old
                  // panel did — making the item is a step inside picking one.
                  if (created?.id) {
                    recents.remember(created.id);
                    onChange(String(created.id), created);
                  }
                  serverItems.reload?.();
                }}
                onClose={() => closePopup()}
              />
            )}
          </div>
        </Modal>
      )}
    </>
  );
};

export default ItemPicker;
