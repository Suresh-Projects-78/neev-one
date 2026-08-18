import React, { Suspense, lazy, useMemo, useState } from 'react';
import { ClipboardList, Receipt, Wallet, FileText } from 'lucide-react';

import { formatMoney, formatMoneyCompact } from '../../utils/money';
import ChartCard from '../../components/charts/ChartCard';
import { PageHeader, EmptyState, StatTile } from '../../components/ui/Primitives';

/**
 * The purchase module's own dashboard.
 *
 * This screen shipped as a placeholder ("statistics will appear here") while
 * the main dashboard grew charts — exactly the inconsistency a user notices
 * first. It now answers the module's three questions in the product's one
 * card language: what did we buy, what have we paid, and who are we buying
 * from. Bills and expense vouchers fold into a single stream, drafts
 * excluded, because a draft is an intention rather than a liability.
 */

const PeriodBars = lazy(() =>
  import('../../components/charts/CircularCharts').then((m) => ({ default: m.PeriodBars }))
);
const CompositionPie = lazy(() =>
  import('../../components/charts/CircularCharts').then((m) => ({ default: m.CompositionPie }))
);
const RankedBars = lazy(() =>
  import('../../components/charts/CircularCharts').then((m) => ({ default: m.RankedBars }))
);

const ChartFallback = ({ height = 220 }) => (
  <div className="ui-skel w-full" style={{ height, borderRadius: 'var(--radius)' }} aria-hidden="true" />
);

const DAY = 86_400_000;

const RANGES = [
  { key: '30', label: '30 days', days: 30 },
  { key: '90', label: '90 days', days: 90 },
  { key: '365', label: '12 months', days: 365 },
  { key: 'all', label: 'All time', days: null },
];

const num = (v) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const toDate = (v) => {
  const d = new Date(`${String(v || '').slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
};

export default function PurchaseOverview({ db, currentCompany }) {
  const [rangeKey, setRangeKey] = useState('90');
  const range = RANGES.find((r) => r.key === rangeKey) || RANGES[1];
  const [now] = useState(() => Date.now());

  const allDocs = useMemo(() => {
    const pick = (rows, fallbackName) =>
      (Array.isArray(rows) ? rows : [])
        .filter((r) => r.companyId === currentCompany?.id)
        .filter((r) => String(r.status || '').toLowerCase() !== 'draft')
        .map((r) => ({
          date: r.date,
          total: num(r.total),
          paid: num(r.paidAmount),
          vendorName: String(r.vendorName || '').trim() || fallbackName,
        }));
    return [...pick(db?.bills, 'Unnamed vendor'), ...pick(db?.expenses, 'Expense')];
  }, [db, currentCompany]);

  const docs = useMemo(() => {
    if (!range.days) return allDocs;
    const from = now - range.days * DAY;
    return allDocs.filter((d) => {
      const t = toDate(d.date)?.getTime();
      return t != null && t >= from;
    });
  }, [allDocs, range, now]);

  const purchased = docs.reduce((s, d) => s + d.total, 0);
  const paid = docs.reduce((s, d) => s + Math.min(d.paid, d.total), 0);
  const outstanding = Math.max(0, purchased - paid);
  const unpaidCount = docs.filter((d) => d.total - d.paid > 0.0001).length;

  const buckets = useMemo(() => {
    if (!docs.length) return [];
    const days = range.days || 365;
    const slots = 6;
    const width = (days * DAY) / slots;
    const start = now - days * DAY;
    const out = Array.from({ length: slots }, (_, i) => ({
      label: new Date(start + i * width).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
      value: 0,
    }));
    for (const d of docs) {
      const t = toDate(d.date)?.getTime();
      if (t == null) continue;
      const idx = Math.min(slots - 1, Math.max(0, Math.floor((t - start) / width)));
      out[idx].value += d.total;
    }
    return out;
  }, [docs, range, now]);

  const topVendors = useMemo(() => {
    const byName = new Map();
    for (const d of docs) {
      if (d.total <= 0) continue;
      byName.set(d.vendorName, (byName.get(d.vendorName) || 0) + d.total);
    }
    return [...byName.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [docs]);

  const owedVendors = useMemo(() => {
    const byName = new Map();
    for (const d of docs) {
      const due = Math.max(0, d.total - d.paid);
      if (due <= 0) continue;
      byName.set(d.vendorName, (byName.get(d.vendorName) || 0) + due);
    }
    return [...byName.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [docs]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Purchases"
        description={`${docs.length} bill${docs.length === 1 ? '' : 's'} and expenses in the last ${range.label.toLowerCase()}`}
        actions={
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
        }
      />

      {allDocs.length === 0 ? (
        <div className="ui-card">
          <EmptyState
            icon={Receipt}
            title="No purchases yet"
            description="Record a bill or an expense and this overview fills in — spend, dues and vendor share."
          />
        </div>
      ) : (
        <>
          <div className="ui-stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile
              label="Purchased"
              amount={purchased}
              format={(v) => formatMoneyCompact(v, currentCompany)}
              title={formatMoney(purchased, currentCompany)}
              hint={`Across ${docs.length} documents`}
              icon={ClipboardList}
            />
            <StatTile
              label="Paid out"
              amount={paid}
              format={(v) => formatMoneyCompact(v, currentCompany)}
              title={formatMoney(paid, currentCompany)}
              hint={purchased > 0 ? `${Math.round((paid / purchased) * 100)}% of purchased` : 'Nothing yet'}
              tone="pos"
              icon={Wallet}
            />
            <StatTile
              label="Owed to vendors"
              amount={outstanding}
              format={(v) => formatMoneyCompact(v, currentCompany)}
              title={formatMoney(outstanding, currentCompany)}
              hint={`${unpaidCount} document${unpaidCount === 1 ? '' : 's'} unpaid`}
              tone="neg"
              icon={FileText}
            />
            <StatTile
              label="Average document"
              amount={docs.length ? purchased / docs.length : 0}
              format={(v) => formatMoneyCompact(v, currentCompany)}
              title={formatMoney(docs.length ? purchased / docs.length : 0, currentCompany)}
              hint="Value per bill or expense"
              icon={Receipt}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <ChartCard title="Spent by period" subtitle={`Last ${range.label.toLowerCase()}`}>
              {buckets.every((b) => b.value <= 0) ? (
                <EmptyState icon={Receipt} title="Nothing in this window" description="Pick a longer period." />
              ) : (
                <Suspense fallback={<ChartFallback height={240} />}>
                  <PeriodBars
                    data={buckets}
                    height={240}
                    tone="deep"
                    formatter={(v) => formatMoneyCompact(v, currentCompany)}
                  />
                </Suspense>
              )}
            </ChartCard>

            <ChartCard title="Where the money goes" subtitle="Share of spend, by vendor">
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

            <ChartCard title="Who we owe" subtitle="Outstanding, by vendor">
              {owedVendors.length === 0 ? (
                <EmptyState icon={Wallet} title="Nothing owed" description="Every bill in view is settled." />
              ) : (
                <Suspense fallback={<ChartFallback height={240} />}>
                  <RankedBars
                    data={owedVendors}
                    height={240}
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
