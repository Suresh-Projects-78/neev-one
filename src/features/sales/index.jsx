import React, { useEffect, useMemo, useRef, useState } from 'react';
import { returnableLines, returnStatusLabel } from '../../utils/returns';
import KnockOffForm from '../../components/KnockOffForm';
import { isOnAccount, noteBalance } from '../../utils/onAccount';
import WarehouseField from '../../components/WarehouseField';
import { notify, confirmDialog } from '../../components/ui/notify';
import { Ban, ClipboardList, Copy, CreditCard, Download, Eye, FileText, MoreVertical, Plus, Printer, Receipt, Settings2, SlidersHorizontal, Table2, Trash2, Tag, RefreshCw, X } from 'lucide-react';

import CustomerPicker from '../../components/pickers/CustomerPicker';
import { addDays, dueDateFor, termsLabel } from '../../utils/paymentTerms';
import { plusDaysIso, todayIso } from '../../utils/dates';
import ItemPicker from '../../components/pickers/ItemPicker';
import { createInvoiceApi, deleteInvoiceApi, updateInvoiceApi } from '../../api/invoices';
import { useFeatures } from '../../permissions/useFeatures';
import { createDocApi, hasApiSession as hasDocsApiSession, saveSettlementApi } from '../../api/purchaseDocs';
import { buildEInvoicePayload, buildEwayBillPayload } from '../../utils/einvoice';
import { registerEInvoiceApi, getEInvoiceSettingsApi, generateEwaybillApi } from '../../api/einvoice';
import { resolveSaleRate } from '../../utils/pricing';
import EwbTransportForm from '../../components/EwbTransportForm';
import EInvoiceWorkflow from './EInvoiceWorkflow';
import { resolveDiscountForLine } from '../../utils/discounts';
import { isTracked, fefoPick, batchesForItem } from '../../utils/batches';
import { downloadJson } from '../../utils/gstrExport';
import { useGridView } from '../../components/grid/useGridView';
import GridControls, { BulkBar } from '../../components/grid/GridControls';
import Popover from '../../components/ui/Popover';
import InvoiceFieldSettings from '../settings/InvoiceFieldSettings';

import { bumpCompanyNextNumber, getDocSettings, nextFreeVoucherNumber } from '../../utils/docSettings';
import { getInvoicePrefs, isInvoicePrefOn, getVisibleCustomFields } from '../../utils/invoicePrefs';
import { getCustomerDisplayName } from '../../utils/contacts';
import { getNextNumericId } from '../../utils/ids';
import { formatMoney, round2 } from '../../utils/money';
import { consumeSearchSeed } from '../../utils/searchSeed';
import RecordReceiptForm from '../payments/RecordReceiptForm';
import InvoicePreview, { amountInWordsInr } from './InvoicePreview';
import {
  canDetermineSupplyType,
  computeGstForLine,
  computeGstForLines,
  getCompanyGstProfile,
  getPartyGstProfile,
  isIntraStateSupply,
} from '../../utils/gst';
import { computeInventorySummaryByItemId, isStockItem } from '../../utils/inventory';
import { PageHeader, StatusPill, EmptyState, TableTotals, FieldError, FieldErrorSummary } from '../../components/ui/Primitives';
import { useFieldErrors } from '../../components/ui/useFieldErrors';
import { PermissionButton } from '../../permissions/ActionGuard';
import DocHeaderStrip from '../../components/ui/DocHeaderStrip';
import { useColumnFilters, ColumnHeader } from '../../components/ColumnFilters';
import { ListToolbar, exportRows, useListSearch } from '../../components/ListToolbar';
import ListControls, { periodRange, usePeriodFilter } from '../../components/ListControls';
import { DocFormActions, AmountInWordsBand, DocFormFootnote } from '../../components/DocumentForm';
import { blockIfClosed } from '../../utils/bookClose';


/**
 * Past its due date and still carrying a balance.
 *
 * Both halves matter: a paid invoice whose due date has passed is not overdue,
 * and colouring it red would train people to ignore the colour.
 */
const isOverdue = (doc) => {
  const due = String(doc?.dueDate || '').slice(0, 10);
  if (!due) return false;
  const outstanding = Number(doc?.total ?? 0) - Number(doc?.paidAmount ?? 0);
  if (outstanding <= 0.005) return false;
  return due < new Date().toISOString().slice(0, 10);
};

/** Columns the invoices grid can show or hide. Identity and actions stay. */
/**
 * Column order follows the document, not the record: the number, when it was
 * raised, who it went to, then what it is worth broken into the three figures
 * that matter — the taxable value, the tax on it, and what the customer owes.
 *
 * Amount and GST Amount are separate columns because they answer different
 * questions. The taxable value is what the sale was worth; the GST is what is
 * being collected on somebody else's behalf and paid over. A single Total
 * column hides both.
 */
const GRID_COLUMNS = [
  { key: 'number', label: 'Invoice No.', always: true },
  { key: 'date', label: 'Date' },
  { key: 'customer', label: 'Customer' },
  { key: 'amount', label: 'Amount' },
  { key: 'gst', label: 'GST Amount' },
  { key: 'total', label: 'Total Amount', always: true },
  { key: 'status', label: 'Status' },
  { key: 'due', label: 'Due' },
  { key: 'warehouse', label: 'Warehouse' },
];

