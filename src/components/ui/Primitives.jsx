import React from 'react';
import { Check, Moon, Sun } from 'lucide-react';
import { useCountUp } from './useCountUp';

/**
 * Shared UI primitives for the app shell.
 * Styling lives in src/index.css as token-driven `.ui-*` classes, so these
 * components never carry raw hex values and both themes stay in sync.
 */

/** Page header: title, optional description, right-aligned actions. */
export const PageHeader = ({ title, description, actions = null }) => (
  <div className="ui-in-fade flex flex-wrap items-start justify-between gap-3 mb-4">
    <div className="min-w-0">
      <h1 className="ui-t-page">{title}</h1>
      {description ? <p className="ui-muted ui-t-body mt-1">{description}</p> : null}
    </div>
    {actions ? <div className="flex items-center gap-2 shrink-0">{actions}</div> : null}
  </div>
);

/**
 * Metric tile. `tone` colours the value for financial meaning only
 * (pos = money in, neg = money owed), never for decoration.
 */
export const StatTile = ({ label, value, hint, tone = 'neutral', icon: Icon = null, amount = null, format = null, title = null, tint = null }) => {
  const toneClass = tone === 'pos' ? 'ui-amount-pos' : tone === 'neg' ? 'ui-amount-neg' : '';
  // When a raw amount and formatter are supplied the figure counts up on
  // change; otherwise the pre-formatted value renders as-is.
  const counted = useCountUp(amount ?? 0);
  const shown = amount !== null && typeof format === 'function' ? format(counted) : value;

  // Same KPI voice as the main dashboard: small quiet label, 42px figure,
  // caption underneath. One language for a number-on-a-card everywhere, so a
  // module overview no longer reads as an older generation of the product.
  return (
    <div className="ui-stat">
      <div className="flex items-center justify-between gap-2">
        <span className="ui-card-label">{label}</span>
        {Icon ? (
          <Icon
            size={15}
            className={tint ? undefined : 'ui-subtle'}
            style={tint ? { color: `rgb(var(--mod-${tint}))` } : undefined}
            aria-hidden="true"
          />
        ) : null}
      </div>
      <div className={`ui-kpi mt-3 ${toneClass}`} title={title || undefined}>{shown}</div>
      {hint ? <div className="ui-caption mt-2">{hint}</div> : null}
    </div>
  );
};

/**
 * A row of headline figures on one surface, divided by hairlines.
 *
 * Separate cards give each number its own border, shadow and gutter, which is
 * four boxes fighting for the same glance. One strip puts them on a single
 * baseline so they read as a set, which is what a summary is.
 *
 * Paise are rendered a size down and muted: scanning money means reading the
 * rupees, and the decimals are there for checking, not for scanning.
 */
