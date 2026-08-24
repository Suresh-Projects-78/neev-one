import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/**
 * The one dialog in the product.
 *
 * A dialog has to announce itself as one, name itself, take the keyboard when
 * it opens and hand it back when it closes. Without that a screen reader
 * treats it as more page, and a keyboard user carries on tabbing through the
 * list behind it while a form sits open in front.
 */
const Modal = ({ children, onClose, title = 'Form', maxWidthClass = 'max-w-4xl' }) => {
  const panelRef = useRef(null);
  const returnFocusRef = useRef(null);
  const titleId = useId();

  useEffect(() => {
    // Remember where focus was, so closing puts it back on the control that
    // opened this rather than dumping the user at the top of the document.
    returnFocusRef.current = document.activeElement;
    panelRef.current?.focus();

    const onKey = (e) => {
      if (e.key === 'Escape') {
        onClose?.();
        return;
      }
      if (e.key !== 'Tab') return;

      // Keep Tab inside the dialog. Without this the focus ring walks off into
      // the page underneath, which is still there and still focusable.
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

    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      const back = returnFocusRef.current;
      if (back && typeof back.focus === 'function') back.focus();
    };
  }, [onClose]);

  return createPortal(
    <div
      className="ui-scrim fixed inset-0 flex items-center justify-center p-4 z-50"
      onMouseDown={(e) => {
        // Backdrop click closes; clicks inside the panel don't bubble here.
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`ui-surface ui-dialog shadow-xl w-full max-h-[90vh] overflow-y-auto ${maxWidthClass}`}
      >
        <div className="sticky top-0 ui-surface border-b px-6 py-4 flex items-center justify-between gap-3">
          <h2 id={titleId} className="ui-t-sec">
            {title}
          </h2>
          <button type="button" onClick={onClose} className="ui-icon-btn" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>,
    document.body
  );
};

export default Modal;
