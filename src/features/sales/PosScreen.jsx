import React, { useMemo, useState } from 'react';
import { ShoppingCart, Minus, Plus, X } from 'lucide-react';
import { PageHeader } from '../../components/ui/Primitives';
import { notify } from '../../components/ui/notify';
import { computeGstForLines } from '../../utils/gst';
import { formatMoney } from '../../utils/money';
import { createInvoiceApi } from '../../api/invoices';

/**
 * Point of sale — the fast lane for counter sales. Search or tap items, take
 * cash/UPI/card, done: it books a normal PAID invoice (B2C, intra-state) plus
 * its receipt, so the books and GST reports see POS sales like any other.
 */
export default function PosScreen({ db, setDb, currentCompany }) {
  const companyId = currentCompany.id;
  const items = useMemo(
    () => (db.items || []).filter((i) => i.companyId === companyId && Number(i.salePrice || 0) > 0),
    [db.items, companyId]
  );

  const [search, setSearch] = useState('');
  const [cart, setCart] = useState([]); // {itemId, name, rate, gstRate, qty}
  const [tender, setTender] = useState('Cash');
  const [customerName, setCustomerName] = useState('');
  const [busy, setBusy] = useState(false);

  const filtered = items.filter(
    (i) => !search || String(i.name || '').toLowerCase().includes(search.toLowerCase()) || String(i.code || '').toLowerCase().includes(search.toLowerCase())
  );

  const addToCart = (item) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.itemId === item.id);
      if (existing) return prev.map((c) => (c.itemId === item.id ? { ...c, qty: c.qty + 1 } : c));
      return [...prev, { itemId: item.id, name: item.name, rate: Number(item.salePrice || 0), gstRate: Number(item.gstRate || 0), qty: 1 }];
    });
  };
  const bump = (itemId, delta) =>
    setCart((prev) => prev.map((c) => (c.itemId === itemId ? { ...c, qty: Math.max(1, c.qty + delta) } : c)));
  const drop = (itemId) => setCart((prev) => prev.filter((c) => c.itemId !== itemId));

  // Walk-in sales are intra-state by definition — the buyer is at the counter.
  const computed = computeGstForLines({
    lines: cart.map((c) => ({ itemId: String(c.itemId), description: c.name, quantity: c.qty, rate: c.rate, gstRate: c.gstRate })),
    isIntra: true,
  });

  const checkout = async () => {
    if (!cart.length) {
      notify.error('Cart is empty');
      return;
    }
    setBusy(true);
    try {
      const buyer = customerName.trim() || 'Walk-in Customer';
      const nextInvId = (db.invoices || []).reduce((m, i) => Math.max(m, Number(i.id) || 0), 0) + 1;
      const posSeq = (db.invoices || []).filter((i) => i.companyId === companyId && String(i.number || '').startsWith('POS-')).length + 1;
      const number = `POS-${posSeq}`;
      const today = new Date().toISOString().slice(0, 10);

      let backendInvoiceId;
      const hasApi = Boolean(String(localStorage.getItem('token') || '').trim() && String(localStorage.getItem('activeOrgId') || '').trim());
      if (hasApi) {
        try {
          const saved = await createInvoiceApi({
            number,
            date: today,
            dueDate: today,
            customerName: buyer,
            taxType: 'CGST_SGST',
            subtotal: computed.subtotal,
            cgstTotal: computed.cgstTotal,
            sgstTotal: computed.sgstTotal,
            igstTotal: 0,
            gstTotal: computed.gstTotal,
            total: computed.total,
            status: 'Paid',
            items: computed.lines,
          });
          backendInvoiceId = String(saved?.id || '') || undefined;
        } catch (err) {
          notify.error(String(err?.message || 'POS sale not saved to the server.'));
          setBusy(false);
          return;
        }
      }

      const invoice = {
        id: nextInvId,
        companyId,
        backendInvoiceId,
        number,
        date: today,
        dueDate: today,
        customerId: '',
        customerName: buyer,
        taxType: 'CGST_SGST',
        items: computed.lines,
        subtotal: computed.subtotal,
        cgstTotal: computed.cgstTotal,
        sgstTotal: computed.sgstTotal,
        igstTotal: 0,
        gstTotal: computed.gstTotal,
        total: computed.total,
        paidAmount: computed.total,
        status: 'Paid',
        posSale: true,
        tender,
        createdAt: new Date().toISOString(),
      };
      const nextPayId = (db.payments || []).reduce((m, p) => Math.max(m, Number(p.id) || 0), 0) + 1;
      const receipt = {
        id: nextPayId,
        companyId,
        voucherType: 'receipt',
        direction: 'IN',
        receiptNo: `RCPT-${number}`,
        date: today,
        customerId: null,
        customerName: buyer,
        amount: computed.total,
        allocatedAmount: computed.total,
        advanceAmount: 0,
        allocations: [{ voucherType: 'invoice', voucherId: nextInvId, documentNumber: number, amount: computed.total }],
        mode: tender,
        notes: `POS sale ${number}`,
        createdAt: new Date().toISOString(),
      };

      setDb((prev) => ({
        ...prev,
        invoices: [...(prev.invoices || []), invoice],
        payments: [...(prev.payments || []), receipt],
      }));

      // Print-friendly receipt.
      const w = window.open('', '_blank', 'width=380,height=600');
      if (w) {
        w.document.write(
          `<pre style="font-family:monospace;font-size:12px;padding:12px">` +
            `${currentCompany.name}\n${number} · ${today}\nCustomer: ${buyer}\n` +
            `--------------------------------\n` +
            computed.lines.map((l) => `${l.description}\n  ${l.quantity} x ${l.rate.toFixed(2)} = ${l.lineTotal.toFixed(2)}`).join('\n') +
            `\n--------------------------------\n` +
            `Subtotal  ${computed.subtotal.toFixed(2)}\nGST       ${computed.gstTotal.toFixed(2)}\nTOTAL     ${computed.total.toFixed(2)}\nPaid by   ${tender}\n\nThank you!` +
            `</pre>`
        );
        w.document.close();
        w.print();
      }

      setCart([]);
      setCustomerName('');
      notify.success(`${number} — ${formatMoney(computed.total, currentCompany)} received by ${tender}.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Point of Sale" description="Counter sales — tap items, take payment, invoice and receipt book themselves." />

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="ui-input mb-3 w-full px-3 py-2"
            placeholder="Search item name or code…"
            autoFocus
          />
          <div className="grid max-h-[30rem] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
            {filtered.slice(0, 60).map((i) => (
              <button
                key={i.id}
                type="button"
                onClick={() => addToCart(i)}
                className="ui-card ui-lift p-3 text-left"
              >
                <div className="truncate text-sm font-medium">{i.name}</div>
                <div className="ui-caption">{formatMoney(Number(i.salePrice || 0), currentCompany)} · GST {Number(i.gstRate || 0)}%</div>
              </button>
            ))}
            {filtered.length === 0 ? <div className="ui-muted col-span-full p-6 text-center text-sm">No items match.</div> : null}
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="ui-card p-4">
            <h3 className="ui-title mb-3 flex items-center gap-2 text-base">
              <ShoppingCart size={16} aria-hidden="true" /> Cart
            </h3>
            {cart.length === 0 ? (
              <p className="ui-muted py-6 text-center text-sm">Tap items to add them.</p>
            ) : (
              <div className="space-y-2">
                {cart.map((c) => (
                  <div key={c.itemId} className="flex items-center gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">{c.name}</span>
                    <button type="button" onClick={() => bump(c.itemId, -1)} className="ui-icon-btn !h-7 !w-7" aria-label="Less"><Minus size={12} /></button>
                    <span className="w-6 text-center">{c.qty}</span>
                    <button type="button" onClick={() => bump(c.itemId, 1)} className="ui-icon-btn !h-7 !w-7" aria-label="More"><Plus size={12} /></button>
                    <span className="ui-col-amount w-20 text-right">{formatMoney(c.qty * c.rate, currentCompany)}</span>
                    <button type="button" onClick={() => drop(c.itemId)} className="ui-icon-btn !h-7 !w-7" aria-label="Remove"><X size={12} /></button>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 space-y-1 border-t pt-3 text-sm">
              <div className="flex justify-between"><span>Subtotal</span><span>{formatMoney(computed.subtotal, currentCompany)}</span></div>
              <div className="flex justify-between"><span>GST</span><span>{formatMoney(computed.gstTotal, currentCompany)}</span></div>
              <div className="flex justify-between text-lg font-bold"><span>Total</span><span>{formatMoney(computed.total, currentCompany)}</span></div>
            </div>

            <div className="mt-3 space-y-2">
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="ui-input w-full px-3 py-2 text-sm"
                placeholder="Customer name (optional — Walk-in)"
              />
              <div className="flex gap-2">
                {['Cash', 'UPI', 'Card'].map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTender(t)}
                    className={`ui-btn !h-9 flex-1 text-sm ${tender === t ? 'ui-btn-primary' : 'ui-btn-secondary'}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <button type="button" onClick={checkout} disabled={busy || !cart.length} className="ui-btn ui-btn-primary !h-11 w-full text-base">
                {busy ? 'Booking…' : `Charge ${formatMoney(computed.total, currentCompany)}`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
