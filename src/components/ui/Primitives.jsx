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
      <h1 className="ui-title text-lg leading-tight">{title}</h1>
      {description ? <p className="ui-muted text-sm mt-0.5">{description}</p> : null}
    </div>
    {actions ? <div className="flex items-center gap-2 shrink-0">{actions}</div> : null}
  </div>
);

/**
 * Metric tile. `tone` colours the value for financial meaning only
 * (pos = money in, neg = money owed), never for decoration.
 */
export const StatTile = ({ label, value, hint, tone = 'neutral', icon: Icon = null, amount = null, format = null }) => {
  const toneClass = tone === 'pos' ? 'ui-amount-pos' : tone === 'neg' ? 'ui-amount-neg' : '';
  // When a raw amount and formatter are supplied the figure counts up on
  // change; otherwise the pre-formatted value renders as-is.
  const counted = useCountUp(amount ?? 0);
  const shown = amount !== null && typeof format === 'function' ? format(counted) : value;

  return (
    <div className="ui-stat">
      <div className="flex items-center justify-between gap-2">
        <span className="ui-muted text-xs font-semibold uppercase tracking-wide">{label}</span>
        {Icon ? <Icon size={15} className="ui-subtle" aria-hidden="true" /> : null}
      </div>
      <div className={`mt-2 text-2xl font-semibold tracking-tight ${toneClass || 'ui-title'}`}>{shown}</div>
      {hint ? <div className="ui-subtle text-xs mt-1">{hint}</div> : null}
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
export const EmptyState = ({ icon: Icon = null, title, description, action = null }) => (
  <div className="ui-in flex flex-col items-center justify-center text-center py-14 px-6">
    {Icon ? (
      <div
        className="h-11 w-11 rounded-full flex items-center justify-center mb-3"
        style={{ backgroundColor: 'rgb(var(--surface-sunken))' }}
      >
        <Icon size={20} className="ui-subtle" aria-hidden="true" />
      </div>
    ) : null}
    <div className="ui-title text-sm">{title}</div>
    {description ? <div className="ui-muted text-sm mt-1 max-w-sm">{description}</div> : null}
    {action ? <div className="mt-4">{action}</div> : null}
  </div>
);

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
          <td key={c} className="px-3 py-2">
            <div className="ui-skel ui-skel-text" style={{ width: c === 0 ? '60%' : '80%' }} />
          </td>
        ))}
      </tr>
    ))}
  </>
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