export const InvoicesList = ({
  db,
  setDb,
  openModal,
  currentCompany,
  onNewInvoice,
  onEditInvoice,
  onRaiseCreditNote,
  warehouses = [],
  defaultWarehouseId = '',
}) => {
  const invoices = db.invoices.filter((i) => i.companyId === currentCompany.id);
  const [openMenu, setOpenMenu] = useState(null);
  const menuRef = useRef(null);

  const warehouseById = useMemo(() => {
    const list = Array.isArray(warehouses) ? warehouses : [];
    return new Map(list.map((w) => [String(w?.id), w]));
  }, [warehouses]);

  // Arriving from the palette: the chosen document's number filters the list
  // on the way in, so the screen opens on the thing that was picked.
  const [searchText, setSearchText] = useState(() => consumeSearchSeed('invoices'));
  const colFilters = useColumnFilters();
  const [statusFilter, setStatusFilter] = useState('');
  /**
   * A period is chosen far more often than it is typed. "This month" and "last
   * 30 days" are the two questions actually being asked of a sales ledger, and
   * making somebody pick two calendar dates to ask them is the reason people
   * export to a spreadsheet instead.
   */
  const [period, setPeriod] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // --- power grid tools (feature-gated) ---
  const { isEnabled } = useFeatures();
  const gridEnabled = isEnabled('gridTools');
  const grid = useGridView({
    storageKey: `grid:${currentCompany?.id || 'x'}:invoices`,
    columns: GRID_COLUMNS,
    getFilterSnapshot: () => ({ searchText, statusFilter, dateFrom, dateTo }),
    applyFilterSnapshot: (f) => {
      setSearchText(String(f?.searchText ?? ''));
      setStatusFilter(String(f?.statusFilter ?? ''));
      setDateFrom(String(f?.dateFrom ?? ''));
      setDateTo(String(f?.dateTo ?? ''));
    },
  });
  const col = (key) => !gridEnabled || grid.isVisible(key);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const toggleSelected = (id) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const MENU_WIDTH = 224; // w-56
  const MENU_HEIGHT_ESTIMATE = 320;

  useEffect(() => {
    if (!openMenu?.id) return;

    const onMouseDown = (e) => {
      if (menuRef.current && menuRef.current.contains(e.target)) return;
      const btn = e.target?.closest?.('[data-invoice-menu-button]');
      if (btn && String(btn.getAttribute('data-invoice-menu-button')) === String(openMenu.id)) return;
      setOpenMenu(null);
    };

    const onScrollOrResize = () => setOpenMenu(null);

    document.addEventListener('mousedown', onMouseDown);
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);

    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [openMenu?.id]);

  useEffect(() => {
    setOpenMenu(null);
  }, [searchText, statusFilter, dateFrom, dateTo]);

/**
 * The answer to the question the status word provokes.
 *
 * "Overdue" invites "by how long"; "Partial" invites "how much is left". Both
 * answers are already on the row — they were just never shown, so the reader
 * had to open the document to learn what the word meant.
 */
const statusReason = (doc, status, company, nowMs) => {
  const s = String(status || '').toLowerCase();
  const total = Number(doc?.total ?? 0);
  const paid = Number(doc?.paidAmount ?? 0);

  if (s === 'overdue' && doc?.dueDate) {
    const due = new Date(`${String(doc.dueDate).slice(0, 10)}T00:00:00`);
    const days = Math.max(0, Math.round((nowMs - due.getTime()) / 86400000));
    return days ? `${days} day${days === 1 ? '' : 's'}` : '';
  }
  if (s === 'partial' && total > 0) {
    // What the word means, in the words people use for it. The figures stay:
    // "partly paid" alone does not say how much is still owed.
    return `partly paid · ${formatMoney(paid, company)} of ${formatMoney(total, company)}`;
  }
  if (s === 'partially returned' || s === 'partly returned') {
    return 'partly returned';
  }
  /**
   * An unpaid invoice says nothing else.
   *
   * It used to count down — "due in 12 days" — on every open invoice on the
   * screen, which is a diary entry rather than a status, and it crowded out
   * the two captions that do carry meaning: partly paid, and partly returned.
   * The due date is already its own column.
   */
  return '';
};

  const getDerivedStatus = (invoice) => {
    const total = Number(invoice?.total ?? 0);
    const paid = Number(invoice?.paidAmount ?? 0);

    const raw = String(invoice?.status || '').trim();
    if (raw === 'Draft') return 'Draft';
    if (raw === 'Paid') return 'Paid';
    if (raw === 'Cancelled') return 'Cancelled';
    if (total > 0 && paid >= total - 0.0001) return 'Paid';

    const due = invoice?.dueDate ? new Date(invoice.dueDate) : null;
    const today = new Date();
    if (due && !Number.isNaN(due.getTime())) {
      const dueYmd = due.toISOString().slice(0, 10);
      const todayYmd = today.toISOString().slice(0, 10);
      if (dueYmd < todayYmd && total > 0 && paid < total - 0.0001) return 'Over due';
    }

    if (paid > 0) return 'Partial';
    return 'Unpaid';
  };

  // What is currently hiding rows, in the user's words. Shown on the empty
  // state so "nothing here" never has to be read as "nothing exists".
  // Pinned once per mount, so "24 days overdue" is the same number in every
  // row of one render pass.
  const [nowMs] = useState(() => Date.now());

  const activeFilterChips = useMemo(() => {
    const chips = [];
    if (String(searchText || '').trim()) {
      chips.push({ label: 'Search', value: String(searchText).trim(), onRemove: () => setSearchText('') });
    }
    if (String(statusFilter || '').trim()) {
      chips.push({ label: 'Status', value: String(statusFilter).trim(), onRemove: () => setStatusFilter('') });
    }
    if (String(dateFrom || '').trim()) {
      chips.push({ label: 'From', value: String(dateFrom).trim(), onRemove: () => setDateFrom('') });
    }
    if (String(dateTo || '').trim()) {
      chips.push({ label: 'To', value: String(dateTo).trim(), onRemove: () => setDateTo('') });
    }
    for (const [key, f] of Object.entries(colFilters.filters || {})) {
      const shown = Array.isArray(f?.values) ? f.values.filter(Boolean).join(', ') : String(f?.value || '');
      chips.push({ label: key, value: shown || 'set', onRemove: () => colFilters.clearColumn(key) });
    }
    return chips;
  }, [searchText, statusFilter, dateFrom, dateTo, colFilters]);

  const clearAllInvoiceFilters = () => {
    setSearchText('');
    setStatusFilter('');
    setDateFrom('');
    setDateTo('');
    colFilters.clearAll();
  };

  const filteredInvoices = useMemo(() => {
    const q = String(searchText || '').trim().toLowerCase();
    const from = String(dateFrom || '').trim();
    const to = String(dateTo || '').trim();
    const wantStatus = String(statusFilter || '').trim();

    const matchesSearch = (inv) => {
      if (!q) return true;
      const hay = [inv?.number, inv?.customerName, inv?.refNo]
        .map((x) => String(x || '').trim().toLowerCase())
        .filter(Boolean)
        .join(' ');
      return hay.includes(q);
    };

    const inDateRange = (inv) => {
      const d = String(inv?.date || '').trim();
      if (!d) return !from && !to;
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    };

    const base = (Array.isArray(invoices) ? invoices : [])
      .filter((inv) => matchesSearch(inv))
      .filter((inv) => {
        if (!wantStatus) return true;
        return getDerivedStatus(inv) === wantStatus;
      })
      .filter((inv) => inDateRange(inv))
      .slice()
      .sort((a, b) => {
        const da = String(a?.date || '');
        const dbb = String(b?.date || '');
        if (da !== dbb) return da < dbb ? 1 : -1;
        return Number(b?.id || 0) - Number(a?.id || 0);
      });

    return colFilters.applyFilters(base, {
      number: (r) => r.number,
      customer: (r) => r.customerName,
      warehouse: (r) => {
        const wh = warehouseById.get(String(r?.warehouseId || '').trim());
        return wh?.name || r?.warehouseId || '';
      },
      date: (r) => r.date,
      due: (r) => r.dueDate,
      total: (r) => r.total,
      status: (r) => getDerivedStatus(r),
    });
  }, [dateFrom, dateTo, invoices, searchText, statusFilter, colFilters.applyFilters, warehouseById]);

  // Summed over the filtered set, not over the rows the browser happens to have
  // drawn — the day this list gets a page window, the figure must not quietly
  // become the total of one page.
  const invoiceTotals = useMemo(() => {
    let billed = 0;
    let outstandingSum = 0;
    let gst = 0;
    let draft = 0;
    for (const inv of filteredInvoices) {
      const total = Number(inv.total || 0);
      // A draft is an intention, not a liability — the same rule the dashboard
      // and the money-out stream apply. Counting one here told the proprietor
      // that ₹2,950 was billed and outstanding on a document nobody had sent,
      // and put its tax into the GST figure before any tax was due.
      if (String(inv.status || '').toLowerCase() === 'draft') {
        draft += total;
        continue;
      }
      billed += total;
      outstandingSum += Math.max(0, total - Number(inv.paidAmount || 0));
      gst += Number(inv.gstTotal || 0);
    }
    return [
      { label: 'Billed', value: formatMoney(billed, currentCompany) },
      { label: 'Outstanding', value: formatMoney(outstandingSum, currentCompany), tone: outstandingSum > 0 ? 'neg' : undefined },
      { label: 'GST', value: formatMoney(gst, currentCompany) },
      // Shown rather than dropped: the money is real, it just is not owed yet,
      // and a footer that silently ignored these rows would be its own defect.
      ...(draft > 0 ? [{ label: 'In draft', value: formatMoney(draft, currentCompany) }] : []),
    ];
  }, [filteredInvoices, currentCompany]);


  /**
   * A preset writes the two dates rather than filtering separately. One code
   * path decides what is in view, so the chips, the totals, the table and both
   * exports can never disagree about the period.
   */
  const applyPeriod = (key) => {
    setPeriod(key);
    const range = periodRange(key);
    // A custom range keeps whatever dates are already typed.
    if (!range) return;
    setDateFrom(range.from);
    setDateTo(range.to);
  };

  /**
   * The columns an export carries: the document's own figures, not the
   * screen's optional ones. The list can hide Warehouse; a sheet of invoices
   * without the customer or the tax on it is not useful to anybody.
   */
  const exportColumns = [
    { key: 'number', label: 'Invoice No.' },
    { key: 'date', label: 'Date' },
    { key: 'customerName', label: 'Customer' },
    { key: 'subtotal', label: 'Amount', align: 'right', value: (r) => Number(r.subtotal || 0) },
    { key: 'gstTotal', label: 'GST Amount', align: 'right', value: (r) => Number(r.gstTotal || 0) },
    { key: 'total', label: 'Total Amount', align: 'right', value: (r) => Number(r.total || 0) },
    { key: 'paidAmount', label: 'Paid', align: 'right', value: (r) => Number(r.paidAmount || 0) },
    { key: 'status', label: 'Status', value: (r) => getDerivedStatus(r) },
  ];

  // Kept for the bulk bar, which exports the selection rather than the view.
  const openNewInvoice = () => {
    if (typeof onNewInvoice === 'function') {
      onNewInvoice();
      return;
    }
    openModal(
      <InvoiceForm
        db={db}
        setDb={setDb}
        currentCompany={currentCompany}
        warehouses={warehouses}
        defaultWarehouseId={defaultWarehouseId}
        onClose={() => openModal(null)}
      />,
      { title: 'New Invoice', maxWidthClass: 'max-w-5xl' }
    );
  };

  const openEditInvoice = (invoice) => {
    if (typeof onEditInvoice === 'function') {
      onEditInvoice(invoice);
      return;
    }
    openModal(
      <InvoiceForm
        db={db}
        setDb={setDb}
        currentCompany={currentCompany}
        initialData={invoice}
        warehouses={warehouses}
        defaultWarehouseId={defaultWarehouseId}
        onClose={() => openModal(null)}
      />,
      { title: `Edit Invoice ${invoice?.number || ''}`.trim(), maxWidthClass: 'max-w-5xl' }
    );
  };

  const openRecordReceipt = (invoice) => {
    // The same form the Receipts screen uses, so money recorded from an
    // invoice row reaches the general ledger too. The old quick form wrote
    // only to the local store: two entrances, and only one of them posted.
    openModal(
      <RecordReceiptForm
        db={db}
        setDb={setDb}
        currentCompany={currentCompany}
        initialData={{
          customerId: invoice?.customerId,
          amount: Math.max(0, Number(invoice?.total ?? 0) - Number(invoice?.paidAmount ?? 0)),
        }}
        onClose={() => openModal(null)}
      />,
      { title: `Record Receipt ${invoice?.number || ''}`.trim(), maxWidthClass: 'max-w-4xl' }
    );
  };

  const openViewInvoice = (invoice) => {
    openModal(
      <InvoicePreview db={db} currentCompany={currentCompany} invoice={invoice} />,
      { title: `Invoice ${invoice?.number || ''}`.trim(), maxWidthClass: 'max-w-5xl' }
    );
  };

  const InvoicePrintDownloadView = ({ invoice }) => {
    const previewRef = useRef(null);
    const [downloading, setDownloading] = useState(false);
    const title = useMemo(() => {
      const no = String(invoice?.number || '').trim();
      return no ? `Invoice ${no}` : 'Invoice';
    }, [invoice?.number]);

    const doPrint = () => {
      try {
        const prevTitle = document.title;
        const no = String(invoice?.number || '').trim();
        if (no) document.title = no;

        document.body.classList.add('print-mode');
        const cleanup = () => {
          document.body.classList.remove('print-mode');
          document.title = prevTitle;
        };
        window.addEventListener('afterprint', cleanup, { once: true });
        window.print();

        // fallback cleanup
        window.setTimeout(cleanup, 1200);
      } catch {
        // ignore
      }
    };

    const doDownload = async () => {
      const el = previewRef.current;
      if (!el || downloading) return;

      setDownloading(true);
      const prevTitle = document.title;
      const no = String(invoice?.number || '').trim();
      const filenameBase = (no || 'invoice').replace(/[\\/:*?"<>|]/g, '-').trim() || 'invoice';

      try {
        if (no) document.title = no;
        document.body.classList.add('print-mode');

        const { jsPDF } = await import('jspdf');
        const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });

        await new Promise((resolve) => {
          doc.html(el, {
            x: 18,
            y: 18,
            width: 559, // A4 width (595pt) - 18pt margins on both sides
            windowWidth: Math.max(el.scrollWidth || 0, 980),
            margin: [18, 18, 18, 18],
            autoPaging: 'text',
            html2canvas: {
              scale: 2,
              useCORS: true,
              backgroundColor: '#ffffff',
            },
            callback: () => resolve(),
          });
        });

        doc.save(`${filenameBase}.pdf`);
      } catch {
        notify.error('Unable to generate PDF. Please try again.');
      } finally {
        document.body.classList.remove('print-mode');
        document.title = prevTitle;
        setDownloading(false);
      }
    };

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="ui-muted text-sm">{title}</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={doPrint}
              className="ui-btn ui-btn-secondary"
            >
              <Printer size={16} /> Print
            </button>
            <button
              type="button"
              onClick={doDownload}
              disabled={downloading}
              className="px-3 py-2 rounded-lg ui-btn ui-btn-primary flex items-center gap-2"
            >
              <Download size={16} /> {downloading ? 'Preparing...' : 'Download'}
            </button>
          </div>
        </div>

        <div ref={previewRef}>
          <InvoicePreview db={db} currentCompany={currentCompany} invoice={invoice} />
        </div>
      </div>
    );
  };

  const openPrintAndDownload = (invoice) => {
    openModal(<InvoicePrintDownloadView invoice={invoice} />, {
      title: `Invoice ${invoice?.number || ''}`.trim(),
      maxWidthClass: 'max-w-5xl',
    });
  };

  const duplicateInvoice = (invoice) => {
    const copyInvoice = {
      ...invoice,
      id: undefined,
      number: '',
      date: undefined,
      dueDate: undefined,
      status: 'Draft',
      paidAmount: 0,
      createdAt: undefined,
      updatedAt: undefined,
      sourceEstimateId: null,
    };

    if (Array.isArray(copyInvoice.items)) {
      copyInvoice.items = copyInvoice.items.map((l) => ({
        itemId: l?.itemId !== undefined && l?.itemId !== null && l?.itemId !== '' ? String(l.itemId) : '',
        description: l?.description ?? '',
        quantity: Number(l?.quantity ?? 1),
        rate: Number(l?.rate ?? 0),
        gstRate: Number(l?.gstRate ?? 0),
        hsnSac: l?.hsnSac || '',
        amount: Number(l?.amount ?? 0),
      }));
    }

    openEditInvoice(copyInvoice);
  };

  const raiseCreditNote = (invoice) => {
    if (typeof onRaiseCreditNote === 'function') {
      onRaiseCreditNote(invoice);
      return;
    }

    openModal(
      <CreditNoteForm
        db={db}
        setDb={setDb}
        currentCompany={currentCompany}
        initialOriginalInvoiceId={invoice?.id}
        warehouses={warehouses}
        defaultWarehouseId={defaultWarehouseId}
        onClose={() => openModal(null)}
      />,
      { title: 'New Credit Note', maxWidthClass: 'max-w-5xl' }
    );
  };

  const cancelInvoice = async (invoice) => {
    const ok = await confirmDialog({ title: 'Please confirm', message: `Cancel invoice ${invoice?.number || ''}?`.trim(), confirmLabel: 'Yes, continue' });
    if (!ok) return;
    setDb((prev) => ({
      ...prev,
      invoices: (prev.invoices || []).map((inv) =>
        inv.id === invoice.id
          ? {
              ...inv,
              status: 'Cancelled',
              updatedAt: new Date().toISOString(),
            }
          : inv
      ),
    }));
  };

  const deleteInvoiceCore = async (invoice) => {
    const run = async () => {
      const hasApiSession = Boolean(String(localStorage.getItem('token') || '').trim() && String(localStorage.getItem('activeOrgId') || '').trim());
      const backendInvoiceId = String(invoice?.backendInvoiceId || '').trim();
      if (hasApiSession && backendInvoiceId) {
        try {
          await deleteInvoiceApi(backendInvoiceId);
        } catch (e) {
          notify.error(String(e?.message || 'Unable to delete invoice from backend.'));
          return;
        }
      }

      setDb((prev) => ({
        ...prev,
        invoices: (prev.invoices || []).filter((inv) => inv.id !== invoice.id),
        payments: (Array.isArray(prev.payments) ? prev.payments : []).filter(
          (p) => {
            if (p?.voucherType === 'invoice' && Number(p?.voucherId) === Number(invoice.id)) return false;
            if (p?.voucherType === 'receipt' && Array.isArray(p?.allocations)) {
              const hit = p.allocations.some((a) => a?.voucherType === 'invoice' && Number(a?.voucherId) === Number(invoice.id));
              if (hit) return false;
            }
            return true;
          }
        ),
      }));
    };
    await run();
  };

  const deleteInvoice = async (invoice) => {
    const ok = await confirmDialog({ title: 'Please confirm', message: `Delete invoice ${invoice?.number || ''}? This cannot be undone.`.trim(), confirmLabel: 'Yes, continue' });
    if (!ok) return;
    deleteInvoiceCore(invoice);
  };

  const bulkDelete = async () => {
    const rows = filteredInvoices.filter((i) => selectedIds.has(i.id));
    if (!rows.length) return;
    const ok = await confirmDialog({ title: 'Please confirm', message: `Delete ${rows.length} invoice${rows.length === 1 ? '' : 's'}? This cannot be undone.`, confirmLabel: 'Yes, continue' });
    if (!ok) return;
    for (const inv of rows) {
      // Sequential on purpose: each delete hits the API and then rewrites
      // db state; racing them loses updates to the last writer.
      // eslint-disable-next-line no-await-in-loop
      await deleteInvoiceCore(inv);
    }
    setSelectedIds(new Set());
  };

  /**
   * The selection, exported through the same columns as the view.
   *
   * This used to build its own CSV by hand with a different, shorter column
   * set — so a selection and a full export of the same invoices disagreed
   * about what an invoice contains.
   */
  const bulkExportCsv = () => {
    const rows = filteredInvoices.filter((i) => selectedIds.has(i.id));
    exportRows({
      fileName: `Invoices_${currentCompany?.name || 'company'}_selection`,
      label: 'invoice(s)',
      columns: exportColumns,
      rows,
    });
  };

  const openInvoiceMenu = (invoiceId, anchorEl) => {
    if (!anchorEl) {
      setOpenMenu({ id: invoiceId, left: 0, top: 0 });
      return;
    }

    const rect = anchorEl.getBoundingClientRect();
    const padding = 12;
    const vw = window.innerWidth || 1024;
    const vh = window.innerHeight || 768;

    let left = rect.right - MENU_WIDTH;
    left = Math.max(padding, Math.min(left, vw - MENU_WIDTH - padding));

    let top = rect.bottom + 8;
    if (top + MENU_HEIGHT_ESTIMATE > vh - padding) {
      top = rect.top - MENU_HEIGHT_ESTIMATE - 8;
    }
    top = Math.max(padding, Math.min(top, vh - padding - 40));

    setOpenMenu({ id: invoiceId, left, top });
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Invoices"
        description="Sales invoices for the active branch"
        actions={
          <PermissionButton
            permission="SALES::Invoices::CREATE"
            onClick={openNewInvoice}
            className="ui-btn ui-btn-primary"
          >
            <Plus size={16} aria-hidden="true" /> New Invoice
          </PermissionButton>
        }
      />

      {/* One card, not two: the filters belong to the table they filter, and a
          separate floating box above it reads as an unrelated control panel. */}
      <div className="ui-card overflow-hidden">
        <ListControls
          idPrefix="inv"
          statusLabel="Show"
          allLabel="All Invoices"
          statusValue={statusFilter}
          onStatusChange={setStatusFilter}
          statusOptions={[
            { value: 'Paid', label: 'Paid' },
            { value: 'Unpaid', label: 'Unpaid' },
            { value: 'Partial', label: 'Partially paid' },
            { value: 'Over due', label: 'Overdue' },
            { value: 'Draft', label: 'Pending — draft' },
            { value: 'Cancelled', label: 'Cancelled' },
          ]}
          searchValue={searchText}
          onSearchChange={setSearchText}
          searchPlaceholder="Search by invoice #, customer, ref no"
          period={period}
          onPeriodChange={applyPeriod}
          dateFrom={dateFrom}
          dateTo={dateTo}
          onDateFromChange={setDateFrom}
          onDateToChange={setDateTo}
          onClear={() => {
            setSearchText('');
            setStatusFilter('');
            applyPeriod('all');
            colFilters.clearAll();
          }}
          exportTitle={`Invoices — ${currentCompany?.name || 'Company'}`}
          exportFileName={`Invoices_${currentCompany?.name || 'company'}`}
          exportSheetName="Invoices"
          exportColumns={exportColumns}
          exportRows={filteredInvoices}
        >
          {gridEnabled ? <GridControls grid={grid} /> : null}
        </ListControls>

        {gridEnabled ? (
          <BulkBar count={selectedIds.size} onClear={() => setSelectedIds(new Set())}>
            <button type="button" onClick={bulkExportCsv} className="ui-btn ui-btn-secondary ui-btn-sm">
              Export CSV
            </button>
            <button type="button" onClick={bulkDelete} className="ui-btn ui-btn-danger ui-btn-sm">
              Delete
            </button>
          </BulkBar>
        ) : null}

        <div className="overflow-x-auto ui-table-scroll">
        <table className="ui-table ui-table-wide ui-table-sticky">
          <thead>
            <tr>
              {gridEnabled ? (
                <th scope="col" className="w-8">
                  <input
                    type="checkbox"
                    className="ui-checkbox"
                    aria-label="Select all invoices in view"
                    checked={filteredInvoices.length > 0 && filteredInvoices.every((i) => selectedIds.has(i.id))}
                    onChange={(e) =>
                      setSelectedIds(e.target.checked ? new Set(filteredInvoices.map((i) => i.id)) : new Set())
                    }
                  />
                </th>
              ) : null}
              <ColumnHeader label="Invoice No." col="number" state={colFilters} />
              {col('date') ? <ColumnHeader label="Date" col="date" state={colFilters} /> : null}
              {col('customer') ? <ColumnHeader label="Customer" col="customer" state={colFilters} /> : null}
              {col('amount') ? <ColumnHeader label="Amount" col="amount" state={colFilters} className="ui-num" align="right" /> : null}
              {col('gst') ? <ColumnHeader label="GST Amount" col="gst" state={colFilters} className="ui-num" align="right" /> : null}
              <ColumnHeader label="Total Amount" col="total" state={colFilters} className="ui-num" align="right" />
              {col('status') ? <ColumnHeader label="Status" col="status" state={colFilters} /> : null}
              {col('due') ? <ColumnHeader label="Due" col="due" state={colFilters} /> : null}
              {col('warehouse') ? <ColumnHeader label="Warehouse" col="warehouse" state={colFilters} /> : null}
              <th scope="col"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="ui-rows">
            {filteredInvoices.length === 0 ? (
              <tr>
                <td colSpan={3 + (gridEnabled ? 1 : 0) + GRID_COLUMNS.filter((c) => !c.always && col(c.key)).length}>
                  {invoices.length === 0 ? (
                    <EmptyState
                      icon={FileText}
                      kind="new"
                      title="No invoices yet"
                      description="An invoice is what turns a sale into money owed to you, and into the GST you have collected."
                      routes={[
                        {
                          label: 'Raise one now',
                          description: 'Pick a customer, add lines, save. Two minutes.',
                          onSelect: () => onNewInvoice?.(),
                        },
                        {
                          label: 'Import your history',
                          description: 'Bring across invoices from your existing books.',
                          onSelect: () => onNewInvoice?.(),
                        },
                      ]}
                    />
                  ) : (
                    <EmptyState
                      icon={FileText}
                      kind="filtered"
                      totalCount={invoices.length}
                      filters={activeFilterChips}
                      onClearFilters={clearAllInvoiceFilters}
                    />
                  )}
                </td>
              </tr>
            ) : (
              filteredInvoices.map((inv) => {
                const whId = String(inv?.warehouseId || '').trim();
                const wh = whId ? warehouseById.get(whId) : null;
                const whLabel = wh ? String(wh?.name || `Warehouse ${wh?.id}`) : whId ? `Warehouse ${whId}` : '-';
                const derived = getDerivedStatus(inv);

                return (
                  <tr
                    key={inv.id}
                    className="cursor-pointer"
                    onClick={(e) => {
                      const el = e.target;
                      if (el?.closest?.('[data-invoice-menu-button]')) return;
                      if (el?.closest?.('[data-invoice-menu]')) return;
                      openViewInvoice(inv);
                    }}
                  >
                    {gridEnabled ? (
                      <td className="w-8" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          className="ui-checkbox"
                          aria-label={`Select invoice ${inv.number}`}
                          checked={selectedIds.has(inv.id)}
                          onChange={() => toggleSelected(inv.id)}
                        />
                      </td>
                    ) : null}
                    <td className="ui-col-id">{inv.number}</td>
                    {col('date') ? <td className="ui-col-date">{inv.date || '-'}</td> : null}
                    {col('customer') ? <td className="ui-col-entity">{inv.customerName || '-'}</td> : null}
                    {col('amount') ? (
                      <td className="ui-col-amount">{formatMoney(Number(inv.subtotal || 0), currentCompany)}</td>
                    ) : null}
                    {col('gst') ? (
                      <td className="ui-col-amount">{formatMoney(Number(inv.gstTotal || 0), currentCompany)}</td>
                    ) : null}
                    <td className="ui-col-amount">{formatMoney(inv.total || 0, currentCompany)}</td>
                    {col('status') ? (
                    <td>
                      <StatusPill status={derived} reason={statusReason(inv, derived, currentCompany, nowMs)} />
                      {(() => {
                        const returnMark = returnStatusLabel(inv, db.creditNotes || [], 'originalInvoiceId');
                        return returnMark ? (
                          <span
                            className="ml-1 px-2 py-1 rounded-full text-[11px] font-medium bg-[rgb(var(--warn-soft))] text-[rgb(var(--warn-ink))]"
                            title={`${returnMark} against this invoice`}
                          >
                            {returnMark}
                          </span>
                        ) : null;
                      })()}
                    </td>
                    ) : null}
                    {/* The only date that earns colour: past due, still owed. */}
                    {col('due') ? (
                      <td className={`ui-col-date${isOverdue(inv) ? ' ui-col-date-late' : ''}`}>
                        {inv.dueDate || '-'}
                      </td>
                    ) : null}
                    {col('warehouse') ? <td className="ui-col-meta">{whLabel}</td> : null}
                    <td
                      className="relative w-10"
                      onMouseDown={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                        }}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (openMenu?.id === inv.id) {
                            setOpenMenu(null);
                          } else {
                            openInvoiceMenu(inv.id, e.currentTarget);
                          }
                        }}
                        className="ui-btn ui-btn-ghost !px-1.5"
                        aria-label="Invoice actions"
                        data-invoice-menu-button={inv.id}
                      >
                        <MoreVertical size={18} />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        </div>

        <TableTotals
          count={filteredInvoices.length}
          totalCount={invoices.length}
          noun="invoices"
          figures={invoiceTotals}
        />
      </div>

      {openMenu?.id ? (
        <div
          ref={menuRef}
          className="fixed w-56 ui-card overflow-hidden z-[9999] ui-in-pop"
          style={{ left: openMenu.left, top: openMenu.top, boxShadow: 'var(--shadow-pop)' }}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          data-invoice-menu
        >
          {(() => {
            const inv = invoices.find((i) => i.id === openMenu.id);
            if (!inv) return null;

            const derived = getDerivedStatus(inv);
            const recordDisabled = derived === 'Paid' || derived === 'Draft' || derived === 'Cancelled';
            const raiseCreditDisabled = derived === 'Draft' || derived === 'Cancelled';

            return (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setOpenMenu(null);
                    openEditInvoice(inv);
                  }}
                  className="w-full px-4 py-2 text-left text-sm ui-hover-sunken flex items-center gap-2"
                >
                  <span className="ui-muted">Edit</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setOpenMenu(null);
                    openPrintAndDownload(inv);
                  }}
                  className="w-full px-4 py-2 text-left text-sm ui-hover-sunken flex items-center gap-2"
                >
                  <Printer size={16} className="ui-muted" />
                  <span>Print & Download</span>
                </button>

                {/*
                  No Change Status here.

                  An invoice's status is what has happened to it — whether it
                  was finalised, what has been received against it, what has
                  been returned. Letting somebody set the word directly meant
                  the label could be made to disagree with the payments and the
                  credit notes underneath it, and the label is what people
                  read. Record the event instead; the status follows.
                */}

                {isEnabled('recurringInvoices')
                  ? (() => {
                      const existing = (db.recurringTemplates || []).find(
                        (t) => t.companyId === currentCompany.id && t.sourceInvoiceId === inv.id && t.active !== false
                      );
                      return (
                        <button
                          type="button"
                          className="w-full px-4 py-2 text-left text-sm ui-hover-sunken flex items-center gap-2"
                          onClick={() => {
                            setOpenMenu(null);
                            if (existing) {
                              setDb((prev) => ({
                                ...prev,
                                recurringTemplates: (prev.recurringTemplates || []).map((t) =>
                                  t.id === existing.id ? { ...t, active: false } : t
                                ),
                              }));
                              notify.success(`${inv.number} will no longer repeat.`);
                              return;
                            }
                            const base = String(inv.date || '').slice(0, 10) || new Date().toISOString().slice(0, 10);
                            const [y, m, d] = base.split('-').map(Number);
                            const nxt = new Date(Date.UTC(y, m, 1));
                            const last = new Date(Date.UTC(nxt.getUTCFullYear(), nxt.getUTCMonth() + 1, 0)).getUTCDate();
                            nxt.setUTCDate(Math.min(d, last));
                            setDb((prev) => ({
                              ...prev,
                              recurringTemplates: [
                                ...(prev.recurringTemplates || []),
                                {
                                  id: Date.now(),
                                  companyId: currentCompany.id,
                                  sourceInvoiceId: inv.id,
                                  sourceInvoiceNumber: inv.number,
                                  customerId: inv.customerId,
                                  customerName: inv.customerName,
                                  items: inv.items || [],
                                  subtotal: inv.subtotal,
                                  cgstTotal: inv.cgstTotal,
                                  sgstTotal: inv.sgstTotal,
                                  igstTotal: inv.igstTotal,
                                  gstTotal: inv.gstTotal,
                                  total: inv.total,
                                  frequency: 'monthly',
                                  nextRunDate: nxt.toISOString().slice(0, 10),
                                  active: true,
                                  createdAt: new Date().toISOString(),
                                },
                              ],
                            }));
                            notify.success(`${inv.number} will repeat monthly as a draft.`);
                          }}
                        >
                          <RefreshCw size={16} className="ui-muted" />
                          <span>{existing ? 'Stop repeating' : 'Repeat monthly'}</span>
                        </button>
                      );
                    })()
                  : null}

                {isEnabled('einvoice') ? (
                  <>
                    <button
                      type="button"
                      className="w-full px-4 py-2 text-left text-sm ui-hover-sunken flex items-center gap-2"
                      onClick={() => {
                        setOpenMenu(null);
                        const customer = (db.customers || []).find((c) => c.id === inv.customerId) || {};
                        openModal(
                          <EInvoiceWorkflow
                            invoice={inv}
                            company={currentCompany}
                            customer={customer}
                            onClose={() => openModal(null)}
                            onRegistered={(d) =>
                              setDb((prev) => ({
                                ...prev,
                                invoices: (prev.invoices || []).map((x) =>
                                  x.id === inv.id
                                    ? { ...x, irn: d.irn, irnStatus: d.status, irnAckNo: d.ackNo, irnAckDate: d.ackDate, irnSignedQr: d.signedQr }
                                    : x
                                ),
                              }))
                            }
                            onCancelled={(d) =>
                              setDb((prev) => ({
                                ...prev,
                                invoices: (prev.invoices || []).map((x) =>
                                  x.id === inv.id ? { ...x, irnStatus: 'CANCELLED', irnCancelReason: d.cancelReason } : x
                                ),
                              }))
                            }
                          />,
                          { title: `e-Invoice — ${inv.number}`, maxWidthClass: 'max-w-3xl' }
                        );
                      }}
                    >
                      <FileText size={16} className="ui-muted" />
                      <span>
                        {inv.irnStatus === 'CANCELLED'
                          ? 'e-Invoice (IRN cancelled)'
                          : inv.irn
                            ? `e-Invoice · IRN ${String(inv.irn).slice(0, 10)}…`
                            : 'e-Invoice (get IRN)'}
                      </span>
                    </button>
                    {inv.irn && !inv.ewbNo ? (
                      <button
                        type="button"
                        className="w-full px-4 py-2 text-left text-sm ui-hover-sunken flex items-center gap-2"
                        onClick={() => {
                          setOpenMenu(null);
                          openModal(
                            <EwbTransportForm
                              onCancel={() => openModal(null)}
                              onSubmit={async (t) => {
                                try {
                                  const result = await generateEwaybillApi(inv.backendInvoiceId, {
                                    distance: Number(t.distanceKm) || 0,
                                    transporterId: t.transporterId || null,
                                    transporterName: t.transporterName || null,
                                    transMode: t.mode || '1',
                                    vehicleNo: t.vehicleNo || null,
                                    transDocNo: t.transDocNo || null,
                                    transDocDate: t.transDocDate
                                      ? t.transDocDate.split('-').reverse().join('/')
                                      : null,
                                  });
                                  setDb((prev) => ({
                                    ...prev,
                                    invoices: (prev.invoices || []).map((x) =>
                                      x.id === inv.id
                                        ? { ...x, ewbNo: result.ewbNo, ewbDate: result.ewbDate, ewbValidTill: result.ewbValidTill, ewbTransport: t }
                                        : x
                                    ),
                                  }));
                                  openModal(null);
                                  notify.success(`e-Way Bill generated — EWB No: ${result.ewbNo}, valid until: ${result.ewbValidTill || '—'}`);
                                } catch (err) {
                                  notify.error(String(err?.message || 'e-Way Bill generation failed.'));
                                }
                              }}
                            />,
                            { title: `e-Way Bill — ${inv.number}`, maxWidthClass: 'max-w-2xl' }
                          );
                        }}
                      >
                        <FileText size={16} className="ui-muted" />
                        <span>Generate e-Way Bill (from IRN)</span>
                      </button>
                    ) : null}
                    {inv.ewbNo ? (
                      <div className="px-4 py-2 text-left text-xs ui-muted">
                        EWB No: {inv.ewbNo}
                        {inv.ewbValidTill ? ` · valid until ${inv.ewbValidTill}` : ''}
                      </div>
                    ) : null}
                    <button
                      type="button"
                      className="w-full px-4 py-2 text-left text-sm ui-hover-sunken flex items-center gap-2"
                      onClick={() => {
                        setOpenMenu(null);
                        if (!String(currentCompany?.gstin || '').trim()) {
                          notify.error('Set the company GSTIN in Company Profile before generating e-invoice JSON.');
                          return;
                        }
                        const customer = (db.customers || []).find((c) => c.id === inv.customerId) || {};
                        downloadJson(
                          `EINV_${inv.number}.json`,
                          buildEInvoicePayload({ invoice: inv, company: currentCompany, customer })
                        );
                        notify.success(`e-Invoice JSON for ${inv.number} downloaded — upload via the NIC bulk tool.`);
                      }}
                    >
                      <FileText size={16} className="ui-muted" />
                      <span>e-Invoice JSON</span>
                    </button>
                    <button
                      type="button"
                      className="w-full px-4 py-2 text-left text-sm ui-hover-sunken flex items-center gap-2"
                      onClick={() => {
                        setOpenMenu(null);
                        if (!String(currentCompany?.gstin || '').trim()) {
                          notify.error('Set the company GSTIN in Company Profile before generating e-way bill JSON.');
                          return;
                        }
                        const customer = (db.customers || []).find((c) => c.id === inv.customerId) || {};
                        openModal(
                          <EwbTransportForm
                            submitLabel="Download EWB JSON"
                            onCancel={() => openModal(null)}
                            onSubmit={(t) => {
                              downloadJson(
                                `EWB_${inv.number}.json`,
                                buildEwayBillPayload({ invoice: inv, company: currentCompany, customer, transport: t })
                              );
                              openModal(null);
                              notify.success(`e-Way Bill JSON for ${inv.number} downloaded — upload via the e-way bill bulk tool.`);
                            }}
                          />,
                          { title: `e-Way Bill JSON — ${inv.number}`, maxWidthClass: 'max-w-2xl' }
                        );
                      }}
                    >
                      <FileText size={16} className="ui-muted" />
                      <span>e-Way Bill JSON</span>
                    </button>
                  </>
                ) : null}

                <button
                  type="button"
                  onClick={() => {
                    setOpenMenu(null);
                    openRecordReceipt(inv);
                  }}
                  disabled={recordDisabled}
                  className={`w-full px-4 py-2 text-left text-sm flex items-center gap-2 ${ recordDisabled ? 'ui-subtle cursor-not-allowed ui-surface' : 'ui-hover-sunken'
                  }`}
                >
                  <CreditCard size={16} className={recordDisabled ? 'ui-subtle' : 'ui-muted'} />
                  <span>Record Receipt</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setOpenMenu(null);
                    if (!raiseCreditDisabled) raiseCreditNote(inv);
                  }}
                  disabled={raiseCreditDisabled}
                  className={`w-full px-4 py-2 text-left text-sm flex items-center gap-2 ${ raiseCreditDisabled ? 'ui-subtle cursor-not-allowed ui-surface' : 'ui-hover-sunken'
                  }`}
                >
                  <Plus size={16} className={raiseCreditDisabled ? 'ui-subtle' : 'ui-muted'} />
                  <span>Raise Credit Note</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setOpenMenu(null);
                    duplicateInvoice(inv);
                  }}
                  className="w-full px-4 py-2 text-left text-sm ui-hover-sunken flex items-center gap-2"
                >
                  <Copy size={16} className="ui-muted" />
                  <span>Duplicate</span>
                </button>

                <div className="border-t ui-border-c" />

                <button
                  type="button"
                  onClick={() => {
                    setOpenMenu(null);
                    cancelInvoice(inv);
                  }}
                  className="w-full px-4 py-2 text-left text-sm ui-hover-sunken flex items-center gap-2 text-[rgb(var(--neg))]"
                >
                  <Ban size={16} className="text-[rgb(var(--neg))]" />
                  <span>Cancel</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setOpenMenu(null);
                    deleteInvoice(inv);
                  }}
                  className="w-full px-4 py-2 text-left text-sm ui-hover-sunken flex items-center gap-2 text-[rgb(var(--neg))]"
                >
                  <Trash2 size={16} className="text-[rgb(var(--neg))]" />
                  <span>Delete</span>
                </button>
              </>
            );
          })()}
        </div>
      ) : null}
    </div>
  );
};

