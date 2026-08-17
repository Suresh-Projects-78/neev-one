import { useEffect, useState } from 'react';

/**
 * Resolves the design tokens into concrete colours for ECharts.
 *
 * ECharts takes colour strings, not CSS custom properties, so the tokens have
 * to be read off the document. Re-read when `data-theme` changes, otherwise a
 * chart keeps light-mode colours after the user switches to dark — the one
 * thing that makes charts look bolted on rather than part of the product.
 */

const readVar = (name, fallback) => {
  if (typeof document === 'undefined') return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!raw) return fallback;
  // Tokens are stored as "R G B" triplets so they can carry an alpha at use.
  return /^\d+\s+\d+\s+\d+$/.test(raw) ? `rgb(${raw.split(/\s+/).join(',')})` : raw;
};

const build = () => ({
  brand: readVar('--brand', '#F97316'),
  info: readVar('--info', '#2563EB'),
  pos: readVar('--pos', '#16A34A'),
  neg: readVar('--neg', '#DC2626'),
  warn: readVar('--warn', '#F59E0B'),
  fg: readVar('--fg', '#111827'),
  muted: readVar('--fg-muted', '#6B7280'),
  subtle: readVar('--fg-subtle', '#9CA3AF'),
  surface: readVar('--surface', '#FFFFFF'),
  sunken: readVar('--surface-sunken', '#F8FAFC'),
  border: readVar('--border', '#E5E7EB'),
});

export function useChartTheme() {
  const [theme, setTheme] = useState(build);

  useEffect(() => {
    const refresh = () => setTheme(build());
    refresh();

    const obs = new MutationObserver(refresh);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);

  return theme;
}

/** Shared tooltip styling so every chart in the product reads the same. */
export const tooltipStyle = (t) => ({
  backgroundColor: t.surface,
  borderColor: t.border,
  borderWidth: 1,
  padding: [8, 12],
  textStyle: { color: t.fg, fontSize: 12, fontFamily: 'Inter, sans-serif' },
  extraCssText: 'border-radius:10px;box-shadow:0 10px 24px -6px rgba(17,24,39,.18);',
});

/**
 * Respect the user's motion preference. ECharts animates by default; someone
 * who has asked for less movement should get the final state immediately.
 */
export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
