import React, { useMemo, useState } from 'react';
import { Download, Search } from 'lucide-react';

import { downloadCsv } from '../utils/csv';
import { consumeSearchSeed } from '../utils/searchSeed';
import { notify } from './ui/notify';

/**
 * The three things every list page owes the user: search across the row, a
 * per-column filter row (see ColumnFilters) and an export of what is on
 * screen. This is the search + export half; pair it with <ColumnHeader /> cells in the
 * table head.
 *
 * Export always writes the *filtered* rows, so what you see is what you get.
 */
export function ListToolbar({
  search,
  onSearch,
  placeholder = 'Search…',
  onExport,
  exportLabel = 'Export',
  count,
  countLabel = 'rows',
  children,
  className = '',
}) {
  return (
    <div className={`ui-card p-3 flex flex-wrap items-center gap-3 ${className}`}>
      <div className="relative flex-1 min-w-[220px]">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 ui-muted" aria-hidden="true" />
        <input
          type="text"
          value={search ?? ''}
          onChange={(e) => onSearch?.(e.target.value)}
          className="ui-input w-full pl-9 pr-3 py-2"
          placeholder={placeholder}
          aria-label={placeholder}
        />
      </div>

      {children}

      {Number.isFinite(count) ? (
        <div className="text-xs ui-muted whitespace-nowrap">
          {count} {countLabel}
        </div>
      ) : null}

      {onExport ? (
        <button type="button" onClick={onExport} className="ui-btn ui-btn-secondary !h-10 whitespace-nowrap">
          <Download size={15} aria-hidden="true" /> {exportLabel}
        </button>
      ) : null}
    </div>
  );
}

/**
 * Free-text search over chosen fields of each row.
 * `fields` is a list of accessors (function or key name).
 */
export function useListSearch(rows, fields = [], seedKey = '') {
  // A list opened from the command palette arrives filtered to the record that
  // was chosen. Consumed once, so navigating back later shows the whole list.
  const [query, setQuery] = useState(() => (seedKey ? consumeSearchSeed(seedKey) : ''));

  const filtered = useMemo(() => {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return Array.isArray(rows) ? rows : [];
    return (Array.isArray(rows) ? rows : []).filter((row) =>
      fields.some((f) => {
        const v = typeof f === 'function' ? f(row) : row?.[f];
        return String(v ?? '').toLowerCase().includes(q);
      })
    );
    // fields is normally an inline array; depending on it would rebuild every
    // render, so the row list and the query are what matter here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, query]);

  return { query, setQuery, filtered };
}

/** Export helper that reports an empty view instead of writing a header-only file. */
export function exportRows({ fileName, columns, rows, label = 'rows' }) {
  if (!Array.isArray(rows) || !rows.length) {
    notify.error('Nothing to export in the current view.');
    return;
  }
  downloadCsv({ fileName, columns, rows });
  notify.success(`${rows.length} ${label} exported.`);
}

export default ListToolbar;
