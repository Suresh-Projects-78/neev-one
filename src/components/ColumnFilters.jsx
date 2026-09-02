import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search as SearchIcon } from 'lucide-react';

/**
 * Column filters, the way a spreadsheet does them.
 *
 * Each header carries a control that opens a panel with: sort ascending or
 * descending, a condition (contains / equals / greater than…), a search box,
 * and a checklist of the values actually present in that column. A column with
 * anything active shows it, so a list that looks empty always explains itself.
 *
 * Usage:
 *   const cf = useColumnFilters();
 *   const rows = cf.apply(allRows, { number: (r) => r.number, date: (r) => r.date });
 *   …
 *   <thead>
 *     <tr>
 *       <ColumnHeader label="No." col="number" state={cf} />
 *       <th>Actions</th>
 *   </thead>
 */

const CONDITIONS = [
  { id: '', label: 'Choose One' },
  { id: 'contains', label: 'Contains' },
  { id: 'notContains', label: 'Does not contain' },
  { id: 'equals', label: 'Equals' },
  { id: 'notEquals', label: 'Does not equal' },
  { id: 'startsWith', label: 'Begins with' },
  { id: 'endsWith', label: 'Ends with' },
  { id: 'gt', label: 'Greater than' },
  { id: 'lt', label: 'Less than' },
  { id: 'empty', label: 'Is empty' },
  { id: 'notEmpty', label: 'Is not empty' },
];

const asText = (v) => String(v ?? '').trim();

/** Numeric when both sides look numeric — so 100 sorts after 9, not before. */
const compareValues = (a, b) => {
  const na = Number(String(a).replace(/[^0-9.-]/g, ''));
  const nb = Number(String(b).replace(/[^0-9.-]/g, ''));
  const bothNumeric = String(a).trim() !== '' && String(b).trim() !== '' && Number.isFinite(na) && Number.isFinite(nb);
  if (bothNumeric) return na - nb;
  return String(a ?? '').localeCompare(String(b ?? ''), undefined, { numeric: true, sensitivity: 'base' });
};

const conditionMatches = (cellText, { op, value }) => {
  if (!op) return true;
  const cell = asText(cellText);
  const needle = asText(value);
  if (op === 'empty') return cell === '';
  if (op === 'notEmpty') return cell !== '';
  if (needle === '') return true;

  const c = cell.toLowerCase();
  const n = needle.toLowerCase();
  if (op === 'contains') return c.includes(n);
  if (op === 'notContains') return !c.includes(n);
  if (op === 'equals') return c === n;
  if (op === 'notEquals') return c !== n;
  if (op === 'startsWith') return c.startsWith(n);
  if (op === 'endsWith') return c.endsWith(n);
  if (op === 'gt') return compareValues(cell, needle) > 0;
  if (op === 'lt') return compareValues(cell, needle) < 0;
  return true;
};

