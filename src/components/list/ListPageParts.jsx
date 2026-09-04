import React, { useRef, useState } from 'react';
import { ChevronDown, Download, FileText, MoreVertical, Search, SlidersHorizontal, Table2, X } from 'lucide-react';

import Popover from '../ui/Popover';
import { formatMoney } from '../../utils/money';
import { exportRows } from '../ListToolbar';
import { LIST_PERIODS, describeView } from '../../utils/listPeriod';
import { exportListPdf } from '../../utils/listPdf';
import { exportListXlsx } from '../../utils/listXlsx';

/**
 * The parts every document list page is built from.
 *
 * Invoices, bills, receipts and payments are the same screen with different
 * nouns: five figures, status tabs with counts, a table, paging, one tip. They
 * were about to be written four times, and four copies drift — the status
 * filter ends up in a different place on each, and the export means something
 * different on two of them.
 *
 * These are parts rather than one page component. A bill is not an invoice and
 * should not be forced through a single template; what they share is where
 * things sit and how they behave, not what they contain.
 */

/**
 * The row of figures across the top. Balances, so they say "as of" nothing.
 *
 * The icon sits in the corner rather than in front of the figure. In a row it
 * took 52px of the card, and a lakh-scale rupee amount needs about 155px at
 * this size — so on a five-across grid the value had 96px and every card on
 * every one of these pages rendered "₹41,01,992." with the rest clipped off.
 * A truncated amount on an accounting screen does not read as a layout bug, it
 * reads as the wrong number. Only the label clears the icon; the figure gets
 * the full width of the card and drops a step in size, which fits a crore at
 * the narrowest column the five-across grid produces.
 */
export function StatCards({ cards, company }) {
  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label="Summary">
      {cards.filter(Boolean).map((c) => (
        <div key={c.label} className="ui-card p-3 relative">
          <span
            className="h-7 w-7 rounded-full grid place-items-center absolute top-2.5 end-2.5"
            style={{ backgroundColor: `rgb(var(--${c.tone}) / 0.12)`, color: `rgb(var(--${c.tone}))` }}
            aria-hidden="true"
          >
            <c.Icon size={15} />
          </span>
          <span className="block">
            {/* One line, clipped rather than wrapped. Two-line labels forced a
                32px reservation on every card whether or not any label used it,
                and five of those across the top of a list is a band of empty
                space between the toolbar and the first invoice. */}
            <span className="ui-card-label block pe-8 truncate" title={c.label}>{c.label}</span>
            <span
              className={`block font-semibold leading-7 ${c.count ? 'text-xl' : 'ui-mono text-base'}`}
              style={c.tone === 'neg' || c.tone === 'warn' ? { color: `rgb(var(--${c.tone}))` } : undefined}
            >
              {c.count ? String(c.value) : formatMoney(c.value, company)}
            </span>
          </span>
          <span className="ui-subtle text-xs block leading-4">{c.hint || 'This financial year'}</span>
        </div>
      ))}
    </section>
  );
}

/**
 * Status as tabs with counts.
 *
 * The counts are the point: "Overdue 17" says there is something to do before
 * anything has been clicked. A tab showing 0 stays — one that appears and
 * disappears is a tab people stop trusting, and its absence is indistinguishable
 * from a bug.
 */
export function StatusTabs({ tabs, value, counts, onChange, children }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex items-center gap-1.5 flex-wrap" role="tablist" aria-label="Status">
        {tabs.map((t) => {
          const on = value === t.value;
          return (
            <button
              key={t.value || 'all'}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => onChange(t.value)}
              className="ui-btn ui-btn-sm"
              style={
                on
                  ? { borderColor: 'rgb(var(--brand))', color: 'rgb(var(--brand-ink))', backgroundColor: 'rgb(var(--accent-soft))' }
                  : { borderColor: 'rgb(var(--border))', color: 'rgb(var(--fg-muted))' }
              }
            >
              {t.label}
              <span
                className="ui-mono text-xs rounded-full px-1.5"
                style={{
                  backgroundColor: on ? 'rgb(var(--brand) / 0.10)' : 'rgb(var(--surface-sunken))',
                  color: on ? 'rgb(var(--brand-ink))' : 'rgb(var(--fg))',
                }}
              >
                {counts[t.value] ?? 0}
              </span>
            </button>
          );
        })}
      </div>
      <div className="ms-auto flex items-center gap-2">{children}</div>
    </div>
  );
}

/** Search, in the header rather than a band of its own. */
/**
 * Search is the control these pages exist for, so it is never the one that
 * gets dropped.
 *
 * It used to be `hidden md:block`. Below 768px the table is 960px wide inside
 * its own scroller and every column but the first is off-screen — which is
 * exactly where finding a document by name matters most, and exactly where the
 * search box disappeared. On a phone the only way to reach an invoice was to
 * scroll. It stays at every width now and takes the full row on small screens,
 * where there is nothing beside it to share with.
 */
