import React, { useRef, useState } from 'react';
import { Download, FileText, Table2 } from 'lucide-react';

import Popover from './ui/Popover';
import { exportRows as exportCsvRows } from './ListToolbar';
import { LIST_PERIODS, describeView, periodRange } from '../utils/listPeriod';
import { exportListPdf } from '../utils/listPdf';
import { exportListXlsx } from '../utils/listXlsx';

/**
 * The controls above a document list: what to show, what to search, over what
 * period, and how to take it away.
 *
 * One component rather than one per module, because these are the same four
 * questions on every screen and the answers were drifting. Invoices offered a
 * status filter and two raw date boxes; bills offered something else; the
 * export button meant CSV on one screen and nothing at all on another. A
 * person who learns this bar on invoices should already know it on bills.
 *
 * The period is a preset that *writes the two dates* rather than filtering by
 * itself. One code path decides what is in view, so the chips, the totals, the
 * table and every export agree about the period by construction.
 */

export { LIST_PERIODS, periodRange, describeView } from '../utils/listPeriod';

export const ListControls = ({
  idPrefix,
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Search',
  statusValue = '',
  onStatusChange = null,
  statusOptions = [],
  statusLabel = 'Show',
  allLabel = 'All',
  period,
  onPeriodChange,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  onClear,
  exportTitle,
  exportFileName,
  exportSheetName,
  exportColumns = [],
  exportRows = [],
  children = null,
}) => {
  const exportBtnRef = useRef(null);
  const [exportOpen, setExportOpen] = useState(false);

  const subtitle = describeView({
    period,
    dateFrom,
    dateTo,
    status: statusValue,
    search: searchValue,
    statusLabel: statusOptions.find((o) => o.value === statusValue)?.label,
  });

  const close = () => setExportOpen(false);

  return (
    <div className="ui-toolbar grid-cols-1 md:grid-cols-12 items-end">
      {onStatusChange ? (
        <div className="md:col-span-3">
          <label className="ui-label" htmlFor={`${idPrefix}-scope`}>
            {statusLabel}
          </label>
          <select
            id={`${idPrefix}-scope`}
            value={statusValue}
            onChange={(e) => onStatusChange(e.target.value)}
            className="ui-select"
          >
            <option value="">{allLabel}</option>
            {statusOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className={onStatusChange ? 'md:col-span-4' : 'md:col-span-7'}>
        <label className="ui-label" htmlFor={`${idPrefix}-search`}>
          Search
        </label>
        <input
          id={`${idPrefix}-search`}
          type="text"
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="ui-input"
        />
      </div>

      <div className="md:col-span-2">
        <label className="ui-label" htmlFor={`${idPrefix}-period`}>
          Period
        </label>
        <select
          id={`${idPrefix}-period`}
          value={period}
          onChange={(e) => onPeriodChange(e.target.value)}
          className="ui-select"
        >
          {LIST_PERIODS.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      {/* The date boxes exist only for a custom range. Beside a preset they
          invite editing one and wondering why the dropdown still says This
          month. */}
      {period === 'custom' ? (
        <>
          <div className="md:col-span-2">
            <label className="ui-label">From</label>
            <input type="date" value={dateFrom} onChange={(e) => onDateFromChange(e.target.value)} className="ui-input" />
          </div>
          <div className="md:col-span-1">
            <label className="ui-label">To</label>
            <input type="date" value={dateTo} onChange={(e) => onDateToChange(e.target.value)} className="ui-input" />
          </div>
        </>
      ) : null}

      <div className="md:col-span-12 flex items-center justify-end gap-2">
        <button type="button" onClick={onClear} className="ui-btn ui-btn-ghost">
          Clear filters
        </button>

        <div className="relative">
          <button
            type="button"
            ref={exportBtnRef}
            onClick={() => setExportOpen((v) => !v)}
            className="ui-btn ui-btn-secondary"
            aria-haspopup="menu"
            aria-expanded={exportOpen}
          >
            <Download size={15} aria-hidden="true" /> Export
          </button>
          {exportOpen ? (
            <Popover anchorRef={exportBtnRef} onClose={close} minWidth={220}>
              <div className="py-1" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    close();
                    exportListPdf({
                      title: exportTitle,
                      subtitle,
                      fileName: exportFileName,
                      columns: exportColumns,
                      rows: exportRows,
                      footNote: `${exportRows.length} row(s) · exported from Neev One`,
                    });
                  }}
                  className="w-full text-left flex items-center gap-2 px-3 py-2 text-sm hover:bg-[rgb(var(--surface-sunken))]"
                >
                  <FileText size={15} aria-hidden="true" /> PDF
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    close();
                    exportListXlsx({
                      subtitle,
                      fileName: exportFileName,
                      sheetName: exportSheetName || exportTitle,
                      columns: exportColumns,
                      rows: exportRows,
                    });
                  }}
                  className="w-full text-left flex items-center gap-2 px-3 py-2 text-sm hover:bg-[rgb(var(--surface-sunken))]"
                >
                  <Table2 size={15} aria-hidden="true" /> Excel
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    close();
                    exportCsvRows({
                      fileName: exportFileName,
                      columns: exportColumns,
                      rows: exportRows,
                      label: 'row(s)',
                    });
                  }}
                  className="w-full text-left flex items-center gap-2 px-3 py-2 text-sm hover:bg-[rgb(var(--surface-sunken))]"
                >
                  <Download size={15} aria-hidden="true" /> CSV
                </button>
                <p className="ui-caption px-3 pt-1 pb-2">
                  Exports what you are looking at — this period, this search, these columns.
                </p>
              </div>
            </Popover>
          ) : null}
        </div>

        {children}
      </div>
    </div>
  );
};