export function useColumnFilters() {
  // key -> { values: string[] | null, op: string, value: string }
  const [filters, setFilters] = useState({});
  const [sort, setSort] = useState(null); // { key, dir: 'asc' | 'desc' }
  // Which column's panel is open — shared, so opening one closes the others.
  const [openKey, setOpenKey] = useState(null);

  // What the table was last given, so a filter panel can list the values that
  // exist in its column without every page having to hand them over.
  const source = useRef({ rows: [], extractors: {} });

  const setColumn = (key, patch) =>
    setFilters((prev) => {
      const next = { ...prev };
      const merged = { ...(prev[key] || { values: null, op: '', value: '' }), ...patch };
      const inert = merged.values === null && !merged.op && asText(merged.value) === '';
      if (inert) delete next[key];
      else next[key] = merged;
      return next;
    });

  const clearColumn = (key) =>
    setFilters((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });

  const clearAll = () => {
    setFilters({});
    setSort(null);
    setOpenKey(null);
  };

  const textOf = (row, key) => {
    const extract = source.current.extractors?.[key];
    if (!extract) return '';
    return asText(typeof extract === 'function' ? extract(row) : row?.[extract]);
  };

  /** Distinct values present in a column, before that column's own filter. */
  const valuesFor = (key) => {
    const { rows, extractors } = source.current;
    const others = Object.entries(filters).filter(([k]) => k !== key);
    const pool = (Array.isArray(rows) ? rows : []).filter((row) =>
      others.every(([k, f]) => {
        const cell = asText(extractors?.[k] ? extractors[k](row) : '');
        if (Array.isArray(f.values) && !f.values.includes(cell)) return false;
        return conditionMatches(cell, f);
      })
    );
    const seen = new Set();
    for (const row of pool) seen.add(textOf(row, key));
    return [...seen].sort(compareValues);
  };

  const apply = (rows, extractors) => {
    source.current = { rows: Array.isArray(rows) ? rows : [], extractors: extractors || {} };

    const active = Object.entries(filters);
    let out = Array.isArray(rows) ? rows : [];

    if (active.length) {
      out = out.filter((row) =>
        active.every(([key, f]) => {
          const cell = asText(extractors?.[key] ? extractors[key](row) : '');
          if (Array.isArray(f.values) && !f.values.includes(cell)) return false;
          return conditionMatches(cell, f);
        })
      );
    }

    if (sort?.key && extractors?.[sort.key]) {
      out = [...out].sort((a, b) => {
        const d = compareValues(textOf(a, sort.key), textOf(b, sort.key));
        return sort.dir === 'desc' ? -d : d;
      });
    }

    return out;
  };

  return {
    filters,
    sort,
    setSort,
    openKey,
    setOpenKey,
    setColumn,
    clearColumn,
    clearAll,
    valuesFor,
    apply,
    // Kept so existing callers keep working while pages migrate.
    applyFilters: apply,
    setFilter: (key, value) => setColumn(key, { op: asText(value) ? 'contains' : '', value }),
    hasActiveFilters: Object.keys(filters).length > 0 || Boolean(sort),
  };
}

/** The panel itself — rendered fixed so a scrolling table cannot clip it. */
const FilterPanel = ({ column, state, anchorRect, onClose }) => {
  const key = column.key;
  const current = state.filters[key] || { values: null, op: '', value: '' };
  const all = useMemo(() => state.valuesFor(key), [state, key]);

  const [search, setSearch] = useState('');
  const [checked, setChecked] = useState(() => (current.values === null ? new Set(all) : new Set(current.values)));
  const [op, setOp] = useState(current.op || '');
  const [value, setValue] = useState(current.value || '');
  const panelRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    const onDown = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [onClose]);

  const shown = search.trim()
    ? all.filter((v) => v.toLowerCase().includes(search.trim().toLowerCase()))
    : all;
  const allShownChecked = shown.length > 0 && shown.every((v) => checked.has(v));

  const toggle = (v) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next;
    });

  const applyNow = () => {
    const everything = checked.size === all.length;
    state.setColumn(key, {
      values: everything ? null : [...checked],
      op,
      value,
    });
    onClose();
  };

  const clearNow = () => {
    state.clearColumn(key);
    onClose();
  };

  const top = Math.min((anchorRect?.bottom || 0) + 6, window.innerHeight - 460);
  const left = Math.min(Math.max(8, (anchorRect?.left || 0) - 8), window.innerWidth - 300);

  return (
    <div
      ref={panelRef}
      className="fixed z-50 w-72 ui-surface border rounded-xl shadow-lg p-3 space-y-3 text-sm"
      style={{ top: Math.max(8, top), left }}
      role="dialog"
      aria-label={`Filter ${column.label || key}`}
    >
      <div className="font-semibold ui-fg">{column.label || key}</div>

      <div>
        <div className="ui-caption mb-1">Sort</div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              state.setSort({ key, dir: 'asc' });
              onClose();
            }}
            className={`ui-btn ui-btn-secondary ui-btn-sm flex-1 text-xs ${state.sort?.key === key && state.sort?.dir === 'asc' ? 'ui-sunken' : ''}`}
          >
            A → Z
          </button>
          <button
            type="button"
            onClick={() => {
              state.setSort({ key, dir: 'desc' });
              onClose();
            }}
            className={`ui-btn ui-btn-secondary ui-btn-sm flex-1 text-xs ${state.sort?.key === key && state.sort?.dir === 'desc' ? 'ui-sunken' : ''}`}
          >
            Z → A
          </button>
        </div>
      </div>

      <div>
        <div className="ui-caption mb-1">Filter</div>
        <div className="flex gap-2">
          <select value={op} onChange={(e) => setOp(e.target.value)} className="ui-select !h-8 flex-1 px-2 text-xs">
            {CONDITIONS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={!op || op === 'empty' || op === 'notEmpty'}
            className="ui-input !h-8 w-24 px-2 text-xs"
            placeholder="Value"
            aria-label="Condition value"
          />
        </div>
      </div>

      <div className="relative">
        <SearchIcon size={13} className="absolute left-2 top-1/2 -translate-y-1/2 ui-muted" aria-hidden="true" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="ui-input !h-8 w-full pl-7 pr-2 text-xs"
          placeholder="Search"
          aria-label="Search values"
        />
      </div>

      <div className="max-h-48 overflow-y-auto border rounded-lg p-2 space-y-1">
        <label className="flex items-center gap-2 cursor-pointer font-medium">
          <input
            type="checkbox"
            className="ui-checkbox"
            checked={allShownChecked}
            onChange={(e) =>
              setChecked((prev) => {
                const next = new Set(prev);
                shown.forEach((v) => (e.target.checked ? next.add(v) : next.delete(v)));
                return next;
              })
            }
          />
          (Select All)
        </label>
        {shown.length === 0 ? <div className="ui-muted text-xs px-1">No values</div> : null}
        {shown.map((v) => (
          <label key={v || '(blank)'} className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" className="ui-checkbox" checked={checked.has(v)} onChange={() => toggle(v)} />
            <span className="truncate">{v === '' ? '(blank)' : v}</span>
          </label>
        ))}
      </div>

      <div className="flex justify-end gap-2">
        <button type="button" onClick={clearNow} className="ui-btn ui-btn-secondary ui-btn-sm text-xs">
          Clear Filter
        </button>
        <button type="button" onClick={applyNow} className="ui-btn ui-btn-primary ui-btn-sm text-xs">
          Apply Filter
        </button>
      </div>
    </div>
  );
};

