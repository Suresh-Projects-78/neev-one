import { useEffect, useRef, useState } from 'react';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Animates a number towards its target on change.
 *
 * When the user prefers reduced motion the target is returned directly, so the
 * figure is always readable rather than caught mid-count. The animation is
 * interruptible: a new target cancels the previous run and continues from
 * wherever it had reached, so rapid updates never queue up or fight each other.
 */
export const useCountUp = (target, { duration = 650 } = {}) => {
  const end = Number.isFinite(Number(target)) ? Number(target) : 0;
  // Read once on mount: this drives whether the hook animates at all.
  const [reduced] = useState(prefersReducedMotion);
  // Start from zero on mount so the figure counts in on first paint, then
  // animates from wherever it stands whenever the target changes.
  const [value, setValue] = useState(() => (prefersReducedMotion() ? end : 0));
  const frame = useRef(0);
  const from = useRef(prefersReducedMotion() ? end : 0);

  useEffect(() => {
    if (reduced) return undefined;

    cancelAnimationFrame(frame.current);
    const start = performance.now();
    const origin = from.current;
    const delta = end - origin;

    const tick = (now) => {
      const t = duration > 0 ? Math.min(1, (now - start) / duration) : 1;
      // Decelerating: the number is arriving at rest.
      const eased = 1 - Math.pow(1 - t, 3);
      const next = origin + delta * eased;
      from.current = t < 1 ? next : end;
      setValue(t < 1 ? next : end);
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };

    frame.current = requestAnimationFrame(tick);
    // Hidden tabs never fire animation frames, and a tile mounted while the
    // tab is backgrounded would sit on 0 until the next target change. The
    // timer is the guarantee the figure lands; the frames are only the show.
    const settle = setTimeout(() => {
      cancelAnimationFrame(frame.current);
      from.current = end;
      setValue(end);
    }, duration + 100);
    return () => {
      cancelAnimationFrame(frame.current);
      clearTimeout(settle);
    };
  }, [end, duration, reduced]);

  return reduced ? end : value;
};
