import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The keyboard contract every list in this product answers to.
 *
 * Four pickers had grown independently — customer, vendor, item, account —
 * and none of them handled an arrow key. The behaviour below is one
 * implementation of the sheet's requirements 4 to 8 and 24 to 28, so a person
 * who learns it on the customer field already knows the item field.
 *
 *   ↑ ↓            walk the list, wrapping at both ends
 *   Home / End     first and last
 *   PageUp/Down    ten at a time
 *   Enter          take the highlighted row
 *   Tab            take the highlighted row and carry on to the next field
 *   Escape         leave without changing anything
 *   a–z, 0–9       jump to the next row starting with that character
 *
 * Wrapping rather than stopping at the ends is deliberate: a list you can
 * walk off the bottom of makes you look at the screen to find out where you
 * are, which is the thing this exists to avoid.
 *
 * @param count      how many rows are currently shown
 * @param onChoose   called with the highlighted index when Enter is pressed
 * @param onCancel   called on Escape
 * @param firstLetter optional (index) => string, for first-letter jumps
 */
export function useListboxKeys({
  count,
  onChoose,
  onCancel,
  firstLetter = null,
  initialIndex = 0,
  chooseOnTab = true,
  onTabOut = null,
}) {
  const [rawIndex, setActiveIndex] = useState(initialIndex);
  const listRef = useRef(null);
  /*
   * Whether the person has actually driven the cursor in this list.
   *
   * Tab may only commit a highlight somebody chose. On a freshly opened list
   * the cursor sits on row 0 by default, and treating Tab as "take row 0"
   * would put an item nobody picked onto the invoice — silently, on the key
   * people press to leave a field. Untouched, Tab just leaves.
   */
  const movedRef = useRef(false);

  /*
   * A list that shrinks under the cursor — because someone typed another
   * letter — must not leave the highlight pointing past the end.
   *
   * Clamped on read rather than corrected in an effect: an effect would
   * render one frame with the stale index, which is exactly the frame where
   * Enter arrives and takes the wrong row.
   */
  const activeIndex = count === 0 ? 0 : Math.min(Math.max(0, rawIndex), count - 1);

  // Keep the highlighted row on screen when the arrows walk past the fold.
  useEffect(() => {
    const row = listRef.current?.querySelector('[data-active="true"]');
    row?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const move = useCallback(
    (step) => {
      if (!count) return;
      movedRef.current = true;
      setActiveIndex((i) => (i + step + count) % count);
    },
    [count]
  );

  const onKeyDown = useCallback(
    (e) => {
      // Alt+Up closes an open list, the mirror of the Alt+Down that opened it.
      if (e.altKey && e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        onCancel?.();
        return;
      }
      if (e.altKey || e.ctrlKey || e.metaKey) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          e.stopPropagation();
          move(1);
          return;
        case 'ArrowUp':
          e.preventDefault();
          e.stopPropagation();
          move(-1);
          return;
        case 'Home':
          e.preventDefault();
          e.stopPropagation();
          movedRef.current = true;
          setActiveIndex(0);
          return;
        case 'End':
          e.preventDefault();
          e.stopPropagation();
          movedRef.current = true;
          setActiveIndex(Math.max(0, count - 1));
          return;
        case 'PageDown':
          e.preventDefault();
          e.stopPropagation();
          movedRef.current = true;
          setActiveIndex((i) => Math.min(count - 1, i + 10));
          return;
        case 'PageUp':
          e.preventDefault();
          e.stopPropagation();
          movedRef.current = true;
          setActiveIndex((i) => Math.max(0, i - 10));
          return;
        case 'Enter':
          e.preventDefault();
          e.stopPropagation();
          if (count) onChoose?.(activeIndex);
          return;
        case 'Tab':
          /*
           * Tab commits the highlight and moves on, which is how every field
           * in a document is left. It used to fall straight through: the list
           * ignored it, the browser moved focus to wherever the panel happened
           * to sit in the document, and the keystroke also reached the form
           * behind — which is how pressing Tab on an open dropdown ended up
           * adding a line to the item grid.
           *
           * Shift+Tab is left alone: going backwards out of a list should not
           * silently choose something on the way.
           */
          if (e.shiftKey || !chooseOnTab) return;
          e.preventDefault();
          e.stopPropagation();
          if (count && movedRef.current) onChoose?.(activeIndex);
          else (onTabOut || onCancel)?.();
          return;
        case 'Escape':
          e.preventDefault();
          e.stopPropagation();
          onCancel?.();
          return;
        default:
          break;
      }

      /*
       * First-letter jump, but only where there is no search box taking the
       * keystroke — otherwise typing "r" would both filter the list and move
       * the cursor, and the two would fight. Callers that render a search
       * input simply pass no `firstLetter`.
       */
      if (!firstLetter) return;
      if (e.key.length !== 1 || !/[a-z0-9]/i.test(e.key)) return;
      const ch = e.key.toLowerCase();
      for (let n = 1; n <= count; n += 1) {
        const i = (activeIndex + n) % count;
        if (String(firstLetter(i) || '').trim().toLowerCase().startsWith(ch)) {
          e.preventDefault();
          movedRef.current = true;
          setActiveIndex(i);
          return;
        }
      }
    },
    [activeIndex, chooseOnTab, count, firstLetter, move, onCancel, onChoose, onTabOut]
  );

  return { activeIndex, setActiveIndex, listRef, onKeyDown };
}

/**
 * Opening a closed dropdown from the keyboard.
 *
 * Alt+↓ and F4 are what an accounting operator's hands already know — F4 from
 * every Windows combo box for the last thirty years, Alt+↓ from every browser
 * since. Enter and Space are there because the trigger is a button and a
 * button should behave like one.
 */
export function openOnKey(open) {
  return (e) => {
    if (e.key === 'F4' || (e.altKey && e.key === 'ArrowDown')) {
      e.preventDefault();
      open();
      return;
    }
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      open();
    }
  };
}

export default useListboxKeys;

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Where focus goes when a picker closes.
 *
 * Cancelling belongs on the trigger: nothing was chosen, so the hands are
 * still on that field. Choosing belongs on the *next* control, because
 * picking is the end of that field's business — the next thing anybody types
 * is the description, or the quantity, or whatever follows.
 *
 * Every picker used to return focus to the trigger in both cases, which is
 * what "tab is not selecting properly" was describing: Tab chose the row, the
 * dialog closed, focus snapped back to the field it had just left, and the
 * keystroke looked like it had been swallowed.
 *
 * The search is scoped to the line first, then the form, so a picker sitting
 * in a table row advances along the row rather than jumping to whatever the
 * document happens to hold next.
 */
export function focusNextAfter(trigger) {
  if (!trigger) return;
  const scope =
    trigger.closest('[data-line-row]') || trigger.closest('tr') || trigger.closest('form') || document.body;
  const focusables = Array.from(scope.querySelectorAll(FOCUSABLE)).filter(
    (el) => el === trigger || el.offsetParent !== null
  );
  const at = focusables.indexOf(trigger);
  const next = at >= 0 ? focusables[at + 1] : null;
  (next || trigger).focus({ preventScroll: true });
}
