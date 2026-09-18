import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

import { EntityMark } from '../../components/ui/Primitives';
import { OverlayLayerContext } from '../../components/ui/overlayLayer';
import { FeatureCatalog, FeatureFilters, FeatureSaveActions } from './FeatureCatalog';
import { useFeatureCatalog } from './useFeatureCatalog';
import { panelWidthFor } from './featurePanelGeometry';

/**
 * Features, opened over the screen you are on.
 *
 * It was a screen of its own, which meant that switching Sales Orders on
 * from inside a half-typed invoice cost the invoice: the rail navigated,
 * <main> remounted on the new key, and the form came back empty. Now the
 * rail opens this panel instead. The route does not change, the screen
 * underneath stays mounted with every unsaved field intact, and closing the
 * panel is the same as never having opened it.
 *
 * A left-anchored panel, not a dialog and not a right drawer: it starts where
 * the content starts, directly after the rail, and covers about three
 * quarters of the content area — the rail stays visible so the product still
 * looks like the product, and the page underneath stays visible enough to
 * remember what you were doing. Geometry is measured from <main> rather than
 * assumed from rail widths, so a collapsed rail, a phone layout or a header
 * of a different height all just work.
 *
 * Layer: a drawer. Toasts and the command palette outrank it, so ⌘K over an
 * open panel still opens the palette on top.
 */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** The content area, as <main> actually is on screen right now. */
const measureContent = () => {
  const el = document.getElementById('main-content');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
};

const useContentRect = (open) => {
  const [rect, setRect] = useState(null);
  useLayoutEffect(() => {
    if (!open) return undefined;
    const update = () => setRect(measureContent());
    update();
    const el = document.getElementById('main-content');
    const ro = typeof ResizeObserver === 'function' && el ? new ResizeObserver(update) : null;
    ro?.observe(el);
    window.addEventListener('resize', update);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [open]);
  return rect;
};

export default function FeaturesPanel({
  open,
  onClose,
  onNavigate = null,
  currentCompany = null,
  /** The rail button that opened the panel; focus goes back to it on close. */
  returnFocusRef = null,
}) {
  /* Exit is the entrance reversed, over --dur-exit; the timer is the fallback
     for when the animation is skipped (reduced motion, a hidden tab), for the
     reason spelled out in Modal. */
  const [closing, setClosing] = useState(false);
  const beginClose = useCallback(() => setClosing(true), []);
  useEffect(() => {
    if (!closing) return undefined;
    const t = setTimeout(() => onClose?.(), 140);
    return () => clearTimeout(t);
  }, [closing, onClose]);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open && closing) setClosing(false);
  }

  const rect = useContentRect(open);
  const panelRef = useRef(null);
  const searchRef = useRef(null);
  const openedFromRef = useRef(null);

  /* Focus in on open, back out on close — once each, never on re-render. */
  useEffect(() => {
    if (!open) return undefined;
    openedFromRef.current = returnFocusRef?.current || document.activeElement;
    (searchRef.current || panelRef.current)?.focus();
    return () => {
      const back = openedFromRef.current;
      if (back && typeof back.focus === 'function' && document.contains(back)) back.focus();
    };
    // returnFocusRef is a ref: read at the moment of opening, by design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      /*
       * Bubble phase on window, deliberately last in line. Anything that
       * owns Escape more closely has already spoken: a Popover stops the
       * event in document capture, the command palette prevents its default.
       * Both leave nothing for the panel to do, which is the nesting rule —
       * one Escape closes one thing.
       */
      if (e.defaultPrevented) return;
      if (e.key === 'Escape') {
        /* A search with text in it clears on Escape (the browser does that
           for type=search); the panel closes on the next one. */
        if (e.target === searchRef.current && searchRef.current?.value) return;
        beginClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusables = panel.querySelectorAll(FOCUSABLE);
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
    return () => window.removeEventListener('keydown', onKey);
  }, [open, beginClose]);

  if (!open) return null;

  return createPortal(
    <FeaturesPanelBody
      rect={rect}
      closing={closing}
      beginClose={beginClose}
      onClose={onClose}
      onNavigate={onNavigate}
      currentCompany={currentCompany}
      panelRef={panelRef}
      searchRef={searchRef}
    />,
    document.body
  );
}

/* Split so the catalogue's state lives only while the panel is open: closing
   discards an unsaved edit the way leaving the page did, and reopening reads
   the store fresh rather than showing a stale copy. */
const FeaturesPanelBody = ({ rect, closing, beginClose, onClose, onNavigate, currentCompany, panelRef, searchRef }) => {
  const model = useFeatureCatalog(currentCompany);
  const titleId = 'features-panel-title';

  const box = rect || { top: 0, left: 0, width: window.innerWidth, height: window.innerHeight };

  return (
    /* Anything opened from inside the panel is told so, and rises above it. */
    <OverlayLayerContext.Provider value="drawer">
      <div
        className={`ui-feature-scrim ${closing ? 'ui-out-fade' : ''}`}
        style={{ top: box.top, left: box.left, width: box.width, height: box.height, zIndex: 'var(--z-drawer)' }}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) beginClose();
        }}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-closing={closing ? 'true' : undefined}
        className="ui-feature-panel shadow-xl"
        style={{
          top: box.top,
          left: box.left,
          height: box.height,
          width: panelWidthFor(box.width),
          zIndex: 'var(--z-drawer-panel)',
        }}
        onAnimationEnd={(e) => {
          if (closing && e.target === e.currentTarget) onClose?.();
        }}
      >
        <div className="shrink-0 px-4 pt-3 pb-3 space-y-3" style={{ borderBottom: '1px solid rgb(var(--border))' }}>
          {/* Wrapping, not overflowing: at 375px the title, Revert, Save and
              the close button do not fit on one line, and without this the
              close button was laid out past the panel's right edge — off
              screen, on the one layout where Escape is not available. */}
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2 min-h-[2.5rem]">
            <EntityMark entity="settings" />
            <h2 id={titleId} className="ui-t-sec min-w-0">
              Features
            </h2>
            <div className="ms-auto flex flex-wrap items-center justify-end gap-2 min-w-0">
              <FeatureSaveActions model={model} />
              <button type="button" onClick={beginClose} className="ui-icon-btn shrink-0" aria-label="Close Features">
                <X size={18} aria-hidden="true" />
              </button>
            </div>
          </div>
          <FeatureFilters model={model} searchRef={searchRef} />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-3">
          <FeatureCatalog model={model} onNavigate={onNavigate} />
        </div>
      </div>
    </OverlayLayerContext.Provider>
  );
};
