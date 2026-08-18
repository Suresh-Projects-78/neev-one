import React, { useEffect, useRef, useState } from 'react';
import { Bookmark, Check, Columns3, Save, Trash2, X } from 'lucide-react';

/**
 * The two grid controls that sit in a list's toolbar: Views and Columns.
 *
 * Both are plain popovers rather than modals — choosing a column set is a
 * glance-level action and must not cover the table it is configuring. One
 * popover open at a time; outside click or Escape closes it, focus returns
 * to the button, and every checkbox row is a real labelled control.
 */
export default function GridControls({ grid }) {
  const [open, setOpen] = useState(''); // '' | 'views' | 'columns'
  const [newName, setNewName] = useState('');
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen('');
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen('');
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const { columns } = grid;

  return (
    <div ref={rootRef} className="relative flex items-center gap-2">
      <button
        type="button"
        onClick={() => setOpen(open === 'views' ? '' : 'views')}
        className="ui-btn ui-btn-secondary"
        aria-haspopup="menu"
        aria-expanded={open === 'views'}
      >
        <Bookmark size={15} aria-hidden="true" />
        {grid.activeView || 'Views'}
      </button>

      <button
        type="button"
        onClick={() => setOpen(open === 'columns' ? '' : 'columns')}
        className="ui-btn ui-btn-secondary"
        aria-haspopup="menu"
        aria-expanded={open === 'columns'}
      >
        <Columns3 size={15} aria-hidden="true" />
        Columns
      </button>

      {open === 'views' ? (
        <div className="ui-card ui-in-pop absolute right-0 top-full z-50 mt-2 w-72 p-3" role="menu">
          {grid.views.length === 0 ? (
            <p className="ui-caption px-1 pb-2">
              No saved views yet. Set filters and columns the way you like, then save them under a name.
            </p>
          ) : (
            <ul className="mb-2 max-h-56 overflow-y-auto">
              {grid.views.map((v) => (
                <li key={v.name} className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      grid.applyView(v.name);
                      setOpen('');
                    }}
                    className="ui-btn ui-btn-ghost flex-1 !justify-start"
                  >
                    {grid.activeView === v.name ? <Check size={14} aria-hidden="true" /> : <span className="w-3.5" />}
                    <span className="truncate">{v.name}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => grid.deleteView(v.name)}
                    className="ui-icon-btn"
                    aria-label={`Delete view ${v.name}`}
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <form
            className="flex items-center gap-2 border-t pt-2"
            style={{ borderColor: 'rgb(var(--border))' }}
            onSubmit={(e) => {
              e.preventDefault();
              if (grid.saveView(newName)) {
                setNewName('');
                setOpen('');
              }
            }}
          >
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Save current as…"
              aria-label="Name for the current view"
              className="ui-input !h-8 flex-1 text-sm"
            />
            <button type="submit" className="ui-btn ui-btn-primary !h-8 !px-2.5" disabled={!newName.trim()}>
              <Save size={14} aria-hidden="true" />
            </button>
          </form>
        </div>
      ) : null}

      {open === 'columns' ? (
        <div className="ui-card ui-in-pop absolute right-0 top-full z-50 mt-2 w-60 p-3" role="menu">
          <div className="mb-1 flex items-center justify-between px-1">
            <span className="ui-card-label">Show columns</span>
            <button type="button" onClick={grid.resetColumns} className="ui-btn ui-btn-ghost !h-7 !px-2 text-xs">
              Reset
            </button>
          </div>
          <ul>
            {columns.map((c) => (
              <li key={c.key}>
                <label
                  className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm ${
                    c.always ? 'opacity-50' : 'cursor-pointer'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={grid.isVisible(c.key)}
                    disabled={Boolean(c.always)}
                    onChange={() => grid.toggleColumn(c.key)}
                    className="ui-checkbox"
                  />
                  {c.label}
                </label>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The bar that replaces silence when rows are selected: count, the actions
 * that apply to the selection, and an exit. Sticky above the table so the
 * actions stay reachable however far the selection extends.
 */
export function BulkBar({ count, onClear, children }) {
  if (!count) return null;
  return (
    <div
      className="ui-in-fade sticky top-0 z-10 flex items-center gap-3 border-b px-4 py-2.5"
      style={{ borderColor: 'rgb(var(--border))', backgroundColor: 'rgb(var(--surface-sunken))' }}
    >
      <span className="text-sm font-medium">{count} selected</span>
      <div className="flex items-center gap-2">{children}</div>
      <button type="button" onClick={onClear} className="ui-icon-btn ml-auto" aria-label="Clear selection">
        <X size={15} aria-hidden="true" />
      </button>
    </div>
  );
}
