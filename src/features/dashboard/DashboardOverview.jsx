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
};
const { ChartLegend, CompositionPie, DonutChart, RadialGauge } = CircularCharts;

/** Reserves the chart's height so nothing below it jumps when it arrives. */
const ChartFallback = ({ height = 220 }) => (
  <div className="ui-skel w-full" style={{ height, borderRadius: 'var(--radius)' }} aria-hidden="true" />
);
import { PageHeader, EmptyState } from '../../components/ui/Primitives';
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
function MetricCard({ label, value, company, deltaValue, invertDelta, hint, series = [], actionLabel, onAction }) {
  const counted = useCountUp(value);

  const path = useMemo(() => {
    if (series.length < 2) return '';
    const max = Math.max(...series, 1);
    const step = 100 / (series.length - 1);
    return series
      .map((v, i) => `${i === 0 ? 'M' : 'L'} ${(i * step).toFixed(2)} ${(24 - (v / max) * 22).toFixed(2)}`)
      .join(' ');
  }, [series]);

  return (
    <article className="ui-card ui-hover-raise p-6 flex flex-col">
      <h3 className="ui-card-label">{label}</h3>

      {/* Compact at a glance; the exact figure is one hover away and lives in
          full in the tables below. */}
      <p className="ui-kpi mt-3" title={formatMoney(counted, company)}>
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

  return (
    <section className="ui-card p-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="ui-title text-sm">Billed and collected</h2>
          <p className="ui-subtle text-xs mt-0.5">Per period, in {company?.currency || 'INR'}</p>
        </div>
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
    </section>
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
  onOpenBranches,
  branchFilterLabel = 'All',
  invoices: invoicesProp = null,
}) {
  const [rangeKey, setRangeKey] = useState('90');
  const range = RANGES.find((r) => r.key === rangeKey) || RANGES[1];

  const allInvoices = useMemo(() => {
    if (Array.isArray(invoicesProp)) return invoicesProp;
    return (Array.isArray(db?.invoices) ? db.invoices : []).filter((i) => i.companyId === currentCompany?.id);
  }, [invoicesProp, db, currentCompany]);

  // Pinned once per mount rather than read during render: "now" moving between
  // renders makes the bucketing impure, and every memo below depends on it.
  const [now] = useState(() => Date.now());

  /** Invoices inside the chosen window, and the window immediately before it. */
  const { current, previous } = useMemo(() => {
    if (!range.days) return { current: allInvoices, previous: [] };
    const from = now - range.days * DAY;
    const prevFrom = from - range.days * DAY;

    const cur = [];
    const prev = [];
    for (const inv of allInvoices) {
      const d = toDate(inv.date);
      if (!d) continue;
      const t = d.getTime();
      if (t >= from) cur.push(inv);
      else if (t >= prevFrom) prev.push(inv);
    }
    return { current: cur, previous: prev };
  }, [allInvoices, range, now]);

  const sum = (rows, fn) => rows.reduce((s, r) => s + fn(r), 0);

  const billed = sum(current, (i) => num(i.total));
  const collected = sum(current, (i) => num(i.paidAmount));
  const outstanding = Math.max(0, billed - collected);

  const prevBilled = sum(previous, (i) => num(i.total));
  const prevCollected = sum(previous, (i) => num(i.paidAmount));
  const prevOutstanding = Math.max(0, prevBilled - prevCollected);

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
      { label: 'Not yet due', amount: 0, color: 'rgb(var(--pos))' },
      { label: '1–30 days', amount: 0, color: 'rgb(var(--warn))' },
      { label: '31–60 days', amount: 0, color: 'rgb(var(--accent))' },
      { label: 'Over 60 days', amount: 0, color: 'rgb(var(--neg))' },
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
  }, [current, now]);

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

  const sparkOf = (key) => buckets.map((b) => b[key]);
  const collectedPct = billed > 0 ? Math.round((collected / billed) * 100) : 0;

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

      {allInvoices.length === 0 ? (
        <div className="ui-card">
          <EmptyState
            title="No invoices yet"
            description="Raise your first invoice and this dashboard fills in — billed, collected, and who still owes you."
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
          <div className="ui-stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Billed"
              value={billed}
              company={currentCompany}
              deltaValue={delta(billed, prevBilled)}
              hint="vs last period"
              series={sparkOf('billed')}
              actionLabel="View invoices"
              onAction={onOpenInvoices}
            />
            <MetricCard
              label="Collected"
              value={collected}
              company={currentCompany}
              deltaValue={delta(collected, prevCollected)}
              hint={`${collectedPct}% of billed`}
              series={sparkOf('collected')}
              actionLabel="View receipts"
              onAction={onOpenReceipts}
            />
            <MetricCard
              label="Outstanding"
              value={outstanding}
              company={currentCompany}
              deltaValue={delta(outstanding, prevOutstanding)}
              invertDelta
              hint={`${current.filter((i) => num(i.total) - num(i.paidAmount) > 0).length} unpaid`}
              actionLabel="Chase payment"
              onAction={onOpenInvoices}
            />
            <MetricCard
              label="Average invoice"
              value={current.length ? billed / current.length : 0}
              company={currentCompany}
              deltaValue={delta(
                current.length ? billed / current.length : 0,
                previous.length ? prevBilled / previous.length : 0
              )}
              hint="per invoice"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
            <RevenueChart buckets={buckets} company={currentCompany} />

            {/* A gauge rather than a bar: the arc has a visible end, so the
                distance still to collect is as readable as the part already
                collected. */}
            <section className="ui-card p-5 flex flex-col">
              <h2 className="ui-title text-sm">Collection rate</h2>
              <p className="ui-subtle text-xs mt-0.5">Of everything billed this period</p>
              <div className="flex-1 flex flex-col justify-center">
                <Suspense fallback={<ChartFallback height={190} />}>
                  <RadialGauge
                    value={collectedPct}
                    label="Collection rate"
                    tone={collectedPct >= 70 ? 'pos' : collectedPct >= 40 ? undefined : 'neg'}
                    height={190}
                  />
                </Suspense>
                <p className="text-center text-sm ui-muted -mt-2">
                  <span className="ui-fg font-medium">{formatMoney(collected, currentCompany)}</span> collected of{' '}
                  {formatMoney(billed, currentCompany)}
                </p>
              </div>
            </section>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <AgingPanel
              buckets={aging}
              total={aging.reduce((s, b) => s + b.amount, 0)}
              company={currentCompany}
            />
            <TopCustomers rows={topCustomers} company={currentCompany} />
          </div>
        </>
      )}
    </div>
  );
}
