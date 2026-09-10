import React, { Suspense, lazy, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Calendar,
  ChevronDown,
  Clock,
  Download,
  FileText,
  LayoutList,
  MoreHorizontal,
  Plus,
  Undo2,
  Wallet,
} from 'lucide-react';

import { formatMoney, formatMoneyCompact } from '../../utils/money';
import { getVendorDisplayName } from '../../utils/contacts';
import { csvSafeValue } from '../../utils/csv';
import { MoneyValue } from '../../components/docs';
import {
  EmptyPanel,
  OverviewCard,
  OverviewStatusPill as StatusPill,
  Panel,
  PanelLink,
  Segmented,
  buildPeriods,
  iso,
  parseIso,
  prettyDate,
  shortDate,
} from '../overview/OverviewParts';

const LazySeriesBars = lazy(() =>
  import('../../components/charts/CircularCharts').then((m) => ({ default: m.SeriesBars }))
);
const LazyDonutChart = lazy(() =>
  import('../../components/charts/CircularCharts').then((m) => ({ default: m.DonutChart }))
);

const ChartFallback = ({ height = 260 }) => (
  <div className="ui-skel rounded-xl" style={{ height }} aria-hidden="true" />
);

/**
 * The Purchases module's front page.
 *
 * It shipped as a placeholder — "statistics will appear here" — beside a Sales
 * overview that had six figures, two charts and the recent documents of each
 * kind. Somebody who had learnt to read one module could not read the other,
 * which is the inconsistency people notice first.
 *
 * It is the same page asking the mirror question. Sales asks what came in and
 * how much of it has been collected; this asks what went out and how much of
 * it has been paid. The furniture is shared (`../overview/OverviewParts`); the
 * figures are not, because a bill is a liability and an invoice is not.
 */
