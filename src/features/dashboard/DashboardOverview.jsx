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
  Search,
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
  cashForecast,
  incomeVsExpenses,
  recentActivity,
  AGEING_BUCKETS,
} from '../../utils/cashPosition';
import { computeInventorySummaryByItemId } from '../../utils/inventory';
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
        <span className="ui-subtle text-xs">as of today</span>
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
            className="inline-flex items-center gap-1.5 text-xs"
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

/* ------------------------------------------------------------------ *
 * The opening composition.
 *
 * Avatar, greeting, and one sentence that had to be earned. The sentence
 * rotates through whatever the book actually has to say — overdue money, a
 * filing window, drafts sitting outside receivables — and when there is
 * nothing to say it says nothing rather than inventing a metric. A greeting
 * that finds a crisis every morning stops being read inside a week.
 * ------------------------------------------------------------------ */

const GREETINGS = [
  [5, 'Good morning'],
  [12, 'Good afternoon'],
  [17, 'Good evening'],
];

function greetingFor(hour) {
  let out = 'Good evening';
  for (const [from, label] of GREETINGS) if (hour >= from) out = label;
  if (hour < 5) out = 'Good evening';
  return out;
}

/** First name from the signed-in address; blank rather than a guess. */
function nameFromEmail(email) {
  const local = String(email || '').split('@')[0] || '';
  const first = local.split(/[._-]/)[0] || '';
  if (!first || /^\d+$/.test(first)) return '';
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

function initialsFor(name, email, company) {
  const src = name || String(email || '').split('@')[0] || company || '';
  const parts = String(src).trim().split(/[\s._-]+/).filter(Boolean);
  if (!parts.length) return '—';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function DashboardHero({ name, initials, insights, onCommand, actions }) {
  const [idx, setIdx] = useState(0);
  const list = Array.isArray(insights) ? insights.filter(Boolean) : [];
  const active = list.length ? list[Math.min(idx, list.length - 1)] : null;

  return (
    <section className="pt-8 pb-2 text-center" aria-label="Overview">
      <span
        className="mx-auto mb-5 grid h-12 w-12 place-items-center rounded-full text-sm font-bold"
        style={{ backgroundColor: 'rgb(var(--brand))', color: 'rgb(var(--on-brand))' }}
        aria-hidden="true"
      >
        {initials}
      </span>

      <h1 className="ui-t-page" style={{ fontSize: '2rem', lineHeight: '2.5rem' }}>
        {greetingFor(new Date().getHours())}
        {name ? (
          <>
            ,{' '}
            <span style={{ fontWeight: 300, color: 'rgb(var(--fg-subtle))' }}>{name}</span>
          </>
        ) : null}
      </h1>

      {active ? (
        <p className="ui-t-body mt-2.5" style={{ color: 'rgb(var(--fg-muted))' }} aria-live="polite">
          {active.text}
        </p>
      ) : (
        <p className="ui-t-body mt-2.5" style={{ color: 'rgb(var(--fg-subtle))' }}>
          Nothing needs you right now.
        </p>
      )}

      {list.length > 1 ? (
        <div className="mt-4 flex justify-center gap-1.5" role="tablist" aria-label="Insights">
          {list.map((it, i) => (
            <button
              key={it.key}
              type="button"
              role="tab"
              aria-selected={i === idx}
              aria-label={it.label || `Insight ${i + 1}`}
              onClick={() => setIdx(i)}
              className="h-0.5 rounded-full transition-all"
              style={{
                width: i === idx ? 22 : 16,
                backgroundColor: i === idx ? 'rgb(var(--brand))' : 'rgb(var(--border))',
              }}
            />
          ))}
        </div>
      ) : null}

      {onCommand ? (
        <>
          <button
            type="button"
            onClick={onCommand}
            className="mx-auto mt-7 flex w-full max-w-xl items-center gap-3 rounded-xl border ps-4 pe-2 text-start"
            style={{
              height: 50,
              borderColor: 'rgb(var(--border))',
              backgroundColor: 'rgb(var(--surface-sunken))',
              color: 'rgb(var(--fg-subtle))',
            }}
          >
            <Search size={16} aria-hidden="true" />
            <span className="ui-t-body truncate">Search invoices, customers, items…</span>
            <span
              className="ms-auto grid h-9 w-9 place-items-center rounded-lg text-xs font-semibold"
              style={{ backgroundColor: 'rgb(var(--brand))', color: 'rgb(var(--on-brand))' }}
              aria-hidden="true"
            >
              ⌘K
            </span>
          </button>
          <p className="ui-t-body mt-2" style={{ color: 'rgb(var(--fg-subtle))' }}>
            Jump to any document, or start one
          </p>
        </>
      ) : null}

      {actions?.length ? (
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {actions.map((a) => (
            <button key={a.label} type="button" onClick={a.onClick} className="ui-btn ui-btn-secondary">
              <a.Icon size={15} aria-hidden="true" />
              {a.label}
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

/**
 * The figures, as a hairline grid rather than six floating cards.
 *
 * One rule holds the composition together: a tile is a label, a figure and a
 * note, and nothing else. No icon, no sparkline, no chrome — the reason this
 * reads as calm is that every cell is the same shape.
 */
function QuietTiles({ tiles, company }) {
  return (
    <section
      className="mx-auto mt-11 grid max-w-4xl border-s border-t sm:grid-cols-2 lg:grid-cols-3"
      style={{ borderColor: 'rgb(var(--border))' }}
      aria-label="Position"
    >
      {tiles.filter(Boolean).map((t) => (
        <div key={t.label} className="border-e border-b px-5 py-4 text-start" style={{ borderColor: 'rgb(var(--border))' }}>
          <div className="ui-t-body" style={{ color: 'rgb(var(--fg-subtle))' }}>
            {t.label}
          </div>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <span
              className="ui-mono"
              style={{
                fontSize: '1.3125rem',
                lineHeight: '1.75rem',
                fontWeight: 600,
                letterSpacing: '-.01em',
                color: t.value == null ? 'rgb(var(--fg-subtle))' : t.tone ? `rgb(var(--${t.tone}))` : 'rgb(var(--fg))',
              }}
            >
              {t.value == null ? '—' : t.count ? String(t.value) : formatMoney(t.value, company)}
            </span>
            {t.note ? (
              <span className="ui-t-body" style={{ color: 'rgb(var(--fg-subtle))' }}>
                {t.note}
              </span>
            ) : null}
          </div>
        </div>
      ))}
    </section>
  );
}

export default function DashboardOverview({
  db,
  currentCompany,
  branches = [],
  onNewInvoice,
  onOpenInvoices,
  onOpenBranches,
  branchFilterLabel = 'All',
  invoices: invoicesProp = null,
  onOpenPurchases,
  activeWarehouseId = '',
  onOpenCommand = null,
  onNewBill = null,
  onRecordReceipt = null,
  onOpenCustomers = null,
  onOpenReports = null,
}) {
  /**
   * Cash and accrual answer different questions and must never be mixed on one
   * screen: accrual says what the business earned, cash says what reached the
   * account. A company can be profitable on one and unable to pay a vendor on
   * the other, which is the whole reason the switch exists. It is global here
   * rather than per-card so two panels can never sit side by side on different
   * bases.
   */
  const [basis, setBasis] = useState('accrual');
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
  const forecast = useMemo(() => cashForecast(db, currentCompany?.id, { days: 30 }), [db, currentCompany]);
  const basisSeries = useMemo(
    () => incomeVsExpenses(db, currentCompany?.id, { basis, days: 90 }),
    [db, currentCompany, basis]
  );
  const activity = useMemo(() => recentActivity(db, currentCompany?.id, 6), [db, currentCompany]);

  /**
   * Stock for the warehouse in the header, not for the whole company.
   *
   * The selector sits above this page and governed nothing on it, which is the
   * kind of control that teaches people the filters do not work.
   */
  const stock = useMemo(() => {
    try {
      const summary = computeInventorySummaryByItemId({
        db,
        companyId: currentCompany?.id,
        warehouseId: String(activeWarehouseId || ''),
      });
      const items = (Array.isArray(db?.items) ? db.items : []).filter((i) => i.companyId === currentCompany?.id);
      let value = 0;
      const low = [];
      let out = 0;
      for (const item of items) {
        const row = summary.get(String(item.id));
        const qty = Number(row?.closingQty ?? 0);
        const rate = Number(item.purchasePrice ?? 0);
        if (Number.isFinite(qty) && Number.isFinite(rate)) value += qty * rate;
        const reorder = Number(item.reorderLevel ?? 0);
        if (qty <= 0) out += 1;
        else if (reorder > 0 && qty <= reorder) low.push({ name: item.name, qty, unit: item.unit });
      }
      return { value, low: low.slice(0, 3), lowCount: low.length, out, itemCount: items.length };
    } catch {
      // A stock summary that throws must not take the dashboard with it.
      return null;
    }
  }, [db, currentCompany, activeWarehouseId]);

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

  const prevBilled = sum(previous, (i) => num(i.total));
  const prevCollected = sum(previous, (i) => num(i.paidAmount));

  const spent = sum(currentOut, (r) => r.total);
  const prevSpent = sum(previousOut, (r) => r.total);

  /** Six buckets across the window, so the shape is visible without noise. */
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

  /**
   * What needs a person today.
   *
   * The panels below describe a quarter that has already happened. This
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
   * The sentence under the greeting.
   *
   * Every one of these is a fact from the book with something to do about it.
   * Order is by how much it costs to ignore: money already late, then a
   * statutory window, then money going out, then work left unfinished. An
   * empty list renders as "nothing needs you right now", which is a true
   * thing to say and the reason the line stays credible.
   */
  const draftCount = useMemo(
    () => allInvoices.filter((i) => String(i.status || '').toLowerCase() === 'draft').length,
    [allInvoices]
  );

  /**
   * How many invoices the overdue money is spread across — the same test the
   * worklist below uses, so the two cannot disagree. `receivables()` returns
   * the overdue amount but not its count.
   */
  const overdueCount = useMemo(() => {
    const todayStr = new Date(now).toISOString().slice(0, 10);
    return postedInvoices.filter(
      (i) =>
        Math.max(0, num(i?.total) - num(i?.paidAmount)) > 0 &&
        String(i.dueDate || '') &&
        String(i.dueDate) < todayStr
    ).length;
  }, [postedInvoices, now]);

  const heroInsights = useMemo(() => {
    const out = [];

    if (recv.overdue > 0) {
      out.push({
        key: 'overdue',
        label: `${formatMoney(recv.overdue, currentCompany)} overdue across ${overdueCount} invoice${overdueCount === 1 ? '' : 's'}${recv.oldestDays ? `, oldest ${recv.oldestDays} days` : ''}`,
        text: (
          <>
            There&rsquo;s <b className="ui-mono" style={{ color: 'rgb(var(--neg))', fontWeight: 600 }}>{formatMoney(recv.overdue, currentCompany)}</b>{' '}
            overdue across {overdueCount} invoice{overdueCount === 1 ? '' : 's'}
            {recv.oldestDays ? <> — the oldest by <b style={{ color: 'rgb(var(--fg))' }}>{recv.oldestDays} days</b></> : null}.
          </>
        ),
      });
    }

    if (Number.isFinite(gst.daysToGstr1) && gst.daysToGstr1 >= 0 && gst.daysToGstr1 <= 15) {
      out.push({
        key: 'gst',
        label: `GSTR-1 closes in ${gst.daysToGstr1} day${gst.daysToGstr1 === 1 ? '' : 's'}${gst.draftsInMonth > 0 ? `, ${gst.draftsInMonth} draft invoice${gst.draftsInMonth === 1 ? '' : 's'} would be left out` : ''}`,
        text: (
          <>
            <b style={{ color: 'rgb(var(--fg))' }}>GSTR-1</b> closes in{' '}
            <b style={{ color: 'rgb(var(--warn))' }}>
              {gst.daysToGstr1} day{gst.daysToGstr1 === 1 ? '' : 's'}
            </b>
            {gst.draftsInMonth > 0 ? (
              <>
                {' '}
                — {gst.draftsInMonth} draft invoice{gst.draftsInMonth === 1 ? '' : 's'} would be left out.
              </>
            ) : (
              '.'
            )}
          </>
        ),
      });
    }

    if (pay.dueThisWeek > 0) {
      out.push({
        key: 'due',
        label: `${formatMoney(pay.dueThisWeek, currentCompany)} of bills falls due this week`,
        text: (
          <>
            <b className="ui-mono" style={{ color: 'rgb(var(--fg))', fontWeight: 600 }}>{formatMoney(pay.dueThisWeek, currentCompany)}</b>{' '}
            of bills falls due this week.
          </>
        ),
      });
    }

    if (draftCount > 0) {
      out.push({
        key: 'drafts',
        label: `${draftCount} invoice${draftCount === 1 ? '' : 's'} still in draft, not counted in what you are owed`,
        text: (
          <>
            <b style={{ color: 'rgb(var(--fg))' }}>{draftCount} invoice{draftCount === 1 ? '' : 's'}</b>{' '}
            {draftCount === 1 ? 'is' : 'are'} still a draft, so {draftCount === 1 ? 'it is' : 'they are'} not counted in what you are owed.
          </>
        ),
      });
    }

    if (stock?.out > 0) {
      out.push({
        key: 'stock',
        label: `${stock.out} item${stock.out === 1 ? '' : 's'} out of stock`,
        text: (
          <>
            <b style={{ color: 'rgb(var(--fg))' }}>{stock.out} item{stock.out === 1 ? '' : 's'}</b> {stock.out === 1 ? 'is' : 'are'} out of stock.
          </>
        ),
      });
    }

    return out;
  }, [recv, gst, pay, draftCount, overdueCount, stock, currentCompany]);

  const userEmail = (() => {
    try {
      return localStorage.getItem('userEmail') || '';
    } catch {
      return '';
    }
  })();
  const heroName = nameFromEmail(userEmail);
  const heroInitials = initialsFor(heroName, userEmail, currentCompany?.name);

  const quickActions = [
    onNewInvoice ? { label: 'New invoice', Icon: FileText, onClick: onNewInvoice } : null,
    onRecordReceipt ? { label: 'Record receipt', Icon: Receipt, onClick: onRecordReceipt } : null,
    onNewBill ? { label: 'New bill', Icon: Wallet, onClick: onNewBill } : null,
    onOpenCustomers ? { label: 'Add customer', Icon: Plus, onClick: onOpenCustomers } : null,
    onOpenReports ? { label: 'Reports', Icon: TrendingUp, onClick: onOpenReports } : null,
  ].filter(Boolean);

  return (
    <div className="space-y-5">
      {/*
        The opening composition, in place of a page header and four cards.

        A dashboard is the one screen with no task on it, so it does not need a
        title telling you where you are — you can see that in the rail. What it
        needs is to say the one thing worth knowing before you decide what to
        do, which is what the line under the greeting is for.
      */}
      <DashboardHero
        name={heroName}
        initials={heroInitials}
        insights={heroInsights}
        onCommand={onOpenCommand}
        actions={quickActions}
      />

      <QuietTiles
        company={currentCompany}
        tiles={[
          {
            label: 'Cash available',
            value: cash.total,
            note: cash.accountCount
              ? `${cash.accountCount} ledger${cash.accountCount === 1 ? '' : 's'}`
              : 'no ledger yet',
          },
          {
            label: 'Owed to you',
            value: recv.count ? recv.total : null,
            tone: recv.overdue > 0 ? 'warn' : '',
            note: recv.count ? `${recv.count} invoice${recv.count === 1 ? '' : 's'}` : 'nothing billed',
          },
          {
            label: 'You owe',
            value: pay.count ? pay.total : null,
            tone: pay.total > 0 ? 'neg' : '',
            note: pay.count ? `${pay.count} bill${pay.count === 1 ? '' : 's'}` : 'nothing owed',
          },
          {
            label: gst.creditCarried > 0 ? 'GST credit' : 'GST payable',
            value: gst.output || gst.input ? (gst.creditCarried > 0 ? gst.creditCarried : gst.payable) : null,
            tone: gst.creditCarried > 0 ? 'pos' : '',
            note:
              Number.isFinite(gst.daysToGstr1) && gst.daysToGstr1 >= 0
                ? `GSTR-1 in ${gst.daysToGstr1}d`
                : gst.monthLabel,
          },
          stock
            ? {
                label: 'Stock on hand',
                value: stock.value,
                note: `${stock.itemCount} item${stock.itemCount === 1 ? '' : 's'}${stock.out ? ` · ${stock.out} out` : ''}`,
              }
            : null,
          {
            label: 'Drafts',
            value: draftCount,
            count: true,
            note: draftCount ? 'not in what you are owed' : 'none open',
          },
        ]}
      />

      {/*
        Everything below is the detail, and it keeps the period control that
        governs it. The balances above are "as of today" and never moved with
        that control; putting it here is what finally makes that legible.
      */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-6">
        <h2 className="ui-t-section">
          {current.length} invoice{current.length === 1 ? '' : 's'} in the last {range.label.toLowerCase()}
        </h2>
        <div className="flex items-center gap-2">
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
        </div>
      </div>

      {/*
        Where cash lands over the next month, from documents already committed.
        The dip matters more than the endpoint: a business that ends the month
        comfortably can still be unable to pay a vendor on the 8th.
      */}
      <section className="grid gap-3 lg:grid-cols-3" aria-label="Cash and trade">
        <div className="ui-card p-4 lg:col-span-2 flex flex-col">
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <h3 className="ui-card-label" style={{ color: 'rgb(var(--fg))' }}>Cash over the next 30 days</h3>
            <span className="ui-subtle text-xs">Finalised documents only — drafts excluded</span>
          </div>

          {forecast.hasEvents ? (
            <>
              <div className="flex items-baseline gap-4 flex-wrap mt-2">
                <span>
                  <span className="ui-subtle text-xs block">Today</span>
                  <b className="ui-mono text-lg">{formatMoney(forecast.start, currentCompany)}</b>
                </span>
                <ArrowRight size={14} aria-hidden="true" style={{ color: 'rgb(var(--fg-subtle))' }} />
                <span>
                  <span className="ui-subtle text-xs block">In 30 days</span>
                  <b
                    className="ui-mono text-lg"
                    style={{ color: `rgb(var(--${forecast.end < forecast.start ? 'neg' : 'pos'}))` }}
                  >
                    {formatMoney(forecast.end, currentCompany)}
                  </b>
                </span>
                <span className="ms-auto text-xs" style={{ color: 'rgb(var(--fg-muted))' }}>
                  expecting <b className="ui-mono" style={{ color: 'rgb(var(--pos))' }}>{formatMoney(forecast.expectedIn, currentCompany)}</b> in
                  {' · '}
                  <b className="ui-mono" style={{ color: 'rgb(var(--neg))' }}>{formatMoney(forecast.expectedOut, currentCompany)}</b> out
                </span>
              </div>

              <svg viewBox="0 0 300 70" preserveAspectRatio="none" className="w-full h-24 mt-3" role="img"
                aria-label={`Projected cash, lowest ${formatMoney(forecast.lowest.value, currentCompany)} on day ${forecast.lowest.day}`}>
                {(() => {
                  const vals = forecast.points.map((p) => p.value);
                  const min = Math.min(...vals, 0);
                  const max = Math.max(...vals, 1);
                  const y = (v) => 66 - ((v - min) / (max - min || 1)) * 60;
                  const x = (i) => (i / (vals.length - 1)) * 300;
                  const d = vals.map((v, i) => `${i ? 'L' : 'M'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
                  return (
                    <>
                      {min < 0 ? (
                        <line x1="0" x2="300" y1={y(0)} y2={y(0)} stroke="rgb(var(--neg))" strokeWidth="1" strokeDasharray="3 3" />
                      ) : null}
                      <path d={`${d} L 300 70 L 0 70 Z`} fill="rgb(var(--brand) / 0.10)" />
                      <path d={d} fill="none" stroke="rgb(var(--brand))" strokeWidth="2" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
                      <circle cx={x(forecast.lowest.day)} cy={y(forecast.lowest.value)} r="3" fill="rgb(var(--warn))" />
                    </>
                  );
                })()}
              </svg>

              <p className="ui-subtle text-xs mt-1">
                Lowest point <b className="ui-mono" style={{ color: 'rgb(var(--warn))' }}>{formatMoney(forecast.lowest.value, currentCompany)}</b>
                {' '}on day {forecast.lowest.day}. Projection, not a promise — it assumes everyone pays on the due date.
              </p>
            </>
          ) : (
            <p className="ui-subtle text-sm mt-2">
              Nothing is scheduled in or out. A projection appears once there are unpaid invoices or bills with due dates.
            </p>
          )}
        </div>

        <div className="ui-card p-4 flex flex-col">
          <div className="flex items-baseline justify-between gap-2 flex-wrap">
            <h3 className="ui-card-label" style={{ color: 'rgb(var(--fg))' }}>
              Stock on hand
            </h3>
            <span className="ui-subtle text-xs">{activeWarehouseId ? 'this warehouse' : 'all warehouses'}</span>
          </div>
          {stock ? (
            <>
              <div className="ui-mono text-[1.4rem] font-semibold leading-9">{formatMoney(stock.value, currentCompany)}</div>
              <div className="ui-subtle text-xs">at purchase cost · {stock.itemCount} item{stock.itemCount === 1 ? '' : 's'}</div>
              {stock.lowCount || stock.out ? (
                <div className="mt-2 space-y-1">
                  {stock.out ? (
                    <div className="text-xs font-medium" style={{ color: 'rgb(var(--neg))' }}>
                      {stock.out} item{stock.out === 1 ? '' : 's'} out of stock
                    </div>
                  ) : null}
                  {stock.low.map((l) => (
                    <div key={l.name} className="flex justify-between gap-2 text-xs">
                      <span className="truncate">{l.name}</span>
                      <b className="ui-mono" style={{ color: 'rgb(var(--warn))' }}>
                        {l.qty}{l.unit ? ` ${l.unit}` : ''} left
                      </b>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="ui-subtle text-xs mt-2">Nothing below its reorder level.</div>
              )}
            </>
          ) : (
            <div className="ui-subtle text-sm mt-2">Stock could not be read for this warehouse.</div>
          )}
        </div>
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

      {/* Income against expenses, on one basis at a time, plus what happened lately. */}
      <section className="grid gap-3 lg:grid-cols-3" aria-label="Income, expenses and activity">
        <div className="ui-card p-4 lg:col-span-2">
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <h3 className="ui-card-label" style={{ color: 'rgb(var(--fg))' }}>Income against expenses</h3>
            <div className="flex items-center rounded-lg p-0.5" style={{ backgroundColor: 'rgb(var(--surface-sunken))' }}
              role="group" aria-label="Accounting basis">
              {[
                { key: 'accrual', label: 'Accrual' },
                { key: 'cash', label: 'Cash' },
              ].map((b2) => (
                <button
                  key={b2.key}
                  type="button"
                  onClick={() => setBasis(b2.key)}
                  aria-pressed={basis === b2.key}
                  className="px-2.5 h-7 rounded-md text-xs font-medium"
                  style={
                    basis === b2.key
                      ? { backgroundColor: 'rgb(var(--surface))', color: 'rgb(var(--fg))', boxShadow: 'var(--shadow-card)' }
                      : { color: 'rgb(var(--fg-muted))' }
                  }
                >
                  {b2.label}
                </button>
              ))}
            </div>
          </div>
          <p className="ui-subtle text-xs mt-1">
            {basis === 'accrual'
              ? 'What was earned and incurred — invoices and bills by their own date.'
              : 'What actually moved — receipts and payments only.'}
          </p>

          {basisSeries.income || basisSeries.expense ? (
            <>
              <div className="flex items-end gap-2 h-28 mt-3">
                {basisSeries.series.map((b3) => {
                  const peak = Math.max(...basisSeries.series.flatMap((x) => [x.income, x.expense]), 1);
                  return (
                    <div key={b3.to} className="flex-1 flex items-end gap-1 h-full" title={b3.to}>
                      <span className="flex-1 rounded-t" style={{ height: `${(b3.income / peak) * 100}%`, backgroundColor: 'rgb(var(--pos))', minHeight: b3.income ? 2 : 0 }} />
                      <span className="flex-1 rounded-t" style={{ height: `${(b3.expense / peak) * 100}%`, backgroundColor: 'rgb(var(--neg) / 0.75)', minHeight: b3.expense ? 2 : 0 }} />
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-4 mt-2 text-xs" style={{ color: 'rgb(var(--fg-muted))' }}>
                <span className="inline-flex items-center gap-1.5">
                  <i className="w-2 h-2 rounded-sm inline-block" style={{ backgroundColor: 'rgb(var(--pos))' }} aria-hidden="true" />
                  {basis === 'cash' ? 'Received' : 'Billed'} <b className="ui-mono" style={{ color: 'rgb(var(--fg))' }}>{formatMoney(basisSeries.income, currentCompany)}</b>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <i className="w-2 h-2 rounded-sm inline-block" style={{ backgroundColor: 'rgb(var(--neg))' }} aria-hidden="true" />
                  {basis === 'cash' ? 'Paid' : 'Incurred'} <b className="ui-mono" style={{ color: 'rgb(var(--fg))' }}>{formatMoney(basisSeries.expense, currentCompany)}</b>
                </span>
                <span className="ms-auto">
                  Net <b className="ui-mono" style={{ color: `rgb(var(--${basisSeries.income - basisSeries.expense >= 0 ? 'pos' : 'neg'}))` }}>
                    {formatMoney(basisSeries.income - basisSeries.expense, currentCompany)}
                  </b>
                </span>
              </div>
            </>
          ) : (
            <p className="ui-subtle text-sm mt-3">
              {basis === 'cash'
                ? 'No receipts or payments recorded yet.'
                : 'No invoices or bills in this window yet.'}
            </p>
          )}
        </div>

        <div className="ui-card p-4">
          <h3 className="ui-card-label" style={{ color: 'rgb(var(--fg))' }}>Recent activity</h3>
          {activity.length ? (
            <ul className="mt-2 space-y-2">
              {activity.map((a2, i) => (
                <li key={`${a2.kind}-${i}`} className="flex items-start gap-2.5 text-xs">
                  <span
                    className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
                    style={{ backgroundColor: `rgb(var(--${a2.tone === 'muted' ? 'border-strong' : a2.tone}))` }}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{a2.title}</span>
                    {a2.who ? <span style={{ color: 'rgb(var(--fg-muted))' }}> · {a2.who}</span> : null}
                    <span className="ui-subtle block">{a2.date} · {a2.note}</span>
                  </span>
                  <b className="ui-mono" style={{ color: `rgb(var(--${a2.amount < 0 ? 'neg' : 'pos'}))` }}>
                    {a2.amount < 0 ? '−' : '+'}{formatMoneyCompact(Math.abs(a2.amount), currentCompany)}
                  </b>
                </li>
              ))}
            </ul>
          ) : (
            <p className="ui-subtle text-sm mt-2">Nothing recorded yet.</p>
          )}
        </div>
      </section>

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
          {/*
            The measures comparison table has moved to Reports.

            Nine rows of This period / Last period / Change is a report — it
            answers a question you already had. A dashboard says which question
            to ask, and on a new company every cell of that table read ₹0.00.
          */}

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
          {/*
            Two cards, not nine.

            Outstanding by age, Billed by period, Billed and collected, Spent by
            period, In against out and Where the money is owed all reported
            figures the panels above now carry, and the collection-rate gauge
            was a caption drawn as a graphic. Reading the same number twice does
            not make it truer; it costs a screen.

            What survives says something nothing else does: who has been owing
            longest, and what the money went on.
          */}
          <div className="grid gap-4 md:grid-cols-2">
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
          </div>
        </>
      )}
    </div>
  );
}