export const StatStrip = ({ items = [], className = '' }) => {
  if (!items.length) return null;

  return (
    <div className={`ui-strip ${className}`.trim()}>
      {items.map((it, i) => {
        const shown = String(it.value ?? '');
        // Split on the last separator so Indian grouping (12,30,340.69) keeps
        // its lakh commas in the whole part.
        const cut = shown.lastIndexOf('.');
        const whole = cut > -1 ? shown.slice(0, cut) : shown;
        const frac = cut > -1 ? shown.slice(cut) : '';

        const dir = typeof it.delta === 'number' ? (it.delta > 0 ? 'pos' : it.delta < 0 ? 'neg' : null) : null;
        const deltaClass =
          it.deltaTone === 'muted' || dir === null
            ? ''
            : dir === 'pos'
              ? 'ui-strip-delta-pos'
              : 'ui-strip-delta-neg';

        return (
          <div key={it.key || it.label || i} className="ui-strip-cell">
            <span className="ui-t-label">{it.label}</span>
            <span className="ui-strip-figure" title={it.title || undefined}>
              {whole}
              {frac ? <span className="ui-strip-frac">{frac}</span> : null}
            </span>
            {typeof it.delta === 'number' ? (
              <span className={`ui-strip-delta ${deltaClass}`}>
                <span aria-hidden="true">{it.delta > 0 ? '\u2197' : it.delta < 0 ? '\u2198' : '\u2192'}</span>
                {Math.abs(it.delta).toFixed(1)}%
                <span className="sr-only">{it.delta > 0 ? ' up' : it.delta < 0 ? ' down' : ' flat'} on last period</span>
              </span>
            ) : it.hint ? (
              <span className="ui-caption">{it.hint}</span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
};

/** Status pill. Pass an explicit tone; the label carries the meaning, not the colour. */
export const StatusPill = ({ status }) => {
  const s = String(status || '').trim().toLowerCase();
  const tone =
    s === 'paid' || s === 'received' || s === 'posted' || s === 'active'
      ? 'pos'
      : s === 'overdue' || s === 'rejected' || s === 'cancelled' || s === 'failed'
      ? 'neg'
      : s === 'partial' || s === 'pending' || s === 'sent'
      ? 'warn'
      : 'neutral';

  return <span className={`ui-pill ui-pill-${tone}`}>{status || '—'}</span>;
};

/** Empty state with an optional call to action. */
/**
 * What a screen says when it has nothing to show.
 *
 * Three situations, three answers, because they are not the same thing:
 *
 *   new       nothing has ever been created here
 *   filtered  records exist, the filters are hiding all of them
 *   disabled  the module is switched off for this company
 *
 * The middle one is the reason this exists. With per-column filters on every
 * list, filtering to nothing is a daily event, and an accountant who knows
 * there are 77 orders reads "No purchase orders found" as data loss. Saying
 * "all 77 are still here, three filters are hiding them" is the difference
 * between a shrug and a support call.
 */
export const EmptyState = ({
  icon: Icon = null,
  title,
  description,
  action = null,
  kind = 'new',
  /** How many records exist behind the filters. Shown so the count is visible. */
  totalCount = null,
  /** [{ label, value, onRemove }] — the filters doing the hiding. */
  filters = [],
  onClearFilters = null,
  /** [{ label, description, onSelect }] — the real ways to a first record. */
  routes = [],
}) => {
  const isFiltered = kind === 'filtered';
  const isDisabled = kind === 'disabled';

  const headline =
    title ||
    (isFiltered ? 'Nothing matches these filters' : isDisabled ? 'This is switched off' : 'Nothing here yet');

  const body =
    description ||
    (isFiltered && totalCount
      ? `All ${totalCount} are still here. The filters below are narrowing them to nothing.`
      : null);

  return (
    <div className="ui-in flex flex-col items-center justify-center text-center py-12 px-6">
      {Icon ? (
        <div
          className="h-11 w-11 rounded-full flex items-center justify-center mb-3"
          style={{ backgroundColor: 'rgb(var(--surface-sunken))' }}
        >
          <Icon size={20} className="ui-subtle" aria-hidden="true" />
        </div>
      ) : null}

      <div className="ui-t-sec">{headline}</div>
      {body ? <div className="ui-muted ui-t-body mt-1 max-w-md">{body}</div> : null}

      {isFiltered && filters.length ? (
        <div className="mt-3 flex flex-wrap gap-1.5 justify-center">
          {filters.map((f) => (
            <span
              key={`${f.label}-${f.value}`}
              className="ui-sunken border ui-border-c rounded-full text-xs px-2.5 py-1 inline-flex items-center gap-1.5"
            >
              <span className="ui-muted">{f.label}</span>
              <span className="font-medium">{f.value}</span>
              {typeof f.onRemove === 'function' ? (
                <button
                  type="button"
                  onClick={f.onRemove}
                  className="ui-subtle hover:ui-fg"
                  aria-label={`Remove the ${f.label} filter`}
                >
                  ×
                </button>
              ) : null}
            </span>
          ))}
        </div>
      ) : null}

      {isFiltered && typeof onClearFilters === 'function' ? (
        <button type="button" onClick={onClearFilters} className="ui-btn ui-btn-secondary ui-btn-sm mt-3">
          Clear filters
        </button>
      ) : null}

      {!isFiltered && routes.length ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-3 w-full max-w-2xl text-left">
          {routes.map((r) => (
            <button
              key={r.label}
              type="button"
              onClick={r.onSelect}
              className="ui-card p-3 hover:border-[rgb(var(--brand))] transition-colors"
            >
              <span className="block text-sm font-semibold">{r.label}</span>
              {r.description ? <span className="block ui-muted text-xs mt-0.5 leading-4">{r.description}</span> : null}
            </button>
          ))}
        </div>
      ) : null}

      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
};

/* --- loading placeholders -------------------------------------------------
   Every skeleton mirrors the shape of the thing it stands in for, so the
   layout does not jump when real data lands. They are hidden from assistive
   technology and announced once through a live region instead: a screen
   reader hearing twenty shimmering boxes learns nothing.
--------------------------------------------------------------------------- */

/** Skeleton row for tables — reserves height so loading does not shift layout. */
export const SkeletonRows = ({ rows = 5, cols = 4 }) => (
  <>
    {Array.from({ length: rows }).map((_, r) => (
      <tr key={r} aria-hidden="true">
        {Array.from({ length: cols }).map((__, c) => (
          <td key={c} className="ui-col-meta px-3 py-2">
            <div className="ui-skel ui-skel-text" style={{ width: c === 0 ? '60%' : '80%' }} />
          </td>
        ))}
      </tr>
    ))}
  </>
);

/**
 * Drop-in replacement for a centred "Loading…" line above a table: rows the
 * shape of the data, announced once through the live region. Layout does not
 * jump when the real rows land.
 */
export const TableSkeleton = ({ rows = 6, cols = 4 }) => (
  <LoadingRegion>
    <table className="ui-table w-full" aria-hidden="true">
      <tbody>
        <SkeletonRows rows={rows} cols={cols} />
      </tbody>
    </table>
  </LoadingRegion>
);

/** Placeholder for a metric tile, matching StatTile's height exactly. */
export const SkeletonStats = ({ count = 4 }) => (
  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-hidden="true">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="ui-card p-4">
        <div className="ui-skel ui-skel-text" style={{ width: '45%' }} />
        <div className="ui-skel ui-skel-amount mt-3" />
        <div className="ui-skel ui-skel-text mt-2" style={{ width: '30%' }} />
      </div>
    ))}
  </div>
);

/** Placeholder for a card of prose or form fields. */
export const SkeletonCard = ({ lines = 3 }) => (
  <div className="ui-card p-4" aria-hidden="true">
    <div className="ui-skel ui-skel-title" />
    <div className="mt-4 space-y-2.5">
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="ui-skel ui-skel-text"
          style={{ width: i === lines - 1 ? '65%' : '100%' }}
        />
      ))}
    </div>
  </div>
);

/**
 * Wraps a loading region so the wait is announced once, politely, instead of
 * leaving a screen reader in silence while the page fills in.
 */
export const LoadingRegion = ({ label = 'Loading', children }) => (
  <div role="status" aria-live="polite" aria-busy="true">
    <span className="sr-only">{label}</span>
    {children}
  </div>
);

export const ThemeToggle = ({ theme, onToggle }) => (
  <button
    type="button"
    onClick={onToggle}
    className="ui-btn ui-btn-ghost !px-2"
    aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
    title={theme === 'dark' ? 'Light theme' : 'Dark theme'}
  >
    {theme === 'dark' ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
  </button>
);

/** Inline busy indicator for buttons mid-request. */
export const Spinner = () => <span className="ui-spinner" aria-hidden="true" />;

/** Small inline confirmation used after save actions. */
export const SavedHint = ({ show, label = 'Saved' }) =>
  show ? (
    <span className="ui-pill ui-pill-pos" role="status">
      <Check size={11} aria-hidden="true" />
      {label}
    </span>
  ) : null;
