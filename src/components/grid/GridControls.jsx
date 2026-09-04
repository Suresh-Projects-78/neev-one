import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bookmark, Check, Pencil, Plus, Save, Trash2, X } from 'lucide-react';

/**
 * The one grid control in a list's toolbar: Layout.
 *
 * This was two buttons — Views and Columns — sitting next to each other and
 * doing halves of the same job. Which columns you want to see is not a
 * separate preference from the view you are working in; it is part of what a
 * view *is*, along with the filters. Splitting them meant configuring a view
 * happened in one popover and half of its content in another, and the Columns
 * button silently detached you from the named view you were in.
 *
 * One button now, with two states: the list of saved views, and an editor for
 * creating one or changing one that exists.
 *
 * Still a popover rather than a modal — choosing what a list shows is a
 * glance-level action and must not cover the table it is configuring.
 */
export default function GridControls({ grid }) {
  const [open, setOpen] = useState(false);
  /** null = the list; otherwise the view being created or edited. */
  const [editor, setEditor] = useState(null);
  const [showColumns, setShowColumns] = useState(false);
  const [pos, setPos] = useState(null);
  const rootRef = useRef(null);
  const btnRef = useRef(null);

  /**
   * The panel is rendered on <body>, not beside the button.
   *
   * The toolbar it sits in is a .ui-card with overflow:hidden, which cut the
   * panel off at the card's edge: the view editor ran to 742px inside a card
   * ending at 515, so its column list and its Save button simply were not
   * there. Positioned from the button's rect instead, and flipped up when
   * there is no room below.
   */
  const place = () => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = 288;
    const pad = 12;
    const vw = window.innerWidth || 1024;
    const vh = window.innerHeight || 768;
    let left = r.right - width;
    left = Math.max(pad, Math.min(left, vw - width - pad));
    setPos({ left, top: r.bottom + 8, maxHeight: Math.max(200, vh - r.bottom - 8 - pad) });
  };

  const close = () => {
    setOpen(false);
    setEditor(null);
    setShowColumns(false);
  };

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      // The panel is portalled to <body>, so it is not inside the trigger's
      // ref: without this check every click on a view, on the name box or on
      // Save counted as a click outside and shut the panel before it acted.
      if (e.target instanceof Element && e.target.closest('[data-views-pop]')) return;
      if (!rootRef.current?.contains(e.target)) close();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const { columns } = grid;

  const startNew = () =>
    setEditor({ originalName: '', name: '', hidden: [...(grid.hidden || [])] });

  const startEdit = (view) =>
    setEditor({
      originalName: view.name,
      name: view.name,
      hidden: Array.isArray(view.hidden) ? [...view.hidden] : [],
    });

  const editorVisible = (key) => {
    const col = columns.find((c) => c.key === key);
    if (col?.always) return true;
    return !(editor?.hidden || []).includes(key);
  };

  const toggleEditorColumn = (key) => {
    const col = columns.find((c) => c.key === key);
    if (col?.always) return;
    setEditor((p) => ({
      ...p,
      hidden: p.hidden.includes(key) ? p.hidden.filter((k) => k !== key) : [...p.hidden, key],
    }));
  };

  const nameRef = useRef(null);
  const editorOpen = Boolean(editor);
  useEffect(() => {
    if (editorOpen) nameRef.current?.focus();
  }, [editorOpen]);

  const submitEditor = (e) => {
    e.preventDefault();
    if (!editor?.name.trim()) return;
    if (grid.upsertView(editor)) close();
  };

  return (
    <div ref={rootRef} className="relative flex items-center gap-2">
      <button
        ref={btnRef}
        type="button"
        onClick={() => {
          if (open) return close();
          place();
          return setOpen(true);
        }}
        className="ui-btn ui-btn-secondary"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Bookmark size={15} aria-hidden="true" />
        Layout
      </button>

      {open && !editor && pos ? createPortal(
        <div
          className="ui-card ui-in-pop fixed z-[120] w-72 overflow-y-auto p-3"
          style={{ left: pos.left, top: pos.top, maxHeight: pos.maxHeight }}
          data-views-pop=""
          role="menu"
        >
          {/*
            The state the list starts in, named.
            It was there all along and had no entry, so the only way back from a
            saved layout was to know that clicking the active one again did
            nothing. A layout you cannot leave is a trap.
          */}
          <ul className="mb-2 max-h-56 overflow-y-auto">
            <li className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  grid.applyView(null);
                  close();
                }}
                className="ui-btn ui-btn-ghost flex-1 !justify-start"
              >
                {!grid.activeView ? <Check size={14} aria-hidden="true" /> : <span className="w-3.5" />}
                <span className="truncate">Default view</span>
              </button>
            </li>
          </ul>

          {grid.views.length === 0 ? (
            <p className="ui-caption px-1 pb-2">
              No saved layouts yet. A layout remembers the columns you want, under a name.
            </p>
          ) : (
            <ul className="mb-2 max-h-56 overflow-y-auto">
              {grid.views.map((v) => (
                <li key={v.name} className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      grid.applyView(v.name);
                      close();
                    }}
                    className="ui-btn ui-btn-ghost flex-1 !justify-start"
                  >
                    {grid.activeView === v.name ? <Check size={14} aria-hidden="true" /> : <span className="w-3.5" />}
                    <span className="truncate">{v.name}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => startEdit(v)}
                    className="ui-icon-btn"
                    aria-label={`Edit layout ${v.name}`}
                    title="Edit"
                  >
                    <Pencil size={14} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => grid.deleteView(v.name)}
                    className="ui-icon-btn"
                    aria-label={`Delete layout ${v.name}`}
                    title="Delete"
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="border-t pt-2" style={{ borderColor: 'rgb(var(--border))' }}>
            <button type="button" onClick={startNew} className="ui-btn ui-btn-ghost w-full !justify-start">
              <Plus size={14} aria-hidden="true" />
              New layout from what is on screen
            </button>

            {/*
              Columns without committing to a name. Saving a view for a column
              you wanted to see once would be a chore, and this is where people
              will now look for the control that used to be its own button.
            */}
            <button
              type="button"
              onClick={() => setShowColumns((v) => !v)}
              className="ui-btn ui-btn-ghost w-full !justify-start"
              aria-expanded={showColumns}
            >
              <span className="w-3.5" />
              {showColumns ? 'Hide column list' : 'Show or hide columns'}
            </button>

            {showColumns ? (
              <ul className="mt-1 max-h-48 overflow-y-auto">
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
                <li className="px-2 pt-1">
                  <button type="button" onClick={grid.resetColumns} className="ui-btn ui-btn-ghost !h-7 !px-2 text-xs">
                    Reset columns
                  </button>
                </li>
              </ul>
            ) : null}
          </div>
        </div>,
        document.body
      ) : null}

      {open && editor && pos ? createPortal(
        <form
          onSubmit={submitEditor}
          className="ui-card ui-in-pop fixed z-[120] w-72 overflow-y-auto p-3"
          style={{ left: pos.left, top: pos.top, maxHeight: pos.maxHeight }}
          data-views-pop=""
          role="dialog"
          aria-label={editor.originalName ? `Edit layout ${editor.originalName}` : 'New layout'}
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="ui-card-label">{editor.originalName ? 'Edit layout' : 'New layout'}</span>
            <button type="button" onClick={() => setEditor(null)} className="ui-icon-btn" aria-label="Back to layouts">
              <X size={14} aria-hidden="true" />
            </button>
          </div>

          <label className="block">
            <span className="ui-t-label">Name</span>
            <input
              type="text"
              value={editor.name}
              onChange={(e) => setEditor((p) => ({ ...p, name: e.target.value }))}
              placeholder="Overdue this month"
              className="ui-input mt-1 !h-8 w-full text-sm"
              ref={nameRef}
            />
          </label>

          <div className="mt-3">
            <span className="ui-t-label">Columns</span>
            <ul className="mt-1 max-h-44 overflow-y-auto">
              {columns.map((c) => (
                <li key={c.key}>
                  <label
                    className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm ${
                      c.always ? 'opacity-50' : 'cursor-pointer'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={editorVisible(c.key)}
                      disabled={Boolean(c.always)}
                      onChange={() => toggleEditorColumn(c.key)}
                      className="ui-checkbox"
                    />
                    {c.label}
                  </label>
                </li>
              ))}
            </ul>
          </div>

          <p className="ui-caption mt-2">
            {editor.originalName
              ? 'Keeps the filters this layout was saved with.'
              : 'Saves the filters currently on screen.'}
          </p>

          <div className="mt-2 flex items-center justify-end gap-2 border-t pt-2" style={{ borderColor: 'rgb(var(--border))' }}>
            <button type="button" onClick={() => setEditor(null)} className="ui-btn ui-btn-ghost ui-btn-sm">
              Cancel
            </button>
            <button type="submit" className="ui-btn ui-btn-primary ui-btn-sm" disabled={!editor.name.trim()}>
              <Save size={14} aria-hidden="true" />
              Save layout
            </button>
          </div>
        </form>,
        document.body
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
