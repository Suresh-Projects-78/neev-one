import React, { Suspense, lazy, useMemo, useState } from 'react';
import HeroBand from '../../components/ui/HeroBand';
import {
  AlertTriangle,
  BarChart3,
  Building2,
  Clock,
  Download,
  FileText,
  MoreHorizontal,
  Plus,
  Wallet,
  Calendar,
  ChevronDown,
  ClipboardList,
  ArrowRight,
  LayoutList,
} from 'lucide-react';

import Modal from '../../components/ui/Modal';
import { formatMoney, formatMoneyCompact } from '../../utils/money';
import { getCustomerDisplayName } from '../../utils/contacts';
import { branchLabel } from '../../utils/branchLabel';
import { MoneyValue } from '../../components/docs';
import { csvSafeValue } from '../../utils/csv';
import {
  EmptyPanel,
  OverviewBand,
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

const normalizeId = (v) => String(v ?? '').trim();

const getBranchLabel = branchLabel;

/**
 * The Sales module's front page.
 *
 * Six figures, two charts, the last few documents of each kind, and the five
 * things people come here to start. Built to the shared reference rather than
 * invented: the layout, the card treatment and the colour assignments are that
 * drawing, and everything in them is computed from the book.
 *
 * Nothing here is a sample. Where the book has no credit notes the panel says
 * so; where there is one month of data the chart draws one month.
 */
const SalesOverview = ({
  db,
  currentCompany,
  branches = [],
  warehouses = [],
  branchesLoading = false,
  branchesError = '',
  onNavigate = null,
  onNewInvoice = null,
  onNewCreditNote = null,
  onRecordReceipt = null,
}) => {
  const [branchPickerOpen, setBranchPickerOpen] = useState(false);
  // Pinned once per mount: period bucketing must not shift between renders.
  const [nowTs] = useState(() => Date.now());
  const [periodKey, setPeriodKey] = useState('thisMonth');

  /*
   * The grain follows the period unless somebody has said otherwise.
   *
   * Monthly over "This Month" is one bucket, which draws a single pair of bars
   * marooned in an empty chart and reads as a broken chart rather than a short
   * period. So the default is derived from how long the window actually is,
   * and re-derived when the window changes — the same during-render sync the
   * numbering settings use, rather than an effect that renders once with the
   * old value first.
   */
  const [grainChoice, setGrainChoice] = useState({ period: 'thisMonth', value: '' });
  const [breakdownBy, setBreakdownBy] = useState('customer');
  const [periodOpen, setPeriodOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const periods = useMemo(() => buildPeriods(nowTs), [nowTs]);
  const period = periods.find((p) => p.key === periodKey) || periods[0];

  /** Enough buckets to be a comparison, few enough to be readable. */
  const defaultGrainFor = (p) => {
    const days = Math.round((parseIso(p.to) - parseIso(p.from)) / 86400000) + 1;
    if (days <= 45) return 'daily';
    if (days <= 180) return 'weekly';
    return 'monthly';
  };

  if (grainChoice.period !== periodKey) {
    setGrainChoice({ period: periodKey, value: '' });
  }
  const grain = grainChoice.value || defaultGrainFor(period);
  const setGrain = (v) => setGrainChoice({ period: periodKey, value: v });

  const [selectedBranchIds, setSelectedBranchIds] = useState(() => {
    try {
      const raw = String(localStorage.getItem('dashboardBranchIds') || '').trim();
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map((x) => normalizeId(x)).filter(Boolean) : [];
    } catch {
      return [];
    }
  });
  const [pendingBranchIds, setPendingBranchIds] = useState(() => selectedBranchIds);

  const branchesSorted = useMemo(
    () =>
      (Array.isArray(branches) ? branches : [])
        .slice()
        .sort((a, b) => getBranchLabel(a).localeCompare(getBranchLabel(b))),
    [branches]
  );

  const branchById = useMemo(() => {
    const map = new Map();
    for (const b of Array.isArray(branches) ? branches : []) map.set(normalizeId(b?.id), b);
    return map;
  }, [branches]);

  const warehouseById = useMemo(() => {
    const map = new Map();
    for (const w of Array.isArray(warehouses) ? warehouses : []) map.set(normalizeId(w?.id), w);
    return map;
  }, [warehouses]);

  const branchFilterLabel = useMemo(() => {
    if (!selectedBranchIds.length) return 'All';
    if (selectedBranchIds.length === 1) {
      return getBranchLabel(branchById.get(normalizeId(selectedBranchIds[0])) || null) || '1 selected';
    }
    return `${selectedBranchIds.length} selected`;
  }, [selectedBranchIds, branchById]);

  const docBranchAllowed = useMemo(() => {
    const allowed = new Set(selectedBranchIds);
    return (doc) => {
      if (!allowed.size) return true;
      const wh = warehouseById.get(normalizeId(doc?.warehouseId)) || null;
      const bid = normalizeId(doc?.branchId) || normalizeId(wh?.branchId);
      return bid ? allowed.has(bid) : false;
    };
  }, [selectedBranchIds, warehouseById]);

  const allInvoices = useMemo(
    () =>
      (Array.isArray(db?.invoices) ? db.invoices : [])
        .filter((i) => i.companyId === currentCompany?.id)
        .filter(docBranchAllowed),
    [db?.invoices, currentCompany?.id, docBranchAllowed]
  );

  const allCreditNotes = useMemo(
    () =>
      (Array.isArray(db?.creditNotes) ? db.creditNotes : [])
        .filter((c) => c.companyId === currentCompany?.id)
        .filter(docBranchAllowed),
    [db?.creditNotes, currentCompany?.id, docBranchAllowed]
  );

  const inRange = (v, from, to) => {
    const d = String(v || '').slice(0, 10);
    return Boolean(d) && d >= from && d <= to;
  };

  /**
   * Every headline figure, for a range.
   *
   * Drafts are excluded from money throughout — a draft is an intention, not a
   * receivable — but counted, because they exist. Run twice, once for the
   * chosen period and once for the one before it, which is what makes every
   * delta on the page a real comparison rather than a decoration.
   */
  const summarise = (from, to) => {
    const rows = allInvoices.filter((i) => inRange(i.date, from, to));
    const live = rows.filter((i) => String(i.status || '').toLowerCase() !== 'draft');
    const today = iso(new Date(nowTs));
    let sales = 0;
    let received = 0;
    let receivable = 0;
    let overdue = 0;
    for (const inv of live) {
      const total = Number(inv.total || 0);
      const paid = Number(inv.paidAmount || 0);
      const bal = Math.max(0, total - paid);
      sales += total;
      received += paid;
      receivable += bal;
      if (bal > 0 && String(inv.dueDate || '').slice(0, 10) && String(inv.dueDate).slice(0, 10) < today) {
        overdue += bal;
      }
    }
    const notes = allCreditNotes.filter((c) => inRange(c.date, from, to));
    return {
      sales,
      count: rows.length,
      received,
      receivable,
      overdue,
      credit: notes.reduce((t, c) => t + Number(c.total || 0), 0),
      creditCount: notes.length,
      rows,
    };
  };

  const current = useMemo(
    () => summarise(period.from, period.to),
    // summarise closes over the same inputs the memo lists.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allInvoices, allCreditNotes, period.from, period.to, nowTs]
  );

  const previous = useMemo(
    () => summarise(period.prev.from, period.prev.to),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allInvoices, allCreditNotes, period.prev.from, period.prev.to, nowTs]
  );

  /** Percentage change, or null when there is no baseline to compare against. */
  const delta = (now, before) => {
    if (!Number.isFinite(before) || before === 0) return null;
    return ((now - before) / Math.abs(before)) * 100;
  };

  const money = (v) => formatMoney(v, currentCompany);

  /**
   * The series behind the performance chart.
   *
   * Bucketed by the chosen grain across the chosen period. Received is counted
   * against the invoice's own date rather than the date the money arrived —
   * this page is about what a period billed and how much of that period's
   * billing has come in, which is the question a proprietor actually asks.
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

    const labelOf = (d) => {
      if (grain === 'daily') return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
      if (grain === 'weekly') return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
      return d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
    };

    const buckets = new Map();
    const cursor = new Date(from);
    // A bucket per period in range, so a month with no invoices draws a gap
    // rather than being silently skipped.
    let guard = 0;
    while (cursor <= to && guard < 400) {
      const k = keyOf(cursor);
      if (!buckets.has(k)) buckets.set(k, { key: k, label: labelOf(cursor), invoiced: 0, received: 0, outstanding: 0 });
      if (grain === 'daily') cursor.setDate(cursor.getDate() + 1);
      else if (grain === 'weekly') cursor.setDate(cursor.getDate() + 7);
      else cursor.setMonth(cursor.getMonth() + 1);
      guard += 1;
    }

    for (const inv of current.rows) {
      if (String(inv.status || '').toLowerCase() === 'draft') continue;
      const d = parseIso(inv.date);
      if (!d) continue;
      const b = buckets.get(keyOf(d));
      if (!b) continue;
      const total = Number(inv.total || 0);
      const paid = Number(inv.paidAmount || 0);
      b.invoiced += total;
      b.received += paid;
      b.outstanding += Math.max(0, total - paid);
    }

    return [...buckets.values()];
  }, [current.rows, grain, period.from, period.to]);

  /** Who or what the period's billing came from, top five and a tail. */
  const breakdown = useMemo(() => {
    const totals = new Map();
    const live = current.rows.filter((i) => String(i.status || '').toLowerCase() !== 'draft');

    if (breakdownBy === 'customer') {
      const byId = new Map((db?.customers || []).map((c) => [String(c.id), c]));
      for (const inv of live) {
        const name =
          getCustomerDisplayName(byId.get(String(inv.customerId))) || inv.customerName || 'Unnamed customer';
        totals.set(name, (totals.get(name) || 0) + Number(inv.total || 0));
      }
    } else {
      const byId = new Map((db?.items || []).map((i) => [String(i.id), i]));
      for (const inv of live) {
        for (const l of Array.isArray(inv.items) ? inv.items : []) {
          const name = byId.get(String(l.itemId))?.name || l.description || 'Unnamed item';
          const amount = Number(l.lineTotal ?? l.amount ?? Number(l.quantity || 0) * Number(l.rate || 0));
          totals.set(name, (totals.get(name) || 0) + amount);
        }
      }
    }

    const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]);
    /* Graphite first, then its own family — a breakdown is a comparison of
       sizes, not six unrelated flags. */
    const palette = ['chart-blue', 'chart-teal', 'chart-gold', 'chart-clay'];
    const top = sorted.slice(0, 4).map(([name, value], i) => ({
      name,
      value,
      color: `rgb(var(--${palette[i]}))`,
    }));
    const tail = sorted.slice(4).reduce((t, [, v]) => t + v, 0);
    // The tail is one slice, not forty. A donut with forty segments is a
    // decorative ring; five is a comparison.
    if (tail > 0) {
      top.push({ name: breakdownBy === 'customer' ? 'Other customers' : 'Other items', value: tail, color: 'rgb(var(--fg-subtle))' });
    }
    return top;
  }, [current.rows, breakdownBy, db?.customers, db?.items]);

  const breakdownTotal = breakdown.reduce((t, r) => t + Number(r.value || 0), 0);

  /*
   * A chart of nothing should say why, not draw a flat line.
   *
   * There are three different kinds of empty and they need different answers:
   * the book has no invoices at all; the period has none but another period
   * does; or the period has invoices and every one of them is a draft, which
   * is money the page deliberately does not count. Only the first is really
   * "no data".
   */
  const periodHasValue = performance.some(
    (b) => Number(b.invoiced) || Number(b.received) || Number(b.outstanding)
  );

  const emptyReason = useMemo(() => {
    if (periodHasValue) return null;

    if (current.rows.length) {
      return {
        title: 'Everything in this period is still a draft',
        detail: `${current.rows.length} invoice${current.rows.length === 1 ? '' : 's'} dated in this period, none of them issued. A draft is an intention, so it is counted but not billed.`,
        action: null,
      };
    }

    const dates = allInvoices.map((i) => String(i.date || '').slice(0, 10)).filter(Boolean).sort();
    const newest = dates[dates.length - 1] || '';
    if (!newest) {
      return { title: 'No invoices yet', detail: 'Raise the first one and this fills in.', action: null };
    }

    // The narrowest period on offer that actually contains the newest invoice.
    const target = periods.find((p) => p.key !== periodKey && newest >= p.from && newest <= p.to);
    return {
      title: `Nothing billed between ${prettyDate(period.from)} and ${prettyDate(period.to)}`,
      detail: `The most recent invoice is dated ${prettyDate(newest)}.`,
      action: target ? { label: `Show ${target.label.toLowerCase()}`, onClick: () => setPeriodKey(target.key) } : null,
    };
  }, [periodHasValue, current.rows.length, allInvoices, periods, periodKey, period.from, period.to]);

  const recentInvoices = useMemo(
    () =>
      allInvoices
        .slice()
        .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || Number(b.id || 0) - Number(a.id || 0))
        .slice(0, 5),
    [allInvoices]
  );

  const recentCreditNotes = useMemo(
    () =>
      allCreditNotes
        .slice()
        .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || Number(b.id || 0) - Number(a.id || 0))
        .slice(0, 5),
    [allCreditNotes]
  );

  const customerNameFor = (inv) => {
    const c = (db?.customers || []).find((x) => String(x.id) === String(inv?.customerId));
    return getCustomerDisplayName(c) || inv?.customerName || '—';
  };

  const derivedStatus = (inv) => {
    const s = String(inv?.status || '').toLowerCase();
    if (s === 'draft' || s === 'cancelled') return s;
    const bal = Number(inv?.total || 0) - Number(inv?.paidAmount || 0);
    if (bal <= 0) return 'paid';
    const due = String(inv?.dueDate || '').slice(0, 10);
    if (due && due < iso(new Date(nowTs))) return 'overdue';
    return Number(inv?.paidAmount || 0) > 0 ? 'partial' : 'pending';
  };

  const go = (screen) => {
    if (typeof onNavigate === 'function') onNavigate(screen);
  };

  const exportCsv = () => {
    const head = ['Invoice No', 'Customer', 'Date', 'Due date', 'Total', 'Paid', 'Status'];
    const rows = current.rows.map((i) => [
      i.number || '',
      customerNameFor(i),
      i.date || '',
      i.dueDate || '',
      Number(i.total || 0),
      Number(i.paidAmount || 0),
      derivedStatus(i),
    ]);
    const csv = [head, ...rows]
      .map((r) => r.map((c) => `"${csvSafeValue(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `sales-overview-${period.from}-to-${period.to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /* The icon says which part of the book the action belongs to; the button
     itself stays neutral so the one creation action is the only brand on the
     panel. */
  const quickActions = [
    { label: 'Create Invoice', icon: Plus, primary: true, onClick: () => (onNewInvoice ? onNewInvoice() : go('invoices')) },
    { label: 'Create Sales Order', icon: ClipboardList, tone: 'sales', onClick: () => go('salesOrders') },
    { label: 'Record Payment', icon: Wallet, tone: 'banking', onClick: () => (onRecordReceipt ? onRecordReceipt() : go('receipts')) },
    { label: 'Create Credit Note', icon: FileText, tone: 'purchase', onClick: () => (onNewCreditNote ? onNewCreditNote() : go('creditNotes')) },
    { label: 'View All Invoices', icon: LayoutList, outlined: true, tone: 'sales', onClick: () => go('invoices') },
  ];

  return (
    /* 16 between blocks, not 24. A dashboard is read by moving the eye down a
       column of related things; at 24 the KPI row, the charts and the tables
       read as three separate pages stacked, and a third of the useful content
       sat below the fold. */
    <div className="space-y-4">
      {/* The same band Home opens with. What differs is only what goes
          in it: the module names itself, and the controls that govern
          every figure below sit where Home keeps its search. */}
      <HeroBand
        title="Sales Overview"
        /* No caption. The heading says what the screen is, and the sentence
           under it repeated that back while costing a line across the top of
           every module overview. */
        right={
          <div className="flex items-center gap-2 flex-wrap justify-end">
          <div className="relative">
            <button
              type="button"
              onClick={() => setPeriodOpen((v) => !v)}
              className="ui-btn ui-btn-secondary"
              aria-haspopup="listbox"
              aria-expanded={periodOpen}
            >
              <Calendar size={16} aria-hidden="true" />
              {period.label}{' '}
              <span style={{ color: 'rgb(var(--link))' }}>
                ({prettyDate(period.from)} - {prettyDate(period.to)})
              </span>
              <ChevronDown size={16} aria-hidden="true" />
            </button>
            {periodOpen ? (
              <div
                className="absolute end-0 mt-1 z-30 ui-card p-1 min-w-[14rem]"
                role="listbox"
                aria-label="Period"
              >
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
                    className="w-full text-left px-3 py-2 rounded-lg text-sm ui-hover-sunken"
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
            <Download size={16} aria-hidden="true" /> Export
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
                    setPendingBranchIds(selectedBranchIds);
                    setBranchPickerOpen(true);
                    setMoreOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm ui-hover-sunken flex items-center gap-2"
                >
                  <Building2 size={16} aria-hidden="true" /> Branches: {branchFilterLabel}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    go('invoices');
                    setMoreOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm ui-hover-sunken flex items-center gap-2"
                >
                  <LayoutList size={16} aria-hidden="true" /> All invoices
                </button>
              </div>
            ) : null}
          </div>
          </div>
        }
      />

      {/* The five figures somebody opens this screen for. Credit notes is a
          month-end number rather than a daily one, so it reads below with the
          rest of the analysis instead of taking a sixth of the row.

          Overdue and receivables are bad-when-rising, so their arrows are
          coloured by what the movement means, not which way it points. */}
      <OverviewBand cols={5}>
        <OverviewCard
          tone="sales"
          icon={BarChart3}
          label="Total Sales"
          value={money(current.sales)}
          delta={delta(current.sales, previous.sales)}
        />
        <OverviewCard
          tone="invoices"
          icon={FileText}
          label="Invoices"
          value={String(current.count)}
          delta={delta(current.count, previous.count)}
        />
        <OverviewCard
          tone="received"
          icon={Wallet}
          label="Amount Received"
          value={money(current.received)}
          delta={delta(current.received, previous.received)}
        />
        <OverviewCard
          tone="due"
          icon={Clock}
          label="Receivables"
          value={money(current.receivable)}
          delta={delta(current.receivable, previous.receivable)}
          deltaGoodWhenUp={false}
        />
        <OverviewCard
          tone="overdue"
          icon={AlertTriangle}
          label="Overdue"
          value={money(current.overdue)}
          delta={delta(current.overdue, previous.overdue)}
          deltaGoodWhenUp={false}
        />
      </OverviewBand>

      <div className="grid gap-4 items-stretch xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <Panel
          title="Sales Performance"
          control={
            <Segmented
              ariaLabel="Chart grain"
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
          {performance.length && periodHasValue ? (
            <>
              <Suspense fallback={<ChartFallback height={228} />}>
                <LazySeriesBars
                  data={performance}
                  height={228}
                  formatter={(v) => formatMoneyCompact(v, currentCompany)}
                />
              </Suspense>
              <div className="flex items-center justify-center gap-6 mt-2 text-sm">
                {[
                  { label: 'Invoiced', color: 'rgb(var(--chart-teal))' },
                  { label: 'Received', color: 'rgb(var(--chart-blue))' },
                  { label: 'Outstanding', color: 'rgb(var(--chart-muted))' },
                ].map((l) => (
                  <span key={l.label} className="inline-flex items-center gap-2 ui-muted">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: l.color }}
                      aria-hidden="true"
                    />
                    {l.label}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <EmptyPanel height={228} {...(emptyReason || { title: 'Nothing billed in this period' })} />
          )}
        </Panel>

        <Panel
          title="Sales Breakdowns"
          control={
            <Segmented
              ariaLabel="Breakdown"
              value={breakdownBy}
              onChange={setBreakdownBy}
              options={[
                { value: 'customer', label: 'By Customer' },
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
                  centerLabel="Total Sales"
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
            <EmptyPanel height={228} {...(emptyReason || { title: 'Nothing billed in this period' })} />
          )}
        </Panel>
      </div>

      {/* The invoice table carries five columns to the credit-note table's four,
          so it gets the wider share rather than an equal one — an equal split
          left the status column scrolling off its own right edge.

          Three-up at 2xl, not xl, because the breakpoint is read against the
          window and the panels are laid out in what is left after the 240px
          rail. At xl (1280) the invoice panel came to 383px for a table whose
          five columns need 508 — so on a 1280, 1366 or 1440 laptop, which is
          most of them, Recent Invoices scrolled sideways inside its own panel
          to show a status pill. 1536 is measured, not guessed: it is the first
          width at which the column reaches the table's natural size. */}
      <div className="grid gap-4 items-stretch 2xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.85fr)_15.5rem]">
        <Panel
          title="Recent Invoices"
          bodyClass="justify-start"
          control={<PanelLink onClick={() => go('invoices')}>View All</PanelLink>}
        >
          {recentInvoices.length ? (
            <div className="overflow-x-auto">
              <table className="ui-table w-full">
                <thead>
                  <tr>
                    <th className="ui-th">Invoice No.</th>
                    <th className="ui-th">Customer</th>
                    <th className="ui-th ui-col-h-center">Date</th>
                    <th className="ui-th text-end">Amount</th>
                    <th className="ui-th ui-col-h-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentInvoices.map((inv) => (
                    <tr key={inv.id} className="border-t">
                      <td className="px-2 py-2">
                        <button
                          type="button"
                          onClick={() => go('invoices')}
                          className="ui-mono text-sm font-medium"
                          style={{ color: 'rgb(var(--link))' }}
                        >
                          {inv.number || '—'}
                        </button>
                      </td>
                      <td className="px-2 py-2 truncate max-w-[7rem]" title={customerNameFor(inv)}>
                        {customerNameFor(inv)}
                      </td>
                      <td className="px-2 py-2 ui-muted whitespace-nowrap" title={prettyDate(inv.date)}>
                        {shortDate(inv.date)}
                      </td>
                      <td className="ui-col-amount px-2 py-2"><MoneyValue value={inv.total} company={currentCompany} /></td>
                      <td className="px-2 py-2">
                        <StatusPill status={derivedStatus(inv)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="ui-muted text-sm py-10 text-center">No invoices yet.</p>
          )}
        </Panel>

        <Panel
          title="Recent Credit Notes"
          bodyClass="justify-start"
          control={<PanelLink onClick={() => go('creditNotes')}>View All</PanelLink>}
        >
          {recentCreditNotes.length ? (
            <div className="overflow-x-auto">
              <table className="ui-table w-full">
                <thead>
                  <tr>
                    <th className="ui-th">Credit Note No.</th>
                    <th className="ui-th">Customer</th>
                    <th className="ui-th ui-col-h-center">Date</th>
                    <th className="ui-th text-end">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {recentCreditNotes.map((cn) => (
                    <tr key={cn.id} className="border-t">
                      <td className="px-2 py-2">
                        <button
                          type="button"
                          onClick={() => go('creditNotes')}
                          className="ui-mono text-sm font-medium"
                          style={{ color: 'rgb(var(--link))' }}
                        >
                          {cn.number || '—'}
                        </button>
                      </td>
                      <td className="px-2 py-2 truncate max-w-[7rem]" title={customerNameFor(cn)}>
                        {customerNameFor(cn)}
                      </td>
                      <td className="px-2 py-2 ui-muted whitespace-nowrap" title={prettyDate(cn.date)}>
                        {shortDate(cn.date)}
                      </td>
                      {/* A credit note is money going back out. */}
                      <td className="ui-col-amount px-2 py-2"><MoneyValue value={cn.total} company={currentCompany} kind="refund" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="ui-muted text-sm py-10 text-center">No credit notes yet.</p>
          )}
        </Panel>

        <Panel title="Quick Actions" bodyClass="justify-start">
          {/*
            Five stacked actions in a narrow column had 10px between them and a
            label that wrapped on the two longest, which is what made this read
            as a cramped list rather than a set of choices. The column has a
            fixed 17rem now — enough for "Create Sales Order" on one line — and
            each row gets a real touch height, the icon in its own tinted square
            so the label starts at the same x on every row, and a chevron on the
            right so the row reads as somewhere to go.
          */}
          <div className="flex flex-col gap-2.5">
            {quickActions.map((a) => (
              <button
                key={a.label}
                type="button"
                onClick={a.onClick}
                className="ui-quick-action w-full rounded-lg ps-2 pe-3 py-2 text-sm font-semibold text-left flex items-center gap-2.5 min-h-[2.75rem]"
                /* One brand button on the panel — the one that creates
                   something. The rest are shortcuts, and five orange buttons
                   stacked in a column made a list of shortcuts the loudest
                   thing on a page of figures. */
                style={
                  a.primary
                    ? { backgroundColor: 'rgb(var(--brand))', color: 'rgb(var(--on-brand))' }
                    : a.outlined
                      ? { border: '1px solid rgb(var(--border-strong))', color: 'rgb(var(--fg))' }
                      : { backgroundColor: 'rgb(var(--surface-sunken))', color: 'rgb(var(--fg))' }
                }
              >
                <span
                  className="h-7 w-7 rounded-lg grid place-items-center flex-shrink-0"
                  style={
                    a.primary
                      ? { backgroundColor: 'rgb(var(--on-brand) / 0.14)' }
                      : {
                          backgroundColor: `rgb(var(--id-${a.tone || 'settings'}-soft))`,
                          color: `rgb(var(--id-${a.tone || 'settings'}))`,
                        }
                  }
                  aria-hidden="true"
                >
                  <a.icon size={16} />
                </span>
                <span className="flex-1 min-w-0 whitespace-nowrap">{a.label}</span>
                <ArrowRight size={14} aria-hidden="true" className="flex-shrink-0 opacity-60" />
              </button>
            ))}
          </div>
        </Panel>
      </div>

      {branchPickerOpen ? (
        <Modal onClose={() => setBranchPickerOpen(false)} title="Select Branches" maxWidthClass="max-w-2xl">
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => setPendingBranchIds([])}
              className={`w-full px-4 py-3 rounded-lg border text-left ${
                pendingBranchIds.length === 0 ? 'ui-sunken ui-border-c' : 'ui-surface ui-hover-sunken ui-border-c'
              }`}
            >
              <div className="font-medium">All branches</div>
              <div className="text-xs ui-muted">Show these figures for every branch</div>
            </button>

            <div className="border rounded-lg overflow-hidden">
              <div className="max-h-[55vh] overflow-y-auto divide-y">
                {branchesLoading ? (
                  <div className="px-4 py-10 text-center ui-muted">Loading branches…</div>
                ) : branchesError ? (
                  <div className="px-4 py-10 text-center text-[rgb(var(--neg))]">{branchesError}</div>
                ) : branchesSorted.length === 0 ? (
                  <div className="px-4 py-10 text-center ui-muted">No branches</div>
                ) : (
                  branchesSorted.map((b) => {
                    const id = normalizeId(b?.id);
                    const checked = pendingBranchIds.length > 0 && pendingBranchIds.includes(id);
                    return (
                      <label key={id} className="flex items-center gap-3 px-4 py-3 ui-hover-sunken cursor-pointer">
                        <input
                          type="checkbox"
                          className="ui-checkbox"
                          checked={checked}
                          onChange={(e) =>
                            setPendingBranchIds((prev) => {
                              const next = new Set(Array.isArray(prev) ? prev : []);
                              if (e.target.checked) next.add(id);
                              else next.delete(id);
                              return Array.from(next);
                            })
                          }
                        />
                        <div>
                          <div className="ui-fg">{getBranchLabel(b) || `Branch ${id}`}</div>
                          <div className="text-xs ui-muted">{id}</div>
                        </div>
                      </label>
                    );
                  })
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setBranchPickerOpen(false)} className="ui-btn ui-btn-secondary">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const next = (Array.isArray(pendingBranchIds) ? pendingBranchIds : [])
                    .map((x) => normalizeId(x))
                    .filter(Boolean);
                  setSelectedBranchIds(next);
                  try {
                    localStorage.setItem('dashboardBranchIds', JSON.stringify(next));
                  } catch {
                    // A browser that refuses storage still filters this session.
                  }
                  setBranchPickerOpen(false);
                }}
                className="ui-btn ui-btn-primary"
              >
                Apply
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
};

export default SalesOverview;
