import React, { useMemo, useState } from 'react';

/**
 * Per-column header filters for document lists.
 *
 * Usage:
 *   const { filters, setFilter, clearFilters, applyFilters } = useColumnFilters();
 *   const rows = applyFilters(allRows, {
 *     number: (r) => r.number,
 *     customer: (r) => r.customerName,
 *     status: (r) => r.status,
 *   });
 *   <thead>
 *     <tr>…normal column headers…</tr>
 *     <FilterRow
 *       columns={[
 *         { key: 'number', placeholder: 'No.' },
 *         { key: 'customer', placeholder: 'Customer' },
 *         { key: 'status', options: ['Paid', 'Unpaid'] },   // renders a select
 *         {},                                               // spacer cell, no filter
 *       ]}
 *       filters={filters}
 *       setFilter={setFilter}
 *     />
 *   </thead>
 *
 * Matching is case-insensitive substring per column; every active filter must
 * match (AND). Column extractors return the value the user sees, so filtering
 * matches what is on screen.
 */
export function useColumnFilters() {
  const [filters, setFilters] = useState({});

  const setFilter = (key, value) => {
    setFilters((prev) => {
      const next = { ...prev };
      const v = String(value ?? '');
      if (v.trim() === '') delete next[key];
      else next[key] = v;
      return next;
    });
  };

  const clearFilters = () => setFilters({});

  const applyFilters = useMemo(() => {
    return (rows, extractors) => {
      const active = Object.entries(filters).filter(([, v]) => String(v).trim() !== '');
      if (!active.length) return rows;
      return rows.filter((row) =>
        active.every(([key, value]) => {
          const extract = extractors[key];
          if (!extract) return true;
          return String(extract(row) ?? '')
            .toLowerCase()
            .includes(String(value).trim().toLowerCase());
        })
      );
    };
  }, [filters]);

  const hasActiveFilters = Object.keys(filters).length > 0;

  return { filters, setFilter, clearFilters, applyFilters, hasActiveFilters };
}

/** The filter header row. Give it one entry per visible column, in order. */
export const FilterRow = ({ columns = [], filters = {}, setFilter }) => (
  <tr className="ui-sunken border-b">
    {columns.map((col, i) => (
      <th key={col?.key || `sp-${i}`} className="px-2 py-1.5">
        {col?.key ? (
          Array.isArray(col.options) ? (
            <select
              value={filters[col.key] || ''}
              onChange={(e) => setFilter(col.key, e.target.value)}
              className="ui-select w-full !h-7 px-1 text-xs font-normal"
              aria-label={`Filter ${col.placeholder || col.key}`}
            >
              <option value="">All</option>
              {col.options.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={filters[col.key] || ''}
              onChange={(e) => setFilter(col.key, e.target.value)}
              className="ui-input w-full !h-7 px-2 text-xs font-normal"
              placeholder={col.placeholder || 'Filter'}
              aria-label={`Filter ${col.placeholder || col.key}`}
            />
          )
        ) : null}
      </th>
    ))}
  </tr>
);
