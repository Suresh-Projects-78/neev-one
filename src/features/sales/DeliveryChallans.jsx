import React, { useMemo, useState } from 'react';
import { Plus, Truck } from 'lucide-react';
import { PageHeader, EmptyState, StatusPill } from '../../components/ui/Primitives';
import { notify } from '../../components/ui/notify';
import ItemPicker from '../../components/pickers/ItemPicker';
import CustomerPicker from '../../components/pickers/CustomerPicker';
import { getCustomerDisplayName } from '../../utils/contacts';
import { formatMoney } from '../../utils/money';

/**
 * Delivery challans — goods leaving without (yet) an invoice: job work,
 * supply on approval, branch/own use. Numbered DC-1, DC-2… per company.
 * "Convert to invoice" hands the challan to the invoice editor via
 * onConvert(challan) so billing reuses the standard invoice flow.
 */
export default function DeliveryChallans({ db, setDb, currentCompany, onConvert }) {
  const companyId = currentCompany.id;
  const challans = useMemo(
    () =>
      (Array.isArray(db.deliveryChallans) ? db.deliveryChallans : [])
        .filter((c) => c.companyId === companyId)
        .slice()
        .sort((a, b) => String(b.date).localeCompare(String(a.date))),
    [db.deliveryChallans, companyId]
  );

  const [open, setOpen] = useState(false);
  const emptyLine = { itemId: '', description: '', quantity: 1, rate: 0 };
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    customerId: '',
    purpose: 'Job Work',
    vehicleNo: '',
    notes: '',
    items: [emptyLine],
  });

  const customers = (db.customers || []).filter((c) => c.companyId === companyId);
  const itemsMaster = (db.items || []).filter((i) => i.companyId === companyId);

  const updateLine = (idx, field, value, picked = null) => {
    setForm((p) => {
      const items = [...p.items];
      if (field === 'itemId') {
        const item = picked || itemsMaster.find((i) => i.id === parseInt(value));
        if (item) items[idx] = { ...items[idx], itemId: value, description: item.name, rate: Number(item.salePrice || 0) };
      } else {
        items[idx] = { ...items[idx], [field]: value };
      }
      return { ...p, items };
    });
  };

  const save = () => {
    if (!form.customerId) {
      notify.error('Customer is required');
      return;
    }
    if (!form.items.some((l) => String(l.itemId || '').trim())) {
      notify.error('Pick at least one item');
      return;
    }
    const nextId = (db.deliveryChallans || []).reduce((m, c) => Math.max(m, Number(c.id) || 0), 0) + 1;
    const customer = customers.find((c) => c.id === parseInt(form.customerId));
    const lines = form.items
      .filter((l) => String(l.itemId || '').trim())
      .map((l) => ({ ...l, quantity: Number(l.quantity) || 1, rate: Number(l.rate) || 0 }));
    const challan = {
      id: nextId,
      companyId,
      number: `DC-${nextId}`,
      date: form.date,
      customerId: form.customerId,
      customerName: getCustomerDisplayName(customer),
      purpose: form.purpose,
      vehicleNo: form.vehicleNo.trim(),
      notes: form.notes.trim(),
      items: lines,
      value: lines.reduce((s, l) => s + l.quantity * l.rate, 0),
      status: 'Open',
      createdAt: new Date().toISOString(),
    };
    setDb((prev) => ({ ...prev, deliveryChallans: [...(prev.deliveryChallans || []), challan] }));
    setOpen(false);
    setForm({ date: new Date().toISOString().slice(0, 10), customerId: '', purpose: 'Job Work', vehicleNo: '', notes: '', items: [emptyLine] });
    notify.success(`Delivery challan ${challan.number} created.`);
  };

  const convert = (challan) => {
    if (typeof onConvert !== 'function') return;
    onConvert(challan);
    setDb((prev) => ({
      ...prev,
      deliveryChallans: (prev.deliveryChallans || []).map((c) => (c.id === challan.id ? { ...c, status: 'Invoiced' } : c)),
    }));
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <PageHeader title="Delivery Challans" description="Goods out without an invoice — job work, approval, own use. Convert to invoice when it becomes a sale." />
        <button type="button" onClick={() => setOpen(true)} className="ui-btn ui-btn-primary">
          <Plus size={15} aria-hidden="true" /> New Challan
        </button>
      </div>

      {open ? (
        <div className="ui-card p-5 space-y-4">
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
              <label className="ui-label">Purpose</label>
              <select value={form.purpose} onChange={(e) => setForm((p) => ({ ...p, purpose: e.target.value }))} className="ui-select w-full px-3 py-2">
                <option>Job Work</option>
                <option>Supply on Approval</option>
                <option>Own Use / Branch</option>
                <option>Exhibition</option>
              </select>
            </div>
            <div>
              <label className="ui-label">Vehicle No</label>
              <input type="text" value={form.vehicleNo} onChange={(e) => setForm((p) => ({ ...p, vehicleNo: e.target.value }))} className="ui-input w-full px-3 py-2" placeholder="KA01AB1234" />
            </div>
          </div>

          <table className="w-full text-sm">
            <thead className="ui-sunken">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium">Item</th>
                <th className="px-3 py-2 text-left text-xs font-medium">Qty</th>
                <th className="px-3 py-2 text-left text-xs font-medium">Rate (for value)</th>
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
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" onClick={() => setForm((p) => ({ ...p, items: [...p.items, emptyLine] }))} className="ui-btn ui-btn-secondary !h-8 text-xs">
            + Add line
          </button>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="ui-btn ui-btn-secondary">Cancel</button>
            <button type="button" onClick={save} className="ui-btn ui-btn-primary">Create Challan</button>
          </div>
        </div>
      ) : null}

      {challans.length === 0 ? (
        <div className="ui-card">
          <EmptyState icon={Truck} title="No delivery challans" description="Send goods for job work or approval without raising an invoice." />
        </div>
      ) : (
        <div className="ui-card overflow-x-auto">
          <table className="ui-table w-full">
            <thead>
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-medium ui-muted uppercase">DC #</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium ui-muted uppercase">Date</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium ui-muted uppercase">Customer</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium ui-muted uppercase">Purpose</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium ui-muted uppercase">Value</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium ui-muted uppercase">Status</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {challans.map((c) => (
                <tr key={c.id} className="border-t">
                  <td className="ui-col-id px-4 py-2.5 font-medium">{c.number}</td>
                  <td className="ui-col-date px-4 py-2.5">{c.date}</td>
                  <td className="ui-col-entity px-4 py-2.5">{c.customerName}</td>
                  <td className="ui-col-meta px-4 py-2.5">{c.purpose}</td>
                  <td className="ui-col-amount px-4 py-2.5 text-right">{formatMoney(c.value || 0, currentCompany)}</td>
                  <td className="px-4 py-2.5"><StatusPill status={c.status} /></td>
                  <td className="px-4 py-2.5 text-right">
                    {c.status === 'Open' ? (
                      <button type="button" onClick={() => convert(c)} className="ui-btn ui-btn-secondary !h-8 text-xs">
                        Convert to Invoice
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
