import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bookmark } from 'lucide-react';

/**
 * The one grid control in a list's toolbar: Layout.
 *
 * It is a column chooser and nothing else — every column the list can show,
 * each with a checkbox, and a way back to the default set.
 *
 * It used to be a saved-views feature: name an arrangement, store it with the
 * filters that were on screen, edit it, delete it, and pick between them. That
 * is a bigger idea than the job, and it put four controls and an explanation
 * in front of the thing people actually came for, which is to turn a column
 * off. Naming and storing arrangements is gone; what is left is the list.
 *
 * Columns marked `always` — the identity column and the row actions — are
 * shown greyed and cannot be turned off, because a row with no way to tell
 * which record it is is not a shorter row, it is a broken one.
 */
export default function GridControls({ grid }) {
  const columns = grid.columns || [];
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const rootRef = useRef(null);

  /*
   * Placed against the viewport rather than inside the toolbar.
   *
   * The toolbar sits in a scroll container with its own stacking context, so
   * an absolutely positioned panel was clipped by it. Portalled to the body
   * and given fixed coordinates, it can hang past the edge of its parent the
   * way a menu is supposed to.
   */
  const place = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const width = 288;
    const gap = 6;
    const left = Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8));
    const top = r.bottom + gap;
    setPos({ left, top, maxHeight: Math.max(180, window.innerHeight - top - 12) });
  };

  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (rootRef.current?.contains(e.target)) return;
      if (e.target.closest?.('[data-layout-pop]')) return;
      close();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') close();
    };
    const onMove = () => place();
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
    };
  }, [open]);

  const hiddenCount = columns.filter((c) => !c.always && !grid.isVisible(c.key)).length;

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
        {/* How many are off, so a list missing a column says so on the button
            rather than leaving somebody to wonder where it went. */}
        {hiddenCount ? (
          <span
            className="ui-mono text-xs rounded-full px-1.5"
            style={{ backgroundColor: 'rgb(var(--surface-sunken))', color: 'rgb(var(--fg))' }}
          >
            {hiddenCount}
          </span>
        ) : null}
      </button>

      {open && pos
        ? createPortal(
            <div
              className="ui-card ui-in-pop fixed z-[120] w-72 overflow-y-auto p-2"
              style={{ left: pos.left, top: pos.top, maxHeight: pos.maxHeight }}
              data-layout-pop=""
              role="menu"
            >
              <div className="ui-caption px-2 pb-1.5">Columns</div>

              <ul>
                {columns.map((c) => (
                  <li key={c.key}>
                    <label
                      className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm ${
                        c.always ? 'opacity-50' : 'cursor-pointer ui-hover-sunken'
                      }`}
                      title={c.always ? 'This column cannot be hidden' : undefined}
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

              <div className="mt-1 border-t pt-1" style={{ borderColor: 'rgb(var(--border))' }}>
                <button
                  type="button"
                  onClick={grid.resetColumns}
                  className="ui-btn ui-btn-ghost w-full !justify-start"
                  disabled={!hiddenCount}
                >
                  Show every column
                </button>
              </div>
            </div>,
            document.body
          )
        : null}
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
      style={{ backgroundColor: 'rgb(var(--accent-soft))', borderColor: 'rgb(var(--border))' }}
    >
      <span className="text-sm font-medium">{count} selected</span>
      <div className="ms-auto flex items-center gap-2">{children}</div>
      <button type="button" onClick={onClear} className="ui-btn ui-btn-ghost ui-btn-sm">
        Clear
      </button>
    </div>
  );
}
