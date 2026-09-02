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


const num = (v) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
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
  /**
   * Cool to warm as the debt ages, in five distinguishable steps: pine, pale
   * amber, amber, pale red, red. Two of them used to be the brand and a
   * hardcoded `234 88 12` — orange-600, a literal left behind when the brand
   * stopped being orange, and the only colour in this file outside the tokens.
   * The pale steps are the same token at reduced alpha rather than new hues,
   * so the ramp cannot drift from the semantics it sits beside.
   */
  const tones = {
    pos: 'rgb(var(--brand))',
    warn: 'rgb(var(--warn) / 0.55)',
    warn2: 'rgb(var(--warn))',
    neg2: 'rgb(var(--neg) / 0.6)',
    neg: 'rgb(var(--neg))',
  };
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
              style={{ width: `${(amt / total) * 100}%`, backgroundColor: tones[b.tone] }}
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
            <span className="inline-block w-2 h-2 rounded-sm" style={{ backgroundColor: tones[b.tone] }} aria-hidden="true" />
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

/**
 * The entries posted in the gutters.
 *
 * Each pair is one transaction: a debit ranged toward the centre on the left
 * and its credit answering on the right, half a beat later. Widths and offsets
 * are fixed rather than random so the two sides line up on the same rules —
 * a ledger where the columns do not agree is the one thing this cannot look
 * like.
 *
 * The rules are 34px apart, so every `top` is a multiple of that.
 */
const LEDGER_ENTRIES = [
  { top: 68, width: 54, delay: 0 },
  { top: 170, width: 38, delay: 3.5 },
  { top: 272, width: 66, delay: 7 },
  { top: 374, width: 44, delay: 10.5 },
  { top: 476, width: 58, delay: 14 },
  { top: 578, width: 34, delay: 17.5 },
];

/**
 * Ruled paper and posted entries, one side of the greeting.
 *
 * The class name is written out rather than interpolated. Tailwind tree-shakes
 * `@layer components` rules whose selector never appears literally in the
 * source, so `ui-ledger-gutter-${side}` meant both side rules were dropped from
 * the build and the two gutters stacked on top of each other at the left edge.
 */
const GUTTER_CLASS = {
  l: 'ui-ledger-gutter ui-ledger-gutter-l',
  r: 'ui-ledger-gutter ui-ledger-gutter-r',
};

function LedgerGutter({ side }) {
  return (
    <div className={GUTTER_CLASS[side]} aria-hidden="true">
      <span className="ui-ledger-rules" />
      {LEDGER_ENTRIES.map((e) => (
        <span
          key={`${side}-${e.top}`}
          className="ui-ledger-mark"
          style={{ top: e.top, width: e.width, animationDelay: `${e.delay}s` }}
        />
      ))}
    </div>
  );
}

