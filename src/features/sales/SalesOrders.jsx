import React, { useMemo, useRef, useState } from 'react';
import { Ban, ClipboardList, Download, FileText, Package, Plus, Printer, Receipt, Settings2, Trash2, Truck } from 'lucide-react';
import { EmptyState, StatusPill, TableTotals } from '../../components/ui/Primitives';
import DocumentListShell from '../../components/list/DocumentListShell';
import { exportRows, useListSearch } from '../../components/ListToolbar';
import { usePeriodFilter } from '../../components/ListControls';
import { DocFormActions, DocFormFootnote, AmountInWordsBand } from '../../components/DocumentForm';
import DocumentCustomFields, { hasCustomFieldsAt } from '../../components/DocumentCustomFields';
import DocumentPrintView from '../../components/DocumentPrintView';
import PrintDownloadFrame from '../../components/PrintDownloadFrame';
import Modal from '../../components/ui/Modal';
import { useDocumentFormKeys } from '../../components/ui/useDocumentFormKeys';
import { getVisibleCustomFields } from '../../utils/invoicePrefs';
import { useColumnFilters, ColumnHeader } from '../../components/ColumnFilters';
import { notify } from '../../components/ui/notify';
import ItemPicker from '../../components/pickers/ItemPicker';
import CustomerPicker from '../../components/pickers/CustomerPicker';
import { bumpCompanyNextNumber, nextFreeVoucherNumber } from '../../utils/docSettings';
import { getCustomerDisplayName } from '../../utils/contacts';
import { amountInWordsInr, formatMoney } from '../../utils/money';
import { computeGstForLines } from '../../utils/gst';
import { getCompanyGstProfile, getPartyGstProfile, isIntraStateSupply } from '../../utils/gst';
import { resolveSaleRate } from '../../utils/pricing';
import { createDocApi, hasApiSession } from '../../api/purchaseDocs';
import { DocumentNumber, SalesDate, DueDate, MoneyValue, SalesBalance } from '../../components/docs';

/**
 * Sales orders — the confirmed order between quote and invoice.
 *
 * The document chain is Quote → SO → Delivery Challan → Invoice. Challans and
 * invoices created from an SO carry sourceSalesOrderId; delivered and billed
 * quantities are computed from those documents, never stored, so the pending
 * report cannot drift from reality.
 */
