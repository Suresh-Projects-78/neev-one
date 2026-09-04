import React, { Suspense, lazy, useMemo, useState } from 'react';
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
  ArrowRight,
  ArrowUp,
  ArrowDown,
  LayoutList,
} from 'lucide-react';

import Modal from '../../components/ui/Modal';
import { formatMoney, formatMoneyCompact } from '../../utils/money';
import { getCustomerDisplayName } from '../../utils/contacts';

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

const getBranchLabel = (b) =>
  String(b?.name || b?.label || b?.code || '').trim() || (b?.id ? `Branch ${b.id}` : '');

const iso = (d) => d.toISOString().slice(0, 10);
const parseIso = (v) => {
  const d = new Date(`${String(v || '').slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * The periods this page can be read over.
 *
 * Anchored on a timestamp the caller pins once, so "this month" cannot change
 * under a render. Each returns the range and the range immediately before it,
 * because every figure on this page is stated against what it was last time.
 */
const buildPeriods = (nowTs) => {
  const now = new Date(nowTs);
  const y = now.getFullYear();
  const m = now.getMonth();
  const startOfMonth = (yy, mm) => new Date(yy, mm, 1);
  const endOfMonth = (yy, mm) => new Date(yy, mm + 1, 0);

  const span = (from, to) => ({ from: iso(from), to: iso(to) });
  const daysBack = (n) => {
    const to = new Date(y, m, now.getDate());
    const from = new Date(to);
    from.setDate(from.getDate() - (n - 1));
    const prevTo = new Date(from);
    prevTo.setDate(prevTo.getDate() - 1);
    const prevFrom = new Date(prevTo);
    prevFrom.setDate(prevFrom.getDate() - (n - 1));
    return { ...span(from, to), prev: span(prevFrom, prevTo) };
  };

  return [
    {
      key: 'thisMonth',
      label: 'This Month',
      ...span(startOfMonth(y, m), endOfMonth(y, m)),
      prev: span(startOfMonth(y, m - 1), endOfMonth(y, m - 1)),
    },
    {
      key: 'lastMonth',
      label: 'Last Month',
      ...span(startOfMonth(y, m - 1), endOfMonth(y, m - 1)),
      prev: span(startOfMonth(y, m - 2), endOfMonth(y, m - 2)),
    },
    { key: 'last30', label: 'Last 30 Days', ...daysBack(30) },
    { key: 'last90', label: 'Last 90 Days', ...daysBack(90) },
    {
      key: 'thisYear',
      label: 'This Year',
      ...span(new Date(y, 0, 1), new Date(y, 11, 31)),
      prev: span(new Date(y - 1, 0, 1), new Date(y - 1, 11, 31)),
    },
  ];
};

const prettyDate = (v) => {
  const d = parseIso(v);
  if (!d) return '';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

/**
 * One of the six figures across the top.
 *
 * Hue rather than position tells them apart — six labels is more than anyone
 * reads before finding the number they came for. The delta is the point of the
 * card as much as the figure: a receivables number means nothing until you know
 * whether it is going up.
 */
const OverviewCard = ({ tone, icon: Icon, label, value, delta = null, deltaGoodWhenUp = true, note = '' }) => {
  const up = Number(delta) > 0;
  const flat = delta === null || delta === undefined || Number(delta) === 0;
  // Rising overdue is bad news wearing the same arrow as rising sales, so the
  // colour follows what the movement means, not which way it points.
  const good = deltaGoodWhenUp ? up : !up;

  return (
    <div
      className="rounded-xl p-4"
      style={{
        backgroundColor: `rgb(var(--ov-${tone}-wash))`,
        border: `1px solid rgb(var(--ov-${tone}-soft))`,
      }}
    >
      <div className="flex items-center gap-2.5">
        <span
          className="h-9 w-9 rounded-lg grid place-items-center flex-shrink-0"
          style={{ backgroundColor: `rgb(var(--ov-${tone}-soft))`, color: `rgb(var(--ov-${tone}))` }}
          aria-hidden="true"
        >
          <Icon size={17} />
        </span>
        <span className="text-sm font-medium" style={{ color: 'rgb(var(--fg-muted))' }}>
          {label}
        </span>
      </div>

      <div className="ui-money-lg mt-2.5">{value}</div>

      <div className="flex items-center gap-1.5 mt-1.5 text-xs">
        {flat ? (
          <span className="ui-subtle">{note || 'No change on the previous period'}</span>
        ) : (
          <>
            <span
              className="inline-flex items-center gap-0.5 font-semibold"
              style={{ color: good ? 'rgb(var(--pos))' : 'rgb(var(--neg))' }}
            >
              {up ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
              {Math.abs(Number(delta)).toFixed(1)}%
            </span>
            <span className="ui-subtle">vs previous period</span>
          </>
        )}
      </div>
    </div>
  );
};

/** Two or three choices, one of them on. */
const Segmented = ({ options, value, onChange, ariaLabel }) => (
  <div
    className="inline-flex items-center p-0.5 rounded-lg"
    role="tablist"
    aria-label={ariaLabel}
    style={{ backgroundColor: 'rgb(var(--surface))', border: '1px solid rgb(var(--border-strong))' }}
  >
    {options.map((o) => {
      const on = o.value === value;
      return (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={on}
          onClick={() => onChange(o.value)}
          className="px-4 py-1.5 rounded-md text-sm font-medium transition-colors"
          style={
            on
              ? { backgroundColor: 'rgb(var(--brand))', color: 'rgb(var(--on-brand))' }
              : { color: 'rgb(var(--fg-muted))' }
          }
        >
          {o.label}
        </button>
      );
    })}
  </div>
);

/** A panel with a heading, a subtitle and a control on the right. */
const Panel = ({ title, subtitle, control, children, className = '' }) => (
  <section className={`ui-card p-5 ${className}`}>
    <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
      <div className="min-w-0">
        <h3 className="ui-t-sec">{title}</h3>
        {subtitle ? <p className="text-sm ui-muted mt-0.5">{subtitle}</p> : null}
      </div>
      {control}
    </div>
    {children}
  </section>
);

const StatusPill = ({ status }) => {
  const key = String(status || '').toLowerCase();
  const map = {
    paid: { bg: 'var(--ov-green-soft)', fg: 'var(--ov-green)', label: 'Paid' },
    'over due': { bg: 'var(--ov-red-soft)', fg: 'var(--ov-red)', label: 'Overdue' },
    overdue: { bg: 'var(--ov-red-soft)', fg: 'var(--ov-red)', label: 'Overdue' },
    partial: { bg: 'var(--ov-amber-soft)', fg: 'var(--ov-amber)', label: 'Partial' },
    draft: { bg: 'var(--info-soft)', fg: 'var(--fg-muted)', label: 'Draft' },
    cancelled: { bg: 'var(--info-soft)', fg: 'var(--fg-muted)', label: 'Cancelled' },
  };
  const it = map[key] || { bg: 'var(--ov-amber-soft)', fg: 'var(--ov-amber)', label: 'Pending' };
  return (
    <span
      className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold"
      style={{ backgroundColor: `rgb(${it.bg})`, color: `rgb(${it.fg})` }}
    >
      {it.label}
    </span>
  );
};

const PanelLink = ({ children, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="inline-flex items-center gap-1 text-sm font-medium"
    style={{ color: 'rgb(var(--link))' }}
  >
    {children} <ArrowRight size={14} aria-hidden="true" />
  </button>
);

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
  const [grain, setGrain] = useState('monthly');
  const [breakdownBy, setBreakdownBy] = useState('customer');
  const [periodOpen, setPeriodOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const periods = useMemo(() => buildPeriods(nowTs), [nowTs]);
  const period = periods.find((p) => p.key === periodKey) || periods[0];

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
    const palette = ['ov-blue', 'ov-green', 'ov-amber', 'ov-violet'];
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
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `sales-overview-${period.from}-to-${period.to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const quickActions = [
    { label: 'Create Invoice', primary: true, onClick: () => (onNewInvoice ? onNewInvoice() : go('invoices')) },
    { label: 'Create Sales Order', onClick: () => go('salesOrders') },
    { label: 'Record Payment', onClick: () => (onRecordReceipt ? onRecordReceipt() : go('receipts')) },
    { label: 'Create Credit Note', onClick: () => (onNewCreditNote ? onNewCreditNote() : go('creditNotes')) },
  ];

  return (
    <div className="space-y-5">
      {/* Title left, the controls that govern every figure below it on the
          right — period first, because nothing else on the page means anything
          until you know what window it covers. */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="ui-t-page">Sales Overview</h1>
          <p className="ui-muted text-sm mt-1">
            Get a snapshot of your sales performance, receivables and credit notes.
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
                    className="w-full text-left px-3 py-2 rounded-md text-sm ui-hover-sunken"
                    style={p.key === periodKey ? { backgroundColor: 'rgb(var(--accent-soft))' } : undefined}
                  >
                    <span className="font-medium">{p.label}</span>
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
                  className="w-full text-left px-3 py-2 rounded-md text-sm ui-hover-sunken flex items-center gap-2"
                >
                  <Building2 size={15} aria-hidden="true" /> Branches: {branchFilterLabel}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    go('invoices');
                    setMoreOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 rounded-md text-sm ui-hover-sunken flex items-center gap-2"
                >
                  <LayoutList size={15} aria-hidden="true" /> All invoices
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* The six figures. Overdue and credit notes read as bad-when-rising, so
          their arrows are coloured by meaning rather than direction. */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <OverviewCard
          tone="blue"
          icon={BarChart3}
          label="Total Sales"
          value={money(current.sales)}
          delta={delta(current.sales, previous.sales)}
        />
        <OverviewCard
          tone="green"
          icon={FileText}
          label="Invoices"
          value={String(current.count)}
          delta={delta(current.count, previous.count)}
        />
        <OverviewCard
          tone="amber"
          icon={Wallet}
          label="Amount Received"
          value={money(current.received)}
          delta={delta(current.received, previous.received)}
        />
        <OverviewCard
          tone="violet"
          icon={Clock}
          label="Receivables"
          value={money(current.receivable)}
          delta={delta(current.receivable, previous.receivable)}
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
          tone="orange"
          icon={FileText}
          label="Credit Notes"
          value={money(current.credit)}
          note={`${current.creditCount} credit note${current.creditCount === 1 ? '' : 's'} this period`}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        <Panel
          title="Sales Performance"
          subtitle="Track your invoiced, received and outstanding amounts."
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
          {performance.length ? (
            <>
              <Suspense fallback={<ChartFallback height={300} />}>
                <LazySeriesBars
                  data={performance}
                  height={300}
                  formatter={(v) => formatMoneyCompact(v, currentCompany)}
                />
              </Suspense>
              <div className="flex items-center justify-center gap-6 mt-2 text-sm">
                {[
                  { label: 'Invoiced', color: 'rgb(var(--ov-blue))' },
                  { label: 'Received', color: 'rgb(var(--ov-green))' },
                  { label: 'Outstanding', color: 'rgb(var(--brand))' },
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
            <p className="ui-muted text-sm py-16 text-center">Nothing billed in this period.</p>
          )}
        </Panel>

        <Panel
          title="Sales Breakdowns"
          subtitle="View your sales from different perspectives."
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
            <div className="grid gap-4 sm:grid-cols-[minmax(0,15rem)_1fr] items-center">
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
                      <span className="ui-mono font-medium">{money(r.value)}</span>
                      <span className="ui-subtle text-xs w-8 text-right">
                        {breakdownTotal > 0 ? Math.round((r.value / breakdownTotal) * 100) : 0}%
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="ui-muted text-sm py-16 text-center">Nothing billed in this period.</p>
          )}
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_1.1fr_0.8fr]">
        <Panel
          title="Recent Invoices"
          subtitle="Your latest sales invoices."
          control={<PanelLink onClick={() => go('invoices')}>View All</PanelLink>}
        >
          {recentInvoices.length ? (
            <div className="overflow-x-auto">
              <table className="ui-table w-full">
                <thead>
                  <tr>
                    <th className="ui-th">Invoice No.</th>
                    <th className="ui-th">Customer</th>
                    <th className="ui-th">Date</th>
                    <th className="ui-th text-end">Amount</th>
                    <th className="ui-th">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentInvoices.map((inv) => (
                    <tr key={inv.id} className="border-t">
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => go('invoices')}
                          className="ui-mono text-sm font-medium"
                          style={{ color: 'rgb(var(--link))' }}
                        >
                          {inv.number || '—'}
                        </button>
                      </td>
                      <td className="px-3 py-2 truncate max-w-[12rem]">{customerNameFor(inv)}</td>
                      <td className="px-3 py-2 ui-muted whitespace-nowrap">{prettyDate(inv.date)}</td>
                      <td className="ui-col-amount px-3 py-2">{money(inv.total)}</td>
                      <td className="px-3 py-2">
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
          subtitle="Your latest credit notes."
          control={<PanelLink onClick={() => go('creditNotes')}>View All</PanelLink>}
        >
          {recentCreditNotes.length ? (
            <div className="overflow-x-auto">
              <table className="ui-table w-full">
                <thead>
                  <tr>
                    <th className="ui-th">Credit Note No.</th>
                    <th className="ui-th">Customer</th>
                    <th className="ui-th">Date</th>
                    <th className="ui-th text-end">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {recentCreditNotes.map((cn) => (
                    <tr key={cn.id} className="border-t">
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => go('creditNotes')}
                          className="ui-mono text-sm font-medium"
                          style={{ color: 'rgb(var(--link))' }}
                        >
                          {cn.number || '—'}
                        </button>
                      </td>
                      <td className="px-3 py-2 truncate max-w-[12rem]">{customerNameFor(cn)}</td>
                      <td className="px-3 py-2 ui-muted whitespace-nowrap">{prettyDate(cn.date)}</td>
                      <td className="ui-col-amount px-3 py-2">{money(cn.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="ui-muted text-sm py-10 text-center">No credit notes yet.</p>
          )}
        </Panel>

        <Panel title="Quick Actions" subtitle="Create and manage your sales transactions.">
          <div className="flex flex-col gap-2">
            {quickActions.map((a) => (
              <button
                key={a.label}
                type="button"
                onClick={a.onClick}
                className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-left inline-flex items-center gap-2"
                style={
                  a.primary
                    ? { backgroundColor: 'rgb(var(--brand))', color: 'rgb(var(--on-brand))' }
                    : { backgroundColor: 'rgb(var(--accent-soft))', color: 'rgb(var(--brand-ink))' }
                }
              >
                <Plus size={15} aria-hidden="true" /> {a.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => go('invoices')}
              className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-left inline-flex items-center gap-2"
              style={{
                border: '1px solid rgb(var(--brand) / 0.4)',
                color: 'rgb(var(--brand-ink))',
              }}
            >
              <LayoutList size={15} aria-hidden="true" /> View All Invoices
            </button>
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
                          <div className="font-medium ui-fg">{getBranchLabel(b) || `Branch ${id}`}</div>
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
