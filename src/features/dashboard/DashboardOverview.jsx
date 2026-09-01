import React, { Suspense, lazy, useMemo, useState } from 'react';
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Building2,
  CircleSlash,
  FileText,
  Minus,
  Plus,
  Receipt,
  TrendingUp,
  Wallet,
} from 'lucide-react';

import { formatMoney, formatMoneyCompact } from '../../utils/money';
import ChartCard from '../../components/charts/ChartCard';
import { useChartTheme } from '../../components/charts/useChartTheme';
import { useFeatures } from '../../permissions/useFeatures';
import { useTilt } from '../../components/ui/useTilt';
/**
 * ECharts is ~2 MB unminified and belongs nowhere near first paint. Loading the
 * chart module on demand keeps the initial bundle for the shell and the tables,
 * and the dashboard shows a shaped placeholder for the few hundred milliseconds
 * it takes to arrive.
 */
const CircularCharts = {
  ChartLegend: lazy(() => import('../../components/charts/CircularCharts').then((m) => ({ default: m.ChartLegend }))),
  CompositionPie: lazy(() => import('../../components/charts/CircularCharts').then((m) => ({ default: m.CompositionPie }))),
  DonutChart: lazy(() => import('../../components/charts/CircularCharts').then((m) => ({ default: m.DonutChart }))),
  RadialGauge: lazy(() => import('../../components/charts/CircularCharts').then((m) => ({ default: m.RadialGauge }))),
  PeriodBars: lazy(() => import('../../components/charts/CircularCharts').then((m) => ({ default: m.PeriodBars }))),
  RankedBars: lazy(() => import('../../components/charts/CircularCharts').then((m) => ({ default: m.RankedBars }))),
};
const { ChartLegend, CompositionPie, DonutChart, RadialGauge, PeriodBars, RankedBars } = CircularCharts;

/** Reserves the chart's height so nothing below it jumps when it arrives. */
const ChartFallback = ({ height = 220 }) => (
  <div className="ui-skel w-full" style={{ height, borderRadius: 'var(--radius)' }} aria-hidden="true" />
);
import { PageHeader, EmptyState } from '../../components/ui/Primitives';
import {
  cashPosition,
  receivables as receivablesAsOf,
  payables as payablesAsOf,
  gstPosition,
  setupGaps,
  AGEING_BUCKETS,
} from '../../utils/cashPosition';
import { useCountUp } from '../../components/ui/useCountUp';

/**
 * The dashboard.
 *
 * Built around the three questions a proprietor actually opens the books to
 * ask — what did we bill, what have we collected, and who owes us — rather
 * than a grid of every number the database can produce. Each block answers one
 * of them, in that order.
 *
 * The chart and the aging bar are hand-drawn SVG rather than a charting
 * library: both are simple shapes, and a 90 KB dependency for two of them
 * would cost more on first paint than it returns.
 */

const DAY = 86_400_000;