export default function SalesOrders({ db, setDb, currentCompany, onConvertToInvoice }) {
  const companyId = currentCompany.id;
  const orders = useMemo(
    () =>
      (Array.isArray(db.salesOrders) ? db.salesOrders : [])
        .filter((o) => o.companyId === companyId)
        .slice()
        .sort((a, b) => String(b.date).localeCompare(String(a.date))),
    [db.salesOrders, companyId]
  );
  const customers = (db.customers || []).filter((c) => c.companyId === companyId);
  const itemsMaster = (db.items || []).filter((i) => i.companyId === companyId);

  const [open, setOpen] = useState(false);
  const [showPending, setShowPending] = useState(false);
  const [previewOrder, setPreviewOrder] = useState(null);
  const emptyLine = { itemId: '', description: '', quantity: 1, rate: 0, gstRate: 0, discountPct: 0, unit: '', hsnSac: '' };
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    expectedDate: '',
    customerId: '',
    salesmanId: '',
    notes: '',
    customFields: {},
    items: [emptyLine],
  });

  /*
   * The fields this company invented. An order is where a customer's PO
   * reference first arrives, so it is the document that needs them most, and
   * until now it was the one document that could not carry them.
   */
  const customFields = useMemo(() => getVisibleCustomFields(currentCompany, 'salesOrder'), [currentCompany]);
  const setCustomField = (key, value) =>
    setForm((p) => ({ ...p, customFields: { ...(p.customFields || {}), [key]: value } }));

  const formRef = useRef(null);
  const addLine = () => setForm((p) => ({ ...p, items: [...p.items, emptyLine] }));
  const duplicateLine = (idx) =>
    setForm((p) => {
      const items = [...p.items];
      items.splice(idx + 1, 0, { ...items[idx] });
      return { ...p, items };
    });
  const removeLine = (idx) =>
    setForm((p) => (p.items.length > 1 ? { ...p, items: p.items.filter((_, i) => i !== idx) } : p));

  const branchIdForNumbering = String(localStorage.getItem('activeBranchId') || localStorage.getItem('branchId') || '').trim();
  // Where this was entered from, so the header's scope can find it later.
  const warehouseIdForEntry = String(localStorage.getItem('activeWarehouseId') || '').trim();
  const selectedCustomer = form.customerId ? customers.find((c) => c.id === parseInt(form.customerId)) : null;
  const { state: companyState } = getCompanyGstProfile(currentCompany);
  const { state: customerState } = getPartyGstProfile(selectedCustomer);
  const isIntra = isIntraStateSupply({ companyState, partyState: customerState });

  /*
   * The keyboard the invoice form has had all along.
   *
   * An order was typed with the browser's defaults: Enter submitted a
   * half-filled document from the customer field, the arrows did nothing, and
   * Tab out of the last rate went to the Create button instead of opening the
   * next line. Nothing here is specific to an order — it is the same hook,
   * which this form simply never called.
   */
  const onFormKeyDown = useDocumentFormKeys({
    formRef,
    lineCount: form.items.length,
    addLine,
    duplicateLine,
    removeLine,
    autoFocus: 'input[type="date"]',
  });

  const updateLine = (idx, field, value, picked = null) => {
    setForm((p) => {
      const items = [...p.items];
      if (field === 'itemId') {
        const item = picked || itemsMaster.find((i) => i.id === parseInt(value));
        if (item) {
          // onDate is the order's own date, so a price list that had expired
          // by then does not price it.
          const resolved = resolveSaleRate({ db, companyId, customer: selectedCustomer, itemId: item.id, item, onDate: form.date });
          items[idx] = {
            ...items[idx],
            itemId: value,
            description: item.name,
            rate: resolved.rate,
            gstRate: Number(item.gstRate ?? 0),
            hsnSac: item.hsnSac || '',
            unit: item.unit || '',
          };
        }
      } else {
        items[idx] = { ...items[idx], [field]: value };
      }
      return { ...p, items };
    });
  };

  const computed = computeGstForLines({ lines: form.items, isIntra });

  /** Delivered / billed per SO line come from linked challans and invoices. */
  const progressOf = (order) => {
    const deliveredBy = new Map();
    for (const dc of db.deliveryChallans || []) {
      if (Number(dc.sourceSalesOrderId) !== Number(order.id)) continue;
      for (const l of dc.items || []) {
        const k = String(l.itemId);
        deliveredBy.set(k, (deliveredBy.get(k) || 0) + (Number(l.quantity) || 0));
      }
    }
    const billedBy = new Map();
    for (const inv of db.invoices || []) {
      if (Number(inv.sourceSalesOrderId) !== Number(order.id)) continue;
      if (String(inv.status || '').toLowerCase() === 'cancelled') continue;
      for (const l of inv.items || []) {
        const k = String(l.itemId);
        billedBy.set(k, (billedBy.get(k) || 0) + (Number(l.quantity) || 0));
      }
    }
    let ordered = 0;
    let delivered = 0;
    let billed = 0;
    for (const l of order.items || []) {
      const q = Number(l.quantity) || 0;
      ordered += q;
      delivered += Math.min(q, deliveredBy.get(String(l.itemId)) || 0);
      billed += Math.min(q, billedBy.get(String(l.itemId)) || 0);
    }
    const status =
      billed >= ordered && ordered > 0 ? 'Billed' : delivered >= ordered && ordered > 0 ? 'Delivered' : delivered > 0 || billed > 0 ? 'Partial' : 'Open';
    return { ordered, delivered, billed, status };
  };

  const save = async () => {
    if (!form.customerId) {
      notify.error('Customer is required');
      return;
    }
    const lines = form.items.filter((l) => String(l.itemId || '').trim());
    if (!lines.length) {
      notify.error('Pick at least one item');
      return;
    }
    const customer = customers.find((c) => c.id === parseInt(form.customerId));

    let backendDocId = null;
    let serverNumber = '';
    if (hasApiSession()) {
      try {
        const saved = await createDocApi('salesOrder', {
          date: form.date,
          expectedDate: form.expectedDate || null,
          partyId: customer?.backendPartyId ? String(customer.backendPartyId) : null,
          partyName: getCustomerDisplayName(customer),
          subtotal: computed.subtotal,
          gstTotal: computed.gstTotal,
          total: computed.total,
          status: 'Open',
          notes: form.notes || null,
          salesmanId: form.salesmanId || undefined,
          items: computed.lines.filter((l) => String(l.itemId || '').trim()),
        });
        backendDocId = saved?.id || null;
        serverNumber = String(saved?.number || '');
      } catch (err) {
        notify.error(String(err?.message || 'Sales order not saved to the server.'));
        return;
      }
    }

    const nextId = (db.salesOrders || []).reduce((m, o) => Math.max(m, Number(o.id) || 0), 0) + 1;
    const order = {
      id: nextId,
      companyId,
      backendDocId,
      number: serverNumber || nextFreeVoucherNumber({db, company: currentCompany, voucherKey: 'salesOrder', branchId: branchIdForNumbering || null, takenNumbers: (db.salesOrders || []).filter((x) => x.companyId === currentCompany.id).map((x) => String(x.number || '').trim()) }) || `SO-${nextId}`,
      date: form.date,
      expectedDate: form.expectedDate || '',
      customerId: form.customerId,
      customerName: getCustomerDisplayName(customer),
      items: computed.lines.filter((l) => String(l.itemId || '').trim()),
      subtotal: computed.subtotal,
      cgstTotal: computed.cgstTotal,
      sgstTotal: computed.sgstTotal,
      igstTotal: computed.igstTotal,
      gstTotal: computed.gstTotal,
      total: computed.total,
      status: 'Open',
      salesmanId: form.salesmanId || '',
      notes: form.notes,
      customFields: { ...(form.customFields || {}) },
      branchId: branchIdForNumbering || '',
      warehouseId: warehouseIdForEntry || '',
      createdAt: new Date().toISOString(),
    };
    setDb((prev) => ({
      ...prev,
      salesOrders: [...(prev.salesOrders || []), order],
      companies: bumpCompanyNextNumber({
        db: prev,
        companyId,
        voucherKey: 'salesOrder',
        usedNumber: order.number,
        branchId: branchIdForNumbering || null,
      }),
    }));
    setOpen(false);
    setForm({ date: new Date().toISOString().slice(0, 10), expectedDate: '', customerId: '', salesmanId: '', notes: '', customFields: {}, items: [emptyLine] });
    notify.success(`Sales order ${order.number} created.`);
  };

  /** SO → Delivery Challan for the still-undelivered quantities. */
  const toChallan = (order) => {
    const prog = progressOf(order);
    const nextId = (db.deliveryChallans || []).reduce((m, c) => Math.max(m, Number(c.id) || 0), 0) + 1;
    const challan = {
      id: nextId,
      companyId,
      number: nextFreeVoucherNumber({db, company: currentCompany, voucherKey: 'deliveryChallan', branchId: branchIdForNumbering || null, takenNumbers: (db.deliveryChallans || []).filter((x) => x.companyId === currentCompany.id).map((x) => String(x.number || '').trim()) }) || `DC-${nextId}`,
      date: new Date().toISOString().slice(0, 10),
      customerId: order.customerId,
      customerName: order.customerName,
      purpose: 'Supply on Approval',
      vehicleNo: '',
      notes: `Against ${order.number}`,
      branchId: String(order.branchId || branchIdForNumbering || ''),
      warehouseId: String(order.warehouseId || warehouseIdForEntry || ''),
      sourceSalesOrderId: order.id,
      items: (order.items || []).map((l) => ({ itemId: l.itemId, description: l.description, quantity: Number(l.quantity) || 1, rate: Number(l.rate) || 0 })),
      value: Number(order.subtotal || 0),
      status: 'Open',
      createdAt: new Date().toISOString(),
    };
    setDb((prev) => ({ ...prev, deliveryChallans: [...(prev.deliveryChallans || []), challan] }));
    notify.success(`Delivery challan ${challan.number} created against ${order.number}.${prog.delivered ? ' (Already-delivered qty not re-split — adjust lines on the challan.)' : ''}`);
  };

  const toInvoice = (order) => {
    if (typeof onConvertToInvoice !== 'function') return;
    onConvertToInvoice(order);
  };

  const pendingRows = orders
    .map((o) => ({ order: o, prog: progressOf(o) }))
    .filter(({ prog }) => prog.billed < prog.ordered);

  const soPeriod = usePeriodFilter();
  const soSearch = useListSearch(showPending ? pendingRows.map((r) => r.order) : orders, [
    'number',
    'customerName',
    'date',
    'status',
    'notes',
  ]);
  const soFilters = useColumnFilters();
  const shownAll = soFilters.applyFilters(soSearch.filtered.filter((r) => soPeriod.inRange(r?.date)), {
    number: (r) => r.number,
    date: (r) => r.date,
    customer: (r) => r.customerName,
    total: (r) => r.total,
    status: (r) => r.status,
  });

  /*
   * An order's status is what has actually happened to it, not what somebody
   * typed: delivered and billed are counted from the challans and invoices
   * raised against it. That is why the tabs filter on the derived value.
   */
  const [soStatus, setSoStatus] = useState('');
  const SO_STATUS_TABS = [
    { value: '', label: 'All', tone: 'all' },
    { value: 'Open', label: 'Open', tone: 'sent' },
    { value: 'Partial', label: 'Partly done', tone: 'partial' },
    { value: 'Delivered', label: 'Delivered', tone: 'outstanding' },
    { value: 'Billed', label: 'Billed', tone: 'paid' },
  ];
  const shown = soStatus ? shownAll.filter((o) => progressOf(o).status === soStatus) : shownAll;

  const soStatusCounts = useMemo(() => {
    const counts = { '': shownAll.length };
    for (const o of shownAll) {
      const st = progressOf(o).status;
      counts[st] = (counts[st] || 0) + 1;
    }
    return counts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownAll]);

  /*
   * Five figures about the same book: how many orders, what they are worth,
   * what is still to go out of the door, what has been billed, and what is
   * sitting delivered but not yet invoiced — which is the one that costs money
   * to forget.
   */
  const soHeadline = useMemo(() => {
    let value = 0;
    let open = 0;
    let billed = 0;
    let toBill = 0;
    for (const o of shownAll) {
      const amt = Number(o.total || 0);
      const prog = progressOf(o);
      value += amt;
      if (prog.status === 'Billed') billed += amt;
      else if (prog.status === 'Delivered') toBill += amt;
      else open += amt;
    }
    return { count: shownAll.length, value, open, billed, toBill };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownAll]);

  const soExportColumns = [
    { key: 'number', label: 'SO #' },
    { key: 'date', label: 'Date' },
    { key: 'expectedDate', label: 'Expected' },
    { key: 'customerName', label: 'Customer' },
    { key: 'subtotal', label: 'Taxable', value: (r) => Number(r.subtotal || 0) },
    { key: 'total', label: 'Total', value: (r) => Number(r.total || 0) },
    { key: 'status', label: 'Status', value: (r) => progressOf(r).status },
    { key: 'notes', label: 'Notes' },
  ];

  /*
   * The form is a screen, not a panel above the list.
   *
   * It used to render inside the list — cards, tabs and every row still
   * on screen under a half-typed document — which is not how an invoice or
   * a quotation opens, and left the primary action of the list sitting
   * beside the primary action of the form.
   */
  if (open) {
    return (
      <div className="space-y-6">
      {open ? (
        <form
          ref={formRef}
          onKeyDown={onFormKeyDown}
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
          className="ui-card space-y-4 p-5"
        >
          {/* The same bar an invoice carries: the document's name on the left,
              every way out of it on the right, pinned so Create stays reachable
              from the last line. */}
          <DocFormActions
            title="New Sales Order"
            onBack={() => setOpen(false)}
            sticky
            primaryLabel="Create Sales Order"
            onPrimary={save}
          />
          {/*
            The head of the document, in the invoice's two columns: who it is
            for on the left, the paperwork that identifies it on the right,
            ruled off between them. Four fields strung across the top put the
            customer between two dates and read as one undifferentiated band.
          */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-x-6 gap-y-4">
            <div className="lg:col-span-6 space-y-4">
              <div>
                <label className="ui-label">Customer</label>
                <CustomerPicker db={db} setDb={setDb} currentCompany={currentCompany} value={form.customerId} onChange={(id) => setForm((p) => ({ ...p, customerId: id }))} label={null} />
              </div>
              {(db.salesmen || []).some((sm) => sm.companyId === companyId) ? (
                <div>
                  <label className="ui-label" htmlFor="so-salesman">Salesman</label>
                  <select
                    id="so-salesman"
                    value={form.salesmanId || ''}
                    onChange={(e) => setForm((p) => ({ ...p, salesmanId: e.target.value ? Number(e.target.value) : '' }))}
                    className="ui-select w-full"
                  >
                    <option value="">— none —</option>
                    {(db.salesmen || []).filter((sm) => sm.companyId === companyId).map((sm) => (
                      <option key={sm.id} value={sm.id}>{sm.name}</option>
                    ))}
                  </select>
                </div>
              ) : null}
            </div>

            <div
              className="lg:col-span-6 space-y-4 lg:ps-6"
              style={{ borderInlineStart: '1px solid rgb(var(--border))' }}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="min-w-0">
                  <label className="ui-label" htmlFor="so-date">
                    Date <span className="text-[rgb(var(--neg-ink))]">*</span>
                  </label>
                  <input id="so-date" type="date" value={form.date} onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))} className="ui-input w-full" required />
                </div>
                <div className="min-w-0">
                  <label className="ui-label" htmlFor="so-expected">Expected delivery</label>
                  <input id="so-expected" type="date" value={form.expectedDate} onChange={(e) => setForm((p) => ({ ...p, expectedDate: e.target.value }))} className="ui-input w-full" />
                </div>
              </div>
              <div>
                <label className="ui-label" htmlFor="so-notes">Ref No.</label>
                <input id="so-notes" type="text" value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} className="ui-input w-full" placeholder="Customer PO ref…" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <DocumentCustomFields fields={customFields} values={form.customFields} onChange={setCustomField} where="header" />
                <DocumentCustomFields fields={customFields} values={form.customFields} onChange={setCustomField} where="reference" />
              </div>
            </div>
          </div>

          <div>
            <div className="mb-2">
              <label className="ui-label">Line Items</label>
            </div>

            <div className="border rounded-lg overflow-hidden">
              <table className="ui-table ui-grid-dense w-full ui-table-wide">
                <thead className="ui-sunken">
                  <tr>
                    <th className="ui-th text-left w-[28%]">Item</th>
                    <th className="ui-th text-left w-[22%]">Description</th>
                    <th className="ui-th ui-num w-[8%]">
                      Qty <span className="text-[rgb(var(--neg-ink))]">*</span>
                    </th>
                    <th className="ui-th text-left w-[7%]">Unit</th>
                    <th className="ui-th ui-num w-[12%]">
                      Rate (₹) <span className="text-[rgb(var(--neg-ink))]">*</span>
                    </th>
                    <th className="ui-th ui-num w-[8%]">Disc %</th>
                    <th className="ui-th ui-num w-[8%]">Tax %</th>
                    <th className="ui-th ui-num w-[13%]">Amount (₹)</th>
                    <th className="px-3 py-2 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {form.items.map((l, idx) => (
                    <tr key={idx} className="border-t" data-line-row={idx}>
                      <td className="ui-col-meta px-3 py-2">
                        <ItemPicker db={db} setDb={setDb} currentCompany={currentCompany} value={l.itemId} onChange={(id, picked) => updateLine(idx, 'itemId', id, picked)} label={null} />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={l.description}
                          onChange={(e) => updateLine(idx, 'description', e.target.value)}
                          className="ui-input w-full min-w-0 px-2 py-1"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" min="1" value={l.quantity} onChange={(e) => updateLine(idx, 'quantity', e.target.value)} className="ui-input w-full min-w-0 px-2 py-1 text-right" />
                      </td>
                      <td className="px-3 py-2">
                        <input type="text" value={l.unit || ''} onChange={(e) => updateLine(idx, 'unit', e.target.value)} className="ui-input w-full min-w-0 px-2 py-1" />
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" min="0" step="0.01" value={l.rate} onChange={(e) => updateLine(idx, 'rate', e.target.value)} className="ui-input w-full min-w-0 px-2 py-1 text-right" />
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" min="0" max="100" step="0.01" value={l.discountPct ?? 0} onChange={(e) => updateLine(idx, 'discountPct', e.target.value)} className="ui-input w-full min-w-0 px-2 py-1 text-right" />
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" min="0" step="0.01" value={l.gstRate ?? 0} onChange={(e) => updateLine(idx, 'gstRate', e.target.value)} className="ui-input w-full min-w-0 px-2 py-1 text-right" />
                      </td>
                      <td className="ui-col-amount px-3 py-2 text-right">{formatMoney(computed.lines[idx]?.lineTotal || 0, currentCompany)}</td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => removeLine(idx)}
                          disabled={form.items.length === 1}
                          aria-label={`Remove line ${idx + 1}`}
                          className="ui-btn ui-btn-ghost ui-btn-sm disabled:opacity-40"
                        >
                          <Trash2 size={14} aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-2 flex items-center gap-3">
            <button type="button" onClick={addLine} className="ui-btn ui-btn-secondary">
              <Plus size={15} aria-hidden="true" /> Add Item
            </button>
            <span className="ui-subtle text-xs">or press Tab in the last field of the last row</span>
          </div>

          <div className="flex items-start justify-end gap-4">
            <div className="w-64 space-y-1 text-sm">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span className="ui-money">{formatMoney(computed.subtotal, currentCompany)}</span>
              </div>
              {computed.cgstTotal > 0 ? (
                <div className="flex justify-between">
                  <span>CGST</span>
                  <span className="ui-money">{formatMoney(computed.cgstTotal, currentCompany)}</span>
                </div>
              ) : null}
              {computed.sgstTotal > 0 ? (
                <div className="flex justify-between">
                  <span>SGST</span>
                  <span className="ui-money">{formatMoney(computed.sgstTotal, currentCompany)}</span>
                </div>
              ) : null}
              {computed.igstTotal > 0 ? (
                <div className="flex justify-between">
                  <span>IGST</span>
                  <span className="ui-money">{formatMoney(computed.igstTotal, currentCompany)}</span>
                </div>
              ) : null}
              <div className="flex justify-between border-t pt-1 font-semibold">
                <span>Total</span>
                <span className="ui-money">{formatMoney(computed.total, currentCompany)}</span>
              </div>
            </div>
          </div>

          <AmountInWordsBand words={amountInWordsInr(computed.total)} />

          {hasCustomFieldsAt(customFields, 'notes') ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <DocumentCustomFields fields={customFields} values={form.customFields} onChange={setCustomField} where="notes" />
            </div>
          ) : null}

          <DocFormFootnote />

          {/* The figure and the line count, kept on screen while the lines are
              typed — the same running total the invoice carries. */}
          <div className="ui-entry-summary">
            <span className="ui-t-label">Total</span>
            <span className="ui-money-lg">{formatMoney(computed.total, currentCompany)}</span>
            <span className="ui-caption">
              {form.items.filter((l) => String(l.itemId || '').trim()).length} line(s)
              {computed.gstTotal > 0 ? ` · ${formatMoney(computed.gstTotal, currentCompany)} GST` : ''}
            </span>
          </div>
        </form>
      ) : null}
      </div>
    );
  }

  return (
    <DocumentListShell
      title="Sales Orders"
      description="Quote → SO → Challan → Invoice. Delivered and billed track against each order."
      company={currentCompany}
      search={{
        value: soSearch.query,
        onChange: soSearch.setQuery,
        placeholder: 'Search sales orders…',
        label: 'Search sales orders',
      }}
      headerExtras={
        /* Not a filter tab: pending is "still owing the customer something",
           which cuts across every status tab beside it. */
        <button
          type="button"
          onClick={() => setShowPending((v) => !v)}
          aria-pressed={showPending}
          className={`ui-btn ${showPending ? 'ui-btn-primary' : 'ui-btn-secondary'}`}
        >
          Pending orders ({pendingRows.length})
        </button>
      }
      moreItems={[{ key: 'export', label: 'Export sales orders', Icon: Download }]}
      onMoreSelect={(k) => {
        if (k !== 'export') return;
        exportRows({
          fileName: `SalesOrders_${currentCompany?.name || 'company'}`,
          label: 'sales order(s)',
          columns: soExportColumns,
          rows: shown,
        });
      }}
      primary={
        <button type="button" onClick={() => setOpen(true)} className="ui-btn ui-btn-primary">
          <Plus size={16} aria-hidden="true" /> New Sales Order
        </button>
      }
      cards={[
        { label: 'Total orders', value: soHeadline.count, count: true, tone: 'draft', Icon: ClipboardList },
        { label: 'Order value', value: soHeadline.value, tone: 'sent', Icon: FileText },
        { label: 'Still to deliver', value: soHeadline.open, tone: 'outstanding', Icon: Package },
        { label: 'Delivered, to bill', value: soHeadline.toBill, tone: 'partial', Icon: Truck },
        { label: 'Billed', value: soHeadline.billed, tone: 'paid', Icon: Receipt },
      ]}
      tabs={SO_STATUS_TABS}
      tabsLabel="Sales order status"
      statusValue={soStatus}
      statusCounts={soStatusCounts}
      onStatusChange={setSoStatus}
      tip={{
        storageKey: 'neev.tip.salesOrders',
        text: 'Delivered and billed are counted from the challans and invoices raised against each order — never typed.',
        Icon: Truck,
      }}
    >


      <div className="overflow-x-auto ui-table-scroll">
        <table className="ui-table ui-table-wide ui-table-sticky">
            <thead>
              <tr>
                <ColumnHeader label="SO #" col="number" state={soFilters} />
                <ColumnHeader label="Date" col="date" state={soFilters} />
                <ColumnHeader label="Customer" col="customer" state={soFilters} />
                <ColumnHeader label="Amount" col="total" state={soFilters} className="ui-num" align="right" />
                {/* Three numbers, one column: an order is read by how far along
                    it is, and three separate columns of quantities read as
                    three unrelated figures. */}
                <th scope="col">Ordered / Delivered / Billed</th>
                <ColumnHeader label="Status" col="status" state={soFilters} />
                <th scope="col"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="ui-rows">
              {shown.length === 0 ? (
                <tr>
                  <td colSpan="7">
                    <EmptyState
                      icon={ClipboardList}
                      kind="new"
                      title={showPending ? 'Nothing pending' : 'No sales orders'}
                      description={
                        showPending
                          ? 'Every order here has been delivered and billed.'
                          : 'A sales order is a customer’s yes — held here until the goods go out and the invoice follows.'
                      }
                      routes={
                        showPending
                          ? undefined
                          : [
                              {
                                label: 'Take an order now',
                                description: 'Pick a customer, enter what they ordered, set the expected date.',
                                onSelect: () => setOpen(true),
                              },
                              {
                                label: 'Start from a quotation',
                                description: 'Convert a quote the customer has accepted.',
                                onSelect: () => setOpen(true),
                              },
                            ]
                      }
                    />
                  </td>
                </tr>
              ) : (
                shown.map((o) => {
                const prog = progressOf(o);
                return (
                  <tr key={o.id}>
                    <td className="ui-col-id"><DocumentNumber value={o.number} label="sales order" /></td>
                    <td className="ui-col-date"><SalesDate value={o.date} /></td>
                    <td className="ui-col-entity">{o.customerName}</td>
                    <td className="ui-col-amount"><MoneyValue value={o.total} company={currentCompany} /></td>
                    <td className="ui-col-meta">
                      {prog.ordered} / {prog.delivered} / {prog.billed}
                    </td>
                    <td><StatusPill status={prog.status} /></td>
                    <td className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setPreviewOrder(o)}
                          aria-label={`Print sales order ${o.number}`}
                          className="ui-btn ui-btn-secondary ui-btn-sm text-xs"
                        >
                          <Printer size={13} aria-hidden="true" /> Print
                        </button>
                        {prog.delivered < prog.ordered ? (
                          <button type="button" onClick={() => toChallan(o)} className="ui-btn ui-btn-secondary ui-btn-sm text-xs">
                            → Challan
                          </button>
                        ) : null}
                        {prog.billed < prog.ordered ? (
                          <button type="button" onClick={() => toInvoice(o)} className="ui-btn ui-btn-secondary ui-btn-sm text-xs">
                            → Invoice
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })
              )}
            </tbody>
          </table>
        </div>
        <TableTotals
          count={shown.length}
          totalCount={orders.length}
          noun="sales orders"
          figures={[{ label: 'Value', value: formatMoney(shown.reduce((t, r) => t + Number(r.total || 0), 0), currentCompany) }]}
        />

      {previewOrder ? (
        <Modal
          title={`Sales Order ${previewOrder.number || ''}`.trim()}
          maxWidthClass="max-w-5xl"
          onClose={() => setPreviewOrder(null)}
        >
          <PrintDownloadFrame
            title={`Sales Order ${previewOrder.number || ''}`.trim()}
            fileBase={previewOrder.number || 'sales-order'}
          >
            <DocumentPrintView
              db={db}
              currentCompany={currentCompany}
              docTitle="SALES ORDER"
              doc={previewOrder}
              party={customers.find((c) => String(c.id) === String(previewOrder.customerId)) || null}
              partyLabel="Customer"
              metaRows={[{ label: 'Expected delivery', value: previewOrder.expectedDate }]}
              sideRows={[
                { label: 'Status', value: progressOf(previewOrder).status },
                { label: 'Ordered', value: String(progressOf(previewOrder).ordered) },
                { label: 'Delivered', value: String(progressOf(previewOrder).delivered) },
                { label: 'Billed', value: String(progressOf(previewOrder).billed) },
              ]}
              footNote="This is a confirmed order, not a tax invoice. Goods will be despatched against a delivery challan."
            />
          </PrintDownloadFrame>
        </Modal>
      ) : null}
    </DocumentListShell>
  );
}
