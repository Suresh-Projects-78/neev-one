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
  brand: readVar('--brand', '#171717'),
  accent: readVar('--accent', '#171717'),
  brandDeep: readVar('--brand-deep', '#334155'),
  info: readVar('--info', '#2563EB'),
  pos: readVar('--pos', '#047857'),
  neg: readVar('--neg', '#B91C1C'),
  warn: readVar('--warn', '#B45309'),
  fg: readVar('--fg', '#0F172A'),
  muted: readVar('--fg-muted', '#475569'),
  subtle: readVar('--fg-subtle', '#64748B'),
  surface: readVar('--surface', '#FFFFFF'),
  sunken: readVar('--surface-sunken', '#F8FAFC'),
  border: readVar('--border', '#E2E8F0'),
  // The categorical overview palette, so a chart on a module overview uses the
  // same blue and green as the cards above it rather than a second set.
  ovBlue: readVar('--ov-blue', '#3B82F6'),
  ovGreen: readVar('--ov-green', '#0F766E'),
  ovAmber: readVar('--ov-amber', '#D97706'),
  ovViolet: readVar('--ov-violet', '#7C3AED'),
  ovRed: readVar('--ov-red', '#B91C1C'),
  ovOrange: readVar('--ov-orange', '#D97706'),
  /* Graphite and its second voice. An overview chart is drawn in the colours
     of the cards above it, and on the dashboards those are no longer the
     categorical six. */
  chartBlue: readVar('--chart-blue', '#3B82F6'),
  chartTeal: readVar('--chart-teal', '#0F766E'),
  chartMauve: readVar('--chart-mauve', '#7C3AED'),
  chartPurple: readVar('--chart-purple', '#7C3AED'),
  chartGold: readVar('--chart-gold', '#D97706'),
  chartClay: readVar('--chart-clay', '#D97706'),
  chartSlate: readVar('--chart-slate', '#334155'),
  chartMuted: readVar('--chart-muted', '#94A3B8'),
});

/**
 * A colour ECharts can actually paint.
 *
 * Pages hand the charts palette entries like `rgb(var(--ov-blue))`, which is a
 * valid colour in CSS and meaningless as an SVG `fill` attribute — ECharts
 * wrote it through verbatim and the donut on every module overview rendered
 * its centre label over an invisible ring. Anything without a `var()` is
 * already a colour and passes through untouched.
 */
export const resolveTokenColor = (value, fallback = '#94A3B8') => {
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  const m = raw.match(/var\(\s*(--[\w-]+)\s*\)/);
  if (!m) return raw;
  return readVar(m[1], fallback);
};

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