const toDate = (v) => {
  const d = new Date(`${String(v || '').slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
};

const num = (v) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const RANGES = [
  { key: '30', label: '30 days', days: 30 },
  { key: '90', label: '90 days', days: 90 },
  { key: '365', label: '12 months', days: 365 },
  { key: 'all', label: 'All time', days: null },
];

/** Percentage change, guarding the divide-by-zero that a first period always is. */
const delta = (current, previous) => {
  if (!previous) return current > 0 ? null : 0; // null = "no basis to compare"
  return ((current - previous) / previous) * 100;
};

/** Direction chip. Colour never carries the meaning alone — the arrow does too. */
/**
 * The shape of a number, at table scale.
 *
 * A change of +179% could be a steady climb or one lumpy week, and the
 * percentage cannot tell you which. Twenty-four pixels of line can.
 */
/** Absolute movement, for figures that can be negative on either side. */
function DiffChip({ value, company, invert = false }) {
  const v = Math.round(value);
  if (v === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[0.8125rem] font-medium" style={{ color: 'rgb(var(--fg-muted))' }}>
        <Minus size={13} aria-hidden="true" />
        Flat
      </span>
    );
  }
  const rose = v > 0;
  const good = invert ? !rose : rose;
  const Icon = rose ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className="inline-flex items-center gap-1 text-[0.8125rem] font-medium"
      style={{ color: good ? 'rgb(var(--pos))' : 'rgb(var(--neg))' }}
    >
      <Icon size={13} aria-hidden="true" />
      {formatMoney(Math.abs(v), company)}
    </span>
  );
}

/** Difference between two rates, in points — never as a percentage of itself. */
function PointsChip({ value, invert = false }) {
  const v = Math.round(value);
  if (v === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[0.8125rem] font-medium" style={{ color: 'rgb(var(--fg-muted))' }}>
        <Minus size={13} aria-hidden="true" />
        Flat
      </span>
    );
  }
  const rose = v > 0;
  const good = invert ? !rose : rose;
  const Icon = rose ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className="inline-flex items-center gap-1 text-[0.8125rem] font-medium"
      style={{ color: good ? 'rgb(var(--pos))' : 'rgb(var(--neg))' }}
    >
      <Icon size={13} aria-hidden="true" />
      {Math.abs(v)} pts
    </span>
  );
}

function MiniSpark({ series = [] }) {
  const path = useMemo(() => {
    if (series.length < 2) return '';
    const max = Math.max(...series, 1);
    const step = 100 / (series.length - 1);
    return series
      .map((v, i) => `${i === 0 ? 'M' : 'L'} ${(i * step).toFixed(2)} ${(20 - (v / max) * 18).toFixed(2)}`)
      .join(' ');
  }, [series]);

  if (!path) return null;
  return (
    <svg viewBox="0 0 100 20" preserveAspectRatio="none" className="h-5 w-full" aria-hidden="true">
      <path d={path} fill="none" stroke="rgb(var(--brand))" strokeWidth="1.75" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function DeltaChip({ value, invert = false }) {
  if (value === null) {
    return <span className="ui-badge ui-badge-neutral">New</span>;
  }

  const rounded = Math.round(value * 10) / 10;
  const flat = Math.abs(rounded) < 0.1;
  // Two independent things, and they must not be conflated: the arrow shows
  // which way the number moved, the colour says whether that is welcome. A
  // rise in money owed points UP and is coloured bad — showing a down arrow
  // for it, as this did, reads as "outstanding fell" when it doubled.
  const rose = rounded > 0;
  const good = invert ? !rose : rose;
  const Icon = flat ? Minus : rose ? ArrowUpRight : ArrowDownRight;

  return (
    <span
      className="inline-flex items-center gap-1 text-[0.8125rem] font-medium"
      style={{ color: flat ? 'rgb(var(--fg-muted))' : good ? 'rgb(var(--pos))' : 'rgb(var(--neg))' }}
    >
      <Icon size={13} aria-hidden="true" />
      {flat ? 'Flat' : `${Math.abs(rounded)}%`}
    </span>
  );
}

/**
 * KPI card.
 *
 * Small title, large number, tiny trend, sparkline, one action. Deliberately
 * no icon: an icon beside "Billed" tells the reader nothing the word did not,
 * and four of them across a row is decoration competing with the figures.
 *
 * The figure is neutral, not coloured. Colour on the number would say the
 * amount itself is good or bad; only the movement can carry that, so only the
 * trend chip is tinted.
 */
/**
 * A balance card: what is true right now.
 *
 * Distinct from MetricCard, which reports a flow over the selected period.
 * The distinction is on the card itself — "as of today" — because the period
 * control sits directly above these and would otherwise appear to govern them.
 */
function BalanceCard({ label, value, company, tone = '', hint, note, accent, actionLabel, onAction, children }) {
  const rail = { neg: 'var(--neg)', warn: 'var(--warn)', pos: 'var(--pos)', brand: 'var(--brand)' }[accent];
  return (
    <div className="ui-card p-4 flex flex-col gap-1 relative overflow-hidden">
      {rail ? (
        <span aria-hidden="true" className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ backgroundColor: `rgb(${rail})` }} />
      ) : null}
      <div className={`flex items-baseline justify-between gap-2 ${rail ? 'pl-1' : ''}`}>
        <span className="ui-card-label">{label}</span>
        <span className="ui-subtle text-[11px]">as of today</span>
      </div>
      <div
        className={`ui-mono text-[1.55rem] font-semibold leading-9 ${rail ? 'pl-1' : ''}`}
        style={tone ? { color: `rgb(var(--${tone}))` } : undefined}
      >
        {value === null ? <span className="ui-subtle font-normal">—</span> : formatMoney(value, company)}
      </div>
      {hint ? <div className={`ui-subtle text-xs ${rail ? 'pl-1' : ''}`}>{hint}</div> : null}
      {note ? (
        <div className={`text-xs font-medium ${rail ? 'pl-1' : ''}`} style={{ color: `rgb(var(--${tone || 'fg-muted'}))` }}>
          {note}
        </div>
      ) : null}
      {children ? <div className={rail ? 'pl-1' : ''}>{children}</div> : null}
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className={`ui-btn ui-btn-ghost ui-btn-sm self-start mt-auto pt-2 !px-0 ${rail ? 'ml-1' : ''}`}
          style={{ color: 'rgb(var(--brand-ink))' }}
        >
          {actionLabel} <ArrowRight size={13} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

/** The ageing bar. A stacked bar, never a pie: proportion off a bar is read, off a pie it is guessed. */
function AgeingBar({ buckets, total, company, onPick }) {
  const tones = { pos: 'var(--pos)', warn: 'var(--warn)', accent: 'var(--brand)', accent2: '234 88 12', neg: 'var(--neg)' };
  if (total <= 0) return null;
  return (
    <div className="mt-2">
      <div className="flex h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'rgb(var(--surface-sunken))' }}>
        {AGEING_BUCKETS.map((b) => {
          const amt = buckets[b.key] || 0;
          if (amt <= 0) return null;
          return (
            <span
              key={b.key}
              style={{ width: `${(amt / total) * 100}%`, backgroundColor: `rgb(${tones[b.tone]})` }}
              title={`${b.label} — ${formatMoney(amt, company)}`}
            />
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
        {AGEING_BUCKETS.filter((b) => (buckets[b.key] || 0) > 0).map((b) => (
          <button
            key={b.key}
            type="button"
            onClick={onPick ? () => onPick(b) : undefined}
            className="inline-flex items-center gap-1.5 text-[11.5px]"
            style={{ color: 'rgb(var(--fg-muted))', background: 'none', border: 0, padding: 0, cursor: onPick ? 'pointer' : 'default' }}
          >
            <span className="inline-block w-2 h-2 rounded-sm" style={{ backgroundColor: `rgb(${tones[b.tone]})` }} aria-hidden="true" />
            {b.label} <b className="ui-mono" style={{ color: 'rgb(var(--fg))' }}>{formatMoney(buckets[b.key], company)}</b>
          </button>
        ))}
      </div>
    </div>
  );
}

function MetricCard({ label, value, company, deltaValue, invertDelta, hint, series = [], actionLabel, onAction }) {
  const counted = useCountUp(value);
  // Three degrees, no more: the figure lifts 18px above the card so the
  // number — the point of the tile — is what the depth showcases.
  const { ref: tiltRef, onPointerMove: tiltMove, onPointerLeave: tiltLeave } = useTilt({ maxDeg: 3, scale: 1.008 });

  const path = useMemo(() => {
    if (series.length < 2) return '';
    const max = Math.max(...series, 1);
    const step = 100 / (series.length - 1);
    return series
      .map((v, i) => `${i === 0 ? 'M' : 'L'} ${(i * step).toFixed(2)} ${(24 - (v / max) * 22).toFixed(2)}`)
      .join(' ');
  }, [series]);

  return (
    <article
      ref={tiltRef}
      onPointerMove={tiltMove}
      onPointerLeave={tiltLeave}
      className="ui-tilt3d ui-card ui-hover-raise p-6 flex flex-col"
    >
      <h3 className="ui-card-label">{label}</h3>

      {/* Compact at a glance; the exact figure is one hover away and lives in
          full in the tables below. */}
      <p className="ui-kpi ui-depth-1 mt-3" title={formatMoney(counted, company)}>
        {formatMoneyCompact(counted, company)}
      </p>

      <div className="mt-3 flex items-center gap-2">
        <DeltaChip value={deltaValue} invert={invertDelta} />
        {hint ? <span className="ui-caption truncate">{hint}</span> : null}
      </div>

      {path ? (
        <svg
          className="mt-5 w-full"
          height="24"
          viewBox="0 0 100 24"
          preserveAspectRatio="none"
          aria-hidden="true"
          focusable="false"
        >
          <path
            d={path}
            fill="none"
            stroke="rgb(var(--brand))"
            strokeWidth="1.5"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      ) : null}

      {actionLabel ? (
        <button type="button" onClick={onAction} className="ui-card-action mt-5 self-start">
          {actionLabel}
          <ArrowRight size={13} aria-hidden="true" />
        </button>
      ) : null}
    </article>
  );
}

/** Billed vs collected over time, as two stacked areas. */
function RevenueChart({ buckets, company }) {
  const max = Math.max(...buckets.map((b) => b.billed), 1);
  const w = 100;
  const h = 40;

  const line = (key) => {
    if (buckets.length < 2) return '';
    const step = w / (buckets.length - 1);
    return buckets
      .map((b, i) => `${i === 0 ? 'M' : 'L'} ${(i * step).toFixed(2)} ${(h - (b[key] / max) * (h - 4)).toFixed(2)}`)
      .join(' ');
  };

  const area = (key) => {
    const l = line(key);
    return l ? `${l} L ${w} ${h} L 0 ${h} Z` : '';
  };

  // Chart only — ChartCard supplies the surface, the title and the footer.
  // Keeping a card in here as well produced a tile inside a tile with the
  // heading printed twice.
  return (
    <div>
      <header className="flex flex-wrap items-center justify-end gap-3">
        <div className="flex items-center gap-4 text-xs">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: 'rgb(var(--brand))' }} />
            Billed
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: 'rgb(var(--pos))' }} />
            Collected
          </span>
        </div>
      </header>

      {buckets.length < 2 ? (
        <EmptyState
          title="Not enough history yet"
          description="Once there are invoices across more than one period, the trend appears here."
        />
      ) : (
        <>
          <svg
            className="mt-5 w-full"
            height="180"
            viewBox={`0 0 ${w} ${h}`}
            preserveAspectRatio="none"
            role="img"
            aria-label={`Billed against collected across ${buckets.length} periods. Highest billed ${formatMoney(max, company)}.`}
          >
            <path d={area('billed')} fill="rgb(var(--brand) / 0.14)" />
            <path d={line('billed')} fill="none" stroke="rgb(var(--brand))" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
            <path d={area('collected')} fill="rgb(var(--pos) / 0.12)" />
            <path d={line('collected')} fill="none" stroke="rgb(var(--pos))" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          </svg>

          {/* A chart is not readable by a screen reader; the same figures are
              available as text underneath it. */}
          <ul className="mt-3 flex justify-between text-[0.6875rem] ui-subtle">
            {buckets.map((b) => (
              <li key={b.label}>{b.label}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/** Receivables by how overdue they are — the question behind "who owes us". */
function AgingPanel({ buckets, total, company }) {
  const rows = buckets.filter((b) => b.amount > 0).map((b) => ({ name: b.label, value: b.amount, color: b.color }));

  return (
    <section className="ui-card p-5">
      <h2 className="ui-title text-sm">Outstanding by age</h2>
      <p className="ui-subtle text-xs mt-0.5">Where the receivable book is sitting</p>

      {total <= 0 ? (
        <EmptyState icon={CircleSlash} title="Nothing outstanding" description="Every invoice in view is settled." />
      ) : (
        <>
          <Suspense fallback={<ChartFallback height={220} />}>
            <DonutChart
              data={rows}
              centerLabel="Outstanding"
              centerValue={formatMoney(total, company)}
              height={220}
            />
          </Suspense>
          {/* The ring shows shape; these carry the figures it cannot. */}
          <div className="mt-4">
            <Suspense fallback={<ChartFallback height={96} />}>
              <ChartLegend rows={rows} total={total} formatter={(v) => formatMoney(v, company)} />
            </Suspense>
          </div>
        </>
      )}
    </section>
  );
}

/**
 * Customer concentration.
 *
 * Ranked bars answer "who owes most"; the share of the whole answers "how
 * exposed are we to one customer", which is the question that changes a
 * decision. Capped at five slices plus an "Other".
 */
function TopCustomers({ rows, company }) {
  return (
    <section className="ui-card p-5">
      <h2 className="ui-title text-sm">Where the money is owed</h2>
      <p className="ui-subtle text-xs mt-0.5">Share of outstanding, by customer</p>

      {rows.length === 0 ? (
        <EmptyState icon={Wallet} title="Nobody owes you" description="Outstanding balances appear here as invoices go unpaid." />
      ) : (
        <div className="mt-4">
          <Suspense fallback={<ChartFallback height={320} />}>
            <CompositionPie
              data={rows.map((r) => ({ name: r.name, value: r.outstanding }))}
              height={220}
              formatter={(v) => formatMoney(v, company)}
            />
          </Suspense>
        </div>
      )}
    </section>
  );
}

export default function DashboardOverview({
  db,
  currentCompany,
  branches = [],
  onNewInvoice,
  onOpenInvoices,
  onOpenReceipts,
  onOpenCustomers,
  onOpenBranches,
  branchFilterLabel = 'All',
  invoices: invoicesProp = null,
  onOpenPurchases,
}) {
  const [rangeKey, setRangeKey] = useState('90');
  const range = RANGES.find((r) => r.key === rangeKey) || RANGES[1];
  // Chart slice colours resolved to concrete rgb() strings: ECharts writes
  // them into SVG *attributes*, where a var() reference is not reliably
  // resolved across browsers. The hook also re-resolves on theme switch.
  const chartTheme = useChartTheme();
  const { isEnabled } = useFeatures();

  const allInvoices = useMemo(() => {
    if (Array.isArray(invoicesProp)) return invoicesProp;
    return (Array.isArray(db?.invoices) ? db.invoices : []).filter((i) => i.companyId === currentCompany?.id);
  }, [invoicesProp, db, currentCompany]);

  /**
   * The same rule the money-out stream already applies: a draft is an
   * intention, not a liability.
   *
   * It was applied on one side only. A draft invoice counted towards Billed,
   * Outstanding, Average invoice, the aging buckets and "where the money is
   * owed" — and, if its due date had passed, was reported as *overdue* and put
   * on the chase list, on a document nobody had ever sent. The worklist card
   * directly above those numbers says "Nothing is owed until they go out",
   * so the dashboard was contradicting itself within one screen.
   *
   * `allInvoices` stays whole: the draft worklist needs the drafts, and the
   * "no invoices yet" empty state should not claim an empty book when a draft
   * is sitting there.
   */
  const postedInvoices = useMemo(
    () => allInvoices.filter((i) => String(i.status || '').toLowerCase() !== 'draft'),
    [allInvoices]
  );

  /**
   * Money out: purchase bills and expense vouchers, folded into one stream.
   *
   * The dashboard used to ingest only the sales side, which answers "what did
   * we bill" but not "what did it cost" — half of the proprietor's question.
   * Drafts are excluded: a draft is an intention, not a liability.
   */
  const allOutflows = useMemo(() => {
    const pick = (rows, fallbackName) =>
      (Array.isArray(rows) ? rows : [])
        .filter((r) => r.companyId === currentCompany?.id)
        .filter((r) => String(r.status || '').toLowerCase() !== 'draft')
        .map((r) => ({
          date: r.date,
          total: num(r.total),
          vendorName: String(r.vendorName || '').trim() || fallbackName,
        }));
    return [...pick(db?.bills, 'Unnamed vendor'), ...pick(db?.expenses, 'Expense')];
  }, [db, currentCompany]);

  /**
   * The four figures at the top are two balances and two flows, and they are
   * not the same kind of thing.
   *
   * Cash, receivables, payables and the GST position are true *now*. The
   * period control below governs what happened over a window; applying it to a
   * balance would produce "cash available in the last 30 days", which is not a
   * quantity. So these are computed as of today and labelled that way.
   */
  const cash = useMemo(() => cashPosition(db, currentCompany?.id), [db, currentCompany]);
  const recv = useMemo(() => receivablesAsOf(db, currentCompany?.id), [db, currentCompany]);
  const pay = useMemo(() => payablesAsOf(db, currentCompany?.id), [db, currentCompany]);
  const gst = useMemo(() => gstPosition(db, currentCompany?.id), [db, currentCompany]);
  const setup = useMemo(() => setupGaps(db, currentCompany?.id), [db, currentCompany]);

  // Pinned once per mount rather than read during render: "now" moving between
  // renders makes the bucketing impure, and every memo below depends on it.
  const [now] = useState(() => Date.now());

  /** Invoices inside the chosen window, and the window immediately before it. */
  const { current, previous } = useMemo(() => {
    if (!range.days) return { current: postedInvoices, previous: [] };
    const from = now - range.days * DAY;
    const prevFrom = from - range.days * DAY;

    const cur = [];
    const prev = [];
    for (const inv of postedInvoices) {
      const d = toDate(inv.date);
      if (!d) continue;
      const t = d.getTime();
      if (t >= from) cur.push(inv);
      else if (t >= prevFrom) prev.push(inv);
    }
    return { current: cur, previous: prev };
  }, [postedInvoices, range, now]);

  /** The same window, applied to the money-out stream. */
  const { currentOut, previousOut } = useMemo(() => {
    if (!range.days) return { currentOut: allOutflows, previousOut: [] };
    const from = now - range.days * DAY;
    const prevFrom = from - range.days * DAY;
    const cur = [];
    const prev = [];
    for (const row of allOutflows) {
      const d = toDate(row.date);
      if (!d) continue;
      const t = d.getTime();
      if (t >= from) cur.push(row);
      else if (t >= prevFrom) prev.push(row);
    }
    return { currentOut: cur, previousOut: prev };
  }, [allOutflows, range, now]);

  const sum = (rows, fn) => rows.reduce((s, r) => s + fn(r), 0);

  const billed = sum(current, (i) => num(i.total));
  const collected = sum(current, (i) => num(i.paidAmount));
  const outstanding = Math.max(0, billed - collected);

  const prevBilled = sum(previous, (i) => num(i.total));
  const prevCollected = sum(previous, (i) => num(i.paidAmount));
  const prevOutstanding = Math.max(0, prevBilled - prevCollected);

  const spent = sum(currentOut, (r) => r.total);
  const prevSpent = sum(previousOut, (r) => r.total);

  /** Six buckets across the window, so the shape is visible without noise. */
  const buckets = useMemo(() => {
    if (!current.length) return [];
    const days = range.days || 365;
    const slots = 6;
    const width = (days * DAY) / slots;
    const start = now - days * DAY;

    const out = Array.from({ length: slots }, (_, i) => ({
      // Day and month: at 15-day buckets a month-only label repeats ("Jun
      // Jun"), which reads as a rendering fault rather than two periods.
      label: new Date(start + i * width).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
      }),
      billed: 0,
      collected: 0,
    }));

    for (const inv of current) {
      const d = toDate(inv.date);
      if (!d) continue;
      const idx = Math.min(slots - 1, Math.max(0, Math.floor((d.getTime() - start) / width)));
      out[idx].billed += num(inv.total);
      out[idx].collected += num(inv.paidAmount);
    }
    return out;
  }, [current, range, now]);

  const aging = useMemo(() => {
    const b = [
      { label: 'Not yet due', amount: 0, color: chartTheme.pos },
      { label: '1–30 days', amount: 0, color: chartTheme.warn },
      { label: '31–60 days', amount: 0, color: chartTheme.accent },
      { label: 'Over 60 days', amount: 0, color: chartTheme.neg },
    ];

    for (const inv of current) {
      const due = Math.max(0, num(inv.total) - num(inv.paidAmount));
      if (due <= 0) continue;
      const d = toDate(inv.dueDate || inv.date);
      const overdueDays = d ? Math.floor((now - d.getTime()) / DAY) : 0;
      if (overdueDays <= 0) b[0].amount += due;
      else if (overdueDays <= 30) b[1].amount += due;
      else if (overdueDays <= 60) b[2].amount += due;
      else b[3].amount += due;
    }
    return b;
  }, [current, now, chartTheme]);

  const topCustomers = useMemo(() => {
    const byName = new Map();
    for (const inv of current) {
      const due = Math.max(0, num(inv.total) - num(inv.paidAmount));
      if (due <= 0) continue;
      const name = String(inv.customerName || 'Unnamed customer').trim() || 'Unnamed customer';
      byName.set(name, (byName.get(name) || 0) + due);
    }
    return [...byName.entries()]
      .map(([name, outstandingAmt]) => ({ name, outstanding: outstandingAmt }))
      .sort((a, b) => b.outstanding - a.outstanding)
      .slice(0, 5);
  }, [current]);

  /**
   * Ageing is a balance, so it is taken as of today across every open invoice.
   *
   * It used to be built from `aging`, which read only the invoices raised
   * inside the selected window. On a 90-day view a five-month-old unpaid
   * invoice was therefore missing from the 90+ bucket — the one invoice the
   * bucket exists to surface was the one the filter removed.
   */
  const agingRows = useMemo(() => {
    const tones = { pos: 'pos', warn: 'warn', accent: 'accent', accent2: 'accent', neg: 'neg' };
    return AGEING_BUCKETS.filter((b) => (recv.buckets[b.key] || 0) > 0).map((b) => ({
      name: b.label,
      value: recv.buckets[b.key],
      color: chartTheme[tones[b.tone]] || chartTheme.accent,
    }));
  }, [recv, chartTheme]);
  const agingTotal = recv.total;

  /**
   * How long the average unpaid invoice has been sitting, per customer.
   *
   * Age of the debt rather than size of it: a customer owing a little for 90
   * days is a different problem from one owing a lot since yesterday, and the
   * size question is already answered by the tile beside this one.
   */
  const daysOutstanding = useMemo(() => {
    const byName = new Map();
    for (const inv of current) {
      const due = Math.max(0, num(inv.total) - num(inv.paidAmount));
      if (due <= 0) continue;
      const d = toDate(inv.date);
      if (!d) continue;
      const age = Math.max(0, Math.floor((now - d.getTime()) / DAY));
      const name = String(inv.customerName || 'Unnamed').trim() || 'Unnamed';
      const prev = byName.get(name) || { total: 0, count: 0 };
      byName.set(name, { total: prev.total + age, count: prev.count + 1 });
    }
    return [...byName.entries()]
      .map(([label, v]) => ({ label, value: v.total / v.count }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [current, now]);

  /** Spend, in the same six slots the income chart uses, so the two compare. */
  const spendBuckets = useMemo(() => {
    if (!currentOut.length) return [];
    const days = range.days || 365;
    const slots = 6;
    const width = (days * DAY) / slots;
    const start = now - days * DAY;
    const out = Array.from({ length: slots }, (_, i) => ({
      label: new Date(start + i * width).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
      value: 0,
    }));
    for (const row of currentOut) {
      const d = toDate(row.date);
      if (!d) continue;
      const idx = Math.min(slots - 1, Math.max(0, Math.floor((d.getTime() - start) / width)));
      out[idx].value += row.total;
    }
    return out;
  }, [currentOut, range, now]);

  const topVendors = useMemo(() => {
    const byName = new Map();
    for (const row of currentOut) {
      if (row.total <= 0) continue;
      byName.set(row.vendorName, (byName.get(row.vendorName) || 0) + row.total);
    }
    return [...byName.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [currentOut]);

  const collectedPct = billed > 0 ? Math.round((collected / billed) * 100) : 0;

  /**
   * Insights: observations computed from the figures already on this page.
   * Every line cites its numbers; nothing is predicted and nothing is
   * invented. An empty list renders nothing rather than filler.
   */
  const insights = useMemo(() => {
    const out = [];
    const fmt = (v) => formatMoneyCompact(v, currentCompany);

    // Receivable concentration: one customer holding too much of the book.
    const totalOut = topCustomers.reduce((s, c) => s + c.outstanding, 0);
    if (topCustomers.length > 1 && totalOut > 0) {
      const top = topCustomers[0];
      const share = top.outstanding / totalOut;
      if (share >= 0.4) {
        out.push({
          id: 'concentration',
          tone: 'warn',
          text: `${top.name} holds ${Math.round(share * 100)}% of outstanding (${fmt(top.outstanding)}). A single delay there moves the whole book.`,
        });
      }
    }

    // Collection rate movement against the previous period.
    if (prevBilled > 0 && billed > 0) {
      const prevPct = Math.round((prevCollected / prevBilled) * 100);
      if (prevPct - collectedPct >= 10) {
        out.push({
          id: 'collection-drop',
          tone: 'neg',
          text: `Collection rate fell to ${collectedPct}% from ${prevPct}% last period. ${fmt(billed - collected)} is uncollected.`,
        });
      } else if (collectedPct - prevPct >= 10) {
        out.push({
          id: 'collection-rise',
          tone: 'pos',
          text: `Collection rate rose to ${collectedPct}% from ${prevPct}% last period.`,
        });
      }
    }

    // Spend spike against the previous period.
    if (prevSpent > 0 && spent > prevSpent * 1.5) {
      out.push({
        id: 'spend-spike',
        tone: 'warn',
        text: `Spend is ${fmt(spent)} this period against ${fmt(prevSpent)} last — up ${Math.round(((spent - prevSpent) / prevSpent) * 100)}%.`,
      });
    }

    // Old receivables: the over-60 bucket carrying real weight.
    const over60 = aging[3]?.amount || 0;
    const agingSum = aging.reduce((s, b) => s + b.amount, 0);
    if (agingSum > 0 && over60 / agingSum >= 0.25) {
      out.push({
        id: 'aging-tail',
        tone: 'neg',
        text: `${Math.round((over60 / agingSum) * 100)}% of outstanding (${fmt(over60)}) is older than 60 days.`,
      });
    }

    return out;
  }, [topCustomers, prevBilled, billed, prevCollected, collectedPct, collected, prevSpent, spent, aging, currentCompany]);

  const sparkOf = (key) => buckets.map((b) => b[key]);

  /**
   * What needs a person today.
   *
   * The nine charts below describe a quarter that has already happened. This
   * describes the morning. Every row is derived from data the dashboard
   * already holds — nothing new is fetched, and nothing here is a prediction.
   *
   * Ordered by how much it costs to ignore, not by size: money already late
   * outranks money about to leave, which outranks paperwork.
   */
  const worklist = useMemo(() => {
    const today = new Date(now);
    const todayStr = today.toISOString().slice(0, 10);
    const weekOut = new Date(now + 7 * DAY).toISOString().slice(0, 10);
    const balanceOf = (d) => Math.max(0, num(d?.total) - num(d?.paidAmount));
    const rows = [];

    // Overdue: past the due date with money still on it.
    const overdue = postedInvoices.filter(
      (i) => balanceOf(i) > 0 && String(i.dueDate || '') && String(i.dueDate) < todayStr
    );
    if (overdue.length) {
      const value = overdue.reduce((t, i) => t + balanceOf(i), 0);
      const oldest = overdue.slice().sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)))[0];
      const daysLate = Math.max(
        0,
        Math.round((now - new Date(`${oldest.dueDate}T00:00:00`).getTime()) / DAY)
      );
      rows.push({
        id: 'overdue',
        tone: 'neg',
        title: `${overdue.length} invoice${overdue.length === 1 ? '' : 's'} overdue · ${formatMoney(value, currentCompany)}`,
        detail: `Oldest ${oldest.number || 'invoice'}, ${daysLate} day${daysLate === 1 ? '' : 's'} past due`,
        actionLabel: 'Review',
        onAction: onOpenInvoices,
      });
    }

    // Bills falling due inside a week: money about to leave, still stoppable.
    const billsDue = (Array.isArray(db?.bills) ? db.bills : [])
      .filter((b) => b.companyId === currentCompany?.id)
      .filter((b) => String(b.status || '').toLowerCase() !== 'draft')
      .filter((b) => balanceOf(b) > 0)
      .filter((b) => String(b.dueDate || '') >= todayStr && String(b.dueDate || '') <= weekOut);
    if (billsDue.length) {
      const value = billsDue.reduce((t, b) => t + balanceOf(b), 0);
      const soonest = billsDue.slice().sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)))[0];
      rows.push({
        id: 'bills-due',
        tone: 'warn',
        title: `${billsDue.length} bill${billsDue.length === 1 ? '' : 's'} due within 7 days · ${formatMoney(value, currentCompany)}`,
        detail: `Soonest ${soonest.number || 'bill'}${soonest.vendorName ? ` · ${soonest.vendorName}` : ''} · due ${soonest.dueDate}`,
        actionLabel: 'Review',
        onAction: onOpenPurchases,
      });
    }

    // A draft owes you nothing. Until it goes out, nobody is late paying it.
    const drafts = allInvoices.filter((i) => String(i.status || '').toLowerCase() === 'draft');
    if (drafts.length) {
      rows.push({
        id: 'drafts',
        tone: 'warn',
        title: `${drafts.length} invoice${drafts.length === 1 ? '' : 's'} still in draft`,
        detail: 'Nothing is owed until they go out',
        actionLabel: 'Open',
        onAction: onOpenInvoices,
      });
    }

    // GSTR-1 for last month closes on the 11th of this one.
    const filingDue = new Date(today.getFullYear(), today.getMonth(), 11);
    if (filingDue.getTime() >= now) {
      const daysLeft = Math.ceil((filingDue.getTime() - now) / DAY);
      rows.push({
        id: 'gstr1',
        tone: daysLeft <= 3 ? 'neg' : 'info',
        title: `GSTR-1 closes in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`,
        detail: drafts.length
          ? `${drafts.length} draft${drafts.length === 1 ? '' : 's'} would be excluded from the return`
          : 'Every invoice in the period is out of draft',
        actionLabel: null,
      });
    }

    return rows;
  }, [allInvoices, postedInvoices, db, currentCompany, now, onOpenInvoices, onOpenPurchases]);

  /**
   * The period, and the one before it, side by side.
   *
   * Four tiles could hold four figures. A ruled grid holds eight, with last
   * period beside each, in less height — and an accountant reads a column of
   * figures faster than four boxes anyway. The sparkline stays, because a
   * percentage does not say whether the change was a trend or one lumpy week.
   */
  const comparisonRows = useMemo(() => {
    const overdueValue = postedInvoices
      .filter((i) => {
        const bal = Math.max(0, num(i.total) - num(i.paidAmount));
        const due = String(i.dueDate || '');
        return bal > 0 && due && due < new Date(now).toISOString().slice(0, 10);
      })
      .reduce((t, i) => t + Math.max(0, num(i.total) - num(i.paidAmount)), 0);

    const prevRate = prevBilled > 0 ? (prevCollected / prevBilled) * 100 : 0;
    const avg = current.length ? billed / current.length : 0;
    const prevAvg = previous.length ? prevBilled / previous.length : 0;

    return [
      { key: 'billed', label: 'Billed', now: billed, then: prevBilled, series: sparkOf('billed') },
      { key: 'collected', label: 'Collected', now: collected, then: prevCollected, series: sparkOf('collected') },
      { key: 'rate', label: 'Collection rate', now: collectedPct, then: Math.round(prevRate), unit: '%', invert: false },
      { key: 'outstanding', label: 'Outstanding', now: outstanding, then: prevOutstanding, invert: true },
      { key: 'overdue', label: '— of which overdue', now: overdueValue, then: null, invert: true, indent: true },
      { key: 'spent', label: 'Spent', now: spent, then: prevSpent, invert: true },
      // Not inverted: unlike outstanding or spend, a net movement that rises
      // is the welcome direction.
      { key: 'net', label: 'Net movement', now: collected - spent, then: prevCollected - prevSpent, mode: 'diff' },
      { key: 'avg', label: 'Average invoice', now: avg, then: prevAvg },
    ];
  }, [
    postedInvoices, now, billed, prevBilled, collected, prevCollected, collectedPct,
    outstanding, prevOutstanding, spent, prevSpent, current.length, previous.length, buckets,
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Dashboard"
        description={`${current.length} invoice${current.length === 1 ? '' : 's'} in the last ${range.label.toLowerCase()}`}
        actions={
          <>
            {/* Segmented period control. One row, current option marked by fill
                and by aria-pressed, not by colour alone. */}
            <div
              className="hidden sm:flex items-center rounded-lg p-0.5"
              style={{ backgroundColor: 'rgb(var(--surface-sunken))' }}
              role="group"
              aria-label="Reporting period"
            >
              {RANGES.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => setRangeKey(r.key)}
                  aria-pressed={r.key === rangeKey}
                  className="px-2.5 h-7 rounded-md text-xs font-medium transition-colors"
                  style={
                    r.key === rangeKey
                      ? { backgroundColor: 'rgb(var(--surface))', color: 'rgb(var(--fg))', boxShadow: 'var(--shadow-card)' }
                      : { color: 'rgb(var(--fg-muted))' }
                  }
                >
                  {r.label}
                </button>
              ))}
            </div>

            {branches.length > 1 && onOpenBranches ? (
              <button type="button" onClick={onOpenBranches} className="ui-btn ui-btn-secondary">
                <Building2 size={15} aria-hidden="true" />
                {branchFilterLabel}
              </button>
            ) : null}

            {onNewInvoice ? (
              <button type="button" onClick={onNewInvoice} className="ui-btn ui-btn-primary">
                <Plus size={15} aria-hidden="true" />
                New invoice
              </button>
            ) : null}
          </>
        }
      />

      {/*
        The four figures the business opens on: what it has, what it is owed,
        what it owes, and what the tax office is owed. These render whether or
        not a single invoice exists — cash and payables are true from the first
        purchase, and a company that has spent money should not be told its
        dashboard is empty.
      */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Financial position">
        <BalanceCard
          label="Cash available"
          value={cash.total}
          company={currentCompany}
          accent="pos"
          hint={
            cash.accountCount
              ? `${cash.accountCount} ledger${cash.accountCount === 1 ? '' : 's'} · per your books`
              : 'No cash or bank ledger yet'
          }
        />

        <BalanceCard
          label="Owed to you"
          value={recv.count ? recv.total : null}
          company={currentCompany}
          accent="brand"
          hint={recv.count ? `across ${recv.count} invoice${recv.count === 1 ? '' : 's'}` : 'Nothing billed yet'}
          note={recv.overdue > 0 ? `${formatMoney(recv.overdue, currentCompany)} overdue · oldest ${recv.oldestDays} days` : null}
          tone={recv.overdue > 0 ? 'neg' : ''}
          actionLabel={recv.count ? 'View invoices' : null}
          onAction={onOpenInvoices}
        >
          <AgeingBar buckets={recv.buckets} total={recv.total} company={currentCompany} />
        </BalanceCard>

        <BalanceCard
          label="You owe"
          value={pay.count ? pay.total : null}
          company={currentCompany}
          accent="neg"
          tone={pay.total > 0 ? 'neg' : ''}
          hint={pay.count ? `${pay.count} bill${pay.count === 1 ? '' : 's'} open` : 'Nothing owed to vendors'}
          note={pay.dueThisWeek > 0 ? `${formatMoney(pay.dueThisWeek, currentCompany)} falls due this week` : null}
          actionLabel={pay.count ? 'Plan payments' : null}
          onAction={onOpenPurchases}
        />

        <BalanceCard
          label={gst.creditCarried > 0 ? 'GST credit' : 'GST payable'}
          value={gst.output || gst.input ? (gst.creditCarried > 0 ? gst.creditCarried : gst.payable) : null}
          company={currentCompany}
          accent="warn"
          tone={gst.creditCarried > 0 ? 'pos' : 'warn'}
          hint={
            gst.output || gst.input
              ? `${gst.monthLabel} · output ${formatMoney(gst.output, currentCompany)} less ITC ${formatMoney(gst.input, currentCompany)}`
              : 'Nothing to file for this period yet'
          }
          note={
            gst.daysToGstr1 >= 0
              ? `GSTR-1 closes in ${gst.daysToGstr1} day${gst.daysToGstr1 === 1 ? '' : 's'}${
                  gst.draftsInMonth ? ` · ${gst.draftsInMonth} draft${gst.draftsInMonth === 1 ? '' : 's'} would be left out` : ''
                }`
              : null
          }
        />
      </section>

      {/*
        Only the gaps that are real in this book, and only until they are
        closed. A finished checklist should leave the screen rather than sit
        there at 100% as a monument to itself.
      */}
      {!setup.complete ? (
        <section className="ui-card p-4" aria-label="Setup">
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <h3 className="ui-card-label" style={{ color: 'rgb(var(--fg))' }}>
              {setup.total - setup.done} thing{setup.total - setup.done === 1 ? '' : 's'} left before your books work
            </h3>
            <span className="ui-subtle text-xs">
              {setup.done} of {setup.total} done
            </span>
          </div>
          <div className="h-1.5 rounded-full mt-2.5 overflow-hidden" style={{ backgroundColor: 'rgb(var(--surface-sunken))' }}>
            <span
              className="block h-full rounded-full"
              style={{ width: `${(setup.done / setup.total) * 100}%`, backgroundColor: 'rgb(var(--brand))' }}
            />
          </div>
          <ul className="mt-3 space-y-1.5">
            {setup.steps.filter((st) => !st.done).map((st) => (
              <li key={st.key} className="flex items-center gap-2.5 text-sm">
                <span
                  className="w-4 h-4 rounded-full border shrink-0"
                  style={{ borderColor: 'rgb(var(--border-strong))' }}
                  aria-hidden="true"
                />
                <span className="min-w-0">
                  <span className="font-medium">{st.label}</span>
                  <span className="ui-subtle text-xs block">{st.hint}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {allInvoices.length === 0 ? (
        <div className="ui-card">
          <EmptyState
            title="No invoices yet"
            description="The figures above are already real — what you hold and what you owe. Billing, collection and the trend appear here once invoices exist."
            action={
              onNewInvoice ? (
                <button type="button" onClick={onNewInvoice} className="ui-btn ui-btn-primary">
                  <Plus size={15} aria-hidden="true" />
                  New invoice
                </button>
              ) : null
            }
          />
        </div>
      ) : (
        <>
          {/* What needs a person today. The charts below say how the quarter
              went; this says where to start. An empty queue is a result, not a
              blank panel — so it says so. */}
          <section className="ui-card p-0 overflow-hidden ui-in" aria-label="What needs you today">
            <div className="flex items-baseline gap-3 px-4 pt-3.5 pb-2">
              <h3 className="ui-card-label" style={{ color: 'rgb(var(--fg))' }}>
                What needs you
              </h3>
              <span className="ui-caption">
                {worklist.length ? `${worklist.length} item${worklist.length === 1 ? '' : 's'}` : 'Nothing outstanding'}
              </span>
            </div>
            {worklist.length === 0 ? (
              <p className="px-4 pb-4 text-sm ui-muted">
                Nothing is overdue, no bill falls due this week, and no invoice is sitting in draft. The quarter is below.
              </p>
            ) : (
              <ul className="divide-y">
                {worklist.map((row) => (
                  <li key={row.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span
                      className="h-8 w-1 flex-shrink-0 rounded-full"
                      style={{ backgroundColor: `rgb(var(--${row.tone}))` }}
                      aria-hidden="true"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{row.title}</span>
                      <span className="block ui-caption">{row.detail}</span>
                    </span>
                    {row.actionLabel && row.onAction ? (
                      <button
                        type="button"
                        onClick={row.onAction}
                        className="ui-btn ui-btn-secondary ui-btn-sm ml-auto flex-shrink-0"
                      >
                        {row.actionLabel}
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* This period against the one before it. Eight figures where four
              tiles stood, in less height, with the shape of each kept as a
              sparkline — a percentage alone cannot say whether the change was a
              trend or one lumpy week. */}
          <section className="ui-card p-0 overflow-hidden ui-in" aria-label="This period against last">
            <table className="ui-table w-full">
              <thead>
                <tr>
                  <th className="ui-th">Measure</th>
                  <th className="ui-th ui-num">This period</th>
                  <th className="ui-th ui-num">Last period</th>
                  <th className="ui-th ui-num">Change</th>
                  <th className="ui-th w-24">Shape</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {comparisonRows.map((row) => {
                  const showChange = row.then !== null && row.then !== undefined;
                  const pct = showChange ? delta(row.now, row.then) : null;
                  const fmtCell = (v) =>
                    row.unit === '%' ? `${Math.round(v)}%` : formatMoney(v, currentCompany);
                  return (
                    <tr key={row.key}>
                      <td className={`ui-cell ${row.indent ? 'pl-6 ui-muted' : ''}`}>{row.label}</td>
                      <td className="ui-cell ui-num ui-money">{fmtCell(row.now)}</td>
                      <td className="ui-cell ui-num ui-money ui-muted">{showChange ? fmtCell(row.then) : '—'}</td>
                      <td className="ui-cell ui-num">
                        {!showChange ? (
                          <span className="ui-subtle">—</span>
                        ) : row.mode === 'diff' ? (
                          // A percentage change across zero is nonsense: net
                          // moving from −7.6L to −26.9L computes as +254%, and
                          // dividing by a negative paints that green. Show the
                          // movement itself.
                          <DiffChip value={row.now - row.then} company={currentCompany} invert={row.invert} />
                        ) : row.unit === '%' ? (
                          // A rate that moves from 56% to 43% has not fallen
                          // 23%. It has fallen 13 points, and saying otherwise
                          // is the oldest misleading statistic there is.
                          <PointsChip value={Math.round(row.now) - Math.round(row.then)} invert={row.invert} />
                        ) : (
                          <DeltaChip value={pct} invert={row.invert} />
                        )}
                      </td>
                      <td className="ui-cell">
                        {row.series && row.series.length > 1 ? (
                          <MiniSpark series={row.series} />
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {/* The four tiles each carried one jump. Losing the tiles should not
                lose the jumps. */}
            <div className="flex flex-wrap gap-2 border-t px-4 py-2.5">
              {onOpenInvoices ? (
                <button type="button" onClick={onOpenInvoices} className="ui-btn ui-btn-ghost ui-btn-sm">
                  View invoices
                </button>
              ) : null}
              {onOpenReceipts ? (
                <button type="button" onClick={onOpenReceipts} className="ui-btn ui-btn-ghost ui-btn-sm">
                  View receipts
                </button>
              ) : null}
              {onOpenPurchases ? (
                <button type="button" onClick={onOpenPurchases} className="ui-btn ui-btn-ghost ui-btn-sm">
                  View purchases
                </button>
              ) : null}
            </div>
          </section>

          {isEnabled('insights') && insights.length > 0 ? (
            <section className="ui-card p-5 ui-in" aria-label="Insights from your books">
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <h3 className="ui-card-label" style={{ color: 'rgb(var(--fg))' }}>Worth a look</h3>
                <span className="ui-caption">Computed from your books — not a prediction</span>
              </div>
              <ul className="space-y-2.5">
                {insights.map((n) => (
                  <li key={n.id} className="flex items-start gap-2.5 text-sm">
                    <span
                      className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full"
                      style={{ backgroundColor: `rgb(var(--${n.tone}))` }}
                      aria-hidden="true"
                    />
                    <span>{n.text}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* Three-column grid of equal tiles. One shape repeated, because a
              dashboard's job is comparison and comparison breaks the moment
              two tiles are built differently. Collapses to two columns on a
              tablet and one on a phone. */}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <ChartCard
              title="Outstanding by age"
              subtitle="Where the receivable book is sitting"
              actionLabel="View invoices"
              onAction={onOpenInvoices}
            >
              {agingTotal <= 0 ? (
                <EmptyState icon={CircleSlash} title="Nothing outstanding" description="Every invoice in view is settled." />
              ) : (
                <>
                  <Suspense fallback={<ChartFallback height={200} />}>
                    <DonutChart
                      data={agingRows}
                      centerLabel="Outstanding"
                      centerValue={formatMoneyCompact(agingTotal, currentCompany)}
                      height={200}
                    />
                  </Suspense>
                  <Suspense fallback={<ChartFallback height={80} />}>
                    <ChartLegend
                      rows={agingRows}
                      total={agingTotal}
                      formatter={(v) => formatMoneyCompact(v, currentCompany)}
                    />
                  </Suspense>
                </>
              )}
            </ChartCard>

            <ChartCard title="Billed by period" subtitle={`Last ${range.label.toLowerCase()}`}>
              <Suspense fallback={<ChartFallback height={240} />}>
                <PeriodBars
                  data={buckets.map((b) => ({ label: b.label, value: b.billed }))}
                  height={240}
                  formatter={(v) => formatMoneyCompact(v, currentCompany)}
                />
              </Suspense>
            </ChartCard>

            <ChartCard
              title="Where the money is owed"
              subtitle="Share of outstanding, by customer"
              actionLabel="View customers"
              onAction={onOpenCustomers}
            >
              {topCustomers.length === 0 ? (
                <EmptyState icon={Wallet} title="Nobody owes you" description="Balances appear here as invoices go unpaid." />
              ) : (
                <Suspense fallback={<ChartFallback height={300} />}>
                  <CompositionPie
                    data={topCustomers.map((r) => ({ name: r.name, value: r.outstanding }))}
                    height={200}
                    formatter={(v) => formatMoneyCompact(v, currentCompany)}
                  />
                </Suspense>
              )}
            </ChartCard>

            <ChartCard title="Collection rate" subtitle="Of everything billed this period">
              <Suspense fallback={<ChartFallback height={200} />}>
                <RadialGauge
                  value={collectedPct}
                  label="Collection rate"
                  tone={collectedPct >= 70 ? 'pos' : collectedPct >= 40 ? undefined : 'neg'}
                  height={200}
                />
              </Suspense>
              <p className="text-center ui-caption -mt-3">
                <span style={{ color: 'rgb(var(--fg))' }} className="font-medium">
                  {formatMoneyCompact(collected, currentCompany)}
                </span>{' '}
                of {formatMoneyCompact(billed, currentCompany)}
              </p>
            </ChartCard>

            <ChartCard title="Billed and collected" subtitle="Per period, in INR">
              <RevenueChart buckets={buckets} company={currentCompany} />
            </ChartCard>

            <ChartCard
              title="Longest outstanding"
              subtitle="Average age of unpaid invoices, by customer"
              actionLabel="Chase payment"
              onAction={onOpenInvoices}
            >
              {daysOutstanding.length === 0 ? (
                <EmptyState icon={CircleSlash} title="Nothing overdue" description="No unpaid invoices in this period." />
              ) : (
                <Suspense fallback={<ChartFallback height={240} />}>
                  <RankedBars
                    data={daysOutstanding}
                    height={240}
                    formatter={(v) => `${Math.round(v)}d`}
                  />
                </Suspense>
              )}
            </ChartCard>

            {/* --- money out ---
                Bills and expense vouchers, in the same window and the same
                six buckets as the income charts, so the rows compare. */}
            <ChartCard
              title="Spent by period"
              subtitle={
                prevSpent > 0
                  ? `${formatMoneyCompact(spent, currentCompany)} this period, ${formatMoneyCompact(prevSpent, currentCompany)} last`
                  : `Bills and expenses, last ${range.label.toLowerCase()}`
              }
              actionLabel="View purchases"
              onAction={onOpenPurchases}
            >
              {spendBuckets.every((b) => b.value <= 0) ? (
                <EmptyState icon={Receipt} title="Nothing spent" description="Bills and expenses land here as you record them." />
              ) : (
                <Suspense fallback={<ChartFallback height={240} />}>
                  <PeriodBars
                    data={spendBuckets}
                    height={240}
                    tone="deep"
                    formatter={(v) => formatMoneyCompact(v, currentCompany)}
                  />
                </Suspense>
              )}
            </ChartCard>

            <ChartCard
              title="Where the money goes"
              subtitle="Share of spend, by vendor"
              actionLabel="View purchases"
              onAction={onOpenPurchases}
            >
              {topVendors.length === 0 ? (
                <EmptyState icon={Receipt} title="No spend yet" description="Vendor share appears once bills are recorded." />
              ) : (
                <Suspense fallback={<ChartFallback height={300} />}>
                  <CompositionPie
                    data={topVendors}
                    height={200}
                    formatter={(v) => formatMoneyCompact(v, currentCompany)}
                  />
                </Suspense>
              )}
            </ChartCard>

            <ChartCard title="In against out" subtitle="Collected vs spent this period">
              {collected <= 0 && spent <= 0 ? (
                <EmptyState icon={Wallet} title="No movement" description="Collections and spend compare here." />
              ) : (
                <>
                  <Suspense fallback={<ChartFallback height={200} />}>
                    <DonutChart
                      data={[
                        { name: 'Collected', value: collected, color: chartTheme.pos },
                        { name: 'Spent', value: spent, color: chartTheme.brandDeep },
                      ]}
                      centerLabel={collected - spent >= 0 ? 'Net in' : 'Net out'}
                      centerValue={formatMoneyCompact(Math.abs(collected - spent), currentCompany)}
                      height={200}
                    />
                  </Suspense>
                  <Suspense fallback={<ChartFallback height={64} />}>
                    <ChartLegend
                      rows={[
                        { name: 'Collected', value: collected, color: chartTheme.pos },
                        { name: 'Spent', value: spent, color: chartTheme.brandDeep },
                      ]}
                      formatter={(v) => formatMoneyCompact(v, currentCompany)}
                    />
                  </Suspense>
                </>
              )}
            </ChartCard>
          </div>
        </>
      )}
    </div>
  );
}
