import React, { useMemo, useState } from 'react';
import { ShoppingCart, Minus, Plus, X } from 'lucide-react';
import { PageHeader } from '../../components/ui/Primitives';
import { notify } from '../../components/ui/notify';
import { computeGstForLines } from '../../utils/gst';
import { formatMoney } from '../../utils/money';
import { createInvoiceApi } from '../../api/invoices';
import { bumpCompanyNextNumber, generateVoucherNumber } from '../../utils/docSettings';

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
  const [customerMobile, setCustomerMobile] = useState('');
  const [busy, setBusy] = useState(false);
  const [dayCloseOpen, setDayCloseOpen] = useState(false);
  const DENOMS = [500, 200, 100, 50, 20, 10, 5, 2, 1];
  const [denomCounts, setDenomCounts] = useState({});

  const today = new Date().toISOString().slice(0, 10);
  const todaysSales = useMemo(
    () => (db.invoices || []).filter((i) => i.companyId === companyId && i.posSale && i.date === today && String(i.status).toLowerCase() !== 'cancelled'),
    [db.invoices, companyId, today]
  );
  const byTender = useMemo(() => {
    const m = { Cash: 0, UPI: 0, Card: 0 };
    for (const s of todaysSales) m[s.tender || 'Cash'] = (m[s.tender || 'Cash'] || 0) + Number(s.total || 0);
    return m;
  }, [todaysSales]);
  const countedCash = DENOMS.reduce((s, d) => s + d * (Number(denomCounts[d]) || 0), 0);
  const overShort = Math.round((countedCash - byTender.Cash) * 100) / 100;

  const saveDayClose = () => {
    const nextId = (db.posDayCloses || []).reduce((m, r) => Math.max(m, Number(r.id) || 0), 0) + 1;
    const record = {
      id: nextId,
      companyId,
      date: today,
      invoices: todaysSales.length,
      cash: byTender.Cash,
      upi: byTender.UPI,
      card: byTender.Card,
      total: byTender.Cash + byTender.UPI + byTender.Card,
      countedCash,
      overShort,
      denomCounts: { ...denomCounts },
      closedAt: new Date().toISOString(),
    };
    setDb((prev) => ({ ...prev, posDayCloses: [...(prev.posDayCloses || []), record] }));

    const w = window.open('', '_blank', 'width=380,height=640');
    if (w) {
      w.document.write(
        `<pre style="font-family:monospace;font-size:12px;padding:12px">` +
          `${currentCompany.name}\nZ REPORT · ${today}\n` +
          `--------------------------------\n` +
          `Invoices     ${record.invoices}\n` +
          `Cash         ${record.cash.toFixed(2)}\nUPI          ${record.upi.toFixed(2)}\nCard         ${record.card.toFixed(2)}\n` +
          `TOTAL        ${record.total.toFixed(2)}\n` +
          `--------------------------------\n` +
          `Counted cash ${countedCash.toFixed(2)}\nExpected     ${record.cash.toFixed(2)}\n` +
          `${overShort === 0 ? 'TALLIED' : overShort > 0 ? `OVER  +${overShort.toFixed(2)}` : `SHORT ${overShort.toFixed(2)}`}\n` +
          `</pre>`
      );
      w.document.close();
      w.print();
    }
    setDayCloseOpen(false);
    setDenomCounts({});
    notify.success(`Day closed — ${record.invoices} sale(s), ${overShort === 0 ? 'cash tallied' : overShort > 0 ? `over by ₹${overShort}` : `short by ₹${-overShort}`}.`);
  };

  const filtered = items.filter(
    (i) =>
      !search ||
      String(i.name || '').toLowerCase().includes(search.toLowerCase()) ||
      String(i.code || '').toLowerCase().includes(search.toLowerCase()) ||
      String(i.barcode || '').toLowerCase() === search.toLowerCase()
  );

  /**
   * Barcode scanners are keyboards that type fast and press Enter. Enter in
   * the search box with an exact barcode/code match adds the item and clears
   * the box, so back-to-back scans just work.
   */
  const onSearchKeyDown = (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const term = search.trim().toLowerCase();
    if (!term) return;
    const hit =
      items.find((i) => String(i.barcode || '').toLowerCase() === term) ||
      items.find((i) => String(i.code || '').toLowerCase() === term) ||
      (filtered.length === 1 ? filtered[0] : null);
    if (hit) {
      addToCart(hit);
      setSearch('');
    } else {
      notify.error(`No item matches "${search.trim()}"`);
    }
  };

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
      // Branch-scoped POS series, like every other document type.
      const activeBranchId = String(localStorage.getItem('activeBranchId') || localStorage.getItem('branchId') || '').trim();
      const posSeq = (db.invoices || []).filter((i) => i.companyId === companyId && String(i.number || '').startsWith('POS-')).length + 1;
      const number =
        generateVoucherNumber({ db, company: currentCompany, voucherKey: 'pos', branchId: activeBranchId || null }) || `POS-${posSeq}`;
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
        customerMobile: customerMobile.trim(),
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
        companies: bumpCompanyNextNumber({
          db: prev,
          companyId,
          voucherKey: 'pos',
          usedNumber: number,
          branchId: activeBranchId || null,
        }),
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
      setCustomerMobile('');
      notify.success(`${number} — ${formatMoney(computed.total, currentCompany)} received by ${tender}.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <PageHeader title="Point of Sale" description="Counter sales — tap items, take payment, invoice and receipt book themselves." />
        <button type="button" onClick={() => setDayCloseOpen(true)} className="ui-btn ui-btn-secondary">
          Day Close ({todaysSales.length})
        </button>
      </div>

      {dayCloseOpen ? (
        <div className="ui-card space-y-4 p-5">
          <h3 className="ui-title text-base">Day close — {today}</h3>
          <div className="grid gap-3 sm:grid-cols-4 text-sm">
            <div className="ui-sunken rounded-lg p-3"><div className="ui-caption">Invoices</div><div className="text-xl font-bold">{todaysSales.length}</div></div>
            <div className="ui-sunken rounded-lg p-3"><div className="ui-caption">Cash</div><div className="text-xl font-bold">{formatMoney(byTender.Cash, currentCompany)}</div></div>
            <div className="ui-sunken rounded-lg p-3"><div className="ui-caption">UPI</div><div className="text-xl font-bold">{formatMoney(byTender.UPI, currentCompany)}</div></div>
            <div className="ui-sunken rounded-lg p-3"><div className="ui-caption">Card</div><div className="text-xl font-bold">{formatMoney(byTender.Card, currentCompany)}</div></div>
          </div>

          <div>
            <div className="ui-label mb-1">Cash denomination count</div>
            <div className="flex flex-wrap gap-2">
              {DENOMS.map((d) => (
                <label key={d} className="flex items-center gap-1 text-sm">
                  <span className="ui-muted w-10 text-right">₹{d} ×</span>
                  <input
                    type="number"
                    min="0"
                    value={denomCounts[d] ?? ''}
                    onChange={(e) => setDenomCounts((p) => ({ ...p, [d]: e.target.value }))}
                    className="ui-input !h-8 w-16 px-2 text-sm"
                    placeholder="0"
                  />
                </label>
              ))}
            </div>
            <div className="mt-2 text-sm">
              Counted: <strong>{formatMoney(countedCash, currentCompany)}</strong> · Expected cash: <strong>{formatMoney(byTender.Cash, currentCompany)}</strong> ·{' '}
              {overShort === 0 ? (
                <span className="ui-amount-pos font-semibold">Tallied</span>
              ) : overShort > 0 ? (
                <span className="font-semibold">Over {formatMoney(overShort, currentCompany)}</span>
              ) : (
                <span className="ui-amount-neg font-semibold">Short {formatMoney(-overShort, currentCompany)}</span>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setDayCloseOpen(false)} className="ui-btn ui-btn-secondary">Cancel</button>
            <button type="button" onClick={saveDayClose} className="ui-btn ui-btn-primary">Close day & print Z report</button>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={onSearchKeyDown}
            className="ui-input mb-3 w-full px-3 py-2"
            placeholder="Search name / code — or scan a barcode"
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
              <input
                type="tel"
                value={customerMobile}
                onChange={(e) => setCustomerMobile(e.target.value.replace(/[^\d+ -]/g, '').slice(0, 15))}
                className="ui-input w-full px-3 py-2 text-sm"
                placeholder="Customer mobile (optional)"
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
