import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * A panel anchored to the control that opened it.
 *
 * The difference from Modal is not decoration, it is how much context the
 * choice destroys. A dialog dims the page, traps the keyboard and hides the
 * row you were reading; that is the right price for a form, and far too high
 * for picking one of three warehouses. This hangs off the trigger, leaves the
 * page lit and readable, and gets out of the way on Escape or the next click
 * anywhere else.
 *
 * Placement is measured, not assumed: it opens downward when there is room and
 * flips above the trigger when there is not, so the panel is never half off
 * the bottom of the window — the failure that makes anchored panels worse than
 * the dialog they replaced.
 */
const GAP = 6;
const MARGIN = 8;
/** Enough rows to be worth opening downward for; below this, prefer the roomier side. */
const MIN_USEFUL = 240;

const Popover = ({ anchorRef, onClose, children, minWidth = 260, maxWidth = 420, labelledBy, onKeyDown }) => {
  const panelRef = useRef(null);
  const returnFocusRef = useRef(null);
  const claimedFocusRef = useRef(false);
  const [pos, setPos] = useState(null);

  // Measure before paint, so the panel never renders once in the wrong place
  // and then jumps.
  useLayoutEffect(() => {
    const place = () => {
      const anchor = anchorRef?.current;
      const panel = panelRef.current;
      if (!anchor || !panel) return;

      const a = anchor.getBoundingClientRect();
      const w = Math.min(Math.max(a.width, minWidth), maxWidth);

      const roomBelow = window.innerHeight - a.bottom - MARGIN;
      const roomAbove = a.top - MARGIN;
      // A long list would rather be tall than be above the control, and it
      // scrolls anyway — so only flip when below is genuinely cramped and above
      // is better. Comparing the panel's natural height instead would send
      // every list of any length upward, which is not a flip, it is a default.
      const wanted = Math.min(panel.scrollHeight, MIN_USEFUL);
      const below = roomBelow >= wanted || roomBelow >= roomAbove;
      const h = Math.min(panel.scrollHeight, below ? roomBelow : roomAbove);

      const top = below ? a.bottom + GAP : Math.max(MARGIN, a.top - h - GAP);
      const left = Math.min(Math.max(MARGIN, a.left), Math.max(MARGIN, window.innerWidth - w - MARGIN));
      const maxHeight = Math.max(140, (below ? roomBelow : roomAbove) - GAP);

      setPos({ top, left, width: w, maxHeight });
    };

    place();
    // Reposition rather than close: a panel that vanishes because the page
    // scrolled a pixel reads as a bug, not as a dismissal.
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [anchorRef, minWidth, maxWidth]);

  useEffect(() => {
    returnFocusRef.current = document.activeElement;

    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose?.();
      }
    };
    const onDown = (e) => {
      const panel = panelRef.current;
      const anchor = anchorRef?.current;
      if (panel?.contains(e.target)) return;
      // Clicking the trigger again is a toggle, and the trigger's own handler
      // owns that. Closing here too would close and immediately reopen.
      if (anchor?.contains(e.target)) return;
      onClose?.();
    };

    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onDown, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onDown, true);
      const back = returnFocusRef.current;
      if (back && typeof back.focus === 'function' && document.contains(back)) back.focus();
    };
  }, [anchorRef, onClose]);

  // Only once the panel has been placed — until then it is still hidden, and a
  // hidden element cannot take focus, so the keyboard would be left behind on
  // the page underneath. Something inside may want the caret first (a search
  // box usually does); the panel claims it only if nothing else did.
  useEffect(() => {
    if (!pos || claimedFocusRef.current) return;
    claimedFocusRef.current = true;
    if (!panelRef.current?.contains(document.activeElement)) {
      panelRef.current?.focus({ preventScroll: true });
    }
  }, [pos]);

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-labelledby={labelledBy}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      className="ui-popover"
      style={
        pos
          ? { top: pos.top, left: pos.left, width: pos.width, maxHeight: pos.maxHeight }
          : { top: 0, left: 0, width: minWidth, visibility: 'hidden' }
      }
    >
      {children}
    </div>,
    document.body
  );
};

export default Popover;
