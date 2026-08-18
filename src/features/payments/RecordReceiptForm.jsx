import React, { useMemo, useState } from 'react';
import { notify } from '../../components/ui/notify';

import CustomerPicker from '../../components/pickers/CustomerPicker';
import { createPayment } from '../../api/payments';
import usePaymentModes, { modeLabel } from './usePaymentModes';
import { getNextNumericId } from '../../utils/ids';
import { formatMoney, round2 } from '../../utils/money';

const safeArray = (v) => (Array.isArray(v) ? v : []);

const getInvoiceBalance = (inv) => {
  const total = Number(inv?.total ?? 0);
  const paid = Number(inv?.paidAmount ?? 0);
  const bal = total - paid;
  return Number.isFinite(bal) ? Math.max(0, round2(bal)) : 0;
};

const canCollectAgainstInvoice = (inv) => {
  const rawStatus = String(inv?.status || '').trim();
  if (rawStatus === 'Draft') return false;
  if (rawStatus === 'Cancelled') return false;
  return getInvoiceBalance(inv) > 0.0001;
};

const RecordReceiptForm = ({ db, setDb, currentCompany, onClose, initialData = null, onSaved, hideMode = false }) => {
  const companyId = currentCompany.id;

  const initial = useMemo(() => {
    const d = initialData && typeof initialData === 'object' ? initialData : null;
    return {
      date: String(d?.date || '').trim() || new Date().toISOString().slice(0, 10),
      customerId: d?.customerId !== undefined && d?.customerId !== null ? String(d.customerId) : '',
      amount: d?.amount !== undefined && d?.amount !== null ? String(d.amount) : '',
      mode: String(d?.mode || '').trim() || 'Cash',
      ledgerAccountId: String(d?.ledgerAccountId || '').trim(),
      reference: String(d?.reference || '').trim(),
      notes: String(d?.notes || '').trim(),
      cashBankAccountId: d?.cashBankAccountId,
      sourceBankTransactionId: d?.sourceBankTransactionId,
    };
  }, [initialData]);

  const [formData, setFormData] = useState(() => ({
    date: initial.date,
    customerId: initial.customerId,
    amount: initial.amount,
    mode: initial.mode,
    ledgerAccountId: initial.ledgerAccountId,
    reference: initial.reference,
    notes: initial.notes,
  }));

  const { modes, loading: modesLoading, error: modesError } = usePaymentModes();
  const [saving, setSaving] = useState(false);

  // With exactly one cash/bank ledger there is no choice to make, so treat it
  // as chosen. Derived rather than written into state by an effect: the user's
  // own pick always wins, and no extra render is spent agreeing with itself.
  //
  // hideMode is the cash/bank book, where the account is implied by the book
  // you are standing in. It still has to resolve to a real ledger, otherwise a
  // receipt entered from the bank book would never reach the general ledger --
  // which is exactly what happens to every receipt once the standalone screens
  // are switched off.
  const impliedByBook = useMemo(() => {
    if (!hideMode) return '';
    const wanted = String(formData.mode || '').toLowerCase() === 'cash' ? 'CASH' : 'BANK';
    return modes.find((m) => m.controlKind === wanted)?.id || modes[0]?.id || '';
  }, [hideMode, formData.mode, modes]);

  const ledgerAccountId =
    formData.ledgerAccountId || (modes.length === 1 ? modes[0].id : '') || impliedByBook;

  const [allocations, setAllocations] = useState(() => ({}));

  const invoices = useMemo(() => {
    return safeArray(db.invoices)
      .filter((i) => i.companyId === companyId)
      .sort((a, b) => {
        const da = String(a.date || '');
        const dbb = String(b.date || '');
        if (da !== dbb) return da < dbb ? 1 : -1;
        return Number(b.id) - Number(a.id);
      });
  }, [db.invoices, companyId]);

  const outstandingInvoices = useMemo(() => {
    const cid = Number(formData.customerId);
    if (!Number.isFinite(cid) || !cid) return [];

    return invoices
      .filter((inv) => Number(inv.customerId) === cid)
      .filter((inv) => canCollectAgainstInvoice(inv));
  }, [formData.customerId, invoices]);

  const selectedInvoiceIds = useMemo(() => {
    return Object.entries(allocations)
      .filter(([, v]) => Boolean(v?.selected))
      .map(([k]) => Number(k))
      .filter((n) => Number.isFinite(n));
  }, [allocations]);

  const computed = useMemo(() => {
    const receiptAmount = Number(formData.amount ?? 0);
    const totalAmount = Number.isFinite(receiptAmount) ? Math.max(0, receiptAmount) : 0;

    let allocated = 0;
    const lines = [];

    for (const inv of outstandingInvoices) {
      const key = String(inv.id);
      const row = allocations[key];
      if (!row?.selected) continue;
      const want = Number(row?.amount ?? 0);
      const amt = Number.isFinite(want) ? Math.max(0, want) : 0;
      if (amt <= 0) continue;
      const balance = getInvoiceBalance(inv);
      const capped = Math.min(balance, amt);
      if (capped <= 0) continue;

      allocated = round2(allocated + capped);
      lines.push({
        invoiceId: Number(inv.id),
        invoiceNumber: inv.number,
        amount: round2(capped),
      });
    }

    const advance = round2(Math.max(0, totalAmount - allocated));

    return {
      totalAmount: round2(totalAmount),
      allocated: round2(allocated),
      advance,
      lines,
    };
  }, [allocations, formData.amount, outstandingInvoices]);

  const toggleInvoice = (inv, selected) => {
    const key = String(inv.id);

    setAllocations((prev) => {
      const next = { ...prev };
      const existing = next[key] || { selected: false, amount: 0 };

      const nextSelected = Boolean(selected);
      let nextAmount = existing.amount;

      if (nextSelected && (!Number(nextAmount) || Number(nextAmount) <= 0)) {
        // Default allocation to remaining (or full outstanding if no amount entered).
        const receiptAmount = Number(formData.amount ?? 0);
        const totalAmount = Number.isFinite(receiptAmount) ? Math.max(0, receiptAmount) : 0;

        const alreadyAllocated = Object.entries(prev)
          .filter(([entryKey, v]) => entryKey !== key && v?.selected)
          .reduce((sum, [, v]) => {
            const amt = Number(v?.amount ?? 0);
            return sum + (Number.isFinite(amt) ? Math.max(0, amt) : 0);
          }, 0);

        const remaining = Math.max(0, totalAmount - alreadyAllocated);
        const suggested = Math.min(getInvoiceBalance(inv), remaining || getInvoiceBalance(inv));
        nextAmount = round2(suggested);
      }

      next[key] = { ...existing, selected: nextSelected, amount: nextAmount };
      return next;
    });
  };

  const setInvoiceAmount = (inv, amount) => {
    const key = String(inv.id);
    setAllocations((prev) => {
      const next = { ...prev };
      const existing = next[key] || { selected: true, amount: 0 };
      next[key] = { ...existing, selected: true, amount };
      return next;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const amount = Number(formData.amount ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      notify.error('Receipt amount must be greater than 0');
      return;
    }

    const customerIdNum = Number(formData.customerId);
    if (!Number.isFinite(customerIdNum) || !customerIdNum) {
      notify.error('Party (Customer) is required');
      return;
    }

    // Validate allocations are within invoice balances
    for (const line of computed.lines) {
      const inv = safeArray(db.invoices).find((i) => i.companyId === companyId && Number(i.id) === Number(line.invoiceId));
      if (!inv) {
        notify.error('One of the selected invoices was not found. Please refresh and try again.');
        return;
      }
      if (!canCollectAgainstInvoice(inv)) {
        notify.error(`Cannot record against invoice ${inv.number || ''} (Draft/Cancelled/No balance).`);
        return;
      }
      const balance = getInvoiceBalance(inv);
      if (Number(line.amount) > balance + 0.0001) {
        notify.error(`Allocation exceeds outstanding for invoice ${inv.number || ''}.`);
        return;
      }
    }

    if (computed.allocated > amount + 0.0001) {
      notify.error('Total allocated cannot be more than receipt amount');
      return;
    }

    if (!hideMode && !String(ledgerAccountId || "").trim()) {
      notify.error('Choose the cash or bank account the money was received into');
      return;
    }

    const customers = safeArray(db.customers).filter((c) => c.companyId === companyId);
    const customer = customers.find((c) => Number(c.id) === customerIdNum) || null;
    const customerName = customer?.name || customer?.displayName || customer?.companyName || customer?.legalName || '';

    const paymentId = getNextNumericId(db.payments);

    // Post to the server first: it allocates the number and writes the
    // double-entry. Only invoices that exist on the server can be allocated
    // against there; anything created before the API migration is still sent,
    // just unallocated, so the cash is never lost from the books.
    let posted = null;
    if (String(ledgerAccountId || "").trim()) {
      const invoiceById = new Map(safeArray(db.invoices).map((i) => [Number(i.id), i]));
      const serverAllocations = computed.lines
        .map((l) => {
          const backendId = String(invoiceById.get(Number(l.invoiceId))?.backendInvoiceId || '').trim();
          return backendId ? { docType: 'INVOICE', docId: backendId, amount: round2(l.amount) } : null;
        })
        .filter(Boolean);

      setSaving(true);
      try {
        posted = await createPayment({
          direction: 'RECEIPT',
          date: formData.date,
          partyType: 'CUSTOMER',
          // Only a server party id is meaningful here. The local row carries
          // backendPartyId once it has been written through; customers that
          // predate that are sent by name alone, so the ledger line still reads
          // correctly.
          partyId: customer?.backendPartyId ? String(customer.backendPartyId) : null,
          partyName: customerName || null,
          ledgerAccountId: String(ledgerAccountId).trim(),
          instrumentRef: formData.reference || null,
          amount: round2(amount),
          notes: formData.notes || null,
          allocations: serverAllocations,
        });
      } catch (err) {
        setSaving(false);
        notify.error(String(err?.message || 'Unable to record the receipt.'));
        return;
      }
      setSaving(false);
    }

    // Prefer the server's series number over a browser-minted one, which two
    // tabs can duplicate.
    const receiptNo = String(posted?.number || '').trim() || `RCPT-${paymentId}`;

    const receiptRecord = {
      id: paymentId,
      companyId,
      voucherType: 'receipt',
      voucherId: null,
      direction: 'IN',
      cashBankAccountId:
        initial.cashBankAccountId !== undefined && initial.cashBankAccountId !== null && String(initial.cashBankAccountId) !== ''
          ? Number(initial.cashBankAccountId)
          : undefined,
      sourceBankTransactionId:
        initial.sourceBankTransactionId !== undefined && initial.sourceBankTransactionId !== null && String(initial.sourceBankTransactionId) !== ''
          ? Number(initial.sourceBankTransactionId)
          : undefined,
      receiptNo,
      date: formData.date,
      customerId: customerIdNum,
      customerName,
      amount: round2(amount),
      allocatedAmount: round2(computed.allocated),
      advanceAmount: round2(computed.advance),
      allocations: computed.lines.map((l) => ({
        voucherType: 'invoice',
        voucherId: l.invoiceId,
        documentNumber: l.invoiceNumber,
        amount: round2(l.amount),
      })),
      mode: formData.mode,
      // Links the local row to the posted server payment and the ledger the
      // money actually landed in.
      backendPaymentId: posted?.id ? String(posted.id) : undefined,
      ledgerAccountId: String(ledgerAccountId || "").trim() || undefined,
      reference: formData.reference,
      notes: formData.notes,
      createdAt: new Date().toISOString(),
    };

    // Apply allocations to invoices
    const nextInvoices = safeArray(db.invoices).map((inv) => {
      if (inv.companyId !== companyId) return inv;

      const line = receiptRecord.allocations.find((a) => Number(a.voucherId) === Number(inv.id));
      if (!line) return inv;

      const total = Number(inv.total ?? 0);
      const alreadyPaid = Number(inv.paidAmount ?? 0);
      const nextPaid = round2(Math.min(total, alreadyPaid + Number(line.amount ?? 0)));

      const rawStatus = String(inv.status || '').trim();
      const nextStatus =
        rawStatus === 'Draft'
          ? 'Draft'
          : total > 0 && nextPaid >= total - 0.0001
            ? 'Paid'
            : nextPaid > 0
              ? 'Partial'
              : 'Unpaid';

      return {
        ...inv,
        paidAmount: nextPaid,
        status: nextStatus,
        updatedAt: new Date().toISOString(),
      };
    });

    setDb({
      ...db,
      invoices: nextInvoices,
      payments: [...safeArray(db.payments), receiptRecord],
    });

    onSaved?.(receiptRecord);

    notify.error(computed.advance > 0 ? 'Receipt recorded (with advance)!' : 'Receipt recorded!');
    onClose?.();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Receipt Date</label>
          <input
            type="date"
            value={formData.date}
            onChange={(e) => setFormData((p) => ({ ...p, date: e.target.value }))}
            className="ui-input w-full px-3 py-2"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Amount Received</label>
          <input
            type="number"
            value={formData.amount}
            onChange={(e) => setFormData((p) => ({ ...p, amount: e.target.value }))}
            className="ui-input w-full px-3 py-2"
            min="0"
            step="0.01"
            required
          />
        </div>

        <div className="col-span-2">
          <CustomerPicker
            db={db}
            setDb={setDb}
            currentCompany={currentCompany}
            value={formData.customerId}
            onChange={(customerId) => {
              setFormData((p) => ({ ...p, customerId }));
              setAllocations({});
            }}
          />
        </div>

        {!hideMode ? (
          <div>
            <label className="block text-sm font-medium mb-1">
              Received into <span className="text-red-600">*</span>
            </label>
            <select
              value={ledgerAccountId}
              onChange={(e) => setFormData((p) => ({ ...p, ledgerAccountId: e.target.value }))}
              className="ui-select w-full px-3 py-2"
              disabled={modesLoading}
              required
            >
              <option value="">{modesLoading ? 'Loading accounts…' : 'Select cash or bank account'}</option>
              {modes.map((m) => (
                <option key={m.id} value={m.id}>
                  {modeLabel(m)}
                </option>
              ))}
            </select>
            {modesError ? (
              <p className="mt-1 text-sm text-red-600">{modesError}</p>
            ) : !modesLoading && modes.length === 0 ? (
              <p className="mt-1 text-sm text-amber-700">
                No cash or bank ledgers yet. Create one under Accounting → Ledgers.
              </p>
            ) : null}
          </div>
        ) : null}
        <div>
          <label className="block text-sm font-medium mb-1">Reference</label>
          <input
            type="text"
            value={formData.reference}
            onChange={(e) => setFormData((p) => ({ ...p, reference: e.target.value }))}
            className="ui-input w-full px-3 py-2"
            placeholder="Txn / UTR / Cheque no"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 text-sm ui-sunken border rounded-lg p-3">
        <div>
          <div className="ui-muted">Allocated</div>
          <div className="font-semibold">{formatMoney(computed.allocated, currentCompany)}</div>
        </div>
        <div>
          <div className="ui-muted">Advance</div>
          <div className="font-semibold">{formatMoney(computed.advance, currentCompany)}</div>
        </div>
        <div>
          <div className="ui-muted">Selected Invoices</div>
          <div className="font-semibold">{selectedInvoiceIds.length}</div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">Outstanding Invoices</div>
          {formData.customerId ? (
            <div className="text-sm ui-muted">{outstandingInvoices.length} invoice(s)</div>
          ) : (
            <div className="text-sm ui-muted">Select party to load invoices</div>
          )}
        </div>

        <div className="ui-surface rounded-xl shadow-sm overflow-hidden border">
          <table className="ui-table w-full">
            <thead className="ui-sunken border-b">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium ui-muted uppercase w-12">Sel</th>
                <th className="px-4 py-3 text-left text-xs font-medium ui-muted uppercase">Invoice #</th>
                <th className="px-4 py-3 text-left text-xs font-medium ui-muted uppercase">Date</th>
                <th className="px-4 py-3 text-right text-xs font-medium ui-muted uppercase">Outstanding</th>
                <th className="px-4 py-3 text-right text-xs font-medium ui-muted uppercase">Allocate</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {!formData.customerId ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center ui-muted">
                    Select party name to see outstanding invoices
                  </td>
                </tr>
              ) : outstandingInvoices.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center ui-muted">
                    No outstanding invoices. This receipt will be recorded as advance.
                  </td>
                </tr>
              ) : (
                outstandingInvoices.map((inv) => {
                  const key = String(inv.id);
                  const selected = Boolean(allocations[key]?.selected);
                  const allocValue = allocations[key]?.amount ?? '';
                  const bal = getInvoiceBalance(inv);

                  return (
                    <tr key={inv.id} className="ui-hover-sunken">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={(e) => toggleInvoice(inv, e.target.checked)}
                        />
                      </td>
                      <td className="ui-col-meta px-4 py-3 font-medium">{inv.number || '-'}</td>
                      <td className="ui-col-date px-4 py-3">{inv.date || '-'}</td>
                      <td className="ui-col-amount px-4 py-3 text-right font-semibold">{formatMoney(bal, currentCompany)}</td>
                      <td className="px-4 py-3 text-right">
                        <input
                          type="number"
                          value={allocValue}
                          onChange={(e) => setInvoiceAmount(inv, e.target.value)}
                          className="ui-input w-32 px-2 py-1 text-right"
                          min="0"
                          step="0.01"
                          disabled={!formData.amount}
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Notes</label>
        <textarea
          value={formData.notes}
          onChange={(e) => setFormData((p) => ({ ...p, notes: e.target.value }))}
          className="ui-input w-full px-3 py-2"
          rows={3}
        />
      </div>

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="px-4 py-2 border rounded-lg ui-hover-sunken">
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 ui-primary-bg rounded-lg disabled:opacity-50"
        >
          {saving ? 'Recording…' : 'Record Receipt'}
        </button>
      </div>
    </form>
  );
};

export default RecordReceiptForm;