export default function PurchaseOverview({ db, currentCompany, onNavigate, onNewBill }) {
  const [nowTs] = useState(() => Date.now());
  const periods = useMemo(() => buildPeriods(nowTs), [nowTs]);
  const [periodKey, setPeriodKey] = useState('thisMonth');
  const [periodOpen, setPeriodOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [grain, setGrain] = useState('daily');
  const [breakdownBy, setBreakdownBy] = useState('vendor');

  const period = periods.find((p) => p.key === periodKey) || periods[0];
  const money = (v) => formatMoney(v, currentCompany);
  const go = (screen) => {
    if (typeof onNavigate === 'function') onNavigate(screen);
  };

  const allBills = useMemo(
    () => (Array.isArray(db?.bills) ? db.bills : []).filter((b) => b.companyId === currentCompany?.id),
    [db?.bills, currentCompany?.id]
  );
  const allDebitNotes = useMemo(
    () => (Array.isArray(db?.debitNotes) ? db.debitNotes : []).filter((d) => d.companyId === currentCompany?.id),
    [db?.debitNotes, currentCompany?.id]
  );

  const inRange = (v, from, to) => {
    const d = String(v || '').slice(0, 10);
    return Boolean(d) && d >= from && d <= to;
  };

  /**
   * Every headline figure, for a range.
   *
   * Drafts are out of the money and in the count, the same rule the Sales page
   * follows: a draft bill is a piece of paper on somebody's desk, not a debt.
   * Run twice — the chosen period and the one before it — which is what makes
   * every delta on this page a comparison rather than a decoration.
   */
  const summarise = (from, to) => {
    const rows = allBills.filter((b) => inRange(b.date, from, to));
    const live = rows.filter((b) => {
      const st = String(b.status || '').toLowerCase();
      return st !== 'draft' && st !== 'cancelled';
    });
    const today = iso(new Date(nowTs));
    let purchases = 0;
    let paid = 0;
    let payable = 0;
    let overdue = 0;
    for (const bill of live) {
      const total = Number(bill.total || 0);
      const settled = Number(bill.paidAmount || 0);
      const bal = Math.max(0, total - settled);
      purchases += total;
      paid += settled;
      payable += bal;
      const due = String(bill.dueDate || '').slice(0, 10);
      if (bal > 0 && due && due < today) overdue += bal;
    }
    const notes = allDebitNotes.filter((d) => inRange(d.date, from, to));
    return {
      purchases,
      count: rows.length,
      paid,
      payable,
      overdue,
      returned: notes.reduce((t, d) => t + Number(d.total || 0), 0),
      returnedCount: notes.length,
      rows,
    };
  };

  const current = useMemo(
    // summarise closes over the same inputs the memo lists.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    () => summarise(period.from, period.to),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allBills, allDebitNotes, period.from, period.to, nowTs]
  );
  const previous = useMemo(
    () => summarise(period.prev.from, period.prev.to),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allBills, allDebitNotes, period.prev.from, period.prev.to, nowTs]
  );

  /** Percentage change, or null when there is no baseline to compare against. */
  const delta = (now, before) => {
    if (!Number.isFinite(before) || before === 0) return null;
    return ((now - before) / Math.abs(before)) * 100;
  };

  /**
   * The series behind the spend chart.
   *
   * Paid is counted against the bill's own date rather than the day the money
   * left, because this page is about what a period cost and how much of that
   * period's cost has been settled.
   */
  const performance = useMemo(() => {
    const from = parseIso(period.from);
    const to = parseIso(period.to);
    if (!from || !to) return [];

    const keyOf = (d) => {
      if (grain === 'daily') return iso(d);
      if (grain === 'weekly') {
        const s = new Date(d);
        s.setDate(s.getDate() - s.getDay());
        return iso(s);
      }
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    };
    const labelOf = (d) =>
      grain === 'monthly'
        ? d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })
        : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });

    const buckets = new Map();
    const cursor = new Date(from);
    // A bucket per period in range, so a month with no bills draws a gap rather
    // than being silently skipped.
    let guard = 0;
    while (cursor <= to && guard < 400) {
      const k = keyOf(cursor);
      if (!buckets.has(k)) buckets.set(k, { key: k, label: labelOf(cursor), billed: 0, paid: 0, payable: 0 });
      if (grain === 'daily') cursor.setDate(cursor.getDate() + 1);
      else if (grain === 'weekly') cursor.setDate(cursor.getDate() + 7);
      else cursor.setMonth(cursor.getMonth() + 1);
      guard += 1;
    }

    for (const bill of current.rows) {
      const st = String(bill.status || '').toLowerCase();
      if (st === 'draft' || st === 'cancelled') continue;
      const d = parseIso(bill.date);
      if (!d) continue;
      const b = buckets.get(keyOf(d));
      if (!b) continue;
      const total = Number(bill.total || 0);
      const settled = Number(bill.paidAmount || 0);
      b.billed += total;
      b.paid += settled;
      b.payable += Math.max(0, total - settled);
    }
    return [...buckets.values()];
  }, [current.rows, grain, period.from, period.to]);

  /** Who or what the period's spend went on, top four and a tail. */
  const breakdown = useMemo(() => {
    const totals = new Map();
    const live = current.rows.filter((b) => {
      const st = String(b.status || '').toLowerCase();
      return st !== 'draft' && st !== 'cancelled';
    });

    if (breakdownBy === 'vendor') {
      const byId = new Map((db?.vendors || []).map((v) => [String(v.id), v]));
      for (const bill of live) {
        const name = getVendorDisplayName(byId.get(String(bill.vendorId))) || bill.vendorName || 'Unnamed vendor';
        totals.set(name, (totals.get(name) || 0) + Number(bill.total || 0));
      }
    } else {
      const byId = new Map((db?.items || []).map((i) => [String(i.id), i]));
      for (const bill of live) {
        for (const l of Array.isArray(bill.items) ? bill.items : []) {
          const name = byId.get(String(l.itemId))?.name || l.description || 'Unnamed item';
          const amount = Number(l.lineTotal ?? l.amount ?? Number(l.quantity || 0) * Number(l.rate || 0));
          totals.set(name, (totals.get(name) || 0) + amount);
        }
      }
    }

    const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]);
    const palette = ['ov-blue', 'ov-green', 'ov-amber', 'ov-violet'];
    const top = sorted.slice(0, 4).map(([name, value], i) => ({
      name,
      value,
      color: `rgb(var(--${palette[i % palette.length]}))`,
    }));
    const tail = sorted.slice(4).reduce((t, [, v]) => t + v, 0);
    if (tail > 0) top.push({ name: 'Everything else', value: tail, color: 'rgb(var(--fg-subtle))' });
    return top;
  }, [current.rows, breakdownBy, db?.vendors, db?.items]);

  const breakdownTotal = breakdown.reduce((t, r) => t + r.value, 0);

  /**
   * Why a panel is empty, when the book is not.
   *
   * "Nothing bought in this period" is true and useless if there are two years
   * of bills a window away; the reason and the way to them is one button.
   */
  const emptyReason = useMemo(() => {
    if (!allBills.length) {
      return {
        title: 'No bills yet',
        detail: 'A bill is what a vendor has charged you. Enter one and this page starts answering.',
        action: { label: 'Enter a bill', onClick: () => (typeof onNewBill === 'function' ? onNewBill() : go('bills')) },
      };
    }
    const newest = allBills
      .map((b) => String(b.date || '').slice(0, 10))
      .filter(Boolean)
      .sort()
      .pop();
    return {
      title: 'Nothing bought in this period',
      detail: newest ? `The most recent bill is dated ${prettyDate(newest)}.` : '',
      action: { label: 'See all bills', onClick: () => go('bills') },
    };
  }, [allBills, onNewBill]);

  const recentBills = useMemo(
    () =>
      allBills
        .slice()
        .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
        .slice(0, 5),
    [allBills]
  );

  const recentDebitNotes = useMemo(
    () =>
      allDebitNotes
        .slice()
        .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
        .slice(0, 5),
    [allDebitNotes]
  );

  /** The period as it stands, as a file — the figures, not the rows. */
  const exportCsv = () => {
    const lines = [
      ['Figure', 'This period', 'Previous period'],
      ['Total purchases', current.purchases, previous.purchases],
      ['Bills', current.count, previous.count],
      ['Amount paid', current.paid, previous.paid],
      ['Payables', current.payable, previous.payable],
      ['Overdue', current.overdue, previous.overdue],
      ['Purchase returns', current.returned, previous.returned],
    ]
      .map((r) => r.map((c) => csvSafeValue(c)).join(','))
      .join('\n');
    const blob = new Blob([lines], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `PurchaseOverview_${period.from}_${period.to}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="space-y-6">
      {/* Title left, the controls that govern every figure below it on the
          right — period first, because nothing else on the page means anything
          until you know what window it covers. */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="ui-t-page">Purchase Overview</h1>
          <p className="ui-muted text-sm mt-1">
            Get a snapshot of your spending, payables and purchase returns.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <button
              type="button"
              onClick={() => setPeriodOpen((v) => !v)}
              className="ui-btn ui-btn-secondary"
              aria-haspopup="listbox"
              aria-expanded={periodOpen}
            >
              <Calendar size={15} aria-hidden="true" />
              {period.label}{' '}
              <span style={{ color: 'rgb(var(--link))' }}>
                ({prettyDate(period.from)} - {prettyDate(period.to)})
              </span>
              <ChevronDown size={15} aria-hidden="true" />
            </button>
            {periodOpen ? (
              <div className="absolute end-0 mt-1 z-30 ui-card p-1 min-w-[14rem]" role="listbox" aria-label="Period">
                {periods.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    role="option"
                    aria-selected={p.key === periodKey}
                    onClick={() => {
                      setPeriodKey(p.key);
                      setPeriodOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 rounded-md text-sm ui-hover-sunken"
                    style={p.key === periodKey ? { backgroundColor: 'rgb(var(--accent-soft))' } : undefined}
                  >
                    <span>{p.label}</span>
                    <span className="block ui-subtle text-xs">
                      {prettyDate(p.from)} – {prettyDate(p.to)}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <span
            className="ui-btn ui-btn-secondary cursor-default"
            title={`Compared against ${prettyDate(period.prev.from)} – ${prettyDate(period.prev.to)}`}
          >
            Compare: Previous Period
          </span>

          <button type="button" onClick={exportCsv} className="ui-btn ui-btn-secondary">
            <Download size={15} aria-hidden="true" /> Export
          </button>

          <button
            type="button"
            onClick={() => (typeof onNewBill === 'function' ? onNewBill() : go('bills'))}
            className="ui-btn ui-btn-primary"
          >
            <Plus size={16} aria-hidden="true" /> New Bill
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => setMoreOpen((v) => !v)}
              className="ui-btn ui-btn-secondary !px-2"
              aria-label="More options"
              aria-haspopup="menu"
              aria-expanded={moreOpen}
            >
              <MoreHorizontal size={16} aria-hidden="true" />
            </button>
            {moreOpen ? (
              <div className="absolute end-0 mt-1 z-30 ui-card p-1 min-w-[13rem]" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    go('bills');
                    setMoreOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 rounded-md text-sm ui-hover-sunken flex items-center gap-2"
                >
                  <LayoutList size={15} aria-hidden="true" /> All bills
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    go('purchaseOrders');
                    setMoreOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 rounded-md text-sm ui-hover-sunken flex items-center gap-2"
                >
                  <FileText size={15} aria-hidden="true" /> Purchase orders
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* The six figures. Payables, overdue and returns read as bad-when-rising,
          so their arrows are coloured by meaning rather than direction. */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <OverviewCard
          tone="blue"
          icon={BarChart3}
          label="Total Purchases"
          value={money(current.purchases)}
          delta={delta(current.purchases, previous.purchases)}
          deltaGoodWhenUp={false}
        />
        <OverviewCard
          tone="green"
          icon={FileText}
          label="Bills"
          value={String(current.count)}
          delta={delta(current.count, previous.count)}
        />
        <OverviewCard
          tone="amber"
          icon={Wallet}
          label="Amount Paid"
          value={money(current.paid)}
          delta={delta(current.paid, previous.paid)}
        />
        <OverviewCard
          tone="violet"
          icon={Clock}
          label="Payables"
          value={money(current.payable)}
          delta={delta(current.payable, previous.payable)}
          deltaGoodWhenUp={false}
        />
        <OverviewCard
          tone="red"
          icon={AlertTriangle}
          label="Overdue"
          value={money(current.overdue)}
          delta={delta(current.overdue, previous.overdue)}
          deltaGoodWhenUp={false}
        />
        <OverviewCard
          tone="blue"
          icon={Undo2}
          label="Purchase Returns"
          value={money(current.returned)}
          delta={delta(current.returned, previous.returned)}
          note={current.returnedCount ? `${current.returnedCount} debit note(s)` : 'No returns'}
        />
      </div>

      <div className="grid gap-4 items-stretch xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <Panel
          title="Purchase Performance"
          subtitle="What you were billed, and how much of it you have paid."
          control={
            <Segmented
              ariaLabel="Grain"
              value={grain}
              onChange={setGrain}
              options={[
                { value: 'daily', label: 'Daily' },
                { value: 'weekly', label: 'Weekly' },
                { value: 'monthly', label: 'Monthly' },
              ]}
            />
          }
        >
          {current.count ? (
            <>
              <Suspense fallback={<ChartFallback height={300} />}>
                <LazySeriesBars
                  data={performance}
                  height={300}
                  series={{ bar1: 'Billed', bar2: 'Paid', line: 'Payable' }}
                  keys={{ bar1: 'billed', bar2: 'paid', line: 'payable' }}
                  formatter={(v) => money(v)}
                />
              </Suspense>
              <div className="flex items-center gap-4 flex-wrap text-xs mt-3">
                {[
                  { label: 'Billed', color: 'rgb(var(--ov-blue))' },
                  { label: 'Paid', color: 'rgb(var(--ov-green))' },
                  { label: 'Payable', color: 'rgb(var(--brand))' },
                ].map((l) => (
                  <span key={l.label} className="inline-flex items-center gap-2 ui-muted">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: l.color }} aria-hidden="true" />
                    {l.label}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <EmptyPanel height={300} {...emptyReason} />
          )}
        </Panel>

        <Panel
          title="Purchase Breakdowns"
          subtitle="Where the money went in this period."
          control={
            <Segmented
              ariaLabel="Breakdown"
              value={breakdownBy}
              onChange={setBreakdownBy}
              options={[
                { value: 'vendor', label: 'By Vendor' },
                { value: 'item', label: 'By Item' },
              ]}
            />
          }
        >
          {breakdown.length ? (
            <div className="grid gap-4 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] items-center">
              <Suspense fallback={<ChartFallback height={230} />}>
                <LazyDonutChart
                  data={breakdown}
                  height={230}
                  centerLabel="Total Spend"
                  centerValue={formatMoneyCompact(breakdownTotal, currentCompany)}
                  formatter={(v) => money(v)}
                />
              </Suspense>
              <ul className="space-y-2.5">
                {breakdown.map((r) => (
                  <li key={r.name} className="flex items-center justify-between gap-3 text-sm">
                    <span className="inline-flex min-w-0 items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                        style={{ backgroundColor: r.color }}
                        aria-hidden="true"
                      />
                      <span className="truncate">{r.name}</span>
                    </span>
                    <span className="flex flex-shrink-0 items-baseline gap-3">
                      <span className="ui-mono">{money(r.value)}</span>
                      <span className="ui-subtle text-xs w-8 text-right">
                        {breakdownTotal > 0 ? Math.round((r.value / breakdownTotal) * 100) : 0}%
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <EmptyPanel height={230} {...emptyReason} />
          )}
        </Panel>
      </div>

      <div className="grid gap-4 items-stretch lg:grid-cols-2">
        <Panel
          title="Recent Bills"
          subtitle="The last five, whatever period is chosen."
          bodyClass="justify-start"
          control={<PanelLink onClick={() => go('bills')}>View all</PanelLink>}
        >
          {recentBills.length ? (
            <table className="ui-table w-full">
              <thead>
                <tr>
                  <th scope="col">Bill #</th>
                  <th scope="col">Vendor</th>
                  <th scope="col">Date</th>
                  <th scope="col" className="ui-num">Amount</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody className="ui-rows">
                {recentBills.map((b) => (
                  <tr key={b.id}>
                    <td className="ui-col-id">{b.number || '—'}</td>
                    <td className="ui-col-entity truncate">{b.vendorName || '—'}</td>
                    <td className="ui-col-date">{shortDate(b.date)}</td>
                    <td className="ui-col-amount">
                      <MoneyValue value={b.total} company={currentCompany} />
                    </td>
                    <td>
                      <StatusPill status={b.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyPanel height={180} {...emptyReason} />
          )}
        </Panel>

        <Panel
          title="Recent Purchase Returns"
          subtitle="Debit notes raised against your vendors."
          bodyClass="justify-start"
          control={<PanelLink onClick={() => go('debitNotes')}>View all</PanelLink>}
        >
          {recentDebitNotes.length ? (
            <table className="ui-table w-full">
              <thead>
                <tr>
                  <th scope="col">Note #</th>
                  <th scope="col">Vendor</th>
                  <th scope="col">Date</th>
                  <th scope="col" className="ui-num">Amount</th>
                </tr>
              </thead>
              <tbody className="ui-rows">
                {recentDebitNotes.map((d) => (
                  <tr key={d.id}>
                    <td className="ui-col-id">{d.number || '—'}</td>
                    <td className="ui-col-entity truncate">{d.vendorName || '—'}</td>
                    <td className="ui-col-date">{shortDate(d.date)}</td>
                    <td className="ui-col-amount">
                      {/* Money coming back, so it takes the refund colour
                          rather than reading as another cost. */}
                      <MoneyValue value={d.total} company={currentCompany} kind="refund" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyPanel
              height={180}
              title="No purchase returns"
              detail="Nothing has gone back to a vendor — which is the way it should be."
            />
          )}
        </Panel>
      </div>
    </div>
  );
}
