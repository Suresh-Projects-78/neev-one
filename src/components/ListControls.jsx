import React, { useRef, useState } from 'react';
import { Download, FileText, Table2 } from 'lucide-react';

import Popover from './ui/Popover';
import { exportRows as exportCsvRows } from './ListToolbar';
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

export const LIST_PERIODS = [
  { key: 'all', label: 'All time' },
  { key: 'last30', label: 'Last 30 days' },
  { key: 'thisMonth', label: 'This month' },
  { key: 'thisYear', label: 'This year (FY)' },
  { key: 'custom', label: 'Custom range' },
];

const iso = (d) => d.toISOString().slice(0, 10);

/**
 * `{ from, to }` for a preset, or null for a range the caller types.
 *
 * "This year" is the Indian financial year, April to March — the year every
 * other figure in this product is reported against. A calendar year here would
 * quietly disagree with every report beside it.
 */
export const periodRange = (key, today = new Date()) => {
  if (key === 'all') return { from: '', to: '' };
  if (key === 'custom') return null;
  const to = new Date(today);
  let from = new Date(today);
  if (key === 'last30') from.setDate(from.getDate() - 29);
  if (key === 'thisMonth') from = new Date(today.getFullYear(), today.getMonth(), 1);
  if (key === 'thisYear') {
    const fyStart = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
    from = new Date(fyStart, 3, 1);
  }
  return { from: iso(from), to: iso(to) };
};

/** What is filtering the view, in words, so an export says so on its face. */
export const describeView = ({ period, dateFrom, dateTo, status, search, statusLabel }) => {
  const parts = [LIST_PERIODS.find((p) => p.key === period)?.label || 'All time'];
  if (dateFrom || dateTo) parts.push(`${dateFrom || 'start'} to ${dateTo || 'today'}`);
  if (status) parts.push(statusLabel || status);
  if (String(search || '').trim()) parts.push(`matching “${String(search).trim()}”`);
  return parts.join(' · ');
};

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