export const EstimatesList = ({
  db,
  setDb,
  openModal,
  currentCompany,
  onNewEstimate,
  onEditEstimate,
  onConvertToInvoice,
  warehouses = [],
  defaultWarehouseId = '',
}) => {
  const [openMenu, setOpenMenu] = useState(null);
  const menuRef = useRef(null);

  const warehouseById = useMemo(() => {
    const list = Array.isArray(warehouses) ? warehouses : [];
    return new Map(list.map((w) => [String(w?.id), w]));
  }, [warehouses]);

  const estFilters = useColumnFilters();
  const estPeriod = usePeriodFilter();
  const estSearch = useListSearch(
    db.estimates.filter((e) => e.companyId === currentCompany.id),
    ['number', 'customerName', 'refNo', 'date'],
    'estimates'
  );

  // What is hiding rows right now, in the user's words. Without this an empty
  // list says "none yet" to someone who has simply filtered them all away.
  const estFilterChips = useMemo(() => {
    const chips = [];
    if (String(estSearch.query || '').trim()) {
      chips.push({ label: 'Search', value: String(estSearch.query).trim(), onRemove: () => estSearch.setQuery('') });
    }
    for (const [key, f] of Object.entries(estFilters.filters || {})) {
      const shown = Array.isArray(f?.values) ? f.values.filter(Boolean).join(', ') : String(f?.value || '');
      chips.push({ label: key, value: shown || 'set', onRemove: () => estFilters.clearColumn(key) });
    }
    return chips;
  }, [estSearch, estFilters]);
  const estimates = estFilters.applyFilters(
    estSearch.filtered
      .filter((r) => estPeriod.inRange(r?.date))
      .slice()
      .sort((a, b) => {
        const da = String(a?.date || '');
        const dbb = String(b?.date || '');
        if (da !== dbb) return da < dbb ? 1 : -1;
        return Number(b?.id || 0) - Number(a?.id || 0);
      }),
    {
      number: (r) => r.number,
      customer: (r) => r.customerName,
      warehouse: (r) => warehouseById.get(String(r?.warehouseId || ''))?.name || r?.warehouseId || '',
      date: (r) => r.date,
      due: (r) => r.dueDate || r.expiryDate,
      total: (r) => r.total,
    }
  );

  const MENU_WIDTH = 224; // w-56
  const MENU_HEIGHT_ESTIMATE = 240;

  useEffect(() => {
    if (!openMenu?.id) return;

    const onMouseDown = (e) => {
      if (menuRef.current && menuRef.current.contains(e.target)) return;
      const btn = e.target?.closest?.('[data-estimate-menu-button]');
      if (btn && String(btn.getAttribute('data-estimate-menu-button')) === String(openMenu.id)) return;
      setOpenMenu(null);
    };

    const onScrollOrResize = () => setOpenMenu(null);

    document.addEventListener('mousedown', onMouseDown);
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);

    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [openMenu?.id]);

  const openNewEstimate = () => {
    if (typeof onNewEstimate === 'function') {
      onNewEstimate();
      return;
    }
    openModal(
      <EstimateForm db={db} setDb={setDb} currentCompany={currentCompany} onClose={() => openModal(null)} />,
      { title: 'New Estimate', maxWidthClass: 'max-w-5xl' }
    );
  };

  const openEditEstimate = (estimate) => {
    if (typeof onEditEstimate === 'function') {
      onEditEstimate(estimate);
      return;
    }
    openModal(
      <EstimateForm
        db={db}
        setDb={setDb}
        currentCompany={currentCompany}
        initialData={estimate}
        onClose={() => openModal(null)}
      />,
      { title: 'Edit Estimate', maxWidthClass: 'max-w-5xl' }
    );
  };

  const duplicateEstimate = (estimate) => {
    const copyEstimate = {
      ...estimate,
      id: undefined,
      number: '',
      date: undefined,
      dueDate: undefined,
      status: 'Draft',
      createdAt: undefined,
      updatedAt: undefined,
      convertedInvoiceId: null,
      convertedAt: undefined,
    };

    if (Array.isArray(copyEstimate.items)) {
      copyEstimate.items = copyEstimate.items.map((l) => ({
        itemId: l?.itemId !== undefined && l?.itemId !== null && l?.itemId !== '' ? String(l.itemId) : '',
        description: l?.description ?? '',
        quantity: Number(l?.quantity ?? 1),
        rate: Number(l?.rate ?? 0),
        gstRate: Number(l?.gstRate ?? 0),
        hsnSac: l?.hsnSac || '',
        amount: Number(l?.amount ?? 0),
      }));
    }

    openEditEstimate(copyEstimate);
  };

  const convertToInvoice = (estimate) => {
    if (typeof onConvertToInvoice === 'function') {
      onConvertToInvoice(estimate);
      return;
    }

    const initialInvoice = {
      status: 'Draft',
      date: estimate?.date || undefined,
      dueDate: estimate?.dueDate || undefined,
      customerId: estimate?.customerId || '',
      refNo: estimate?.number || '',
      refDate: estimate?.date || '',
      sourceEstimateId: estimate?.id ?? null,
      items: Array.isArray(estimate?.items)
        ? estimate.items.map((l) => ({
            itemId: l?.itemId !== undefined && l?.itemId !== null && l?.itemId !== '' ? String(l.itemId) : '',
            description: l?.description ?? '',
            quantity: Number(l?.quantity ?? 1),
            rate: Number(l?.rate ?? 0),
            gstRate: Number(l?.gstRate ?? 0),
            hsnSac: l?.hsnSac || '',
            amount: Number(l?.amount ?? 0),
          }))
        : undefined,
    };

    openModal(
      <InvoiceForm
        db={db}
        setDb={setDb}
        currentCompany={currentCompany}
        initialData={initialInvoice}
        warehouses={warehouses}
        defaultWarehouseId={defaultWarehouseId}
        onClose={() => openModal(null)}
      />,
      { title: `New Invoice from ${estimate?.number || 'Estimate'}`.trim(), maxWidthClass: 'max-w-5xl' }
    );
  };

  const deleteEstimate = async (estimate) => {
    const ok = await confirmDialog({ title: 'Please confirm', message: `Delete estimate ${estimate?.number || ''}? This cannot be undone.`.trim(), confirmLabel: 'Yes, continue' });
    if (!ok) return;
    setDb((prev) => ({
      ...prev,
      estimates: (prev.estimates || []).filter((e) => e.id !== estimate.id),
    }));
  };

  const openEstimateMenu = (estimateId, anchorEl) => {
    if (!anchorEl) {
      setOpenMenu({ id: estimateId, left: 0, top: 0 });
      return;
    }

    const rect = anchorEl.getBoundingClientRect();
    const padding = 12;
    const vw = window.innerWidth || 1024;
    const vh = window.innerHeight || 768;

    let left = rect.right - MENU_WIDTH;
    left = Math.max(padding, Math.min(left, vw - MENU_WIDTH - padding));

    let top = rect.bottom + 8;
    if (top + MENU_HEIGHT_ESTIMATE > vh - padding) {
      top = rect.top - MENU_HEIGHT_ESTIMATE - 8;
    }
    top = Math.max(padding, Math.min(top, vh - padding - 40));

    setOpenMenu({ id: estimateId, left, top });
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="ui-title text-lg">Estimates</h3>
        <button
          type="button"
          onClick={openNewEstimate}
          className="ui-btn ui-btn-primary "
        >
          <Plus size={20} /> New Estimate
        </button>
      </div>

      <ListToolbar
        search={estSearch.query}
        onSearch={estSearch.setQuery}
        placeholder="Search estimates (number, customer, ref)"
        count={estimates.length}
        countLabel="estimates"
        onExport={() =>
          exportRows({
            fileName: `Estimates_${currentCompany?.name || 'company'}`,
            label: 'estimate(s)',
            columns: [
              { key: 'number', label: 'Estimate #' },
              { key: 'customerName', label: 'Customer' },
              { key: 'date', label: 'Date' },
              { key: 'dueDate', label: 'Due' },
              { key: 'subtotal', label: 'Taxable', value: (r) => Number(r.subtotal || 0) },
              { key: 'gstTotal', label: 'GST', value: (r) => Number(r.gstTotal || 0) },
              { key: 'total', label: 'Total', value: (r) => Number(r.total || 0) },
              { key: 'status', label: 'Status' },
            ],
            rows: estimates,
          })
        }
      />

      <div className="ui-surface rounded-xl shadow-sm overflow-hidden border">
        <table className="ui-table w-full ui-table-sticky">
          <thead className="ui-sunken border-b">
            <tr>
              <ColumnHeader label="Estimate #" col="number" state={estFilters} className="ui-th" />
              <ColumnHeader label="Customer" col="customer" state={estFilters} className="ui-th" />
              <ColumnHeader label="Warehouse" col="warehouse" state={estFilters} className="ui-th" />
              <ColumnHeader label="Date" col="date" state={estFilters} className="ui-th" />
              <ColumnHeader label="Due" col="due" state={estFilters} className="ui-th" />
              <ColumnHeader label="Total" col="total" state={estFilters} className="ui-th" />
              <ColumnHeader label="Status" col="status" state={estFilters} className="ui-th" />
              <th className="ui-th">Actions</th>
            </tr>
            <tr className="hidden">
            </tr>
          </thead>
          <tbody className="divide-y">
            {estimates.length === 0 ? (
              <tr>
                <td colSpan="8" className="px-0 py-0">
                  {estFilterChips.length === 0 ? (
                    <EmptyState
                      icon={ClipboardList}
                      title="No estimates yet"
                      description="An estimate is a quote you can turn into an invoice once the customer agrees."
                      action={
                        <button type="button" onClick={openNewEstimate} className="ui-btn ui-btn-primary">
                          <Plus size={16} /> New Estimate
                        </button>
                      }
                    />
                  ) : (
                    <EmptyState
                      icon={ClipboardList}
                      kind="filtered"
                      totalCount={(db.estimates || []).filter((e) => e.companyId === currentCompany.id).length}
                      filters={estFilterChips}
                      onClearFilters={() => {
                        estSearch.setQuery('');
                        estFilters.clearAll();
                      }}
                    />
                  )}
                </td>
              </tr>
            ) : (
              estimates.map((est) => {
                const whId = String(est?.warehouseId || '').trim();
                const wh = whId ? warehouseById.get(whId) : null;
                const whLabel = wh ? String(wh?.name || `Warehouse ${wh?.id}`) : whId ? `Warehouse ${whId}` : '-';
                return (
                <tr
                  key={est.id}
                  className="ui-hover-sunken cursor-pointer"
                  onClick={(e) => {
                    const el = e.target;
                    if (el?.closest?.('[data-estimate-menu-button]')) return;
                    if (el?.closest?.('[data-estimate-menu]')) return;
                    openEditEstimate(est);
                  }}
          
        period={estPeriod.period}
        onPeriodChange={estPeriod.setPeriod}
        dateFrom={estPeriod.dateFrom}
        dateTo={estPeriod.dateTo}
        onDateFromChange={estPeriod.setDateFrom}
        onDateToChange={estPeriod.setDateTo}
        exportTitle="Estimates — {currentCompany?.name || 'Company'}"
        exportFileName={`Estimates_${currentCompany?.name || 'company'}`}
        exportSheetName="Estimates"
        exportColumns={[
              { key: 'number', label: 'Estimate #' },
              { key: 'customerName', label: 'Customer' },
              { key: 'date', label: 'Date' },
              { key: 'dueDate', label: 'Due' },
              { key: 'subtotal', label: 'Taxable', value: (r) => Number(r.subtotal || 0) },
              { key: 'gstTotal', label: 'GST', value: (r) => Number(r.gstTotal || 0) },
              { key: 'total', label: 'Total', value: (r) => Number(r.total || 0) },
              { key: 'status', label: 'Status' },
        ]}
        exportRows={estimates}
      >
                  <td className="ui-col-id px-4 py-2.5 font-medium">{est.number}</td>
                  <td className="ui-col-entity px-4 py-2.5">{est.customerName || '-'}</td>
                  <td className="ui-col-meta px-4 py-2.5">{whLabel}</td>
                  <td className="ui-col-date px-4 py-2.5">{est.date || '-'}</td>
                  <td className="ui-col-date px-4 py-2.5">{est.dueDate || '-'}</td>
                  <td className="ui-col-amount px-4 py-2.5 font-semibold">{formatMoney(est.total || 0, currentCompany)}</td>
                  {/*
                    An estimate that has already become an invoice looked
                    exactly like one still waiting on the customer. The only
                    place that fact appeared was a greyed-out menu item you had
                    to open the row menu to find, so a list of quotes could not
                    be read at a glance — which is the whole job of a list.
                  */}
                  <td className="px-4 py-2.5">
                    <StatusPill status={est.status || 'Draft'} />
                  </td>
                  <td
                    className="px-4 py-2.5 relative"
                    onMouseDown={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.stopPropagation();
                      }}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (openMenu?.id === est.id) {
                          setOpenMenu(null);
                        } else {
                          openEstimateMenu(est.id, e.currentTarget);
                        }
                      }}
                      className="ui-btn ui-btn-ghost !px-1.5"
                      aria-label="Estimate actions"
                      data-estimate-menu-button={est.id}
                    >
                      <MoreVertical size={18} />
                    </button>
                  </td>
                </tr>
                );
              })
            )}
          </tbody>
        </table>
        <TableTotals
          count={estimates.length}
          totalCount={(db.estimates || []).filter((e) => e.companyId === currentCompany.id).length}
          noun="estimates"
          figures={[{ label: 'Value', value: formatMoney(estimates.reduce((t, e) => t + Number(e.total || 0), 0), currentCompany) }]}
        />
      </div>

      {openMenu?.id ? (
        <div
          ref={menuRef}
          className="fixed w-56 ui-card overflow-hidden z-[9999] ui-in-pop"
          style={{ left: openMenu.left, top: openMenu.top, boxShadow: 'var(--shadow-pop)' }}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          data-estimate-menu
        >
          {(() => {
            const est = estimates.find((e) => e.id === openMenu.id);
            if (!est) return null;

            const isConverted =
              String(est?.status || '').trim().toLowerCase() === 'converted' ||
              (est?.convertedInvoiceId !== undefined && est?.convertedInvoiceId !== null && est?.convertedInvoiceId !== '');

            return (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setOpenMenu(null);
                    openEditEstimate(est);
                  }}
                  className="w-full px-4 py-2 text-left text-sm ui-hover-sunken flex items-center gap-2"
                >
                  <span className="ui-muted">Edit</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setOpenMenu(null);
                    duplicateEstimate(est);
                  }}
                  className="w-full px-4 py-2 text-left text-sm ui-hover-sunken flex items-center gap-2"
                >
                  <Copy size={16} className="ui-muted" />
                  <span>Duplicate</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setOpenMenu(null);
                    if (!isConverted) convertToInvoice(est);
                  }}
                  disabled={isConverted}
                  // A disabled control that will not say why is a dead end.
                  // This one is correct to disable — converting twice would
                  // invoice the same quote again — but it was silent about it.
                  title={isConverted ? 'Already converted to an invoice. Duplicate it if you need to quote this again.' : undefined}
                  className={`w-full px-4 py-2 text-left text-sm flex items-center gap-2 ${ isConverted ? 'ui-subtle cursor-not-allowed ui-surface' : 'ui-hover-sunken'
                  }`}
                >
                  <FileText size={16} className={isConverted ? 'ui-subtle' : 'ui-muted'} />
                  <span>{isConverted ? 'Converted to invoice' : 'Convert to Invoice'}</span>
                </button>

                <div className="border-t ui-border-c" />

                <button
                  type="button"
                  onClick={() => {
                    setOpenMenu(null);
                    deleteEstimate(est);
                  }}
                  className="w-full px-4 py-2 text-left text-sm ui-hover-sunken flex items-center gap-2 text-[rgb(var(--neg))]"
                >
                  <Trash2 size={16} className="text-[rgb(var(--neg))]" />
                  <span>Delete</span>
                </button>
              </>
            );
          })()}
        </div>
      ) : null}
    </div>
  );
};

