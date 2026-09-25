/**
 * A list screen, as a real spreadsheet.
 *
 * CSV was standing in for this and it does not survive contact with Indian
 * accounting data: a number with a thousands separator arrives as text, a
 * leading-zero HSN code loses its zero, and a long invoice number in
 * scientific notation is a support call. A real .xlsx carries the type with
 * the value, so a figure opens as a figure and a code opens as a code.
 *
 * Same rows and columns the screen is showing, never a fresh query — an export
 * that quietly widens the filter produces a file that disagrees with the
 * screen it came from, and whoever is holding it cannot tell which is right.
 *
 * The writer loads on demand; it only matters the moment somebody exports.
 */
import { notify } from '../components/ui/notify';

/**
 * v4 takes `columns` of `{ header, cell(object) }`. The older `schema` /
 * `value` shape it replaced fails at call time, not at build time, so the
 * export button looked fine and died on click.
 */
const headerCell = (label, align) => ({
  value: String(label),
  fontWeight: 'bold',
  backgroundColor: '#F5F5F4',
  color: '#292524',
  align: align || 'left',
  borderBottomColor: '#D6D3D1',
  borderBottomStyle: 'thin',
});

const raw = (col, row) => (typeof col.value === 'function' ? col.value(row) : row?.[col.key]);

/**
 * A column is a number column when it says so, or when it is right-aligned on
 * screen — the two are the same statement about the data.
 */
const isNumeric = (col) => col.type === 'number' || col.align === 'right';

const buildColumns = (columns) =>
  columns.map((col) => {
    const numeric = isNumeric(col);
    return {
      header: headerCell(col.label, numeric ? 'right' : 'left'),
      width: numeric
        ? Math.max(12, String(col.label).length + 4)
        : Math.max(12, Math.min(42, String(col.label).length + 8)),
      cell: (row) => {
        const v = raw(col, row);
        if (numeric) {
          const n = Number(v);
          return {
            // null, not 0: a missing figure and a zero figure are different
            // answers, and a spreadsheet that turns one into the other will be
            // summed by somebody.
            value: Number.isFinite(n) ? n : null,
            type: Number,
            // Two decimals, Indian grouping, so the column adds up in Excel
            // instead of reading as a list of words.
            format: '#,##,##0.00',
            align: 'right',
          };
        }
        return { value: v === null || v === undefined ? '' : String(v), type: String };
      },
    };
  });

export async function exportListXlsx({ subtitle = '', fileName, columns, rows, sheetName = 'Export' }) {
  if (!Array.isArray(rows) || !rows.length) {
    notify.error('Nothing to export in the current view.');
    return;
  }
  try {
    // The browser entry point: the package's node build writes to a stream and
    // would fail here with no obvious reason why.
    const { default: writeXlsxFile } = await import('write-excel-file/browser');
    const cols = (columns || []).filter(Boolean);

    // v4 returns { toBlob, toFile } and saves nothing on its own. Awaiting the
    // call and passing a fileName — the v2 shape — produces no file and no
    // error: the button works, and nothing arrives.
    const workbook = writeXlsxFile(rows, {
      columns: buildColumns(cols),
      // Excel truncates a sheet name past 31 characters and refuses several
      // punctuation marks outright, so it is trimmed here rather than failing
      // at save time.
      sheet: String(sheetName || 'Export').replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Export',
      stickyRowsCount: 1,
    });
    await workbook.toFile(`${fileName || 'export'}.xlsx`);

    notify.success(
      `${rows.length} row(s) exported to Excel${subtitle ? ` — ${subtitle}` : ''}.`.replace(/\s+—\s+\./, '.')
    );
  } catch (err) {
    // A failed export has to say so. Doing nothing quietly reads as a dead
    // button, and the next thing tried is always clicking it again.
    notify.error(`Excel export failed: ${String(err?.message || err)}`);
  }
}

export default exportListXlsx;
