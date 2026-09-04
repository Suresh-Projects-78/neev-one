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
export function useListboxKeys({ count, onChoose, onCancel, firstLetter = null, initialIndex = 0 }) {
  const [rawIndex, setActiveIndex] = useState(initialIndex);
  const listRef = useRef(null);

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
      setActiveIndex((i) => (i + step + count) % count);
    },
    [count]
  );

  const onKeyDown = useCallback(
    (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          move(1);
          return;
        case 'ArrowUp':
          e.preventDefault();
          move(-1);
          return;
        case 'Home':
          e.preventDefault();
          setActiveIndex(0);
          return;
        case 'End':
          e.preventDefault();
          setActiveIndex(Math.max(0, count - 1));
          return;
        case 'PageDown':
          e.preventDefault();
          setActiveIndex((i) => Math.min(count - 1, i + 10));
          return;
        case 'PageUp':
          e.preventDefault();
          setActiveIndex((i) => Math.max(0, i - 10));
          return;
        case 'Enter':
          e.preventDefault();
          if (count) onChoose?.(activeIndex);
          return;
        case 'Escape':
          e.preventDefault();
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
          setActiveIndex(i);
          return;
        }
      }
    },
    [activeIndex, count, firstLetter, move, onCancel, onChoose]
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