export const CreditNotesList = ({
  db,
  setDb,
  openModal,
  currentCompany,
  onNewCreditNote,
  warehouses = [],
  defaultWarehouseId = '',
}) => {
  const warehouseById = useMemo(() => {
    const list = Array.isArray(warehouses) ? warehouses : [];
    return new Map(list.map((w) => [String(w?.id), w]));
  }, [warehouses]);

  /** Settle an on-account credit note against the customer's open invoices. */
  const openKnockOff = (note) => {
    if (typeof openModal !== 'function') return;
    openModal(
      <KnockOffForm
        note={note}
        documents={db.invoices || []}
        notes={db.creditNotes || []}
        currentCompany={currentCompany}
        partyKey="customerId"
        docLabel="invoice"
        onCancel={() => openModal(null)}
        onConfirm={async (allocations) => {
          const today = new Date().toISOString().slice(0, 10);
          const stamped = allocations.map((a) => ({ ...a, date: today }));
          const next = [...(note.allocations || []), ...stamped];

          if (note.backendDocId && hasDocsApiSession()) {
            try {
              await saveSettlementApi('creditNote', note.backendDocId, {
                settlementMode: 'ON_ACCOUNT',
                invoiceIds: (note.invoiceIds || []).map(String),
                allocations: next,
              });
            } catch (err) {
              notify.error(String(err?.message || 'Settlement not saved to the server.'));
              return;
            }
          }

          setDb((prev) => ({
            ...prev,
            creditNotes: (prev.creditNotes || []).map((x) =>
              String(x.id) === String(note.id) ? { ...x, allocations: next } : x
            ),
          }));
          openModal(null);
          const total = allocations.reduce((t, a) => t + Number(a.amount || 0), 0);
          notify.success(`${formatMoney(total, currentCompany)} knocked off against ${allocations.length} invoice(s).`);
        }}
      />,
      { title: `Knock off ${note?.number || ''}`.trim(), maxWidthClass: 'max-w-3xl' }
    );
  };

  const cnFilters = useColumnFilters();
  const cnPeriod = usePeriodFilter();
  const cnSearch = useListSearch(
    db.creditNotes.filter((c) => c.companyId === currentCompany.id),
    ['number', 'customerName', 'originalInvoiceNumber', 'date'],
    'creditNotes'
  );

  // What is hiding rows right now, in the user's words. Without this an empty
  // list says "none yet" to someone who has simply filtered them all away.
  const cnFilterChips = useMemo(() => {
    const chips = [];
    if (String(cnSearch.query || '').trim()) {
      chips.push({ label: 'Search', value: String(cnSearch.query).trim(), onRemove: () => cnSearch.setQuery('') });
    }
    for (const [key, f] of Object.entries(cnFilters.filters || {})) {
      const shown = Array.isArray(f?.values) ? f.values.filter(Boolean).join(', ') : String(f?.value || '');
      chips.push({ label: key, value: shown || 'set', onRemove: () => cnFilters.clearColumn(key) });
    }
    return chips;
  }, [cnSearch, cnFilters]);
  const creditNotes = cnFilters.applyFilters(
    cnSearch.filtered
      .filter((r) => cnPeriod.inRange(r?.date))
      .slice()
      .sort((a, b) => {
        const da = String(a?.date || '');
        const dbb = String(b?.date || '');
        if (da !== dbb) return da < dbb ? 1 : -1;
        return Number(b?.id || 0) - Number(a?.id || 0);
      }),
    {
      number: (r) => r.number,
      original: (r) => r.originalInvoiceNumber,
      customer: (r) => r.customerName,
      warehouse: (r) => warehouseById.get(String(r?.warehouseId || ''))?.name || r?.warehouseId || '',
      date: (r) => r.date,
      total: (r) => r.total,
    }
  );

  const openNewCreditNote = () => {
    if (typeof onNewCreditNote === 'function') {
      onNewCreditNote();
      return;
    }
    openModal(
      <CreditNoteForm
        db={db}
        setDb={setDb}
        currentCompany={currentCompany}
        warehouses={warehouses}
        defaultWarehouseId={defaultWarehouseId}
        onClose={() => openModal(null)}
      />,
      { title: 'New Credit Note', maxWidthClass: 'max-w-5xl' }
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="ui-title text-lg">Credit Notes</h3>
        <button
          type="button"
          onClick={openNewCreditNote}
          className="ui-btn ui-btn-primary "
        >
          <Plus size={20} /> New Credit Note
        </button>
      </div>

      <ListToolbar
        search={cnSearch.query}
        onSearch={cnSearch.setQuery}
        placeholder="Search credit notes (number, customer, invoice)"
        count={creditNotes.length}
        countLabel="credit notes"
        onExport={() =>
          exportRows({
            fileName: `CreditNotes_${currentCompany?.name || 'company'}`,
            label: 'credit note(s)',
            columns: [
              { key: 'number', label: 'Credit #' },
              { key: 'originalInvoiceNumber', label: 'Original Invoice' },
              { key: 'customerName', label: 'Customer' },
              { key: 'date', label: 'Date' },
              { key: 'total', label: 'Total', value: (r) => Number(r.total || 0) },
            ],
            rows: creditNotes,
          })
        }
      />

      <div className="ui-surface rounded-xl shadow-sm overflow-hidden border">
        <table className="ui-table w-full ui-table-sticky">
          <thead className="ui-sunken border-b">
            <tr>
              <ColumnHeader label="Credit #" col="number" state={cnFilters} className="ui-th" />
              <ColumnHeader label="Original Invoice" col="original" state={cnFilters} className="ui-th" />
              <ColumnHeader label="Customer" col="customer" state={cnFilters} className="ui-th" />
              <ColumnHeader label="Warehouse" col="warehouse" state={cnFilters} className="ui-th" />
              <ColumnHeader label="Date" col="date" state={cnFilters} className="ui-th" />
              <ColumnHeader label="Total" col="total" state={cnFilters} className="ui-th" />
              <ColumnHeader label="Status" col="status" state={cnFilters} className="ui-th" />
              <th className="ui-th ui-num">On account</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {creditNotes.length === 0 ? (
              <tr>
                <td colSpan="8" className="px-0 py-0">
                  {cnFilterChips.length === 0 ? (
                    <EmptyState
                      icon={Receipt}
                      title="No sales returns yet"
                      description="A credit note reverses part or all of an invoice when goods come back."
                    />
                  ) : (
                    <EmptyState
                      icon={Receipt}
                      kind="filtered"
                      totalCount={(db.creditNotes || []).filter((c) => c.companyId === currentCompany.id).length}
                      filters={cnFilterChips}
                      onClearFilters={() => {
                        cnSearch.setQuery('');
                        cnFilters.clearAll();
                      }}
                    />
                  )}
                </td>
              </tr>
            ) : (
              creditNotes.map((cn) => {
                const whId = String(cn?.warehouseId || '').trim();
                const wh = whId ? warehouseById.get(whId) : null;
                const whLabel = wh ? String(wh?.name || `Warehouse ${wh?.id}`) : whId ? `Warehouse ${whId}` : '-';
                return (
                  <tr key={cn.id} className="ui-hover-sunken">
                    <td className="ui-col-id px-4 py-2.5 font-medium">{cn.number}</td>
                    <td className="ui-col-meta px-4 py-2.5">
                      {cn.originalInvoiceNumber || (
                        <span className="ui-muted">
                          {(cn.invoiceIds || []).length ? `${(cn.invoiceIds || []).length} invoices · on account` : '-'}
                        </span>
                      )}
                    </td>
                    <td className="ui-col-entity px-4 py-2.5">{cn.customerName || '-'}</td>
                    <td className="ui-col-meta px-4 py-2.5">{whLabel}</td>
                    <td className="ui-col-date px-4 py-2.5">{cn.date || '-'}</td>
                    <td className="ui-col-amount px-4 py-2.5 font-semibold">{formatMoney(cn.total || 0, currentCompany)}</td>
                    {/*
                      Whether this credit has actually reached the books. A
                      draft does not post, and without this column there was
                      nothing on screen to say so.
                    */}
                    <td className="px-4 py-2.5">
                      <StatusPill status={cn.status || 'Open'} />
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {isOnAccount(cn) ? (
                        noteBalance(cn).unsettled > 0.0001 ? (
                          <button
                            type="button"
                            onClick={() => openKnockOff(cn)}
                            className="ui-btn ui-btn-secondary ui-btn-sm text-xs"
                            title="Knock this off against the customer's open invoices"
                    
        period={cnPeriod.period}
        onPeriodChange={cnPeriod.setPeriod}
        dateFrom={cnPeriod.dateFrom}
        dateTo={cnPeriod.dateTo}
        onDateFromChange={cnPeriod.setDateFrom}
        onDateToChange={cnPeriod.setDateTo}
        exportTitle="Credit Notes — {currentCompany?.name || 'Company'}"
        exportFileName={`CreditNotes_${currentCompany?.name || 'company'}`}
        exportSheetName="Credit Notes"
        exportColumns={[
              { key: 'number', label: 'Credit #' },
              { key: 'originalInvoiceNumber', label: 'Original Invoice' },
              { key: 'customerName', label: 'Customer' },
              { key: 'date', label: 'Date' },
              { key: 'total', label: 'Total', value: (r) => Number(r.total || 0) },
        ]}
        exportRows={creditNotes}
      >
                            Knock off {formatMoney(noteBalance(cn).unsettled, currentCompany)}
                          </button>
                        ) : (
                          <span className="ui-caption">Settled</span>
                        )
                      ) : null}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        <TableTotals
          count={creditNotes.length}
          totalCount={(db.creditNotes || []).filter((c) => c.companyId === currentCompany.id).length}
          noun="credit notes"
          figures={[
            { label: 'Value', value: formatMoney(creditNotes.reduce((t, c) => t + Number(c.total || 0), 0), currentCompany) },
          ]}
        />
      </div>
    </div>
  );
};

export const InvoiceForm = ({ db, setDb, currentCompany, initialData = null, onClose, warehouses = [], defaultWarehouseId = '', onOpenInvoiceSettings = null, onDuplicateInvoice = null }) => {
  const isEdit = Boolean(initialData && (initialData.id !== undefined && initialData.id !== null));

  /**
   * Which fields this company's invoice carries — see utils/invoicePrefs.
   *
   * A preference that is off removes the field rather than disabling it. The
   * one exception, applied at the two money fields below, is a value this
   * invoice already carries: hiding a discount that still moves the total
   * would be worse than showing a field the company switched off.
   */
  const invoicePrefs = useMemo(() => getInvoicePrefs(currentCompany), [currentCompany]);
  const prefOn = (key) => isInvoicePrefOn(invoicePrefs, key);
  const customFields = useMemo(() => getVisibleCustomFields(currentCompany), [currentCompany]);

  const [previewOpen, setPreviewOpen] = useState(false);

  /**
   * Save & New keeps the form open with a fresh invoice instead of closing it.
   *
   * A ref rather than state: the submit handler that reads it runs in the same
   * tick as the click that set it, and a state update would not have landed
   * yet. Reset after every save so an ordinary Save the next time does not
   * inherit it.
   */
  const saveAndNewRef = useRef(false);
  const markSaveAndNew = () => {
    saveAndNewRef.current = true;
  };

  /*
   * Named rather than inline: a ref read inside a prop passed to a component
   * looks like a render-phase read to the hooks lint, because it cannot tell
   * an event handler from any other callback prop.
   */
  const submitAsDraftNow = () => {
    setSubmitAsDraft(true);
    formRef.current?.requestSubmit();
  };

  /**
   * The saved invoice this form is editing, at component scope.
   *
   * The submit handler has its own local `existingInvoice`; the menu needs the
   * same record outside that function to know whether Duplicate and Cancel
   * apply at all.
   */
  const existingInvoiceRecord = isEdit
    ? (db.invoices || []).find((i) => i.id === Number(initialData.id)) || null
    : null;

  /**
   * Three of the four entries in this menu configure every invoice, not this
   * one, so they leave the form rather than opening something inside it. The
   * parent decides how — the form has no business knowing about navigation.
   */
  /**
   * Cancelling is not deleting.
   *
   * A GST invoice number cannot be reused, so cancelling keeps the number and
   * the row and marks it cancelled; deleting would leave a hole in the series
   * that an officer will ask about. Anything already settled against it has to
   * come off first — a cancelled invoice with a receipt attached leaves money
   * allocated to a document that no longer exists.
   */
  const cancelInvoice = async () => {
    const settled = Number(existingInvoiceRecord?.paidAmount ?? 0);
    if (settled > 0) {
      notify.error(
        `${formatMoney(settled, currentCompany)} is already received against this invoice. Unlink the receipt before cancelling it.`
      );
      return;
    }
    const ok = await confirmDialog({
      title: `Cancel invoice ${existingInvoiceRecord?.number || ''}?`.trim(),
      message:
        'The invoice keeps its number and stays in the list, marked cancelled, and its ledger entries are reversed. ' +
        'That is deliberate: a GST number cannot be reused, so the series must not gain a hole.',
      confirmLabel: 'Cancel invoice',
    });
    if (!ok) return;
    setDb((prev) => ({
      ...prev,
      invoices: (prev.invoices || []).map((inv) =>
        inv.id === existingInvoiceRecord.id ? { ...inv, status: 'Cancelled', cancelledAt: todayIso() } : inv
      ),
    }));
    notify.success(`Invoice ${existingInvoiceRecord?.number || ''} cancelled. The number stays used.`.trim());
    onClose?.();
  };

  const [prefsOpen, setPrefsOpen] = useState(false);

  /**
   * Preferences opens inside the form rather than navigating to Settings.
   *
   * Navigating meant closing the form, which threw away whatever had been
   * typed — and there was no way back. Somebody switching a field on is in the
   * middle of raising an invoice; that invoice has to survive the detour.
   */
  const openPreferences = (focusCustomFields = false) => {
    setPreviewOpen(false);
    setPrefsOpen(true);
    if (focusCustomFields) {
      // After the panel paints, not before.
      window.requestAnimationFrame(() => {
        document.getElementById('invoice-custom-fields')?.scrollIntoView({ block: 'nearest' });
      });
    }
  };

  /**
   * The template picker is a screen of its own, so this one does leave — but
   * only after saying so, and never silently on a form with typing in it.
   */
  const goToSettings = async (screen) => {
    if (typeof onOpenInvoiceSettings !== 'function') {
      notify.error('Open Settings → Invoice Templates to change this.');
      return;
    }
    const typing =
      String(formData.customerId || '') ||
      (formData.items || []).some((l) => l.itemId || Number(l.quantity) > 1 || Number(l.rate) > 0);
    if (typing && !isEdit) {
      const ok = await confirmDialog({
        title: 'Leave this invoice?',
        message: 'The template picker is a separate screen. Anything typed here is not saved yet and will be lost.',
        confirmLabel: 'Leave and pick a template',
      });
      if (!ok) return;
    }
    onOpenInvoiceSettings(screen);
  };

  const setCustomField = (key, value) =>
    setFormData((p) => ({ ...p, customFields: { ...(p.customFields || {}), [key]: value } }));

  /** One company-defined field. `where` matches the placement it was given. */
  const renderCustomFields = (where) =>
    customFields
      .filter((f) => f.formPlacement === where)
      .map((f) => {
        const value = (formData.customFields || {})[f.key] ?? '';
        const id = `cf-${f.key}`;
        return (
          <div key={f.key}>
            <label htmlFor={id} className="block text-sm font-medium mb-1">
              {f.label}
              {f.required ? <span className="ml-1 text-[rgb(var(--neg-ink))]">*</span> : null}
            </label>
            {f.type === 'Yes/No' ? (
              <label className="inline-flex items-center gap-2 text-sm cursor-pointer h-[38px]">
                <input
                  id={id}
                  type="checkbox"
                  className="ui-checkbox"
                  checked={value === true || value === 'true'}
                  onChange={(e) => setCustomField(f.key, e.target.checked)}
                />
                {value === true || value === 'true' ? 'Yes' : 'No'}
              </label>
            ) : f.type === 'List' && f.options.length ? (
              <select
                id={id}
                value={value}
                onChange={(e) => setCustomField(f.key, e.target.value)}
                className="ui-select w-full px-3 py-2"
              >
                <option value="">— none —</option>
                {f.options.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id={id}
                type={f.type === 'Number' ? 'number' : f.type === 'Date' ? 'date' : 'text'}
                value={value}
                required={f.required}
                onChange={(e) => setCustomField(f.key, e.target.value)}
                className="ui-input"
              />
            )}
          </div>
        );
      });

  /**
   * Whether this invoice is still a draft — a new one, or one saved as a draft
   * and reopened. Only a draft can be saved as a draft or finalised; anything
   * already on the customer's account is simply updated.
   */
  const isDraftInvoice = !isEdit || String(initialData?.status || '').trim() === 'Draft';
  const formRef = useRef(null);
  const [submitAsDraft, setSubmitAsDraft] = useState(false);
  const { isEnabled } = useFeatures();

  const activeBranchId = String(localStorage.getItem('activeBranchId') || localStorage.getItem('branchId') || '').trim();
  const resolveBranchIdFromWarehouseId = (warehouseId) => {
    const wid = String(warehouseId || '').trim();
    if (!wid) return activeBranchId || '';
    const w = (Array.isArray(warehouses) ? warehouses : []).find((x) => String(x?.id || '').trim() === wid) || null;
    return String(w?.branchId || '').trim() || activeBranchId || '';
  };

  const initWarehouseId = String(initialData?.warehouseId || defaultWarehouseId || '').trim();
  const initBranchId = resolveBranchIdFromWarehouseId(initWarehouseId) || '';
  const invoiceDocSettingsInit = getDocSettings(db, currentCompany, { branchId: initBranchId || null });
  const invoiceNumberingInit = invoiceDocSettingsInit?.numbering?.invoice;
  const isInvoiceAutoInit = String(invoiceNumberingInit?.mode || '').toLowerCase() === 'auto';

  const [formData, setFormData] = useState(() => {
    const defaultDate = todayIso();
    const defaultDueDate = plusDaysIso(30);

    const normalizedItems = Array.isArray(initialData?.items)
      ? initialData.items.map((it) => {
          const quantity = Number(it.quantity ?? 1);
          const rate = Number(it.rate ?? 0);
          const gstRate = Number(it.gstRate ?? 0);
          const amount = Number(it.amount ?? quantity * rate);
          return {
            itemId: it.itemId !== undefined && it.itemId !== null && it.itemId !== '' ? String(it.itemId) : '',
            description: it.description ?? '',
            quantity: Number.isFinite(quantity) ? quantity : 1,
            rate: Number.isFinite(rate) ? rate : 0,
            gstRate: Number.isFinite(gstRate) ? gstRate : 0,
            hsnSac: it.hsnSac || '',
            discountPct: Number(it.discountPct) || 0,
            amount: Number.isFinite(amount) ? amount : 0,
          };
        })
      : null;

    const rawStatus = String(initialData?.status || '').trim();
    const isDraft = rawStatus === 'Draft';

    const initialNumber = initialData?.number
      ? String(initialData.number)
      : isInvoiceAutoInit
        ? String(nextFreeVoucherNumber({db, company: currentCompany, voucherKey: 'invoice', branchId: initBranchId || null, takenNumbers: (db.invoices || []).filter((x) => x.companyId === currentCompany.id).map((x) => String(x.number || '').trim()) }) || '')
        : '';

    return {
      number: initialNumber,
      date: initialData?.date || defaultDate,
      dueDate: initialData?.dueDate || defaultDueDate,
      status: isDraft ? 'Draft' : 'Unpaid',
      refNo: initialData?.refNo || '',
      refDate: initialData?.refDate || '',
      customerId: initialData?.customerId || '',
      warehouseId: String(initialData?.warehouseId || defaultWarehouseId || '').trim(),
      items:
        normalizedItems && normalizedItems.length
          ? normalizedItems
          : [{ itemId: '', description: '', quantity: 1, rate: 0, gstRate: 0, hsnSac: '', amount: 0 }],
      sourceEstimateId: initialData?.sourceEstimateId ?? null,
      sourceChallanId: initialData?.sourceChallanId ?? null,
      sourceSalesOrderId: initialData?.sourceSalesOrderId ?? null,
      invoiceDiscountType: initialData?.invoiceDiscountType || 'pct',
      invoiceDiscountValue: Number(initialData?.invoiceDiscountValue) || '',
      otherCharges: Array.isArray(initialData?.otherCharges) ? initialData.otherCharges : [],
      salesmanId: initialData?.salesmanId ?? '',
      costCenterId: initialData?.costCenterId ?? '',
      reverseCharge: !!initialData?.reverseCharge,
      shipToCode: initialData?.shipToCode || '',
      shipToAddress: initialData?.shipToAddress || null,
      // Values for the fields this company invented. Keyed, not positional, so
      // reordering or renaming a field in settings never rewrites what an
      // existing invoice already says.
      customFields:
        initialData?.customFields && typeof initialData.customFields === 'object' ? { ...initialData.customFields } : {},
      // Fields the preferences can switch on. Each is inert until its
      // preference is on: nothing here changes a total, so an invoice that
      // carries a value for a field the company later switches off simply
      // stops printing it rather than changing what is owed.
      lutNumber: initialData?.lutNumber || '',
      iecNumber: initialData?.iecNumber || '',
      shippingBillNo: initialData?.shippingBillNo || '',
      shippingBillDate: initialData?.shippingBillDate || '',
      portCode: initialData?.portCode || '',
      invoiceCurrency: initialData?.invoiceCurrency || '',
      exchangeRate: initialData?.exchangeRate || '',
      transporterName: initialData?.transporterName || '',
      vehicleNo: initialData?.vehicleNo || '',
      lrNumber: initialData?.lrNumber || '',
      lrDate: initialData?.lrDate || '',
      packageDetails: initialData?.packageDetails || '',
      servicePeriodFrom: initialData?.servicePeriodFrom || '',
      servicePeriodTo: initialData?.servicePeriodTo || '',
      projectName: initialData?.projectName || '',
      workOrderNo: initialData?.workOrderNo || '',
      raBillNo: initialData?.raBillNo || '',
      timesheetRef: initialData?.timesheetRef || '',
      paymentTermDays: initialData?.paymentTermDays ?? '',
      notesText: initialData?.notesText || '',
    };
  });

  const branchIdForNumbering = resolveBranchIdFromWarehouseId(formData.warehouseId) || null;
  const invoiceDocSettings = getDocSettings(db, currentCompany, { branchId: branchIdForNumbering });
  const invoiceNumbering = invoiceDocSettings?.numbering?.invoice;
  const isInvoiceAuto = String(invoiceNumbering?.mode || '').toLowerCase() === 'auto';
  const lockInvoiceNumberOnCreate = !isEdit && isInvoiceAuto && !invoiceNumbering?.allowManualOverride;
  const generatedInvoiceNumber = !isEdit ? nextFreeVoucherNumber({db, company: currentCompany, voucherKey: 'invoice', branchId: branchIdForNumbering, takenNumbers: (db.invoices || []).filter((x) => x.companyId === currentCompany.id).map((x) => String(x.number || '').trim()) }) : '';

  const warehouseOptions = useMemo(() => {
    const list = Array.isArray(warehouses) ? warehouses : [];
    return list.slice().sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')));
  }, [warehouses]);

  const customers = db.customers.filter((c) => c.companyId === currentCompany.id);

  // The customer on this invoice, and what they already owe. Read here so the
  // summary bar can show it while the invoice is still being written.
  const customer = useMemo(
    () => customers.find((c) => String(c.id) === String(formData?.customerId)) || null,
    [customers, formData?.customerId]
  );
  const fieldErrors = useFieldErrors('invoice');

  const customerOutstanding = useMemo(() => {
    if (!customer) return 0;
    return (db.invoices || [])
      .filter((inv) => inv.companyId === currentCompany.id)
      .filter((inv) => String(inv.customerId) === String(customer.id))
      .filter((inv) => String(inv.status || '').toLowerCase() !== 'cancelled')
      .reduce((t, inv) => t + Math.max(0, Number(inv.total || 0) - Number(inv.paidAmount || 0)), 0);
  }, [customer, db.invoices, currentCompany.id]);

  const items = db.items.filter((i) => i.companyId === currentCompany.id);

  const { state: companyState } = getCompanyGstProfile(currentCompany);
  const selectedCustomer = formData.customerId
    ? customers.find((c) => c.id === parseInt(formData.customerId))
    : null;
  const { state: customerState, gstin: customerGstin } = getPartyGstProfile(selectedCustomer);
  const isIntra = isIntraStateSupply({ companyState, partyState: customerState });

  // Index of a row that was just added, so focus can land in it. Entry is
  // keyboard-driven: adding a line and then reaching for the mouse defeats it.
  const [focusRowIndex, setFocusRowIndex] = useState(-1);

  const addItem = () => {
    // The focus index is set outside the updater. Setting state from inside
    // one runs during React's render phase, where the second invocation under
    // StrictMode makes it a side effect React is entitled to drop.
    setFocusRowIndex(formData.items.length);
    setFormData((prev) => ({
      ...prev,
      items: [...prev.items, { itemId: '', description: '', quantity: 1, rate: 0, gstRate: 0, hsnSac: '', amount: 0 }],
    }));
  };

  /**
   * What is actually on the shelf, per item, for the warehouse this invoice
   * ships from.
   *
   * The save already refuses to oversell, but only once everything is typed
   * and the button is pressed. Showing the number the moment an item is
   * chosen turns that late refusal into something you can see coming — and a
   * line that already exceeds stock says so where the line is, not in a toast
   * after the fact.
   */
  const availableByItemId = useMemo(() => {
    const whId = String(formData.warehouseId || '').trim();
    try {
      const summary = computeInventorySummaryByItemId({ db, companyId: currentCompany.id, warehouseId: whId });
      const map = new Map();
      for (const [itemId, row] of summary.entries()) map.set(String(itemId), Number(row?.closingQty ?? 0));
      return map;
    } catch {
      return new Map();
    }
    // db is the whole book; the lines that matter are its stock documents.
  }, [db, currentCompany.id, formData.warehouseId]);

  const updateItem = (index, field, value, pickedItem = null) => {
    const newItems = [...formData.items];

    if (field === 'itemId') {
      // Every other field clears its error the moment it is answered; the line
      // grid did not, so "Every line needs an item" sat there after the line
      // had one, and the count beside Save still said a field needed attention.
      fieldErrors.clearField('items');
      const item = pickedItem || items.find((i) => i.id === parseInt(value));
      if (item) {
        // Price list first, then this customer's last paid rate, then master.
        const resolved = resolveSaleRate({
          db,
          companyId: currentCompany.id,
          customer: selectedCustomer,
          itemId: item.id,
          item,
        });
        newItems[index] = {
          ...newItems[index],
          itemId: value,
          description: item.name,
          rate: resolved.rate,
          rateSource: resolved.source,
          gstRate: Number(item.gstRate ?? 0),
          hsnSac: item.hsnSac || '',
        };
        if (resolved.source !== 'item master') {
          notify.info(`Rate ${resolved.rate} from ${resolved.source}`);
        }
        // Batch-tracked items default to the FEFO batch (earliest expiry).
        if (isTracked(item)) {
          const pick = fefoPick(db, currentCompany.id, item.id, Number(newItems[index].quantity) || 1);
          newItems[index].batchId = pick ? pick.id : '';
          newItems[index].batchNo = pick ? pick.batchNo : '';
          if (pick) notify.info(`Batch ${pick.batchNo} (FEFO${pick.expiryDate ? `, exp ${pick.expiryDate}` : ''})`);
        } else {
          newItems[index].batchId = '';
          newItems[index].batchNo = '';
        }
      }
    } else {
      newItems[index][field] = value;
    }

    // Discount rules: on item pick or quantity change, the best matching rule
    // fills the discount columns. A manual Disc% edit is the operator's call —
    // rules never overwrite that field once touched by hand.
    if (field === 'itemId' || field === 'quantity') {
      const line = newItems[index];
      const item = items.find((i) => String(i.id) === String(line.itemId));
      if (item && !line.discountManual) {
        const ruleHit = resolveDiscountForLine({
          db,
          companyId: currentCompany.id,
          customer: selectedCustomer,
          item,
          qty: Number(line.quantity ?? 1),
          rate: Number(line.rate ?? 0),
          date: formData.date,
        });
        const prevPct = Number(line.discountPct) || 0;
        const prevFixed = Number(line.discountAmount) || 0;
        line.discountPct = ruleHit?.pct || 0;
        line.discountAmount = ruleHit?.fixedPerUnit ? ruleHit.fixedPerUnit * (Number(line.quantity) || 1) : 0;
        line.discountRule = ruleHit?.ruleName || '';
        if (ruleHit && (line.discountPct !== prevPct || line.discountAmount !== prevFixed)) {
          notify.info(
            `${ruleHit.pct ? `${ruleHit.pct}% off` : `₹${ruleHit.fixedPerUnit}/unit off`} — ${ruleHit.ruleName}`
          );
        }
      }
    }
    if (field === 'discountPct') {
      newItems[index].discountManual = true;
    }

    if (field === 'quantity' || field === 'rate' || field === 'gstRate' || field === 'itemId' || field === 'discountPct') {
      const computed = computeGstForLine({
        quantity: Number(newItems[index].quantity ?? 1),
        rate: Number(newItems[index].rate ?? 0),
        gstRate: Number(newItems[index].gstRate ?? 0),
        isIntra,
        discountPct: Number(newItems[index].discountPct ?? 0),
        discountAmount: Number(newItems[index].discountAmount ?? 0),
      });
      newItems[index].amount = computed.taxableAmount;
      newItems[index].taxableAmount = computed.taxableAmount;
      newItems[index].gstAmount = computed.gstAmount;
      newItems[index].cgstAmount = computed.cgstAmount;
      newItems[index].sgstAmount = computed.sgstAmount;
      newItems[index].igstAmount = computed.igstAmount;
      newItems[index].lineTotal = computed.lineTotal;
      newItems[index].taxType = computed.taxType;
    }

    setFormData({ ...formData, items: newItems });
  };

  const removeItem = (index) => {
    setFormData({
      ...formData,
      items: formData.items.filter((_, i) => i !== index),
    });
  };

  const computed = computeGstForLines({
    lines: formData.items,
    isIntra,
    invoiceDiscount:
      Number(formData.invoiceDiscountValue) > 0
        ? { type: formData.invoiceDiscountType || 'pct', value: Number(formData.invoiceDiscountValue) }
        : null,
    otherCharges: formData.otherCharges,
  });

  /**
   * The invoice as it stands right now, shaped like a saved one.
   *
   * The preview uses the same renderer that prints and emails, so it has to be
   * fed the same shape. Building it from `computed` rather than from the raw
   * form is the point — a preview that totals differently from the saved
   * document is worse than no preview.
   */
  /**
   * A cancelled invoice is a record, not a document you still work on. Its
   * number is spent and its ledger entries are reversed; editing it would put
   * a live figure back behind a status that says there isn't one.
   */
  const isCancelled = String(existingInvoiceRecord?.status || '') === 'Cancelled';

  const previewInvoice = useMemo(
    () => ({
      ...formData,
      number: formData.number || generatedInvoiceNumber || '',
      customerName: getCustomerDisplayName(customer),
      customerGstin,
      placeOfSupplyState: customerState,
      taxType: isIntra ? 'CGST_SGST' : 'IGST',
      items: computed.lines,
      subtotal: computed.subtotal,
      invoiceDiscountApplied: computed.invoiceDiscount,
      otherCharges: computed.otherCharges,
      otherChargesTotal: computed.otherChargesTotal,
      cgstTotal: computed.cgstTotal,
      sgstTotal: computed.sgstTotal,
      igstTotal: computed.igstTotal,
      gstTotal: computed.gstTotal,
      total: computed.total,
    }),
    [formData, generatedInvoiceNumber, customer, customerGstin, customerState, isIntra, computed]
  );

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (isCancelled) {
      notify.error('This invoice is cancelled. Its number is spent — raise a new invoice instead.');
      return;
    }

    const wantsDraft = !isEdit && submitAsDraft;
    if (wantsDraft) {
      setSubmitAsDraft(false);
    }

    let invoiceNumber = String(formData.number || '').trim();
    if (isInvoiceAuto) {
      if (lockInvoiceNumberOnCreate) {
        invoiceNumber = String(generatedInvoiceNumber || '').trim();
      } else if (!invoiceNumber) {
        invoiceNumber = String(generatedInvoiceNumber || '').trim();
      }
    }

    // Everything that is about a field, gathered in one pass. Reporting these
    // one at a time meant a form with three blanks took three submits to find
    // out about the third.
    const invoiceNumberClash = db.invoices.some(
      (inv) => inv.companyId === currentCompany.id && String(inv.number || '').trim() === invoiceNumber && (!isEdit || inv.id !== Number(initialData?.id))
    );

    fieldErrors.reset();
    fieldErrors.require('number', invoiceNumber, 'Invoice number is required');
    fieldErrors.check(
      'number',
      !invoiceNumber || !invoiceNumberClash,
      'That number is already used. Change it, or adjust numbering in Company Profile.'
    );
    fieldErrors.require('date', formData.date, 'Invoice date is required');
    fieldErrors.require('warehouseId', formData.warehouseId, 'Warehouse is required');
    fieldErrors.require('customerId', formData.customerId, 'Customer is required');
    fieldErrors.check(
      'items',
      !(formData.items || []).some((l) => !String(l.itemId || '').trim()),
      'Every line needs an item — GST is charged per item.'
    );
    if (fieldErrors.failed()) return;

    // Closed books: nothing back-dates into a period already reported.
    {
      const closed = blockIfClosed(db, currentCompany.id, formData.date, 'This invoice');
      if (closed) {
        notify.error(closed);
        return;
      }
    }

    if (!companyState) {
      notify.error('Please set Company State in Company Profile before creating GST invoices.');
      return;
    }

    const customerIsRegistered = String(selectedCustomer?.gstRegistration || '').trim().toLowerCase() === 'registered';
    if (customerIsRegistered && !canDetermineSupplyType({ companyState, partyState: customerState })) {
      notify.error('Cannot determine Place of Supply for this registered customer. Please set customer state/address before creating GST invoices.');
      return;
    }


    // Batch-tracked lines must name a batch with enough remaining stock.
    if (!wantsDraft) {
      for (const l of formData.items || []) {
        const master = items.find((i) => String(i.id) === String(l.itemId));
        if (!isTracked(master)) continue;
        if (!l.batchId) {
          notify.error(`"${master.name}" is batch-tracked — pick a batch on its line.`);
          return;
        }
        const batch = batchesForItem(db, currentCompany.id, l.itemId, {
          includeEmpty: true,
          excludeInvoiceId: isEdit ? initialData?.id : undefined,
        }).find((b) => String(b.id) === String(l.batchId));
        const q = Number(l.quantity) || 0;
        if (!batch) {
          notify.error(`Batch on "${master.name}" no longer exists — pick again.`);
          return;
        }
        if (q > batch.remaining + 0.0001) {
          notify.error(`Batch ${batch.batchNo} has only ${batch.remaining} left — line needs ${q}.`);
          return;
        }
      }
    }

    const customer = customers.find((c) => c.id === parseInt(formData.customerId));

    // Credit management: warn before pushing a customer past their limit or
    // stacking onto already-overdue invoices. Warn-and-confirm, not a hard
    // block — the operator may have collected payment out of band.
    if (!isEdit && customer) {
      const openInvoices = db.invoices.filter((i) => {
        if (i.companyId !== currentCompany.id) return false;
        if (parseInt(i.customerId) !== customer.id) return false;
        const st = String(i.status || '').toLowerCase();
        return st !== 'draft' && st !== 'cancelled' && st !== 'paid';
      });
      const outstanding = openInvoices.reduce((s, i) => s + Math.max(0, Number(i.total || 0) - Number(i.paidAmount || 0)), 0);
      const creditLimit = Number(customer.creditLimit || 0);
      const todayStr = todayIso();
      const overdue = openInvoices.filter((i) => i.dueDate && i.dueDate < todayStr);

      const warnings = [];
      if (creditLimit > 0 && outstanding + computed.total > creditLimit) {
        warnings.push(
          `Credit limit ${formatMoney(creditLimit, currentCompany)} would be crossed — outstanding ${formatMoney(outstanding, currentCompany)} + this invoice ${formatMoney(computed.total, currentCompany)}.`
        );
      }
      if (overdue.length > 0) {
        warnings.push(`${overdue.length} invoice(s) already past due (oldest: ${overdue.map((i) => i.dueDate).sort()[0]}).`);
      }
      if (warnings.length) {
        const ok = await confirmDialog({
          title: 'Credit check',
          message: warnings.join('\n') + '\n\nCreate the invoice anyway?',
          confirmLabel: 'Create anyway',
        });
        if (!ok) return;
      }
    }

    const existingInvoice = isEdit ? db.invoices.find((i) => i.id === Number(initialData.id)) : null;
    if (isEdit && !existingInvoice) {
      notify.error('Invoice not found. It may have been removed.');
      return;
    }

    const invoicePayloadBase = {
      companyId: currentCompany.id,
      ...formData,
      number: invoiceNumber,
      warehouseId: String(formData.warehouseId || '').trim(),
      customerName: getCustomerDisplayName(customer),
      customerGstin: customerGstin,
      placeOfSupplyState: customerState,
      taxType: isIntra ? 'CGST_SGST' : 'IGST',
      items: computed.lines,
      subtotal: computed.subtotal,
      invoiceDiscountApplied: computed.invoiceDiscount,
      otherCharges: computed.otherCharges,
      otherChargesTotal: computed.otherChargesTotal,
      cgstTotal: computed.cgstTotal,
      sgstTotal: computed.sgstTotal,
      igstTotal: computed.igstTotal,
      gstTotal: computed.gstTotal,
      total: computed.total,
    };

    const existingPaidAmount = isEdit ? Number(existingInvoice?.paidAmount ?? 0) : 0;
    // Editing a draft and pressing Update used to finalise it, because the
    // only thing consulted was which button was pressed on a form that no
    // longer offered the draft one.
    const isDraft = wantsDraft;
    const nextStatus =
      isDraft
        ? 'Draft'
        : computed.total > 0 && existingPaidAmount >= computed.total - 0.0001
          ? 'Paid'
          : existingPaidAmount > 0
            ? 'Partial'
            : 'Unpaid';

    // Block negative stock for Goods (Services do not affect inventory)
    if (!isDraft) {
      const whId = String(formData.warehouseId || '').trim();
      const inventoryByItemId = computeInventorySummaryByItemId({ db, companyId: currentCompany.id, warehouseId: whId });

      const itemsById = new Map(items.map((it) => [String(it.id), it]));
      const sumQtyByItemId = (lines) => {
        const map = new Map();
        (Array.isArray(lines) ? lines : []).forEach((l) => {
          const itemId = l?.itemId !== undefined && l?.itemId !== null && l?.itemId !== '' ? String(l.itemId) : '';
          if (!itemId) return;
          const master = itemsById.get(itemId);
          if (!master || !isStockItem(master)) return;
          const qty = Number(l?.quantity ?? 0);
          const q = Number.isFinite(qty) ? Math.max(0, qty) : 0;
          if (q <= 0) return;
          map.set(itemId, (map.get(itemId) || 0) + q);
        });
        return map;
      };

      const requiredOut = sumQtyByItemId(computed.lines);
      const canGiveBack =
        Boolean(isEdit) &&
        Boolean(existingInvoice) &&
        String(existingInvoice?.status || '').trim() !== 'Draft' &&
        String(existingInvoice?.warehouseId || '').trim() === whId;
      const giveBackOut = canGiveBack ? sumQtyByItemId(existingInvoice?.items) : new Map();

      for (const [itemId, needQty] of requiredOut.entries()) {
        const closingQty = Number(inventoryByItemId.get(String(itemId))?.closingQty ?? 0);
        const giveBack = Number(giveBackOut.get(String(itemId)) || 0);
        const available = (Number.isFinite(closingQty) ? closingQty : 0) + (Number.isFinite(giveBack) ? giveBack : 0);

        if (needQty > available + 0.0001) {
          const master = itemsById.get(String(itemId));
          const label = master?.name || master?.code || `Item ${itemId}`;
          notify.error(`Negative stock not allowed. "${label}" available ${available}, required ${needQty}.`);
          return;
        }
      }
    }

    if (isEdit) {
      const updatedInvoice = {
        ...existingInvoice,
        ...invoicePayloadBase,
        id: existingInvoice.id,
        paidAmount: existingInvoice.paidAmount ?? 0,
        status: nextStatus,
        createdAt: existingInvoice.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const hasApiSession = Boolean(String(localStorage.getItem('token') || '').trim() && String(localStorage.getItem('activeOrgId') || '').trim());
      if (hasApiSession) {
        const backendInvoiceId = String(existingInvoice?.backendInvoiceId || '').trim();
        const payload = {
          branchId: String(activeBranchId || branchIdForNumbering || '').trim(),
          warehouseId: String(updatedInvoice.warehouseId || '').trim(),
          number: String(updatedInvoice.number || '').trim(),
          date: String(updatedInvoice.date || '').trim(),
          dueDate: String(updatedInvoice.dueDate || '').trim(),
          refNo: String(updatedInvoice.refNo || '').trim(),
          refDate: String(updatedInvoice.refDate || '').trim(),
          customerId: String(updatedInvoice.customerId || '').trim(),
          customerName: String(updatedInvoice.customerName || '').trim(),
          customerGstin: String(updatedInvoice.customerGstin || '').trim(),
          placeOfSupplyState: String(updatedInvoice.placeOfSupplyState || '').trim(),
          taxType: String(updatedInvoice.taxType || '').trim(),
          subtotal: Number(updatedInvoice.subtotal ?? 0),
          cgstTotal: Number(updatedInvoice.cgstTotal ?? 0),
          sgstTotal: Number(updatedInvoice.sgstTotal ?? 0),
          igstTotal: Number(updatedInvoice.igstTotal ?? 0),
          gstTotal: Number(updatedInvoice.gstTotal ?? 0),
          total: Number(updatedInvoice.total ?? 0),
          paidAmount: Number(updatedInvoice.paidAmount ?? 0),
          status: String(updatedInvoice.status || 'Draft').trim(),
          sourceEstimateId: updatedInvoice.sourceEstimateId ? String(updatedInvoice.sourceEstimateId) : '',
          items: Array.isArray(updatedInvoice.items) ? updatedInvoice.items : [],
        };

        try {
          const saved = backendInvoiceId
            ? await updateInvoiceApi(backendInvoiceId, payload)
            : await createInvoiceApi(payload);
          updatedInvoice.backendInvoiceId = String(saved?.id || backendInvoiceId || '').trim() || undefined;
        } catch (err) {
          notify.error(String(err?.message || 'Unable to save invoice to backend.'));
          return;
        }
      }

      setDb({
        ...db,
        invoices: db.invoices.map((inv) => (inv.id === existingInvoice.id ? updatedInvoice : inv)),
      });
      onClose?.();
      notify.success('Invoice updated successfully!');
      return;
    }

    const newInvoiceId = getNextNumericId(db.invoices);
    const newInvoice = {
      ...invoicePayloadBase,
      id: newInvoiceId,
      paidAmount: 0,
      status: nextStatus,
      createdAt: new Date().toISOString(),
    };

    const hasApiSession = Boolean(String(localStorage.getItem('token') || '').trim() && String(localStorage.getItem('activeOrgId') || '').trim());
    if (hasApiSession) {
      const payload = {
        branchId: String(activeBranchId || branchIdForNumbering || '').trim(),
        warehouseId: String(newInvoice.warehouseId || '').trim(),
        number: String(newInvoice.number || '').trim(),
        date: String(newInvoice.date || '').trim(),
        dueDate: String(newInvoice.dueDate || '').trim(),
        refNo: String(newInvoice.refNo || '').trim(),
        refDate: String(newInvoice.refDate || '').trim(),
        customerId: String(newInvoice.customerId || '').trim(),
        customerName: String(newInvoice.customerName || '').trim(),
        customerGstin: String(newInvoice.customerGstin || '').trim(),
        placeOfSupplyState: String(newInvoice.placeOfSupplyState || '').trim(),
        taxType: String(newInvoice.taxType || '').trim(),
        subtotal: Number(newInvoice.subtotal ?? 0),
        cgstTotal: Number(newInvoice.cgstTotal ?? 0),
        sgstTotal: Number(newInvoice.sgstTotal ?? 0),
        igstTotal: Number(newInvoice.igstTotal ?? 0),
        gstTotal: Number(newInvoice.gstTotal ?? 0),
        total: Number(newInvoice.total ?? 0),
        paidAmount: Number(newInvoice.paidAmount ?? 0),
        status: String(newInvoice.status || 'Draft').trim(),
        sourceEstimateId: newInvoice.sourceEstimateId ? String(newInvoice.sourceEstimateId) : '',
        reverseCharge: !!newInvoice.reverseCharge,
        // Fields the form collects that used to stop at the browser: without
        // them a device that had never seen this invoice rebuilt it without
        // its salesman, cost centre, discounts, charges or source document.
        salesmanId: newInvoice.salesmanId ?? undefined,
        costCenterId: newInvoice.costCenterId ?? undefined,
        invoiceDiscountType: newInvoice.invoiceDiscountType ?? undefined,
        invoiceDiscountValue: newInvoice.invoiceDiscountValue ?? undefined,
        invoiceDiscountApplied: Number.isFinite(Number(newInvoice.invoiceDiscountApplied))
          ? Number(newInvoice.invoiceDiscountApplied)
          : undefined,
        otherCharges: Array.isArray(newInvoice.otherCharges) && newInvoice.otherCharges.length ? newInvoice.otherCharges : undefined,
        otherChargesTotal: Number.isFinite(Number(newInvoice.otherChargesTotal)) ? Number(newInvoice.otherChargesTotal) : undefined,
        shipToAddressId: newInvoice.shipToAddressId ?? undefined,
        sourceChallanId: newInvoice.sourceChallanId ?? undefined,
        sourceSalesOrderId: newInvoice.sourceSalesOrderId ?? undefined,
        items: Array.isArray(newInvoice.items) ? newInvoice.items : [],
      };

      try {
        const saved = await createInvoiceApi(payload);
        newInvoice.backendInvoiceId = String(saved?.id || '').trim() || undefined;
      } catch (err) {
        notify.error(String(err?.message || 'Unable to save invoice to backend.'));
        return;
      }
    }

    const sourceEstimateId = formData.sourceEstimateId;
    const updatedEstimates = sourceEstimateId
      ? db.estimates.map((e) =>
          e.id === sourceEstimateId
            ? {
                ...e,
                status: 'Converted',
                convertedInvoiceId: newInvoice.id,
                convertedAt: new Date().toISOString(),
              }
            : e
        )
      : db.estimates;

    const sourceChallanId = formData.sourceChallanId;
    setDb({
      ...db,
      invoices: [...db.invoices, newInvoice],
      estimates: updatedEstimates,
      deliveryChallans: sourceChallanId
        ? (db.deliveryChallans || []).map((c) =>
            Number(c.id) === Number(sourceChallanId) ? { ...c, status: 'Invoiced', invoiceNumber: newInvoice.number } : c
          )
        : db.deliveryChallans,
      companies: bumpCompanyNextNumber({
        db,
        companyId: currentCompany.id,
        voucherKey: 'invoice',
        usedNumber: invoiceNumber,
        branchId: branchIdForNumbering,
      }),
    });

    const keepGoing = saveAndNewRef.current;
    saveAndNewRef.current = false;

    if (keepGoing) {
      // Same customer, same warehouse, everything else blank — the next
      // invoice in a run is usually for a different line of goods, not a
      // different buyer, and retyping the customer every time is the thing
      // that makes bulk entry slow.
      setFormData((p) => ({
        ...p,
        number: '',
        items: [{ itemId: '', description: '', quantity: 1, rate: 0, gstRate: 0, hsnSac: '', amount: 0 }],
        invoiceDiscountValue: '',
        otherCharges: [],
        refNo: '',
        refDate: '',
        customFields: {},
        sourceEstimateId: null,
        sourceChallanId: null,
        sourceSalesOrderId: null,
      }));
      setPreviewOpen(false);
    } else {
      onClose?.();
    }

    if (sourceEstimateId) notify.success('Invoice created and estimate converted successfully!');
    else if (keepGoing) notify.success(`Invoice ${invoiceNumber} saved. Next one is ready.`);
    else notify.success('Invoice created successfully!');

    // Auto-register on the IRP when the org opted in (fire-and-forget: the
    // invoice is already saved; a gateway failure only means "no IRN yet").
    if (newInvoice.backendInvoiceId && isEnabled('einvoice')) {
      (async () => {
        try {
          // Reading the gateway settings needs the settings permission; a
          // sales user without it simply skips auto-registration — silently,
          // because the invoice itself saved fine.
          let settings = null;
          try {
            settings = await getEInvoiceSettingsApi();
          } catch {
            return;
          }
          if (!settings?.autoRegister || !settings?.baseUrl) return;
          const customer = (db.customers || []).find((c) => c.id === newInvoice.customerId) || {};
          const result = await registerEInvoiceApi(
            newInvoice.backendInvoiceId,
            buildEInvoicePayload({ invoice: newInvoice, company: currentCompany, customer })
          );
          setDb((prev) => ({
            ...prev,
            invoices: (prev.invoices || []).map((x) =>
              x.id === newInvoice.id
                ? { ...x, irn: result.irn, irnAckNo: result.ackNo, irnAckDate: result.ackDate, irnSignedQr: result.signedQr }
                : x
            ),
          }));
          notify.success(`IRN for ${newInvoice.number}: ${result.irn}`);
        } catch (err) {
          notify.error(`IRP auto-registration failed: ${String(err?.message || err)}`);
        }
      })();
    }
  };

  // Hands stay on the keyboard. These are the bindings a Tally operator
  // already has in muscle memory, so entry does not slow down on arrival.
  const onFormKeyDown = (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && String(e.key).toLowerCase() === 's') {
      e.preventDefault();
      formRef.current?.requestSubmit();
      return;
    }
    /**
     * Tab out of the *last* control of the *last* line starts the next one,
     * the way a Tally operator expects.
     *
     * This used to hang off the row's own onKeyDown and fired on any cell in
     * the last row, so tabbing from the item to the quantity opened a line
     * nobody asked for — when it fired at all. Enter has always been handled
     * here at the form, which is the level a keystroke from inside the table
     * reliably reaches, so Tab is handled here too.
     */
    if (e.key === 'Tab' && !e.shiftKey && !mod) {
      const el = e.target;
      if (!(el instanceof HTMLElement)) return;
      const row = el.closest('[data-line-row]');
      if (!row) return;
      if (Number(row.dataset.lineRow) !== formData.items.length - 1) return;
      // The last thing you *type into*, not the last thing you can focus.
      // The row ends with a delete button, so counting that as the last field
      // meant Tab from the final rate or discount did nothing, and the new
      // line only opened from the bin icon — which is not where anybody's
      // hands are.
      const entry = row.querySelectorAll(
        'input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled])'
      );
      if (!entry.length || entry[entry.length - 1] !== el) return;
      e.preventDefault();
      addItem();
      return;
    }

    if (e.key !== 'Enter' || e.shiftKey || mod) return;
    // Enter inside a line opens the next one. Anywhere else it would submit
    // the form early, which is the classic way to book a half-typed invoice.
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.tagName === 'TEXTAREA') return;
    if (!target.closest('tbody')) return;
    e.preventDefault();
    addItem();
  };

  return (
    <form ref={formRef} onSubmit={handleSubmit} onKeyDown={onFormKeyDown} noValidate className="space-y-6">
      {isCancelled ? (
        <div
          className="flex items-start gap-2 rounded-lg p-3 text-sm"
          style={{ background: 'rgb(var(--warn-soft))', color: 'rgb(var(--warn-ink))' }}
          role="status"
        >
          <Ban size={16} aria-hidden="true" className="mt-0.5 flex-shrink-0" />
          <span>
            This invoice was cancelled{existingInvoiceRecord?.cancelledAt ? ` on ${existingInvoiceRecord.cancelledAt}` : ''}. It
            keeps its number so the series has no hole, and it cannot be edited. Raise a new invoice instead.
          </span>
        </div>
      ) : null}

      <DocFormActions
        primaryLabel={isDraftInvoice ? (isEdit ? 'Finalize Invoice' : 'Create Invoice') : 'Update Invoice'}
        onPrimary={() => setSubmitAsDraft(false)}
        secondaryLabel={isDraftInvoice ? 'Save Draft' : ''}
        onSecondary={submitAsDraftNow}
        /*
         * react-hooks/refs cannot tell a callback prop from a render-time
         * read, so a menu entry whose handler touches a ref reads to it as a
         * ref access during render. Every onSelect below runs on click.
         */
        // eslint-disable-next-line react-hooks/refs
        menu={[
          { key: 'preview', group: 'This invoice', label: 'Preview Invoice', icon: Eye, onSelect: () => setPreviewOpen(true) },
          !isEdit
            ? {
                key: 'saveNew',
                group: 'This invoice',
                label: 'Save & New',
                icon: Plus,
                submit: true,
                onSelect: markSaveAndNew,
              }
            : null,
          isEdit && typeof onDuplicateInvoice === 'function'
            ? {
                key: 'duplicate',
                group: 'This invoice',
                label: 'Duplicate',
                icon: Copy,
                onSelect: () => onDuplicateInvoice(existingInvoiceRecord || initialData),
              }
            : null,
          {
            key: 'prefs',
            group: 'Configure — every invoice',
            label: 'Preferences',
            icon: SlidersHorizontal,
            onSelect: () => openPreferences(false),
          },
          {
            key: 'custom',
            group: 'Configure — every invoice',
            label: 'Custom Field',
            icon: Plus,
            onSelect: () => openPreferences(true),
          },
          {
            key: 'template',
            group: 'Configure — every invoice',
            label: 'Invoice Template',
            icon: Settings2,
            onSelect: () => goToSettings('invoiceTemplates'),
          },
          isEdit && String(existingInvoiceRecord?.status || '') !== 'Cancelled'
            ? { key: 'cancel', group: 'danger', label: 'Cancel invoice', icon: Ban, danger: true, onSelect: cancelInvoice }
            : null,
        ].filter(Boolean)}
      />

      {prefsOpen ? (
        <div className="space-y-3">
          <InvoiceFieldSettings
            db={db}
            setDb={setDb}
            currentCompany={currentCompany}
            embedded
            onBack={() => setPrefsOpen(false)}
          />
          <div style={{ borderTop: '1px solid rgb(var(--border))' }} className="pt-3">
            <button type="button" onClick={() => setPrefsOpen(false)} className="ui-btn ui-btn-primary">
              Back to the invoice
            </button>
            <span className="ui-caption ml-3">Nothing typed above was lost — the invoice is exactly as you left it.</span>
          </div>
        </div>
      ) : null}

      {previewOpen && !prefsOpen ? (
        <div className="ui-card p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="ui-t-label">Preview — what the customer receives</span>
            <button
              type="button"
              onClick={() => setPreviewOpen(false)}
              className="ui-btn ui-btn-ghost ui-btn-sm"
            >
              <X size={14} aria-hidden="true" /> Close preview
            </button>
          </div>
          <div className="overflow-x-auto">
            <InvoicePreview db={db} currentCompany={currentCompany} invoice={previewInvoice} />
          </div>
        </div>
      ) : null}

      {/*
        Warehouse, number and the two dates on one line.

        The number and dates used to sit in a tinted strip above the form,
        which read as a separate object rather than the top of the invoice —
        and it pushed the warehouse, the field that decides which stock moves,
        down the page.
      */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div
          ref={(el) => fieldErrors.register('warehouseId', el)}
          data-invalid-within={fieldErrors.error('warehouseId') ? 'true' : undefined}
        >
          <WarehouseField
            value={formData.warehouseId}
            onChange={(warehouseId) => {
              fieldErrors.clearField('warehouseId');
              setFormData((p) => ({ ...p, warehouseId }));
            }}
            options={warehouseOptions}
            activeWarehouseId={defaultWarehouseId}
            isEdit={Boolean(initialData)}
            className="ui-select"
          />
          <FieldError error={fieldErrors.error('warehouseId')} id={fieldErrors.errorId('warehouseId')} />
        </div>

        <div>
          <label htmlFor="invoice-number" className="block text-sm font-medium mb-1">
            Invoice No.
          </label>
          <input
            id="invoice-number"
            type="text"
            value={formData.number ?? ''}
            onChange={(e) => setFormData((p) => ({ ...p, number: e.target.value }))}
            disabled={lockInvoiceNumberOnCreate}
            required
            aria-invalid={fieldErrors.error('number') ? true : undefined}
            className="ui-input ui-mono"
          />
          <p className="mt-1 text-xs ui-muted">
            {lockInvoiceNumberOnCreate ? 'Numbered automatically from the series' : 'Auto from Settings; type over it when needed.'}
          </p>
          <FieldError error={fieldErrors.error('number')} id={fieldErrors.errorId('number')} />
        </div>

        <div>
          <label htmlFor="invoice-date" className="block text-sm font-medium mb-1">
            Date <span className="text-[rgb(var(--neg-ink))]">*</span>
          </label>
          <input
            id="invoice-date"
            type="date"
            value={formData.date}
            required
            onChange={(e) =>
              setFormData((p) => ({
                ...p,
                date: e.target.value,
                // Terms are counted from the document date, so moving the date
                // moves the due date with it.
                dueDate: selectedCustomer ? dueDateFor(e.target.value, selectedCustomer) || p.dueDate : p.dueDate,
              }))
            }
            className="ui-input"
          />
          <FieldError error={fieldErrors.error('date')} id={fieldErrors.errorId('date')} />
        </div>

        <div>
          <label htmlFor="invoice-due" className="block text-sm font-medium mb-1">
            Due Date <span className="text-[rgb(var(--neg-ink))]">*</span>
          </label>
          <input
            id="invoice-due"
            type="date"
            value={formData.dueDate}
            required
            onChange={(e) => setFormData((p) => ({ ...p, dueDate: e.target.value }))}
            className="ui-input"
          />
          {prefOn('dueDateFromTerms') ? <p className="mt-1 text-xs ui-muted">Follows the payment terms.</p> : null}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div
          className="lg:col-span-2"
          ref={(el) => fieldErrors.register('customerId', el)}
          data-invalid-within={fieldErrors.error('customerId') ? 'true' : undefined}
        >
          <CustomerPicker
            db={db}
            setDb={setDb}
            currentCompany={currentCompany}
            value={formData.customerId}
            onChange={(customerId) =>
              setFormData((prev) => {
                // Requirement 12: the due date follows the customer's agreed
                // terms instead of a blanket +30 days. The server recomputes
                // this on save from the same terms, so showing anything else
                // here would just be a number that changes after saving.
                const picked = customers.find((c) => String(c.id) === String(customerId));
                fieldErrors.clearField('customerId');
                return {
                  ...prev,
                  customerId,
                  dueDate: picked ? dueDateFor(prev.date, picked) || prev.dueDate : prev.dueDate,
                };
              })
            }
          />
          <FieldError error={fieldErrors.error('customerId')} id={fieldErrors.errorId('customerId')} />
          {selectedCustomer ? (
            <p className="mt-1 text-xs ui-muted">Terms: {termsLabel(selectedCustomer)}</p>
          ) : null}
          {prefOn('shipTo') && selectedCustomer && Array.isArray(selectedCustomer.shipToAddresses) && selectedCustomer.shipToAddresses.length > 0 ? (
            <div className="mt-2">
              <label className="block text-xs ui-muted mb-1">Deliver to</label>
              <select
                value={formData.shipToCode || ''}
                onChange={(e) => {
                  const code = e.target.value;
                  const addr = selectedCustomer.shipToAddresses.find((a) => a.code === code) || null;
                  setFormData((p) => ({ ...p, shipToCode: code, shipToAddress: addr }));
                }}
                className="ui-select w-full px-3 py-2"
              >
                <option value="">Billing address</option>
                {selectedCustomer.shipToAddresses.map((a) => (
                  <option key={a.code} value={a.code}>
                    {a.code} — {a.label || a.line1 || a.city}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>

        {prefOn('iec') ? (
          <div>
            <label className="block text-sm font-medium mb-1">
              IEC <span className="ui-subtle font-normal">(if applicable)</span>
            </label>
            <input
              type="text"
              value={formData.iecNumber}
              onChange={(e) => setFormData((p) => ({ ...p, iecNumber: e.target.value }))}
              className="ui-input"
              placeholder="Enter IEC"
            />
          </div>
        ) : null}

        {prefOn('lut') ? (
          <div>
            <label className="block text-sm font-medium mb-1">
              LUT <span className="ui-subtle font-normal">(if applicable)</span>
            </label>
            <input
              type="text"
              value={formData.lutNumber}
              onChange={(e) => setFormData((p) => ({ ...p, lutNumber: e.target.value }))}
              className="ui-input"
              placeholder="Select LUT"
            />
            <p className="mt-1 text-xs ui-muted">Zero-rated export without payment of IGST.</p>
          </div>
        ) : null}

        {prefOn('reverseCharge') ? (
          <div className="flex items-end pb-2">
            <label className="inline-flex items-center gap-2 text-sm font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={!!formData.reverseCharge}
                onChange={(e) => setFormData({ ...formData, reverseCharge: e.target.checked })}
                className="ui-checkbox"
              />
              Reverse charge (RCM)
            </label>
          </div>
        ) : null}

        {prefOn('costCenter') && (db.costCenters || []).some((c) => c.companyId === currentCompany.id) ? (
          <div>
            <label className="block text-sm font-medium mb-1">Cost Center</label>
            <select
              value={formData.costCenterId || ''}
              onChange={(e) => setFormData({ ...formData, costCenterId: e.target.value ? Number(e.target.value) : '' })}
              className="ui-select w-full px-3 py-2"
            >
              <option value="">— none —</option>
              {(db.costCenters || [])
                .filter((c) => c.companyId === currentCompany.id)
                .map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
            </select>
          </div>
        ) : null}

        {prefOn('salesman') && (db.salesmen || []).some((s) => s.companyId === currentCompany.id) ? (
          <div>
            <label className="block text-sm font-medium mb-1">Salesman</label>
            <select
              value={formData.salesmanId || ''}
              onChange={(e) => setFormData({ ...formData, salesmanId: e.target.value ? Number(e.target.value) : '' })}
              className="ui-select w-full px-3 py-2"
            >
              <option value="">— none —</option>
              {(db.salesmen || [])
                .filter((s) => s.companyId === currentCompany.id)
                .map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
            </select>
          </div>
        ) : null}

        {renderCustomFields('header')}
      </div>

      {prefOn('customerRef') || customFields.some((f) => f.formPlacement === 'reference') ? (
        <div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-4"
          style={{ borderTop: '1px solid rgb(var(--border))' }}
        >
          {prefOn('customerRef') ? (
            <div>
              <label className="block text-sm font-medium mb-1">Ref No.</label>
              <input
                type="text"
                value={formData.refNo}
                onChange={(e) => setFormData({ ...formData, refNo: e.target.value })}
                className="ui-input"
                placeholder="Estimate / Quotation / Sales Order"
              />
            </div>
          ) : null}

          {prefOn('customerRef') ? (
            <div>
              <label className="block text-sm font-medium mb-1">Ref Date</label>
              <input
                type="date"
                value={formData.refDate}
                onChange={(e) => setFormData({ ...formData, refDate: e.target.value })}
                className="ui-input"
              />
            </div>
          ) : null}

          {renderCustomFields('reference')}
        </div>
      ) : null}

      {[
        prefOn('lut'),
        prefOn('iec'),
        prefOn('shippingBill'),
        prefOn('foreignCurrency'),
        prefOn('transporter'),
        prefOn('lrNumber'),
        prefOn('packages'),
        prefOn('servicePeriod'),
        prefOn('project'),
        prefOn('workOrder'),
        prefOn('timesheetRef'),
      ].some(Boolean) ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {prefOn('shippingBill') ? (
            <div>
              <label className="block text-sm font-medium mb-1">Shipping bill</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={formData.shippingBillNo}
                  onChange={(e) => setFormData((p) => ({ ...p, shippingBillNo: e.target.value }))}
                  className="ui-input flex-1"
                  placeholder="Number"
                />
                <input
                  type="date"
                  value={formData.shippingBillDate}
                  onChange={(e) => setFormData((p) => ({ ...p, shippingBillDate: e.target.value }))}
                  className="ui-input w-40"
                  aria-label="Shipping bill date"
                />
              </div>
              <input
                type="text"
                value={formData.portCode}
                onChange={(e) => setFormData((p) => ({ ...p, portCode: e.target.value }))}
                className="ui-input mt-2"
                placeholder="Port code — INMAA1"
                aria-label="Port code"
              />
            </div>
          ) : null}

          {prefOn('foreignCurrency') ? (
            <div>
              <label className="block text-sm font-medium mb-1">Currency &amp; exchange rate</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={formData.invoiceCurrency}
                  onChange={(e) => setFormData((p) => ({ ...p, invoiceCurrency: e.target.value.toUpperCase() }))}
                  className="ui-input w-24"
                  placeholder="USD"
                  aria-label="Invoice currency"
                />
                <input
                  type="number"
                  step="0.0001"
                  min="0"
                  value={formData.exchangeRate}
                  onChange={(e) => setFormData((p) => ({ ...p, exchangeRate: e.target.value }))}
                  className="ui-input flex-1"
                  placeholder="Rate to INR"
                  aria-label="Exchange rate"
                />
              </div>
              <p className="mt-1 text-xs ui-muted">Recorded on the document. Totals are still kept in INR.</p>
            </div>
          ) : null}

          {prefOn('transporter') ? (
            <div>
              <label className="block text-sm font-medium mb-1">Transporter &amp; vehicle</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={formData.transporterName}
                  onChange={(e) => setFormData((p) => ({ ...p, transporterName: e.target.value }))}
                  className="ui-input flex-1"
                  placeholder="Transporter"
                />
                <input
                  type="text"
                  value={formData.vehicleNo}
                  onChange={(e) => setFormData((p) => ({ ...p, vehicleNo: e.target.value.toUpperCase() }))}
                  className="ui-input w-36"
                  placeholder="KA-01-AB-1234"
                  aria-label="Vehicle number"
                />
              </div>
            </div>
          ) : null}

          {prefOn('lrNumber') ? (
            <div>
              <label className="block text-sm font-medium mb-1">LR / GR no.</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={formData.lrNumber}
                  onChange={(e) => setFormData((p) => ({ ...p, lrNumber: e.target.value }))}
                  className="ui-input flex-1"
                  placeholder="Consignment note"
                />
                <input
                  type="date"
                  value={formData.lrDate}
                  onChange={(e) => setFormData((p) => ({ ...p, lrDate: e.target.value }))}
                  className="ui-input w-40"
                  aria-label="LR date"
                />
              </div>
            </div>
          ) : null}

          {prefOn('packages') ? (
            <div>
              <label className="block text-sm font-medium mb-1">Packages &amp; weight</label>
              <input
                type="text"
                value={formData.packageDetails}
                onChange={(e) => setFormData((p) => ({ ...p, packageDetails: e.target.value }))}
                className="ui-input"
                placeholder="12 packages · 840 kg gross"
              />
            </div>
          ) : null}

          {prefOn('servicePeriod') ? (
            <div>
              <label className="block text-sm font-medium mb-1">Service period</label>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={formData.servicePeriodFrom}
                  onChange={(e) => setFormData((p) => ({ ...p, servicePeriodFrom: e.target.value }))}
                  className="ui-input flex-1"
                  aria-label="Service period from"
                />
                <input
                  type="date"
                  value={formData.servicePeriodTo}
                  onChange={(e) => setFormData((p) => ({ ...p, servicePeriodTo: e.target.value }))}
                  className="ui-input flex-1"
                  aria-label="Service period to"
                />
              </div>
              <p className="mt-1 text-xs ui-muted">What this fee covers.</p>
            </div>
          ) : null}

          {prefOn('project') ? (
            <div>
              <label className="block text-sm font-medium mb-1">Project / site</label>
              <input
                type="text"
                value={formData.projectName}
                onChange={(e) => setFormData((p) => ({ ...p, projectName: e.target.value }))}
                className="ui-input"
                placeholder="Peenya shed"
              />
            </div>
          ) : null}

          {prefOn('workOrder') ? (
            <div>
              <label className="block text-sm font-medium mb-1">Work order &amp; RA bill</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={formData.workOrderNo}
                  onChange={(e) => setFormData((p) => ({ ...p, workOrderNo: e.target.value }))}
                  className="ui-input flex-1"
                  placeholder="WO-1182"
                />
                <input
                  type="text"
                  value={formData.raBillNo}
                  onChange={(e) => setFormData((p) => ({ ...p, raBillNo: e.target.value }))}
                  className="ui-input w-32"
                  placeholder="RA-03"
                  aria-label="RA bill number"
                />
              </div>
            </div>
          ) : null}

          {prefOn('timesheetRef') ? (
            <div>
              <label className="block text-sm font-medium mb-1">Timesheet reference</label>
              <input
                type="text"
                value={formData.timesheetRef}
                onChange={(e) => setFormData((p) => ({ ...p, timesheetRef: e.target.value }))}
                className="ui-input"
                placeholder="TS-2608"
              />
            </div>
          ) : null}
        </div>
      ) : null}

      <div>
        <div className="mb-2">
          <label className="block text-sm font-medium">Line Items</label>
        </div>

        <div className="border rounded-lg overflow-hidden">
          <table className="ui-table w-full ui-table-wide">
            <thead className="ui-sunken">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium">Item</th>
                <th className="px-3 py-2 text-left text-xs font-medium">Description</th>
                <th className="px-3 py-2 text-left text-xs font-medium">
                  Qty <span className="text-[rgb(var(--neg-ink))]">*</span>
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium">Unit</th>
                <th className="px-3 py-2 text-left text-xs font-medium">
                  Rate (₹) <span className="text-[rgb(var(--neg-ink))]">*</span>
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium">Disc %</th>
                <th className="px-3 py-2 text-left text-xs font-medium">Tax %</th>
                <th className="px-3 py-2 text-right text-xs font-medium">Amount (₹)</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {formData.items.map((item, idx) => {
                const lineMaster = items.find((i) => String(i.id) === String(item.itemId));
                const lineTracked = isTracked(lineMaster);
                const lineBatches = lineTracked ? batchesForItem(db, currentCompany.id, item.itemId) : [];
                return (
                <React.Fragment key={idx}>
                <tr className="border-t" data-line-row={idx}>
                  <td className="ui-col-meta px-3 py-2">
                    <ItemPicker
                      db={db}
                      setDb={setDb}
                      currentCompany={currentCompany}
                      value={item.itemId}
                      onChange={(itemId, picked) => updateItem(idx, 'itemId', itemId, picked)}
                      label={null}
                      autoFocus={idx === focusRowIndex}
                    />
                    {/*
                      Stock, the moment the item is chosen. Only for goods —
                      a service has no shelf — and only once a line has an
                      item on it.
                    */}
                    {item.itemId && lineMaster && isStockItem(lineMaster) ? (() => {
                      const available = Number(availableByItemId.get(String(item.itemId)) ?? 0);
                      const wanted = Number(item.quantity ?? 0);
                      const short = Number.isFinite(wanted) && wanted > available;
                      const unit = String(lineMaster.unit || '').trim();
                      return (
                        <p
                          className="ui-caption mt-1"
                          style={short ? { color: 'rgb(var(--neg))' } : undefined}
                        >
                          {short
                            ? `Only ${available}${unit ? ` ${unit}` : ''} in stock — short by ${round2(wanted - available)}`
                            : `In stock: ${available}${unit ? ` ${unit}` : ''}`}
                        </p>
                      );
                    })() : null}
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={item.description}
                      onChange={(e) => updateItem(idx, 'description', e.target.value)}
                      className="ui-input w-full px-2 py-1"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      value={item.quantity}
                      onChange={(e) => updateItem(idx, 'quantity', e.target.value)}
                      className="ui-input w-20 px-2 py-1"
                      min="1"
                    />
                  </td>
                  <td className="px-3 py-2">
                    {/* The unit belongs to the item, so it is shown rather than
                        asked for. Typing it per line is how two lines of the
                        same item end up billed in different units. */}
                    <span className="text-sm ui-muted">{String(lineMaster?.unit || '').trim() || '—'}</span>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      value={item.rate}
                      onChange={(e) => updateItem(idx, 'rate', e.target.value)}
                      className="ui-input w-24 px-2 py-1"
                      min="0"
                      step="0.01"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      value={item.discountPct || ''}
                      onChange={(e) => updateItem(idx, 'discountPct', e.target.value)}
                      className="ui-input w-16 px-2 py-1"
                      min="0"
                      max="100"
                      step="0.01"
                      placeholder="0"
                    />
                  </td>
                  <td className="px-3 py-2">
                    {prefOn('lineTaxEditable') ? (
                      <select
                        value={String(item.gstRate ?? 0)}
                        onChange={(e) => updateItem(idx, 'gstRate', e.target.value)}
                        className="ui-select w-20 px-2 py-1"
                        aria-label={`GST rate for line ${idx + 1}`}
                      >
                        {[0, 0.1, 0.25, 1, 1.5, 3, 5, 6, 7.5, 12, 18, 28].map((r) => (
                          <option key={r} value={r}>
                            {r}%
                          </option>
                        ))}
                      </select>
                    ) : (
                      // A value, not a disabled control: the rate comes from the
                      // item master, and a greyed-out box invites a fight with a
                      // field that will not move.
                      <span className="text-sm">{Number(item.gstRate ?? 0)}%</span>
                    )}
                  </td>
                  <td className="ui-col-amount px-3 py-2 font-semibold">{formatMoney((computed.lines[idx]?.lineTotal ?? item.lineTotal) || 0, currentCompany)}</td>
                  <td className="px-3 py-2">
                    <button type="button" onClick={() => removeItem(idx)} className="text-[rgb(var(--neg))] hover:text-[rgb(var(--neg))]">
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
                {lineTracked ? (
                  <tr className="border-t-0">
                    <td colSpan={9} className="px-3 pb-2 pt-0">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="ui-muted font-medium">Batch:</span>
                        <select
                          value={item.batchId || ''}
                          onChange={(e) => {
                            const b = lineBatches.find((x) => String(x.id) === e.target.value);
                            updateItem(idx, 'batchId', e.target.value);
                            updateItem(idx, 'batchNo', b ? b.batchNo : '');
                          }}
                          className="ui-select ui-btn-sm w-72 px-2 text-xs"
                        >
                          <option value="">Select batch (FEFO order)</option>
                          {lineBatches.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.batchNo} — {b.remaining} left{b.expiryDate ? ` · exp ${b.expiryDate}` : ''}
                            </option>
                          ))}
                        </select>
                        {lineBatches.length === 0 ? <span className="text-[rgb(var(--warn-ink))]">No batches in stock — receive via a bill first.</span> : null}
                      </div>
                    </td>
                  </tr>
                ) : null}
                </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-2 flex items-center gap-3">
          <button type="button" onClick={addItem} className="ui-btn ui-btn-secondary">
            <Plus size={15} aria-hidden="true" /> Add Item
          </button>
          <span className="ui-subtle text-xs">or press Tab in the last field of the last row</span>
          <FieldError error={fieldErrors.error('items')} id={fieldErrors.errorId('items')} />
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="space-y-3">
            {prefOn('invoiceDiscount') || Number(formData.invoiceDiscountValue) > 0 ? (
            <div>
              <label className="block text-xs ui-muted mb-1">Invoice discount</label>
              <div className="flex items-center gap-2">
                <select
                  value={formData.invoiceDiscountType}
                  onChange={(e) => setFormData((p) => ({ ...p, invoiceDiscountType: e.target.value }))}
                  className="ui-select !h-9 w-20 px-2 text-sm"
                >
                  <option value="pct">%</option>
                  <option value="amt">₹</option>
                </select>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.invoiceDiscountValue}
                  onChange={(e) => setFormData((p) => ({ ...p, invoiceDiscountValue: e.target.value }))}
                  className="ui-input !h-9 w-28 px-2 text-sm"
                  placeholder="0"
                />
                {computed.invoiceDiscount > 0 ? (
                  <span className="ui-caption">− {formatMoney(computed.invoiceDiscount, currentCompany)} across lines</span>
                ) : null}
              </div>
            </div>
            ) : null}
            {prefOn('otherCharges') || (formData.otherCharges || []).length > 0 ? (
            <div>
              <label className="block text-xs ui-muted mb-1">Other charges (transport, reimbursement…)</label>
              {(formData.otherCharges || []).map((c, ci) => (
                <div key={ci} className="mb-1.5 flex items-center gap-2">
                  <input
                    type="text"
                    value={c.label}
                    onChange={(e) =>
                      setFormData((p) => ({
                        ...p,
                        otherCharges: p.otherCharges.map((x, i) => (i === ci ? { ...x, label: e.target.value } : x)),
                      }))
                    }
                    className="ui-input !h-9 flex-1 px-2 text-sm"
                    placeholder="Transport"
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={c.amount}
                    onChange={(e) =>
                      setFormData((p) => ({
                        ...p,
                        otherCharges: p.otherCharges.map((x, i) => (i === ci ? { ...x, amount: e.target.value } : x)),
                      }))
                    }
                    className="ui-input !h-9 w-24 px-2 text-sm"
                    placeholder="Amount"
                  />
                  <select
                    value={c.gstRate}
                    onChange={(e) =>
                      setFormData((p) => ({
                        ...p,
                        otherCharges: p.otherCharges.map((x, i) => (i === ci ? { ...x, gstRate: e.target.value } : x)),
                      }))
                    }
                    className="ui-select !h-9 w-24 px-2 text-sm"
                  >
                    {[0, 5, 12, 18, 28].map((r) => (
                      <option key={r} value={r}>GST {r}%</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setFormData((p) => ({ ...p, otherCharges: p.otherCharges.filter((_, i) => i !== ci) }))}
                    className="ui-icon-btn ui-btn-sm !w-8"
                    aria-label="Remove charge"
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setFormData((p) => ({ ...p, otherCharges: [...(p.otherCharges || []), { label: '', amount: '', gstRate: 0 }] }))}
                className="ui-btn ui-btn-secondary ui-btn-sm text-xs"
              >
                + Add charge
              </button>
            </div>
            ) : null}

            {prefOn('paymentTerms') ? (
              <div>
                <label htmlFor="invoice-terms" className="block text-xs ui-muted mb-1">
                  Payment Terms
                </label>
                <select
                  id="invoice-terms"
                  value={String(formData.paymentTermDays ?? '')}
                  onChange={(e) => {
                    const raw = e.target.value;
                    setFormData((prev) => {
                      const days = raw === '' ? '' : Number(raw);
                      // The terms are what the date follows, so changing them
                      // moves the due date — otherwise the two disagree on
                      // screen and the server's answer arrives as a surprise.
                      const nextDue =
                        raw !== '' && prefOn('dueDateFromTerms')
                          ? addDays(prev.date, days) || prev.dueDate
                          : prev.dueDate;
                      return { ...prev, paymentTermDays: days, dueDate: nextDue };
                    });
                  }}
                  className="ui-select w-full px-3 py-2"
                >
                  <option value="">
                    {selectedCustomer ? `From the customer — ${termsLabel(selectedCustomer)}` : 'From the customer'}
                  </option>
                  <option value="0">Due on receipt</option>
                  <option value="7">Net 7</option>
                  <option value="15">Net 15</option>
                  <option value="30">Net 30</option>
                  <option value="45">Net 45</option>
                  <option value="60">Net 60</option>
                  <option value="90">Net 90</option>
                </select>
              </div>
            ) : null}

            {prefOn('notes') ? (
              <div>
                <label htmlFor="invoice-notes" className="block text-xs ui-muted mb-1">
                  Notes
                </label>
                <textarea
                  id="invoice-notes"
                  value={formData.notesText}
                  onChange={(e) => setFormData((p) => ({ ...p, notesText: e.target.value }))}
                  rows={3}
                  className="ui-input w-full px-3 py-2"
                  placeholder="Enter notes here…"
                />
              </div>
            ) : null}

            {customFields.some((f) => f.formPlacement === 'notes') ? (
              <div className="grid gap-3 sm:grid-cols-2">{renderCustomFields('notes')}</div>
            ) : null}
          </div>
          <div className="flex justify-end">
            <div className="w-64 space-y-2">
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span>{formatMoney(computed.subtotal, currentCompany)}</span>
            </div>
            {computed.invoiceDiscount > 0 ? (
              <div className="flex justify-between">
                <span>Discount:</span>
                <span className="text-[rgb(var(--neg-ink))]">− {formatMoney(computed.invoiceDiscount, currentCompany)}</span>
              </div>
            ) : null}
            {computed.invoiceDiscount > 0 || computed.otherChargesTotal > 0 ? (
              <div className="flex justify-between">
                <span>Taxable Amount:</span>
                <span>{formatMoney(computed.subtotal - computed.invoiceDiscount + computed.otherChargesTotal, currentCompany)}</span>
              </div>
            ) : null}
            {computed.otherChargesTotal > 0 ? (
              <div className="flex justify-between">
                <span>Other charges:</span>
                <span>{formatMoney(computed.otherChargesTotal, currentCompany)}</span>
              </div>
            ) : null}
            {isIntra ? (
              <>
                <div className="flex justify-between">
                  <span>CGST:</span>
                  <span>{formatMoney(computed.cgstTotal, currentCompany)}</span>
                </div>
                <div className="flex justify-between">
                  <span>SGST:</span>
                  <span>{formatMoney(computed.sgstTotal, currentCompany)}</span>
                </div>
              </>
            ) : (
              <div className="flex justify-between">
                <span>IGST:</span>
                <span>{formatMoney(computed.igstTotal, currentCompany)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-lg border-t pt-2">
              <span>Total:</span>
              <span>{formatMoney(computed.total, currentCompany)}</span>
            </div>
            </div>
          </div>
        </div>
      </div>

      {prefOn('amountInWords') ? (
        <AmountInWordsBand
          words={amountInWordsInr(computed.total)}
          amount={formatMoney(computed.total, currentCompany)}
        />
      ) : null}

      <DocFormFootnote
        declaration={
          prefOn('declaration')
            ? String(invoiceDocSettings?.templates?.invoice?.declarationText || '').trim() ||
              'We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.'
            : ''
        }
      />

      {/* The figure and the one action, kept on screen while the lines are
          typed. What the customer already owes sits here too, because the
          moment to see it is before more credit is extended, not after. */}
      <div className="ui-entry-summary">
        <span className="ui-t-label">Total</span>
        <span className="fig text-lg">{formatMoney(computed.total, currentCompany)}</span>
        <span className="ui-caption">
          {formData.items.filter((l) => String(l.itemId || '').trim()).length} line(s)
          {computed.gstTotal > 0 ? ` · ${formatMoney(computed.gstTotal, currentCompany)} GST` : ''}
        </span>
        {customerOutstanding > 0 ? (
          <span className="ui-caption">
            {getCustomerDisplayName(customer) || 'This customer'} owes{' '}
            <span className="fig">{formatMoney(customerOutstanding, currentCompany)}</span> already
          </span>
        ) : null}
        <FieldErrorSummary errors={fieldErrors.errors} />
      </div>
    </form>
  );
};

export const EstimateForm = ({ db, setDb, currentCompany, initialData = null, onClose }) => {
  const isEdit = Boolean(initialData && (initialData.id !== undefined && initialData.id !== null));
  const activeBranchId = String(localStorage.getItem('activeBranchId') || localStorage.getItem('branchId') || '').trim();
  const estimateDocSettings = getDocSettings(db, currentCompany, { branchId: activeBranchId || null });
  const estimateNumbering = estimateDocSettings?.numbering?.estimate;
  const isEstimateAuto = String(estimateNumbering?.mode || '').toLowerCase() === 'auto';
  const lockEstimateNumberOnCreate = !isEdit && isEstimateAuto && !estimateNumbering?.allowManualOverride;
  const generatedEstimateNumber = !isEdit
    ? nextFreeVoucherNumber({db, company: currentCompany, voucherKey: 'estimate', branchId: activeBranchId || null, takenNumbers: (db.estimates || []).filter((x) => x.companyId === currentCompany.id).map((x) => String(x.number || '').trim()) })
    : '';

  const [formData, setFormData] = useState(() => {
    const defaultDate = todayIso();
    const defaultDueDate = plusDaysIso(30);

    const normalizedItems = Array.isArray(initialData?.items)
      ? initialData.items.map((it) => {
          const quantity = Number(it.quantity ?? 1);
          const rate = Number(it.rate ?? 0);
          const gstRate = Number(it.gstRate ?? 0);
          const amount = Number(it.amount ?? quantity * rate);
          return {
            itemId: it.itemId !== undefined && it.itemId !== null && it.itemId !== '' ? String(it.itemId) : '',
            description: it.description ?? '',
            quantity: Number.isFinite(quantity) ? quantity : 1,
            rate: Number.isFinite(rate) ? rate : 0,
            gstRate: Number.isFinite(gstRate) ? gstRate : 0,
            hsnSac: it.hsnSac || '',
            amount: Number.isFinite(amount) ? amount : 0,
          };
        })
      : [{ itemId: '', description: '', quantity: 1, rate: 0, gstRate: 0, hsnSac: '', amount: 0 }];

    const nextNumber = isEdit
      ? String(initialData?.number || '')
      : String(generatedEstimateNumber || `EST-${Date.now()}`);

    return {
      number: nextNumber,
      date: initialData?.date || defaultDate,
      dueDate: initialData?.dueDate || defaultDueDate,
      customerId: initialData?.customerId !== undefined && initialData?.customerId !== null ? String(initialData.customerId) : '',
      salesmanId: initialData?.salesmanId ?? '',
      items: normalizedItems,
    };
  });

  const customers = db.customers.filter((c) => c.companyId === currentCompany.id);
  const itemsMaster = db.items.filter((i) => i.companyId === currentCompany.id);

  const { state: companyState } = getCompanyGstProfile(currentCompany);
  const selectedCustomer = formData.customerId
    ? customers.find((c) => c.id === parseInt(formData.customerId))
    : null;
  const { state: customerState, gstin: customerGstin } = getPartyGstProfile(selectedCustomer);
  const isIntra = isIntraStateSupply({ companyState, partyState: customerState });

  const addItem = () => {
    setFormData({
      ...formData,
      items: [...formData.items, { itemId: '', description: '', quantity: 1, rate: 0, gstRate: 0, hsnSac: '', amount: 0 }],
    });
  };

  const updateItem = (index, field, value, pickedItem = null) => {
    const newItems = [...formData.items];

    if (field === 'itemId') {
      const item = pickedItem || itemsMaster.find((i) => i.id === parseInt(value));
      if (item) {
        newItems[index] = {
          ...newItems[index],
          itemId: value,
          description: item.name,
          rate: item.salePrice,
          gstRate: Number(item.gstRate ?? 0),
          hsnSac: item.hsnSac || '',
        };
      }
    } else {
      newItems[index][field] = value;
    }

    if (field === 'quantity' || field === 'rate' || field === 'gstRate' || field === 'itemId' || field === 'discountPct') {
      const computed = computeGstForLine({
        quantity: Number(newItems[index].quantity ?? 1),
        rate: Number(newItems[index].rate ?? 0),
        gstRate: Number(newItems[index].gstRate ?? 0),
        isIntra,
        discountPct: Number(newItems[index].discountPct ?? 0),
      });
      newItems[index].amount = computed.taxableAmount;
      newItems[index].taxableAmount = computed.taxableAmount;
      newItems[index].gstAmount = computed.gstAmount;
      newItems[index].cgstAmount = computed.cgstAmount;
      newItems[index].sgstAmount = computed.sgstAmount;
      newItems[index].igstAmount = computed.igstAmount;
      newItems[index].lineTotal = computed.lineTotal;
      newItems[index].taxType = computed.taxType;
    }

    setFormData({ ...formData, items: newItems });
  };

  const removeItem = (index) => {
    setFormData({
      ...formData,
      items: formData.items.filter((_, i) => i !== index),
    });
  };

  const computed = computeGstForLines({ lines: formData.items, isIntra });

  const handleSubmit = async (e) => {
    e.preventDefault();

    let estimateNumber = String(formData.number || '').trim();
    if (isEstimateAuto && lockEstimateNumberOnCreate) estimateNumber = String(generatedEstimateNumber || '').trim();
    if (!isEdit && isEstimateAuto && !estimateNumber) estimateNumber = String(generatedEstimateNumber || '').trim();
    if (!estimateNumber) {
      notify.error('Estimate number is required');
      return;
    }

    const estimateNumberClash = db.estimates.some(
      (est) =>
        est.companyId === currentCompany.id &&
        String(est.number || '').trim() === estimateNumber &&
        (!isEdit || est.id !== initialData?.id)
    );
    if (estimateNumberClash) {
      notify.error('Estimate number already exists. Please change the number or update numbering settings in Company Profile.');
      return;
    }

    if (!formData.customerId) {
      notify.error('Customer is required');
      return;
    }

    if (!companyState) {
      notify.error('Please set Company State in Company Profile before creating GST estimates.');
      return;
    }

    const hasMissingItem = (formData.items || []).some((l) => !String(l.itemId || '').trim());
    if (hasMissingItem) {
      notify.error('Please select an Item for every line. Items are mandatory for GST.');
      return;
    }

    const customer = customers.find((c) => c.id === parseInt(formData.customerId));

    const nextEstimateCore = {
      number: estimateNumber,
      date: formData.date,
      dueDate: formData.dueDate,
      customerId: formData.customerId,
      salesmanId: formData.salesmanId || '',
      customerName: getCustomerDisplayName(customer),
      customerGstin: customerGstin,
      placeOfSupplyState: customerState,
      taxType: isIntra ? 'CGST_SGST' : 'IGST',
      items: computed.lines,
      subtotal: computed.subtotal,
      cgstTotal: computed.cgstTotal,
      sgstTotal: computed.sgstTotal,
      igstTotal: computed.igstTotal,
      gstTotal: computed.gstTotal,
      total: computed.total,
    };

    if (isEdit) {
      const updatedAt = new Date().toISOString();
      setDb({
        ...db,
        estimates: db.estimates.map((est) =>
          est.id === initialData.id
            ? {
                ...est,
                ...nextEstimateCore,
                status: est.status || initialData?.status || 'Draft',
                updatedAt,
              }
            : est
        ),
      });
      onClose?.();
      notify.success('Estimate updated successfully!');
      return;
    }

    // Survives the browser: estimates are quote-stage (no ledger posting),
    // but they still belong on the server, not in this profile's storage.
    let backendDocId = null;
    let serverNumber = '';
    if (hasDocsApiSession()) {
      try {
        const saved = await createDocApi('estimate', {
          number: estimateNumber || undefined,
          date: nextEstimateCore.date,
          validUntil: nextEstimateCore.validUntil || null,
          partyName: nextEstimateCore.customerName || 'Customer',
          subtotal: Number(nextEstimateCore.subtotal || 0),
          gstTotal: Number(nextEstimateCore.gstTotal || 0),
          total: Number(nextEstimateCore.total || 0),
          status: 'Draft',
          items: nextEstimateCore.items || [],
                  salesmanId: formData.salesmanId || undefined,
});
        backendDocId = saved?.id || null;
        serverNumber = String(saved?.number || '');
      } catch (err) {
        notify.error(String(err?.message || 'Estimate not saved to the server.'));
        return;
      }
    }

    const newEstimate = {
      id: getNextNumericId(db.estimates),
      companyId: currentCompany.id,
      ...nextEstimateCore,
      ...(serverNumber ? { number: serverNumber } : {}),
      backendDocId,
      status: 'Draft',
      createdAt: new Date().toISOString(),
    };

    setDb({
      ...db,
      estimates: [...db.estimates, newEstimate],
      companies: bumpCompanyNextNumber({ db, companyId: currentCompany.id, voucherKey: 'estimate', usedNumber: estimateNumber, branchId: activeBranchId || null }),
    });
    onClose?.();
    notify.success('Estimate created successfully!');
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <DocFormActions primaryLabel={isEdit ? 'Update Estimate' : 'Create Estimate'} />

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Estimate Number</label>
          <input
            type="text"
            value={formData.number}
            onChange={(e) => setFormData({ ...formData, number: e.target.value })}
            className={`w-full px-3 py-2 border rounded-lg ${lockEstimateNumberOnCreate ? 'ui-sunken' : ''}`}
            disabled={lockEstimateNumberOnCreate}
            required
          />
        </div>
        <div>
          <CustomerPicker
            db={db}
            setDb={setDb}
            currentCompany={currentCompany}
            value={formData.customerId}
            onChange={(customerId) => setFormData((prev) => ({ ...prev, customerId }))}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Estimate Date</label>
          <input
            type="date"
            value={formData.date}
            onChange={(e) => setFormData({ ...formData, date: e.target.value })}
            className="ui-input"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Due Date</label>
          <input
            type="date"
            value={formData.dueDate}
            onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
            className="ui-input"
            required
          />
        </div>
        {(db.salesmen || []).some((sm) => sm.companyId === currentCompany.id) ? (
          <div>
            <label className="block text-sm font-medium mb-1">Salesman</label>
            <select
              value={formData.salesmanId || ''}
              onChange={(e) => setFormData({ ...formData, salesmanId: e.target.value ? Number(e.target.value) : '' })}
              className="ui-select w-full px-3 py-2"
            >
              <option value="">— none —</option>
              {(db.salesmen || [])
                .filter((sm) => sm.companyId === currentCompany.id)
                .map((sm) => (
                  <option key={sm.id} value={sm.id}>{sm.name}</option>
                ))}
            </select>
          </div>
        ) : null}
      </div>

      <div>
        <div className="flex justify-between items-center mb-2">
          <label className="block text-sm font-medium">Line Items</label>
          <button type="button" onClick={addItem} className="ui-fg ui-hover-fg text-sm flex items-center gap-1">
            <Plus size={16} /> Add Item
          </button>
        </div>

        <div className="border rounded-lg overflow-hidden">
          <table className="ui-table w-full ui-table-wide">
            <thead className="ui-sunken">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium">Item</th>
                <th className="px-3 py-2 text-left text-xs font-medium">Description</th>
                <th className="px-3 py-2 text-left text-xs font-medium">Qty</th>
                <th className="px-3 py-2 text-left text-xs font-medium">Rate</th>
                <th className="px-3 py-2 text-left text-xs font-medium">Line Total</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {formData.items.map((item, idx) => (
                <tr key={idx} className="border-t">
                  <td className="ui-col-meta px-3 py-2">
                    <ItemPicker
                      db={db}
                      setDb={setDb}
                      currentCompany={currentCompany}
                      value={item.itemId}
                      onChange={(itemId, picked) => updateItem(idx, 'itemId', itemId, picked)}
                      label={null}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={item.description}
                      onChange={(e) => updateItem(idx, 'description', e.target.value)}
                      className="ui-input w-full px-2 py-1"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      value={item.quantity}
                      onChange={(e) => updateItem(idx, 'quantity', e.target.value)}
                      className="ui-input w-20 px-2 py-1"
                      min="1"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      value={item.rate}
                      onChange={(e) => updateItem(idx, 'rate', e.target.value)}
                      className="ui-input w-24 px-2 py-1"
                      min="0"
                      step="0.01"
                    />
                  </td>
                  <td className="ui-col-amount px-3 py-2 font-semibold">{formatMoney((computed.lines[idx]?.lineTotal ?? item.lineTotal) || 0, currentCompany)}</td>
                  <td className="px-3 py-2">
                    <button type="button" onClick={() => removeItem(idx)} className="text-[rgb(var(--neg))] hover:text-[rgb(var(--neg))]">
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex justify-end">
          <div className="w-64 space-y-2">
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span>{formatMoney(computed.subtotal, currentCompany)}</span>
            </div>
            {isIntra ? (
              <>
                <div className="flex justify-between">
                  <span>CGST:</span>
                  <span>{formatMoney(computed.cgstTotal, currentCompany)}</span>
                </div>
                <div className="flex justify-between">
                  <span>SGST:</span>
                  <span>{formatMoney(computed.sgstTotal, currentCompany)}</span>
                </div>
              </>
            ) : (
              <div className="flex justify-between">
                <span>IGST:</span>
                <span>{formatMoney(computed.igstTotal, currentCompany)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-lg border-t pt-2">
              <span>Total:</span>
              <span>{formatMoney(computed.total, currentCompany)}</span>
            </div>
          </div>
        </div>
      </div>

      <AmountInWordsBand
        words={amountInWordsInr(computed.total)}
        amount={formatMoney(computed.total, currentCompany)}
      />

      <DocFormFootnote />
    </form>
  );
};

export const CreditNoteForm = ({ db, setDb, currentCompany, initialOriginalInvoiceId, onClose, warehouses = [], defaultWarehouseId = '' }) => {
  const companyInvoices = db.invoices.filter((i) => i.companyId === currentCompany.id);
  const customers = db.customers.filter((c) => c.companyId === currentCompany.id);
  const itemsMaster = db.items.filter((i) => i.companyId === currentCompany.id);

  const { state: companyState } = getCompanyGstProfile(currentCompany);

  const activeBranchId = String(localStorage.getItem('activeBranchId') || localStorage.getItem('branchId') || '').trim();
  const resolveBranchIdFromWarehouseId = (warehouseId) => {
    const wid = String(warehouseId || '').trim();
    if (!wid) return activeBranchId || '';
    const w = (Array.isArray(warehouses) ? warehouses : []).find((x) => String(x?.id || '').trim() === wid) || null;
    return String(w?.branchId || '').trim() || activeBranchId || '';
  };

  const initWarehouseId = String(defaultWarehouseId || '').trim();
  const initBranchId = resolveBranchIdFromWarehouseId(initWarehouseId) || '';
  const creditDocSettingsInit = getDocSettings(db, currentCompany, { branchId: initBranchId || null });
  const creditNumberingInit = creditDocSettingsInit?.numbering?.creditNote;
  const isCreditAutoInit = String(creditNumberingInit?.mode || '').toLowerCase() === 'auto';

  const [formData, setFormData] = useState({
    number: isCreditAutoInit ? nextFreeVoucherNumber({db, company: currentCompany, voucherKey: 'creditNote', branchId: initBranchId || null, takenNumbers: (db.creditNotes || []).filter((x) => x.companyId === currentCompany.id).map((x) => String(x.number || '').trim()) }) || '' : '',
    date: new Date().toISOString().split('T')[0],
    originalInvoiceId: '',
    customerId: '',
    warehouseId: String(defaultWarehouseId || '').trim(),
    items: [{ itemId: '', description: '', quantity: 1, rate: 0, gstRate: 0, hsnSac: '', amount: 0 }],
  });

  const branchIdForNumbering = resolveBranchIdFromWarehouseId(formData.warehouseId) || null;
  const creditDocSettings = getDocSettings(db, currentCompany, { branchId: branchIdForNumbering });
  const creditNumbering = creditDocSettings?.numbering?.creditNote;
  const isCreditAuto = String(creditNumbering?.mode || '').toLowerCase() === 'auto';
  const lockCreditNumber = isCreditAuto && !creditNumbering?.allowManualOverride;
  const generatedCreditNumber = nextFreeVoucherNumber({db, company: currentCompany, voucherKey: 'creditNote', branchId: branchIdForNumbering, takenNumbers: (db.creditNotes || []).filter((x) => x.companyId === currentCompany.id).map((x) => String(x.number || '').trim()) });

  const warehouseOptions = useMemo(() => {
    const list = Array.isArray(warehouses) ? warehouses : [];
    return list.slice().sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')));
  }, [warehouses]);

  /**
   * Goods come back in a heap that no single invoice accounts for. Rather than
   * make a clerk guess which one, the note is raised on account: the value
   * waits on the customer's ledger until it is knocked off.
   */
  const [onAccountMode, setOnAccountMode] = useState(false);
  const invoicesForCustomer = useMemo(() => {
    const customerId = String(formData.customerId || '').trim();
    if (!customerId) return [];
    return companyInvoices
      .filter((i) => String(i.customerId ?? '') === customerId)
      .filter((i) => String(i.status || '').toLowerCase() !== 'cancelled')
      .slice()
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyInvoices.length, formData.customerId]);

  const toggleOnAccount = (next) => {
    setOnAccountMode(next);
    setFormData((prev) => ({
      ...prev,
      originalInvoiceId: next ? '' : prev.originalInvoiceId,
      invoiceIds: next ? prev.invoiceIds || [] : [],
    }));
  };

  const [originalInvoiceQuery, setOriginalInvoiceQuery] = useState('');

  const selectedCustomer = formData.customerId ? customers.find((c) => c.id === parseInt(formData.customerId)) : null;
  const { state: customerState, gstin: customerGstin } = getPartyGstProfile(selectedCustomer);
  const isIntra = isIntraStateSupply({ companyState, partyState: customerState });
  const computed = computeGstForLines({ lines: formData.items, isIntra });

  const addItem = () => {
    setFormData({
      ...formData,
      items: [...formData.items, { itemId: '', description: '', quantity: 1, rate: 0, gstRate: 0, hsnSac: '', amount: 0 }],
    });
  };

  const updateItem = (index, field, value, pickedItem = null) => {
    const newItems = [...formData.items];

    if (field === 'itemId') {
      const item = pickedItem || itemsMaster.find((i) => i.id === parseInt(value));
      if (item) {
        newItems[index] = {
          ...newItems[index],
          itemId: value,
          description: item.name,
          rate: item.salePrice,
          gstRate: Number(item.gstRate ?? 0),
          hsnSac: item.hsnSac || '',
        };
      }
    } else {
      newItems[index][field] = value;
    }

    if (field === 'quantity' || field === 'rate' || field === 'gstRate' || field === 'itemId') {
      const computedLine = computeGstForLine({
        quantity: Number(newItems[index].quantity ?? 1),
        rate: Number(newItems[index].rate ?? 0),
        gstRate: Number(newItems[index].gstRate ?? 0),
        isIntra,
      });
      newItems[index].amount = computedLine.taxableAmount;
      newItems[index].taxableAmount = computedLine.taxableAmount;
      newItems[index].gstAmount = computedLine.gstAmount;
      newItems[index].cgstAmount = computedLine.cgstAmount;
      newItems[index].sgstAmount = computedLine.sgstAmount;
      newItems[index].igstAmount = computedLine.igstAmount;
      newItems[index].lineTotal = computedLine.lineTotal;
      newItems[index].taxType = computedLine.taxType;
    }

    setFormData({ ...formData, items: newItems });
  };

  const removeItem = (index) => {
    setFormData({
      ...formData,
      items: formData.items.filter((_, i) => i !== index),
    });
  };

  const onSelectOriginalInvoice = (invoiceIdValue) => {
    const invoiceId = parseInt(invoiceIdValue);
    const inv = companyInvoices.find((i) => i.id === invoiceId);

    if (!inv) {
      setFormData({
        ...formData,
        originalInvoiceId: '',
        customerId: '',
        warehouseId: String(defaultWarehouseId || '').trim(),
        items: [{ itemId: '', description: '', quantity: 1, rate: 0, gstRate: 0, hsnSac: '', amount: 0 }],
      });
      return;
    }

    // Only what has not come back already. A line returned in full is gone
    // from the list; a line half returned offers the other half.
    const state = returnableLines(inv, db.creditNotes || [], 'originalInvoiceId');

    if (state.fullyReturned) {
      notify.error(`${inv.number} has already been fully returned — there is nothing left to credit.`);
      return;
    }

    const copiedItems = state.open.map((line) => {
      const qty = Number(line.remainingQty) || 0;
      const rate = parseFloat(line.rate || 0) || 0;
      const gstRate = parseFloat(line.gstRate || 0);
      return {
        itemId: line.itemId || '',
        description: line.description || '',
        quantity: qty,
        maxQuantity: qty,
        rate,
        gstRate: Number.isFinite(gstRate) ? gstRate : 0,
        hsnSac: line.hsnSac || '',
        amount: qty * rate,
      };
    });

    if (state.partlyReturned) {
      notify.info(`${inv.number} was partly returned already — only the quantities still open are shown.`);
    }

    setFormData({
      ...formData,
      originalInvoiceId: invoiceIdValue,
      customerId: String(inv.customerId || ''),
      warehouseId: String(inv?.warehouseId || formData.warehouseId || defaultWarehouseId || '').trim(),
      items: copiedItems.length
        ? copiedItems
        : [{ itemId: '', description: '', quantity: 1, rate: 0, gstRate: 0, hsnSac: '', amount: 0 }],
    });

    setOriginalInvoiceQuery(String(inv.number || ''));
  };

  useEffect(() => {
    if (!initialOriginalInvoiceId) return;
    const nextId = String(initialOriginalInvoiceId);
    if (!nextId || nextId === String(formData.originalInvoiceId || '')) return;
    onSelectOriginalInvoice(nextId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialOriginalInvoiceId, companyInvoices.length]);

  const onOriginalInvoiceQueryChange = (nextQuery) => {
    const cleaned = String(nextQuery || '').trim();
    setOriginalInvoiceQuery(cleaned);

    const matched = companyInvoices.find(
      (inv) => String(inv.number || '').trim().toLowerCase() === cleaned.toLowerCase()
    );

    if (matched) {
      onSelectOriginalInvoice(String(matched.id));
      return;
    }

    if (String(formData.originalInvoiceId || '').trim()) {
      setFormData((prev) => ({ ...prev, originalInvoiceId: '' }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    let creditNumber = String(formData.number || '').trim();
    if (isCreditAuto) {
      if (lockCreditNumber) creditNumber = String(generatedCreditNumber || '').trim();
      else if (!creditNumber) creditNumber = String(generatedCreditNumber || '').trim();
    }
    if (!creditNumber) {
      notify.error('Credit note number is required');
      return;
    }

    const creditNumberClash = db.creditNotes.some((cn) => cn.companyId === currentCompany.id && String(cn.number || '').trim() === creditNumber);
    if (creditNumberClash) {
      notify.error('Credit note number already exists. Please change the number or update numbering settings in Company Profile.');
      return;
    }

    const originalInvoice = companyInvoices.find((i) => i.id === parseInt(formData.originalInvoiceId));
    if (!onAccountMode && !originalInvoice) {
      notify.error('Please select the original invoice');
      return;
    }
    if (onAccountMode && !(formData.invoiceIds || []).length) {
      notify.error('Tick the invoices this return covers.');
      return;
    }

    if (!String(formData.warehouseId || '').trim()) {
      notify.error('Warehouse is required');
      return;
    }

    if (!formData.customerId) {
      notify.error('Customer is required');
      return;
    }

    // The prefill can be typed over, so the rule is enforced here too: nothing
    // may come back that was not sold, or that has come back already.
    // On account there is no single invoice to check against; the knock-offs
    // are what keep that note honest instead.
    const returnState = onAccountMode
      ? { fullyReturned: false, lines: [] }
      : returnableLines(originalInvoice, db.creditNotes || [], 'originalInvoiceId');
    if (returnState.fullyReturned) {
      notify.error(`${originalInvoice.number} has already been fully returned.`);
      return;
    }
    const remainingByItem = new Map(returnState.lines.map((l) => [String(l.itemId), l.remainingQty]));
    for (const line of onAccountMode ? [] : formData.items || []) {
      const key = String(line.itemId || '');
      if (!key) continue;
      const want = Number(line.quantity) || 0;
      if (want <= 0) continue;
      const canReturn = remainingByItem.get(key);
      if (canReturn === undefined) {
        notify.error(`${line.description || `Item ${key}`} is not on ${originalInvoice.number}.`);
        return;
      }
      if (want > canReturn + 0.0001) {
        notify.error(
          canReturn <= 0
            ? `${line.description || `Item ${key}`} has already been returned in full.`
            : `Only ${canReturn} of ${line.description || `item ${key}`} is still open to return.`
        );
        return;
      }
    }

    if (!companyState) {
      notify.error('Please set Company State in Company Profile before creating GST credit notes.');
      return;
    }

    const customerIsRegistered = String(selectedCustomer?.gstRegistration || '').trim().toLowerCase() === 'registered';
    if (customerIsRegistered && !canDetermineSupplyType({ companyState, partyState: customerState })) {
      notify.error('Cannot determine Place of Supply for this registered customer. Please set customer state/address before creating GST credit notes.');
      return;
    }

    const hasMissingItem = (formData.items || []).some((l) => !String(l.itemId || '').trim());
    if (hasMissingItem) {
      notify.error('Please select an Item for every line. Items are mandatory for GST.');
      return;
    }

    const customer = customers.find((c) => c.id === parseInt(formData.customerId));

    // Server first: a credit note reverses booked revenue, so it must reach
    // the books. The local copy mirrors it for the UI.
    let backendDocId = null;
    let serverNumber = '';
    if (hasDocsApiSession()) {
      try {
        const saved = await createDocApi('creditNote', {
          number: creditNumber || undefined,
          date: formData.date,
          againstDocId: originalInvoice?.backendInvoiceId ? String(originalInvoice.backendInvoiceId) : null,
          partyId: customer?.backendPartyId ? String(customer.backendPartyId) : null,
          partyName: getCustomerDisplayName(customer) || originalInvoice.customerName || '',
          partyGstin: customerGstin || null,
          placeOfSupplyState: customerState || null,
          taxType: isIntra ? 'CGST_SGST' : 'IGST',
          subtotal: computed.subtotal,
          cgstTotal: computed.cgstTotal,
          sgstTotal: computed.sgstTotal,
          igstTotal: computed.igstTotal,
          gstTotal: computed.gstTotal,
          total: computed.total,
          status: 'Open',
          items: computed.lines,
        });
        backendDocId = saved?.id || null;
        serverNumber = String(saved?.number || '');
      } catch (err) {
        notify.error(String(err?.message || 'Credit note not saved to the server.'));
        return;
      }
    }

    const newCreditNote = {
      id: getNextNumericId(db.creditNotes),
      companyId: currentCompany.id,
      backendDocId,
      number: serverNumber || creditNumber,
      date: formData.date,
      originalInvoiceId: onAccountMode ? null : originalInvoice.id,
      originalInvoiceNumber: onAccountMode ? '' : originalInvoice.number,
      // On account: the value waits on the customer's ledger until knocked off.
      settlementMode: onAccountMode ? 'ON_ACCOUNT' : 'DOCUMENT',
      invoiceIds: onAccountMode ? (formData.invoiceIds || []).map(String) : [],
      allocations: [],
      customerId: formData.customerId,
      warehouseId: String(formData.warehouseId || '').trim(),
      customerName: getCustomerDisplayName(customer) || originalInvoice?.customerName || '',
      customerGstin: customerGstin,
      placeOfSupplyState: customerState,
      taxType: isIntra ? 'CGST_SGST' : 'IGST',
      items: computed.lines,
      subtotal: computed.subtotal,
      cgstTotal: computed.cgstTotal,
      sgstTotal: computed.sgstTotal,
      igstTotal: computed.igstTotal,
      gstTotal: computed.gstTotal,
      total: computed.total,
      /**
       * Issued, not Draft.
       *
       * This was hardcoded to Draft, and the ledger — correctly — does not
       * post drafts. There is no action anywhere to take a credit note out of
       * draft and no status column to reveal it was in one, so every sales
       * return raised through this form was inert: the goods came back on the
       * stock report, the customer's account was never credited, the output
       * GST was never reversed, and the screen said "Credit note created
       * successfully!".
       *
       * An invoice raised from the equivalent button posts immediately. A
       * credit note is the same kind of act in the other direction, and the
       * form has one button whose meaning is "issue this".
       */
      status: 'Open',
      createdAt: new Date().toISOString(),
    };

    setDb({
      ...db,
      creditNotes: [...db.creditNotes, newCreditNote],
      companies: bumpCompanyNextNumber({ db, companyId: currentCompany.id, voucherKey: 'creditNote', usedNumber: creditNumber, branchId: branchIdForNumbering }),
    });
    onClose?.();
    notify.success('Credit note created successfully!');
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <DocFormActions primaryLabel="Create Credit Note" />

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Credit Note Number</label>
          <input
            type="text"
            value={formData.number}
            onChange={(e) => setFormData({ ...formData, number: e.target.value })}
            className={`w-full px-3 py-2 border rounded-lg ${lockCreditNumber ? 'ui-sunken' : ''}`}
            disabled={lockCreditNumber}
            required
          />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-sm font-medium">
              {onAccountMode ? 'Invoices this return covers' : 'Original Invoice #'}
            </label>
            <button
              type="button"
              onClick={() => toggleOnAccount(!onAccountMode)}
              className="text-xs underline ui-muted hover:ui-fg"
            >
              {onAccountMode ? 'Against a single invoice instead' : 'Goods from several invoices?'}
            </button>
          </div>

          {onAccountMode ? (
            <div className="space-y-2">
              <div className="border rounded-lg max-h-40 overflow-y-auto p-2 space-y-1">
                {invoicesForCustomer.length === 0 ? (
                  <div className="text-xs ui-muted px-1">Pick the customer first — their invoices will be listed here.</div>
                ) : (
                  invoicesForCustomer.map((inv) => (
                    <label key={inv.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        className="ui-checkbox"
                        checked={(formData.invoiceIds || []).some((id) => String(id) === String(inv.id))}
                        onChange={(e) =>
                          setFormData((prev) => {
                            const set = new Set((prev.invoiceIds || []).map(String));
                            if (e.target.checked) set.add(String(inv.id));
                            else set.delete(String(inv.id));
                            return { ...prev, invoiceIds: [...set] };
                          })
                        }
                      />
                      <span className="truncate">
                        {inv.number} · {inv.date} · {formatMoney(Number(inv.total || 0), currentCompany)}
                      </span>
                    </label>
                  ))
                )}
              </div>
              <div className="text-xs ui-muted">
                The value goes to the customer&apos;s ledger as unsettled, and you knock it off against their invoices
                later — from the Sales Returns list.
              </div>
            </div>
          ) : (
            <>
              <input
                type="text"
                value={originalInvoiceQuery}
                onChange={(e) => onOriginalInvoiceQueryChange(e.target.value)}
                onPaste={(e) => {
                  const pasted = e.clipboardData?.getData('text');
                  if (typeof pasted === 'string') onOriginalInvoiceQueryChange(pasted);
                }}
                onBlur={() => {
                  // Normalize any pasted value and try one more exact match on blur.
                  onOriginalInvoiceQueryChange(originalInvoiceQuery);
                }}
                list="creditnote-original-invoice-options"
                className="ui-input"
                placeholder="Search / paste invoice number"
                required
              />
              <datalist id="creditnote-original-invoice-options">
                {companyInvoices.map((inv) => (
                  <option key={inv.id} value={String(inv.number || '')} />
                ))}
              </datalist>
            </>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Credit Note Date</label>
          <input
            type="date"
            value={formData.date}
            onChange={(e) => setFormData({ ...formData, date: e.target.value })}
            className="ui-input"
            required
          />
        </div>

        <WarehouseField
          value={formData.warehouseId}
          onChange={(warehouseId) => setFormData((p) => ({ ...p, warehouseId }))}
          options={warehouseOptions}
          activeWarehouseId={defaultWarehouseId}
          isEdit={false}
          className="ui-select"
        />
        <div>
          <CustomerPicker
            db={db}
            setDb={setDb}
            currentCompany={currentCompany}
            value={formData.customerId}
            onChange={(customerId) => setFormData((prev) => ({ ...prev, customerId }))}
            disabled={Boolean(String(formData.originalInvoiceId || '').trim()) && Boolean(String(formData.customerId || '').trim())}
            disabledHint="Customer comes from the original invoice"
          />
        </div>
      </div>

      <div>
        <div className="flex justify-between items-center mb-2">
          <label className="block text-sm font-medium">Line Items</label>
          <button type="button" onClick={addItem} className="ui-fg ui-hover-fg text-sm flex items-center gap-1">
            <Plus size={16} /> Add Item
          </button>
        </div>

        <div className="border rounded-lg overflow-hidden">
          <table className="ui-table w-full ui-table-wide">
            <thead className="ui-sunken">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium">Item</th>
                <th className="px-3 py-2 text-left text-xs font-medium">Description</th>
                <th className="px-3 py-2 text-left text-xs font-medium">Qty</th>
                <th className="px-3 py-2 text-left text-xs font-medium">Rate</th>
                <th className="px-3 py-2 text-left text-xs font-medium">Line Total</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {formData.items.map((item, idx) => (
                <tr key={idx} className="border-t">
                  <td className="ui-col-meta px-3 py-2">
                    <ItemPicker
                      db={db}
                      setDb={setDb}
                      currentCompany={currentCompany}
                      value={item.itemId}
                      onChange={(itemId, picked) => updateItem(idx, 'itemId', itemId, picked)}
                      label={null}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={item.description}
                      onChange={(e) => updateItem(idx, 'description', e.target.value)}
                      className="ui-input w-full px-2 py-1"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      value={item.quantity}
                      onChange={(e) => updateItem(idx, 'quantity', e.target.value)}
                      className="ui-input w-20 px-2 py-1"
                      min="1"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      value={item.rate}
                      onChange={(e) => updateItem(idx, 'rate', e.target.value)}
                      className="ui-input w-24 px-2 py-1"
                      min="0"
                      step="0.01"
                    />
                  </td>
                  <td className="ui-col-amount px-3 py-2 font-semibold">{formatMoney((computed.lines[idx]?.lineTotal ?? item.lineTotal) || 0, currentCompany)}</td>
                  <td className="px-3 py-2">
                    <button type="button" onClick={() => removeItem(idx)} className="text-[rgb(var(--neg))] hover:text-[rgb(var(--neg))]">
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex justify-end">
          <div className="w-64 space-y-2">
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span>{formatMoney(computed.subtotal, currentCompany)}</span>
            </div>
            {isIntra ? (
              <>
                <div className="flex justify-between">
                  <span>CGST:</span>
                  <span>{formatMoney(computed.cgstTotal, currentCompany)}</span>
                </div>
                <div className="flex justify-between">
                  <span>SGST:</span>
                  <span>{formatMoney(computed.sgstTotal, currentCompany)}</span>
                </div>
              </>
            ) : (
              <div className="flex justify-between">
                <span>IGST:</span>
                <span>{formatMoney(computed.igstTotal, currentCompany)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-lg border-t pt-2">
              <span>Total:</span>
              <span>{formatMoney(computed.total, currentCompany)}</span>
            </div>
          </div>
        </div>
      </div>

      <AmountInWordsBand
        words={amountInWordsInr(computed.total)}
        amount={formatMoney(computed.total, currentCompany)}
      />

      <DocFormFootnote />
    </form>
  );
};
