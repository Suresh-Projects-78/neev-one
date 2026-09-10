import React from 'react';
import { ArrowDown, ArrowRight, ArrowUp } from 'lucide-react';

import Illustration from '../../components/ui/Illustration';

/**
 * The parts a module overview page is built from.
 *
 * Sales had a real one — a period picker with a comparison, six tinted figures,
 * panels holding charts and recent documents — while Purchases had a
 * placeholder saying statistics would appear here. Rather than write the page
 * twice and let the two drift, the furniture lives here and each module
 * supplies its own figures: what a purchase costs and what a sale earns are
 * not the same question asked twice.
 */

/*
 * Local calendar date, not UTC.
 *
 * `toISOString()` converts to UTC first, so in IST midnight on the 1st is
 * 18:30 on the 31st and every period on this page came out shifted a day —
 * "This Month" read 31 Aug to 29 Sep, and an invoice dated the 1st could fall
 * outside the month it was raised in.
 */
export const iso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const parseIso = (v) => {
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
export const buildPeriods = (nowTs) => {
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

export const prettyDate = (v) => {
  const d = parseIso(v);
  if (!d) return '';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

/*
 * The same date without the year, for the two narrow panels at the foot.
 *
 * Five columns in a third of the page do not fit a four-part date, and the
 * table was squeezing the status column off its own right edge. The year is
 * the least useful part of a date on a list called "recent" — every row is
 * within weeks — so it is the part that goes. The full date stays in the
 * title, and on the invoice itself.
 */
export const shortDate = (v) => {
  const d = parseIso(v);
  if (!d) return '';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
};

/**
 * One of the six figures across the top.
 *
 * Hue rather than position tells them apart — six labels is more than anyone
 * reads before finding the number they came for. The delta is the point of the
 * card as much as the figure: a receivables number means nothing until you know
 * whether it is going up.
 */
export const OverviewCard = ({ tone, icon: Icon, label, value, delta = null, deltaGoodWhenUp = true, note = '' }) => {
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
        <span className="text-sm" style={{ color: 'rgb(var(--fg-muted))' }}>
          {label}
        </span>
      </div>

      <div className="ui-money-lg mt-2.5">{value}</div>

      <div className="flex items-center gap-1.5 mt-1.5 text-xs min-w-0">
        {flat ? (
          /* One line, and the muted value rather than the subtle one: on a
             tinted card `--fg-subtle` measures 4.45:1, just under the 4.5 a
             12px line needs. "No change on the previous period" also wrapped
             to two lines on every card that had nothing to compare, which made
             four of the six tiles taller than the two that did. */
          <span className="ui-muted truncate">{note || 'No change'}</span>
        ) : (
          <>
            <span
              className="inline-flex items-center gap-0.5 font-medium"
              style={{ color: good ? 'rgb(var(--pos))' : 'rgb(var(--neg))' }}
            >
              {up ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
              {Math.abs(Number(delta)).toFixed(1)}%
            </span>
            {/* Muted, not subtle: on the deepened card tints `--fg-subtle`
                measures 4.40:1, under the 4.5 a 12px line needs. */}
            <span className="ui-muted">vs previous period</span>
          </>
        )}
      </div>
    </div>
  );
};

/** Two or three choices, one of them on. */
export const Segmented = ({ options, value, onChange, ariaLabel }) => (
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
export const Panel = ({ title, subtitle, control, children, className = '', bodyClass = 'justify-center' }) => (
  <section className={`ui-card p-5 min-w-0 flex flex-col ${className}`}>
    <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
      <div className="min-w-0">
        <h3 className="ui-t-sec">{title}</h3>
        {subtitle ? <p className="text-sm ui-muted mt-0.5">{subtitle}</p> : null}
      </div>
      {control}
    </div>
    {/* Fills the card, so two panels sharing a row end the same height. A
        chart or an empty state centres in whatever space that leaves; a table
        or a stack of buttons stays at the top, which is why the caller says
        which it is. */}
    <div className={`flex-1 min-h-0 flex flex-col ${bodyClass}`}>{children}</div>
  </section>
);

/**
 * What a panel says when the period is empty.
 *
 * "Nothing billed in this period" is true and useless: the book usually has
 * data, just not here, and a flat line at zero with a hover tooltip reads as a
 * chart that failed rather than a window with nothing in it. So the reason is
 * stated, and where the data actually is, the way to it is one button.
 */
export const EmptyPanel = ({ height = 240, title, detail = '', action = null }) => (
  <div className="flex flex-col items-center justify-center text-center gap-2 px-4" style={{ minHeight: height }}>
    <Illustration kind="filtered" size={72} />
    <p className="ui-t-sec mt-1">{title}</p>
    {detail ? <p className="ui-muted text-sm max-w-sm">{detail}</p> : null}
    {action ? (
      <button type="button" onClick={action.onClick} className="ui-btn ui-btn-secondary mt-1">
        {action.label}
      </button>
    ) : null}
  </div>
);

export const OverviewStatusPill = ({ status }) => {
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
      className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium"
      style={{ backgroundColor: `rgb(${it.bg})`, color: `rgb(${it.fg})` }}
    >
      {it.label}
    </span>
  );
};

export const PanelLink = ({ children, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="inline-flex items-center gap-1 text-sm"
    style={{ color: 'rgb(var(--link))' }}
  >
    {children} <ArrowRight size={14} aria-hidden="true" />
  </button>
);

