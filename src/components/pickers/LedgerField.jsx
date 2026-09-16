import React, { useMemo, useRef, useState } from 'react';
import { Plus } from 'lucide-react';

import Modal from '../ui/Modal';
import Popover from '../ui/Popover';
import { AccountForm } from './AccountPicker';
import { rankedSearch, soleConfidentMatch } from '../../utils/rankedSearch';
import { useListboxKeys, openOnKey, focusNextAfter } from './useListboxKeys';
import { useRecentPicks } from './useRecentPicks';

const safeArray = (v) => (Array.isArray(v) ? v : []);

/**
 * A ledger, typed rather than hunted for.
 *
 * The allocation row used to be a `<select>` holding every ledger in the book,
 * alphabetically. On a company of any age that is a scroll through a hundred
 * names to find the one you already knew, and there is no way at all to post
 * to a ledger that does not exist yet — you leave the receipt, make the
 * ledger, and come back to start again.
 *
 * So it is the field the line grid already uses for items: type, see what
 * matches, and if nothing does, make it from here. `AccountPicker` exists and
 * is the same idea, but it is a button that opens a dialog that holds a search
 * box — two clicks before the first keystroke, which is one more than a row in
 * a table can afford.
 */
export const LedgerField = ({
  db,
  setDb,
  currentCompany,
  value,
  onChange,
  options = null,
  placeholder = 'Type a ledger name or code',
  ariaLabel = 'Ledger',
  disabled = false,
  canCreate = true,
}) => {
  const ledgers = useMemo(() => {
    if (Array.isArray(options)) return options;
    return safeArray(db?.chartOfAccounts)
      .filter((a) => Number(a?.companyId) === Number(currentCompany?.id) && a?.isActive !== false)
      .slice()
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  }, [options, db?.chartOfAccounts, currentCompany?.id]);

  const triggerRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState('select');
  const [search, setSearch] = useState('');

  const selected = value ? ledgers.find((a) => String(a.id) === String(value)) : null;
  const selectedName = selected ? selected.name : '';

  const typed = String(search || '').trim();
  const recents = useRecentPicks('ledger', currentCompany?.id);

  /* A code is typed, not read, so a code hit outranks the same string buried
     in another ledger's name. Unfiltered, the ones this operator actually
     posts to come first. */
  const searchOpts = {
    fields: (a) => [a.name, a.groupName, a.ledgerCategory],
    codes: (a) => [a.code],
  };
  const filtered = typed ? rankedSearch(ledgers, typed.toLowerCase(), searchOpts) : recents.promote(ledgers);
  const recentCount = typed ? 0 : recents.recentCount(filtered);

  const close = ({ advance = false, refocus = true } = {}) => {
    setOpen(false);
    setMode('select');
    setSearch('');
    requestAnimationFrame(() => {
      if (advance) focusNextAfter(triggerRef.current);
      else if (refocus) triggerRef.current?.focus({ preventScroll: true });
    });
  };

  const choose = (ledger) => {
    if (!ledger) return;
    recents.remember(ledger.id);
    onChange?.(String(ledger.id));
    close({ advance: true });
  };

  const openPopup = () => {
    setMode('select');
    setSearch('');
    setOpen(true);
  };

  /* Tab out of the field takes the one match, when there is exactly one — a
     full code should not have to be confirmed, and a partial one should not
     be guessed at. */
  const onTab = (e) => {
    if (e.key !== 'Tab' || e.shiftKey) return;
    const sole = soleConfidentMatch(ledgers, search, searchOpts);
    if (!sole) return;
    e.preventDefault();
    e.stopPropagation();
    choose(sole);
  };

  const { activeIndex, setActiveIndex, listRef, onKeyDown } = useListboxKeys({
    count: filtered.length,
    onChoose: (i) => choose(filtered[i]),
    onCancel: () => close(),
    onTabOut: () => close({ advance: true }),
  });

  return (
    <>
      <input
        ref={triggerRef}
        type="text"
        role="combobox"
        value={open ? search : selectedName}
        placeholder={placeholder}
        disabled={disabled}
        onMouseDown={() => {
          /* A click or a keystroke opens it — never focus alone, which arrives
             as the list closes and would reopen it on the same gesture. */
          if (open) return;
          setSearch('');
          setMode('select');
          setOpen(true);
        }}
        onChange={(e) => {
          if (!open) {
            setMode('select');
            setOpen(true);
          }
          setSearch(e.target.value);
          setActiveIndex(0);
        }}
        onKeyDown={(e) => {
          if (!open) {
            openOnKey(openPopup)(e);
            return;
          }
          /* Alt+C makes the ledger that is not on file, without leaving the
             row — the same reflex the item field answers to. */
          if (e.altKey && (e.key === 'c' || e.key === 'C')) {
            e.preventDefault();
            e.stopPropagation();
            if (canCreate) setMode('create');
            return;
          }
          onTab(e);
          onKeyDown(e);
        }}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-activedescendant={open && filtered[activeIndex] ? `ledger-opt-${filtered[activeIndex].id}` : undefined}
        className="ui-input w-full"
      />

      {open && mode === 'select' ? (
        <Popover anchorRef={triggerRef} onClose={() => close({ refocus: false })} autoFocus={false} minWidth={320}>
          <div ref={listRef} role="listbox" className="max-h-80 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-sm ui-muted">
                {typed ? `No ledger matches “${typed}”.` : 'No ledgers yet.'}
              </div>
            ) : (
              filtered.map((a, n) => {
                const on = n === activeIndex;
                return (
                  <React.Fragment key={a.id}>
                    {recentCount && n === 0 ? (
                      <div className="ui-caption px-2 pt-1 pb-0.5">Recently used</div>
                    ) : null}
                    {recentCount && n === recentCount ? (
                      <div className="ui-caption px-2 pt-2 pb-0.5">All ledgers</div>
                    ) : null}
                    <button
                      id={`ledger-opt-${a.id}`}
                      type="button"
                      role="option"
                      aria-selected={String(a.id) === String(value)}
                      data-active={on || undefined}
                      onMouseEnter={() => setActiveIndex(n)}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => choose(a)}
                      className={`w-full rounded-lg px-3 py-2 text-left ${on ? '' : 'ui-hover-sunken'}`}
                      style={on ? { backgroundColor: 'rgb(var(--brand))', color: 'rgb(var(--on-brand))' } : undefined}
                    >
                      <div className={`text-sm font-medium ${on ? '' : 'ui-fg'}`}>{a.name}</div>
                      {a.code || a.groupName ? (
                        <div className={`text-xs truncate ${on ? 'opacity-80' : 'ui-muted'}`}>
                          {[a.code, a.groupName].filter(Boolean).join(' • ')}
                        </div>
                      ) : null}
                    </button>
                  </React.Fragment>
                );
              })
            )}
          </div>

          {canCreate ? (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setMode('create')}
              className="ui-hover-sunken flex w-full items-center gap-2 border-t px-3 py-2 text-left text-sm"
            >
              <Plus size={14} aria-hidden="true" />
              {typed ? `Create “${typed}”` : 'Create a new ledger'}
            </button>
          ) : null}
        </Popover>
      ) : null}

      {open && mode === 'create' ? (
        <Modal onClose={() => close()} title="Create Ledger" maxWidthClass="max-w-3xl">
          <AccountForm
            db={db}
            setDb={setDb}
            currentCompany={currentCompany}
            /* What was typed is the name — retyping it into the form the
               search just failed to match is the whole point of this route. */
            initialData={typed ? { name: typed } : null}
            onCreated={(account) => {
              if (account?.id) {
                recents.remember(account.id);
                onChange?.(String(account.id));
              }
              close({ advance: true });
            }}
            onClose={() => setMode('select')}
          />
        </Modal>
      ) : null}
    </>
  );
};

export default LedgerField;
