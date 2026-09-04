import React, { useMemo, useState } from 'react';
import { Plus, ClipboardList } from 'lucide-react';
import { PageHeader, EmptyState, StatusPill, TableTotals } from '../../components/ui/Primitives';
import { ListToolbar, exportRows, useListSearch } from '../../components/ListToolbar';
import { usePeriodFilter } from '../../components/ListControls';
import { DocFormActions, DocFormFootnote } from '../../components/DocumentForm';
import { useColumnFilters, ColumnHeader } from '../../components/ColumnFilters';
import { notify } from '../../components/ui/notify';
import ItemPicker from '../../components/pickers/ItemPicker';
import CustomerPicker from '../../components/pickers/CustomerPicker';
import { bumpCompanyNextNumber, nextFreeVoucherNumber } from '../../utils/docSettings';
import { getCustomerDisplayName } from '../../utils/contacts';
import { formatMoney } from '../../utils/money';
import { computeGstForLines } from '../../utils/gst';
import { getCompanyGstProfile, getPartyGstProfile, isIntraStateSupply } from '../../utils/gst';
import { resolveSaleRate } from '../../utils/pricing';
import { createDocApi, hasApiSession } from '../../api/purchaseDocs';

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
  const emptyLine = { itemId: '', description: '', quantity: 1, rate: 0, gstRate: 0 };
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    expectedDate: '',
    customerId: '',
    salesmanId: '',
    notes: '',
    items: [emptyLine],
  });

  const branchIdForNumbering = String(localStorage.getItem('activeBranchId') || localStorage.getItem('branchId') || '').trim();
  // Where this was entered from, so the header's scope can find it later.
  const warehouseIdForEntry = String(localStorage.getItem('activeWarehouseId') || '').trim();
  const selectedCustomer = form.customerId ? customers.find((c) => c.id === parseInt(form.customerId)) : null;
  const { state: companyState } = getCompanyGstProfile(currentCompany);
  const { state: customerState } = getPartyGstProfile(selectedCustomer);
  const isIntra = isIntraStateSupply({ companyState, partyState: customerState });

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
      gstTotal: computed.gstTotal,
      total: computed.total,
      status: 'Open',
      salesmanId: form.salesmanId || '',
      notes: form.notes,
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
    setForm({ date: new Date().toISOString().slice(0, 10), expectedDate: '', customerId: '', salesmanId: '', notes: '', items: [emptyLine] });
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
  const shown = soFilters.applyFilters(soSearch.filtered.filter((r) => soPeriod.inRange(r?.date)), {
    number: (r) => r.number,
    date: (r) => r.date,
    customer: (r) => r.customerName,
    total: (r) => r.total,
    status: (r) => r.status,
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <PageHeader title="Sales Orders" description="Quote → SO → Challan → Invoice. Delivered and billed track against each order." />
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setShowPending((v) => !v)} className={`ui-btn !h-9 text-sm ${showPending ? 'ui-btn-primary' : 'ui-btn-secondary'}`}>
            Pending orders ({pendingRows.length})
          </button>
          <button type="button" onClick={() => setOpen(true)} className="ui-btn ui-btn-primary">
            <Plus size={15} aria-hidden="true" /> New Sales Order
          </button>
        </div>
      </div>

      {open ? (
        <div className="ui-card space-y-4 p-5">
          {/* The same bar an invoice carries: the document's name on the left,
              every way out of it on the right, pinned so Create stays reachable
              from the last line. */}
          <DocFormActions
            title="New Sales Order"
            onBack={() => setOpen(false)}
            sticky
            primaryLabel="Create Sales Order"
            primaryType="button"
            onPrimary={save}
          />
          <div className="grid gap-3 sm:grid-cols-4">
            <div>
              <label className="ui-label">Date</label>
              <input type="date" value={form.date} onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))} className="ui-input w-full px-3 py-2" />
            </div>
            <div>
              <label className="ui-label">Customer</label>
              <CustomerPicker db={db} setDb={setDb} currentCompany={currentCompany} value={form.customerId} onChange={(id) => setForm((p) => ({ ...p, customerId: id }))} label={null} />
            </div>
            <div>
              <label className="ui-label">Expected delivery</label>
              <input type="date" value={form.expectedDate} onChange={(e) => setForm((p) => ({ ...p, expectedDate: e.target.value }))} className="ui-input w-full px-3 py-2" />
            </div>
            <div>
              <label className="ui-label">Notes</label>
              <input type="text" value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} className="ui-input w-full px-3 py-2" placeholder="Customer PO ref…" />
            </div>
            {(db.salesmen || []).some((sm) => sm.companyId === companyId) ? (
              <div>
                <label className="ui-label">Salesman</label>
                <select
                  value={form.salesmanId || ''}
                  onChange={(e) => setForm((p) => ({ ...p, salesmanId: e.target.value ? Number(e.target.value) : '' }))}
                  className="ui-select w-full px-3 py-2"
                >
                  <option value="">— none —</option>
                  {(db.salesmen || []).filter((sm) => sm.companyId === companyId).map((sm) => (
                    <option key={sm.id} value={sm.id}>{sm.name}</option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>

          <table className="w-full text-sm">
            <thead className="ui-sunken">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium">Item</th>
                <th className="px-3 py-2 text-left text-xs font-medium">Qty</th>
                <th className="px-3 py-2 text-left text-xs font-medium">Rate</th>
                <th className="px-3 py-2 text-left text-xs font-medium">Line Total</th>
              </tr>
            </thead>
            <tbody>
              {form.items.map((l, idx) => (
                <tr key={idx} className="border-t">
                  <td className="px-3 py-2">
                    <ItemPicker db={db} setDb={setDb} currentCompany={currentCompany} value={l.itemId} onChange={(id, picked) => updateLine(idx, 'itemId', id, picked)} label={null} />
                  </td>
                  <td className="px-3 py-2">
                    <input type="number" min="1" value={l.quantity} onChange={(e) => updateLine(idx, 'quantity', e.target.value)} className="ui-input w-20 px-2 py-1" />
                  </td>
                  <td className="px-3 py-2">
                    <input type="number" min="0" step="0.01" value={l.rate} onChange={(e) => updateLine(idx, 'rate', e.target.value)} className="ui-input w-24 px-2 py-1" />
                  </td>
                  <td className="ui-col-amount px-3 py-2">{formatMoney(computed.lines[idx]?.lineTotal || 0, currentCompany)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-between">
            <button type="button" onClick={() => setForm((p) => ({ ...p, items: [...p.items, emptyLine] }))} className="ui-btn ui-btn-secondary ui-btn-sm text-xs">
              + Add line
            </button>
            <div className="text-sm font-semibold">Total: {formatMoney(computed.total, currentCompany)}</div>
          </div>

          <DocFormFootnote />
        </div>
      ) : null}

      <ListToolbar
        search={soSearch.query}
        onSearch={soSearch.setQuery}
        placeholder="Search sales orders (number, customer, status)"
        count={shown.length}
        countLabel="orders"
        onExport={() =>
          exportRows({
            fileName: `SalesOrders_${currentCompany?.name || 'company'}`,
            label: 'sales order(s)',
            columns: [
              { key: 'number', label: 'SO #' },
              { key: 'date', label: 'Date' },
              { key: 'expectedDate', label: 'Expected' },
              { key: 'customerName', label: 'Customer' },
              { key: 'subtotal', label: 'Taxable', value: (r) => Number(r.subtotal || 0) },
              { key: 'total', label: 'Total', value: (r) => Number(r.total || 0) },
              { key: 'status', label: 'Status' },
              { key: 'notes', label: 'Notes' },
            ],
            rows: shown,
          })
        }
        period={soPeriod.period}
        onPeriodChange={soPeriod.setPeriod}
        dateFrom={soPeriod.dateFrom}
        dateTo={soPeriod.dateTo}
        onDateFromChange={soPeriod.setDateFrom}
        onDateToChange={soPeriod.setDateTo}
        exportTitle="Sales Orders — {currentCompany?.name || 'Company'}"
        exportFileName={`SalesOrders_${currentCompany?.name || 'company'}`}
        exportSheetName="Sales Orders"
        exportColumns={[
              { key: 'number', label: 'SO #' },
              { key: 'date', label: 'Date' },
              { key: 'expectedDate', label: 'Expected' },
              { key: 'customerName', label: 'Customer' },
              { key: 'subtotal', label: 'Taxable', value: (r) => Number(r.subtotal || 0) },
              { key: 'total', label: 'Total', value: (r) => Number(r.total || 0) },
              { key: 'status', label: 'Status' },
              { key: 'notes', label: 'Notes' },
        ]}
        exportRows={shown}
      />

      {shown.length === 0 ? (
        <div className="ui-card">
          <EmptyState icon={ClipboardList} title={showPending ? 'No pending orders' : 'No sales orders'} description="Confirmed customer orders live here until delivered and billed." />
        </div>
      ) : (
        <div className="ui-card overflow-x-auto">
          <table className="ui-table w-full ui-table-sticky">
            <thead>
              <tr>
                <ColumnHeader label="SO #" col="number" state={soFilters} className="ui-th" />
                <ColumnHeader label="Date" col="date" state={soFilters} className="ui-th" />
                <ColumnHeader label="Customer" col="customer" state={soFilters} className="ui-th" />
                <ColumnHeader label="Total" col="total" state={soFilters} className="ui-th ui-num" align="right" />
                <th className="ui-th">Ordered / Delivered / Billed</th>
                <ColumnHeader label="Status" col="status" state={soFilters} className="ui-th" />
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((o) => {
                const prog = progressOf(o);
                return (
                  <tr key={o.id} className="border-t">
                    <td className="ui-col-id px-4 py-2.5 font-medium">{o.number}</td>
                    <td className="ui-col-date px-4 py-2.5">{o.date}</td>
                    <td className="ui-col-entity px-4 py-2.5">{o.customerName}</td>
                    <td className="ui-col-amount px-4 py-2.5 text-right">{formatMoney(Number(o.total || 0), currentCompany)}</td>
                    <td className="px-4 py-2.5">
                      {prog.ordered} / {prog.delivered} / {prog.billed}
                    </td>
                    <td className="px-4 py-2.5"><StatusPill status={prog.status} /></td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-2">
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
              })}
            </tbody>
          </table>
          <TableTotals
            count={shown.length}
            totalCount={orders.length}
            noun="sales orders"
            figures={[{ label: 'Value', value: formatMoney(shown.reduce((t, r) => t + Number(r.total || 0), 0), currentCompany) }]}
          />
        </div>
      )}
    </div>
  );
}
