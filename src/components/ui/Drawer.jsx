import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/**
 * A panel that slides in from the right, over whatever is behind it.
 *
 * For settings reached from inside a document. Preferences and custom fields
 * were rendered *inline* in the invoice form — the settings screen appeared
 * stacked in the middle of a half-typed invoice, so the page was two screens
 * at once and neither had the width it needed. A drawer keeps the invoice
 * where it was, visible behind the scrim, and gives the settings a column of
 * their own to be read in.
 *
 * Right-hand side and about two-fifths of the viewport, because the thing
 * being configured is on the left and should stay in view while it is.
 *
 * Portalled to the body: the form it opens from sits inside a scroll container
 * with its own stacking context, and a fixed panel inside one of those is
 * clipped by it.
 */
export default function Drawer({ open, onClose, title, description = '', children, widthClass = 'w-[min(40rem,40vw)]' }) {
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose?.();
        return;
      }
      if (e.key !== 'Tab') return;
      // Keep Tab inside the drawer; the form behind it is still focusable and
      // tabbing into it would edit a document the user cannot currently see.
      const panel = panelRef.current;
      if (!panel) return;
      const focusables = panel.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', onKey, true);
    panelRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="ui-scrim fixed inset-0 z-50 flex justify-end"
      onMouseDown={(e) => {
        // The scrim closes; a click inside the panel does not reach here.
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`ui-surface h-full ${widthClass} max-w-full shadow-xl flex flex-col ui-in-right`}
        style={{ borderInlineStart: '1px solid rgb(var(--border))' }}
      >
        <div
          className="flex items-start justify-between gap-3 px-5 py-4 shrink-0"
          style={{ borderBottom: '1px solid rgb(var(--border))' }}
        >
          <div className="min-w-0">
            <h2 className="ui-t-sec truncate">{title}</h2>
            {description ? <p className="text-sm ui-muted mt-0.5">{description}</p> : null}
          </div>
          <button type="button" onClick={onClose} className="ui-icon-btn shrink-0" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>,
    document.body
  );
}