function DashboardHero({ name, initials, avatarUrl, insights, onCommand, actions }) {
  const [idx, setIdx] = useState(0);
  const list = Array.isArray(insights) ? insights.filter(Boolean) : [];
  const active = list.length ? list[Math.min(idx, list.length - 1)] : null;

  return (
    <section className="relative pt-8 pb-2 text-center" aria-label="Overview">
      <LedgerGutter side="l" />
      <LedgerGutter side="r" />
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt=""
          width={48}
          height={48}
          className="mx-auto mb-5 h-12 w-12 rounded-full object-cover"
          style={{ border: '1px solid rgb(var(--border))' }}
        />
      ) : (
        <span
          className="mx-auto mb-5 grid h-12 w-12 place-items-center rounded-full text-sm font-bold"
          style={{ backgroundColor: 'rgb(var(--brand))', color: 'rgb(var(--on-brand))' }}
          aria-hidden="true"
        >
          {initials}
        </span>
      )}

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
  onNewInvoice,
  onOpenInvoices,
  invoices: invoicesProp = null,
  activeWarehouseId = '',
  onOpenCommand = null,
  onNewBill = null,
  onRecordReceipt = null,
  onOpenCustomers = null,
  onOpenReports = null,
  userName = '',
  userAvatarUrl = '',
  userInitials = '',
}) {
  /**
   * Cash and accrual answer different questions and must never be mixed on one
   * screen: accrual says what the business earned, cash says what reached the
   * account. A company can be profitable on one and unable to pay a vendor on
   * the other, which is the whole reason the switch exists. It is global here
   * rather than per-card so two panels can never sit side by side on different
   * bases.
   */

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












  /**
   * Insights: observations computed from the figures already on this page.
   * Every line cites its numbers; nothing is predicted and nothing is
   * invented. An empty list renders nothing rather than filler.
   */


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

  /** Five is enough to act on; a ranking longer than that is a report. */
  const topDebtors = useMemo(
    () => (Array.isArray(recv?.byCustomer) ? recv.byCustomer : []).filter((c) => c.amount > 0).slice(0, 5),
    [recv]
  );

  /**
   * How far through the filing window we are, as a percentage.
   *
   * The window is the eleven days from the start of the month to the 11th,
   * which is when GSTR-1 is due for a monthly filer. The dial fills as the
   * time runs out, so a full dial means "file today", not "all done".
   */
  const gstWindowPct = useMemo(() => {
    const left = Number(gst?.daysToGstr1);
    if (!Number.isFinite(left)) return 0;
    if (left < 0) return 100;
    return Math.max(0, Math.min(100, Math.round(((11 - left) / 11) * 100)));
  }, [gst]);

  const userEmail = (() => {
    try {
      return localStorage.getItem('userEmail') || '';
    } catch {
      return '';
    }
  })();
  /**
   * The shell has already resolved who this is from /auth/me, so prefer that.
   * Parsing the email is the fallback for the first paint, before the profile
   * lands — it is why the greeting said "Test" for an address like
   * test@… even after a real first name had been saved.
   */
  const heroName = String(userName || '').trim().split(/\s+/)[0] || nameFromEmail(userEmail);
  const heroInitials = userInitials || initialsFor(heroName, userEmail, currentCompany?.name);

  const quickActions = [
    onNewInvoice ? { label: 'New invoice', Icon: FileText, onClick: onNewInvoice } : null,
    onRecordReceipt ? { label: 'Record receipt', Icon: Receipt, onClick: onRecordReceipt } : null,
    onNewBill ? { label: 'New bill', Icon: Wallet, onClick: onNewBill } : null,
    onOpenCustomers ? { label: 'Add customer', Icon: Plus, onClick: onOpenCustomers } : null,
    onOpenReports ? { label: 'Reports', Icon: TrendingUp, onClick: onOpenReports } : null,
  ].filter(Boolean);

  return (
    <div className="ui-hero-ground space-y-5">
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
        avatarUrl={userAvatarUrl}
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
        The three things worth a look every morning, and the reason each one is
        a different shape.

        Ageing is a proportion, so it is a bar you read left to right. Debtors
        are a ranking, so they are bars you read top to bottom. The filing
        window is a countdown against a fixed date, so it is a dial. Giving all
        three the same card would have made them look like the same kind of
        fact, and they are not.

        All three are "as of today" and none of them moves with the period
        control below — which is exactly why they sit above it.
      */}
      <section className="grid gap-3 lg:grid-cols-3 pt-2" aria-label="Today">
        {/* Proportion — where the receivable book is sitting. */}
        <div className="ui-card p-4 flex flex-col">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="ui-t-section">Outstanding by age</h2>
            {recv.count ? (
              <button type="button" onClick={onOpenInvoices} className="ui-t-body" style={{ color: 'rgb(var(--brand-ink))', fontWeight: 600 }}>
                All invoices
              </button>
            ) : null}
          </div>
          <p className="ui-subtle ui-t-body mt-0.5">
            {recv.count
              ? `${formatMoney(recv.total, currentCompany)} across ${recv.count} invoice${recv.count === 1 ? '' : 's'}`
              : 'Nothing outstanding'}
          </p>

          {recv.total > 0 ? (
            <>
              <AgeingBar buckets={recv.buckets} total={recv.total} company={currentCompany} onPick={onOpenInvoices ? () => onOpenInvoices() : undefined} />
              {recv.oldestDays > 0 ? (
                <p className="ui-subtle ui-t-body mt-auto pt-3">
                  Oldest is <b style={{ color: 'rgb(var(--neg))' }}>{recv.oldestDays} days</b> past due.
                </p>
              ) : null}
            </>
          ) : (
            <p className="ui-subtle ui-t-body mt-3">Every invoice in the book is settled.</p>
          )}
        </div>

        {/* Ranking — who to call first. */}
        <div className="ui-card p-4">
          <h2 className="ui-t-section">Who owes you most</h2>
          <p className="ui-subtle ui-t-body mt-0.5">
            {topDebtors.length ? 'By balance, with how late the oldest is' : 'Nobody owes you anything'}
          </p>
          {topDebtors.length ? (
            <div className="mt-3 space-y-2.5">
              {topDebtors.map((c) => {
                const share = recv.total > 0 ? Math.max(4, Math.round((c.amount / recv.total) * 100)) : 0;
                return (
                  <div key={c.name}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="ui-t-body truncate" style={{ color: 'rgb(var(--col-party))', fontWeight: 600 }}>{c.name}</span>
                      <span className="ui-mono ui-t-body" style={{ fontWeight: 600 }}>{formatMoney(c.amount, currentCompany)}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="h-1.5 flex-1 rounded-full overflow-hidden" style={{ backgroundColor: 'rgb(var(--surface-sunken))' }}>
                        <span
                          className="block h-full rounded-full"
                          style={{ width: `${share}%`, backgroundColor: c.oldest > 0 ? 'rgb(var(--neg))' : 'rgb(var(--brand))' }}
                        />
                      </span>
                      <span className="ui-subtle" style={{ fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                        {c.oldest > 0 ? `${c.oldest}d late` : 'not due'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>

        {/* Countdown — a fixed date the tax office set, not one you chose. */}
        <div className="ui-card p-4 flex flex-col">
          <h2 className="ui-t-section">GSTR-1 filing</h2>
          <p className="ui-subtle ui-t-body mt-0.5">{gst.monthLabel}</p>

          {Number.isFinite(gst.daysToGstr1) ? (
            <div className="mt-2 flex-1">
              <Suspense fallback={<ChartFallback height={150} />}>
                <RadialGauge
                  value={gstWindowPct}
                  label="Filing window"
                  centerText={
                    gst.daysToGstr1 < 0
                      ? 'Overdue'
                      : `${gst.daysToGstr1}d left`
                  }
                  height={150}
                  tone={gst.daysToGstr1 < 0 ? 'neg' : gst.daysToGstr1 <= 5 ? 'neg' : gst.daysToGstr1 <= 10 ? '' : 'pos'}
                />
              </Suspense>
              <div className="flex items-baseline justify-between gap-3 mt-1">
                <span className="ui-subtle ui-t-body">
                  {gst.creditCarried > 0 ? 'Credit carried' : 'Payable'}
                </span>
                <span className="ui-mono ui-t-body" style={{ fontWeight: 600 }}>
                  {formatMoney(gst.creditCarried > 0 ? gst.creditCarried : gst.payable, currentCompany)}
                </span>
              </div>
              {gst.draftsInMonth > 0 ? (
                <p className="ui-t-body mt-2" style={{ color: 'rgb(var(--warn))' }}>
                  {gst.draftsInMonth} draft invoice{gst.draftsInMonth === 1 ? '' : 's'} would be left out of this return.
                </p>
              ) : null}
            </div>
          ) : (
            <p className="ui-subtle ui-t-body mt-3">Nothing to file for this period yet.</p>
          )}
        </div>
      </section>

      {/*
        The period-governed detail used to live here: the thirty-day cash
        projection, stock on hand, the setup checklist, income against
        expenses, recent activity, the worklist and two ranked charts.

        Removed on request. The dashboard is now the greeting, the six figures
        and the three things worth a look every morning — everything on it is
        as-of-today, which is why the period control went with them.

        Where each one went, so nothing is quietly lost:
          · Cash projection and income vs expenses — Reports › Cash Flow and P&L
          · Recent activity — the module lists, each with its own dates
          · Setup checklist and worklist — no other home. If a new company
            needs the nudge back, this is the block to restore; the components
            are still in this file and cost nothing while unused.
      */}
    </div>
  );
}
