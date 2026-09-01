/**
 * A list screen, on paper.
 *
 * The same rows and the same columns the screen is showing — not a fresh query.
 * An export that quietly widens the filter produces a document that disagrees
 * with the screen it came from, and the person holding it has no way to tell
 * which one is right.
 *
 * jsPDF loads on demand: it is ~100KB gzipped and only matters the moment
 * somebody exports.
 */
import { notify } from '../components/ui/notify';

const loadPdf = async () => {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  return { jsPDF, autoTable };
};

const cellValue = (col, row) => {
  const raw = typeof col.value === 'function' ? col.value(row) : row?.[col.key];
  if (raw === null || raw === undefined) return '';
  return typeof raw === 'number' ? raw.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : String(raw);
};

/**
 * `subtitle` carries what is currently filtering the view. Printing it is the
 * difference between "our invoices" and "our invoices for August, unpaid".
 */
export async function exportListPdf({ title, subtitle = '', fileName, columns, rows, footNote = '' }) {
  if (!Array.isArray(rows) || !rows.length) {
    notify.error('Nothing to export in the current view.');
    return;
  }
  try {
    const { jsPDF, autoTable } = await loadPdf();
    const cols = (columns || []).filter(Boolean);
    // Landscape once the table is wide enough that portrait would squeeze the
    // figures into two lines each.
    const doc = new jsPDF({ orientation: cols.length > 6 ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' });

    doc.setFontSize(14);
    doc.text(String(title || 'Export'), 40, 40);
    if (subtitle) {
      doc.setFontSize(9);
      doc.setTextColor(110);
      doc.text(String(subtitle), 40, 56);
      doc.setTextColor(0);
    }

    autoTable(doc, {
      startY: subtitle ? 70 : 56,
      head: [cols.map((c) => c.label)],
      body: rows.map((row) => cols.map((c) => cellValue(c, row))),
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [245, 245, 244], textColor: 40, fontStyle: 'bold' },
      columnStyles: cols.reduce((acc, c, i) => {
        if (c.align === 'right') acc[i] = { halign: 'right' };
        return acc;
      }, {}),
      margin: { left: 40, right: 40 },
    });

    if (footNote) {
      const y = (doc.lastAutoTable?.finalY || 80) + 16;
      doc.setFontSize(8);
      doc.setTextColor(110);
      doc.text(String(footNote), 40, y);
    }

    doc.save(`${fileName || 'export'}.pdf`);
    notify.success(`${rows.length} row(s) exported to PDF.`);
  } catch (err) {
    // A failed export must say so. Silently doing nothing reads as a dead
    // button, and the next thing tried is usually clicking it again.
    notify.error(`PDF export failed: ${String(err?.message || err)}`);
  }
}

export default exportListPdf;