export function ListSearch({ value, onChange, placeholder = 'Search…', label = 'Search' }) {
  return (
    <div className="relative order-first w-full md:order-none md:w-auto">
      <Search size={14} aria-hidden="true" className="absolute left-2.5 top-1/2 -translate-y-1/2 ui-muted" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="ui-input !h-9 w-full md:w-56 lg:w-64 ps-8 pe-2 text-sm"
      />
    </div>
  );
}

/** Period and Clear, behind a button that says how many filters are on. */
export function FiltersButton({ period, onPeriodChange, dateFrom, dateTo, onDateFromChange, onDateToChange, onClear, activeCount = 0 }) {
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        ref={ref}
        onClick={() => setOpen((v) => !v)}
        className="ui-btn ui-btn-secondary"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <SlidersHorizontal size={15} aria-hidden="true" /> Filters
        {activeCount ? (
          <span className="ui-mono text-xs rounded-full px-1.5" style={{ backgroundColor: 'rgb(var(--brand))', color: '#fff' }}>
            {activeCount}
          </span>
        ) : null}
      </button>
      {open ? (
        <Popover anchorRef={ref} onClose={() => setOpen(false)} minWidth={264}>
          <div className="p-3 space-y-3">
            <div>
              <label className="ui-label" htmlFor="list-period">Period</label>
              <select
                id="list-period"
                value={period}
                onChange={(e) => onPeriodChange(e.target.value)}
                className="ui-select w-full px-3 py-2"
              >
                {LIST_PERIODS.map((p) => (
                  <option key={p.key} value={p.key}>{p.label}</option>
                ))}
              </select>
            </div>
            {period === 'custom' ? (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="ui-label">From</label>
                  <input type="date" value={dateFrom} onChange={(e) => onDateFromChange(e.target.value)} className="ui-input w-full px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="ui-label">To</label>
                  <input type="date" value={dateTo} onChange={(e) => onDateToChange(e.target.value)} className="ui-input w-full px-2 py-1.5 text-sm" />
                </div>
              </div>
            ) : null}
            <button
              type="button"
              onClick={() => {
                onClear();
                setOpen(false);
              }}
              className="ui-btn ui-btn-ghost ui-btn-sm w-full"
            >
              Clear all filters
            </button>
          </div>
        </Popover>
      ) : null}
    </div>
  );
}

/** Page-level actions. Never row actions — those belong on the row. */
export function MoreButton({ items, onSelect }) {
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        ref={ref}
        onClick={() => setOpen((v) => !v)}
        className="ui-btn ui-btn-secondary"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MoreVertical size={15} aria-hidden="true" /> More
      </button>
      {open ? (
        <Popover anchorRef={ref} onClose={() => setOpen(false)} minWidth={228}>
          <div className="py-1" role="menu">
            {items.filter(Boolean).map((o, i) =>
              o.sep ? (
                <div key={`s${i}`} className="my-1" style={{ borderTop: '1px solid rgb(var(--border))' }} />
              ) : (
                <React.Fragment key={o.key}>
                  {o.group ? <div className="ui-caption px-3 pb-1.5">{o.group}</div> : null}
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setOpen(false);
                      onSelect(o.key);
                    }}
                    className="w-full text-left flex items-center gap-2 px-3 py-2 text-sm hover:bg-[rgb(var(--surface-sunken))]"
                  >
                    {o.Icon ? <o.Icon size={15} aria-hidden="true" /> : null} {o.label}
                  </button>
                </React.Fragment>
              )
            )}
          </div>
        </Popover>
      ) : null}
    </div>
  );
}

/**
 * A split primary: the face does the common thing in one click, the caret
 * offers the less common ways in. When there is nothing else to offer it
 * renders as an ordinary button rather than a caret onto an empty menu.
 */
export function SplitPrimary({ label, options = [], onSelect, children }) {
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  if (!options.length) return children;
  return (
    <span className="inline-flex">
      {children}
      <button
        type="button"
        ref={ref}
        onClick={() => setOpen((v) => !v)}
        className="ui-btn ui-btn-primary !rounded-s-none !px-2"
        style={{ borderInlineStart: '1px solid rgb(255 255 255 / 0.28)' }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`More ways to create ${label}`}
      >
        <ChevronDown size={15} aria-hidden="true" />
      </button>
      {open ? (
        <Popover anchorRef={ref} onClose={() => setOpen(false)} minWidth={236}>
          <div className="py-1" role="menu">
            {options.map((o) => (
              <button
                key={o.key}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onSelect(o.key);
                }}
                className="w-full text-left flex items-center gap-2 px-3 py-2 text-sm hover:bg-[rgb(var(--surface-sunken))]"
              >
                {o.Icon ? <o.Icon size={15} aria-hidden="true" /> : null} {o.label}
              </button>
            ))}
            {options.hint ? <p className="ui-caption px-3 pt-1 pb-2">{options.hint}</p> : null}
          </div>
        </Popover>
      ) : null}
    </span>
  );
}