export default ListControls;

/**
 * Period state for a list, as one hook.
 *
 * `inRange` is what the list filters with, so the preset, the dates and the
 * rows can never disagree — the preset writes the dates, and the dates are the
 * only thing consulted.
 */
/**
 * The financial year chosen top-right, read by every period filter.
 *
 * '' means "all years". Anything else is 'YYYY-MM-DD..YYYY-MM-DD' — the
 * FY's own range — and a list whose period is still 'all' silently narrows
 * to it, which is what a top-right year selector means: every list and
 * report answers for that year until the list picks something narrower
 * itself. Stored per browser; a storage event keeps open tabs in step.
 */
export const readGlobalFy = () => {
  try {
    return String(localStorage.getItem('globalFy') || '').trim();
  } catch {
    return '';
  }
};
export const writeGlobalFy = (range) => {
  try {
    if (range) localStorage.setItem('globalFy', String(range));
    else localStorage.removeItem('globalFy');
  } catch {
    /* private mode: the selector simply does not persist */
  }
  window.dispatchEvent(new Event('globalFyChanged'));
};

export const usePeriodFilter = () => {
  const [period, setPeriodState] = React.useState('all');
  const [dateFrom, setDateFrom] = React.useState('');
  const [dateTo, setDateTo] = React.useState('');
  const [globalFy, setGlobalFy] = React.useState(readGlobalFy);

  React.useEffect(() => {
    const sync = () => setGlobalFy(readGlobalFy());
    window.addEventListener('globalFyChanged', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('globalFyChanged', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const setPeriod = (key) => {
    setPeriodState(key);
    const range = periodRange(key);
    // A custom range keeps whatever dates are already typed.
    if (!range) return;
    setDateFrom(range.from);
    setDateTo(range.to);
  };

  /* The FY floor: with no narrower period chosen, the year rules. */
  const [fyFrom, fyTo] = period === 'all' && !dateFrom && !dateTo && globalFy.includes('..')
    ? globalFy.split('..')
    : ['', ''];
  const effFrom = dateFrom || fyFrom;
  const effTo = dateTo || fyTo;

  const inRange = (value) => {
    const d = String(value || '').slice(0, 10);
    if (!d) return !effFrom && !effTo;
    if (effFrom && d < effFrom) return false;
    if (effTo && d > effTo) return false;
    return true;
  };

  const clear = () => {
    setPeriodState('all');
    setDateFrom('');
    setDateTo('');
  };

  return { period, setPeriod, dateFrom: effFrom, dateTo: effTo, setDateFrom, setDateTo, inRange, clear };
};