/**
 * A header cell that carries its own filter, the way a spreadsheet does: the
 * label stays put and a caret on the right opens the panel. No second row.
 */
export const ColumnHeader = ({ label, col, state, className = '', align = 'left' }) => {
  const [rect, setRect] = useState(null);
  const [localOpen, setLocalOpen] = useState(false);
  const shared = typeof state?.setOpenKey === 'function';
  const open = shared ? state.openKey === col : localOpen;
  const active = col ? state?.filters?.[col] : null;
  const sorted = col && state?.sort?.key === col;

  const close = () => {
    if (shared) state.setOpenKey(null);
    else setLocalOpen(false);
  };

  if (!col) {
    return <th scope="col" className={className}>{label}</th>;
  }

  return (
    <th scope="col" className={className}>
      <button
        type="button"
        onClick={(e) => {
          setRect(e.currentTarget.getBoundingClientRect());
          if (shared) state.setOpenKey(open ? null : col);
          else setLocalOpen(!open);
        }}
        className={`w-full flex items-center gap-1 ${align === 'right' ? 'justify-end' : 'justify-between'} rounded px-1 -mx-1 ui-hover-sunken`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Sort and filter ${typeof label === 'string' ? label : col}`}
      >
        <span className="truncate">{label}</span>
        <span className="flex items-center gap-0.5 shrink-0">
          {sorted ? <span aria-hidden="true" className="text-xs">{state.sort.dir === 'asc' ? '\u25b2' : '\u25bc'}</span> : null}
          <ChevronDown
            size={13}
            aria-hidden="true"
            className={active ? 'text-[rgb(var(--brand))]' : 'opacity-50'}
          />
        </span>
      </button>

      {open && rect ? (
        <FilterPanel
          column={{ key: col, label: typeof label === 'string' ? label : col }}
          state={state}
          anchorRect={rect}
          onClose={close}
        />
      ) : null}
    </th>
  );
};

export default ColumnHeader;
