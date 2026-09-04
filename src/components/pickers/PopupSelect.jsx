import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

import Popover from '../ui/Popover';
import { rankedSearch } from '../../utils/rankedSearch';
import { useListboxKeys, openOnKey } from './useListboxKeys';

const normalizeText = (v) => String(v || '').trim().toLowerCase();

/** Below this many options there is nothing to search — the list is the search. */
const SEARCH_THRESHOLD = 8;

/**
 * Pick one value from a list.
 *
 * This used to open a full dialog: scrim, trapped keyboard, the page dimmed —
 * the same ceremony for choosing between three warehouses as for filling in a
 * user record. It now opens an anchored panel instead, so the form you are
 * filling stays lit and readable behind the choice you are making. Arrow keys
 * and Enter work, because on a form this size the hands should not have to
 * leave the keyboard to answer a question this small.
 */
const PopupSelect = ({
  label,
  value,
  onChange,
  options,
  placeholder = 'Select',
  disabled = false,
  allowCustom = false,
  customActionText = 'Use',
  onCustomAction,
  showValueSubtext = true,
  title,
  // `maxWidthClass` sized the old dialog. Call sites still pass it; the panel
  // takes its width from the control it hangs off, so it is swallowed here
  // rather than made every caller's problem to remove.
  ...ignoredLegacyProps
}) => {
  void ignoredLegacyProps;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const triggerRef = useRef(null);
  const searchRef = useRef(null);

  const normalizedQuery = normalizeText(query);

  /*
   * Ranked by the same rule as every other list: exact, starts-with, a word
   * inside the label, then the code, then anything containing it. A ledger
   * code is typed rather than read, so it is matched as a code and outranks a
   * stray substring in some other account's name.
   */
  const filtered = useMemo(() => {
    if (!normalizedQuery) return options || [];
    return rankedSearch(options || [], normalizedQuery, {
      fields: (o) => [o?.label, o?.value],
      codes: (o) => [o?.code],
    });
  }, [normalizedQuery, options]);

  const showSearch = (options || []).length >= SEARCH_THRESHOLD;

  const normalizedValue = String(value || '').trim();
  const displayLabel = useMemo(() => {
    if (!normalizedValue) return '';
    const exact = (options || []).find((o) => String(o.value || '').trim() === normalizedValue);
    if (!exact) return normalizedValue;
    const labelText = String(exact.label || exact.value || '');
    const codeText = String(exact.code || '').trim();
    return codeText ? `${codeText} - ${labelText}` : labelText;
  }, [normalizedValue, options]);

  const openPopup = () => {
    if (disabled) return;
    setQuery('');
    // Open on what is already chosen, so Enter without touching anything is a
    // no-op rather than a silent change to the first row.
    const at = (options || []).findIndex((o) => String(o.value || '').trim() === normalizedValue);
    setActiveIndex(at >= 0 ? at : 0);
    setOpen((prev) => !prev);
  };

  const closePopup = () => {
    setOpen(false);
    setQuery('');
  };

  const applyValue = (next) => {
    const nextValue = String(next || '').trim();
    onChange?.(nextValue);
    closePopup();
  };

  const runCustomAction = (next) => {
    const nextValue = String(next || '').trim();
    if (!nextValue) return;
    if (typeof onCustomAction === 'function') {
      closePopup();
      onCustomAction(nextValue);
      return;
    }
    applyValue(nextValue);
  };

  const canUseCustom = allowCustom && String(query || '').trim();
  const customValue = String(query || '').trim();
  const customIsAlreadyOption = (options || []).some((o) => String(o?.value || '').trim().toLowerCase() === customValue.toLowerCase());

  useEffect(() => {
    if (!open || !showSearch) return;
    searchRef.current?.focus();
  }, [open, showSearch]);

  /*
   * The shared keyboard contract, so this behaves exactly like the customer,
   * vendor and item lists: arrows wrap, Home/End jump, PageUp/Down move ten,
   * Enter takes the highlight, Escape leaves without changing anything.
   *
   * Enter on an empty result falls through to the create-this action when the
   * caller allows one — otherwise typing a new value and pressing Enter would
   * silently do nothing.
   */
  const {
    activeIndex,
    setActiveIndex,
    listRef,
    onKeyDown: onListKeys,
  } = useListboxKeys({
    count: filtered.length,
    onChoose: (i) => {
      const picked = filtered[i];
      if (picked) applyValue(picked.value);
    },
    onCancel: closePopup,
    // Only where there is no search box to take the keystroke.
    firstLetter: showSearch ? null : (i) => filtered[i]?.label,
  });

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !filtered.length && canUseCustom && !customIsAlreadyOption) {
      e.preventDefault();
      runCustomAction(customValue);
      return;
    }
    onListKeys(e);
  };

  return (
    <>
      {label ? <label className="ui-label">{label}</label> : null}
      <button
        ref={triggerRef}
        type="button"
        onClick={openPopup}
        onKeyDown={openOnKey(() => { if (!open) openPopup(); })}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`w-full flex items-center justify-between gap-2 px-3 py-2 border rounded-lg text-left ${
          disabled ? 'ui-sunken ui-muted cursor-not-allowed' : 'ui-surface ui-hover-sunken'
        }`}
      >
        <span className={displayLabel ? 'ui-fg' : 'ui-subtle'}>{displayLabel || placeholder}</span>
        <ChevronDown size={16} className="ui-muted" />
      </button>

      {open && (
        <Popover anchorRef={triggerRef} onClose={closePopup} onKeyDown={onKeyDown}>
          {showSearch ? (
            <div className="p-2 border-b">
              <input
                ref={searchRef}
                // Claimed by Popover once the panel is placed; focusing from
                // the effect below alone is too early to stick.
                data-autofocus="true"
                type="text"
                value={query}
                onChange={(e) => {
                  // Typing narrows the list, so whatever was highlighted may
                  // no longer be in it.
                  setQuery(e.target.value);
                  setActiveIndex(0);
                }}
                className="ui-input w-full px-2.5 py-1.5"
                placeholder={`Search ${String(title || label || '').toLowerCase() || 'options'}…`}
              />
            </div>
          ) : null}

          {canUseCustom && !customIsAlreadyOption ? (
            <button
              type="button"
              onClick={() => runCustomAction(customValue)}
              className="w-full px-3 py-2 text-left ui-hover-sunken border-b text-sm"
            >
              {String(customActionText || 'Use').trim() || 'Use'} “{customValue}”
            </button>
          ) : null}

          <div
            ref={listRef}
            role="listbox"
            className="overflow-y-auto divide-y outline-none"
          >
            {filtered.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm ui-muted">No results</div>
            ) : (
              filtered.map((o, i) => (
                <button
                  key={`${String(o.value)}-${String(o.label)}`}
                  type="button"
                  role="option"
                  aria-selected={String(o.value || '').trim() === normalizedValue}
                  data-active={i === activeIndex}
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => applyValue(o.value)}
                  className={`w-full px-3 py-2 text-left text-sm ${i === activeIndex ? 'ui-sunken' : ''}`}
                >
                  {String(o.code || '').trim() ? (
                    <div className="grid grid-cols-[72px_1fr] gap-2 items-center">
                      <div className="text-xs ui-muted">{String(o.code || '').trim()}</div>
                      <div className="font-medium ui-fg">{o.label}</div>
                    </div>
                  ) : (
                    <div className="font-medium ui-fg">{o.label}</div>
                  )}
                  {showValueSubtext && String(o.value || '').trim() !== String(o.label || '').trim() ? (
                    <div className="text-xs ui-muted">{o.value}</div>
                  ) : null}
                </button>
              ))
            )}
          </div>
        </Popover>
      )}
    </>
  );
};

export default PopupSelect;