/** PDF, Excel or CSV, over exactly the rows and columns on screen. */
export function ExportButton({ title, fileName, sheetName, columns, rows, subtitleParts = {} }) {
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  const subtitle = describeView(subtitleParts);
  const common = { fileName, columns, rows };
  return (
    <div className="relative">
      <button
        type="button"
        ref={ref}
        onClick={() => setOpen((v) => !v)}
        className="ui-btn ui-btn-secondary ui-btn-sm"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Export"
        title="Export"
      >
        <Download size={15} aria-hidden="true" />
      </button>
      {open ? (
        <Popover anchorRef={ref} onClose={() => setOpen(false)} minWidth={216}>
          <div className="py-1" role="menu">
            {[
              { k: 'pdf', label: 'PDF', Icon: FileText },
              { k: 'xlsx', label: 'Excel', Icon: Table2 },
              { k: 'csv', label: 'CSV', Icon: Download },
            ].map((o) => (
              <button
                key={o.k}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  if (o.k === 'pdf') {
                    exportListPdf({ ...common, title, subtitle, footNote: `${rows.length} row(s) · exported from Neev One` });
                  } else if (o.k === 'xlsx') {
                    exportListXlsx({ ...common, subtitle, sheetName: sheetName || title });
                  } else {
                    exportRows({ ...common, label: 'row(s)' });
                  }
                }}
                className="w-full text-left flex items-center gap-2 px-3 py-2 text-sm hover:bg-[rgb(var(--surface-sunken))]"
              >
                <o.Icon size={15} aria-hidden="true" /> {o.label}
              </button>
            ))}
            <p className="ui-caption px-3 pt-1 pb-2">Exports what you are looking at — this tab, this search, this period.</p>
          </div>
        </Popover>
      ) : null}
    </div>
  );
}

/**
 * Paging. Hidden when everything already fits, because a control that can only
 * do nothing is noise. The page window is five wide, so page 40 of 60 does not
 * render sixty buttons.
 */
export function Pagination({ total, page, perPage, pageCount, onPage, onPerPage, noun = 'rows' }) {
  if (total <= perPage && perPage === 10) return null;
  const first = Math.max(1, Math.min(page - 2, pageCount - 4));
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap px-4 py-3" style={{ borderTop: '1px solid rgb(var(--border))' }}>
      <span className="ui-subtle text-xs">
        Showing {total === 0 ? 0 : (page - 1) * perPage + 1} to {Math.min(page * perPage, total)} of {total} {noun}
      </span>
      <div className="flex items-center gap-1.5 flex-wrap">
        <button type="button" className="ui-btn ui-btn-sm" disabled={page === 1} onClick={() => onPage(1)} aria-label="First page">«</button>
        <button type="button" className="ui-btn ui-btn-sm" disabled={page === 1} onClick={() => onPage(page - 1)} aria-label="Previous page">‹</button>
        {Array.from({ length: Math.min(5, pageCount) }, (_, i) => first + i)
          .filter((n) => n >= 1 && n <= pageCount)
          .map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onPage(n)}
              aria-current={n === page ? 'page' : undefined}
              className="ui-btn ui-btn-sm ui-mono"
              style={n === page ? { borderColor: 'rgb(var(--brand))', color: 'rgb(var(--brand-ink))', backgroundColor: 'rgb(var(--accent-soft))' } : undefined}
            >
              {n}
            </button>
          ))}
        <button type="button" className="ui-btn ui-btn-sm" disabled={page === pageCount} onClick={() => onPage(page + 1)} aria-label="Next page">›</button>
        <button type="button" className="ui-btn ui-btn-sm" disabled={page === pageCount} onClick={() => onPage(pageCount)} aria-label="Last page">»</button>
        <select
          value={perPage}
          onChange={(e) => onPerPage(Number(e.target.value))}
          className="ui-select ui-btn-sm !h-8 w-24 px-2 text-xs"
          aria-label="Rows per page"
        >
          {[10, 25, 50, 100].map((n) => (
            <option key={n} value={n}>{n} / page</option>
          ))}
        </select>
      </div>
    </div>
  );
}

/** One tip, under the table, dismissed for good. */
export function ListTip({ storageKey, text, actionLabel, onAction, Icon }) {
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(storageKey) === 'dismissed');
  if (dismissed) return null;
  return (
    <div
      className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm"
      style={{ backgroundColor: 'rgb(var(--info-soft))', color: 'rgb(var(--fg))' }}
      role="note"
    >
      {Icon ? (
        <Icon size={16} aria-hidden="true" className="shrink-0" style={{ color: 'rgb(var(--info))' }} />
      ) : null}
      <span className="min-w-0">{text}</span>
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="ui-btn ui-btn-sm"
          style={{ borderColor: 'currentColor', color: 'inherit', backgroundColor: 'transparent' }}
        >
          {actionLabel}
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => {
          localStorage.setItem(storageKey, 'dismissed');
          setDismissed(true);
        }}
        className="ui-btn ui-btn-ghost ui-btn-sm ms-auto"
        style={{ color: 'inherit' }}
        aria-label="Dismiss this tip"
      >
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );
}

/** Page slice plus a clamped page number, the arithmetic every list repeats. */
export function usePaged(rows, perPage, page) {
  const pageCount = Math.max(1, Math.ceil(rows.length / perPage));
  const safePage = Math.min(page, pageCount);
  return { pageCount, safePage, pageRows: rows.slice((safePage - 1) * perPage, safePage * perPage) };
}
