import React, { useMemo, useState } from 'react';

import VendorPicker from '../../components/pickers/VendorPicker';
import { createPayment } from '../../api/payments';
import usePaymentModes, { modeLabel } from './usePaymentModes';
import { formatMoney, round2 } from '../../utils/money';

const safeArray = (v) => (Array.isArray(v) ? v : []);

const getDocBalance = (doc) => {
  const total = Number(doc?.total ?? 0);
  const paid = Number(doc?.paidAmount ?? 0);
  const bal = total - paid;
  return Number.isFinite(bal) ? Math.max(0, round2(bal)) : 0;
};

const canPayDoc = (doc) => {
  const rawStatus = String(doc?.status || '').trim();
  if (rawStatus === 'Draft') return false;
  return getDocBalance(doc) > 0.0001;
};

const RecordDisbursementForm = ({ db, setDb, currentCompany, onClose, initialData = null, onSaved, hideMode = false }) => {
  const companyId = currentCompany.id;

  const initial = useMemo(() => {
    const d = initialData && typeof initialData === 'object' ? initialData : null;
    return {
      date: String(d?.date || '').trim() || new Date().toISOString().slice(0, 10),
      vendorId: d?.vendorId !== undefined && d?.vendorId !== null ? String(d.vendorId) : '',
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
    vendorId: initial.vendorId,
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
  const ledgerAccountId = formData.ledgerAccountId || (modes.length === 1 ? modes[0].id : '');

  const [allocations, setAllocations] = useState(() => ({}));

  const bills = useMemo(() => {
    return safeArray(db.bills)
      .filter((b) => b.companyId === companyId)
      .sort((a, b) => {
        const da = String(a.date || '');
        const dbb = String(b.date || '');
        if (da !== dbb) return da < dbb ? 1 : -1;
        return Number(b.id) - Number(a.id);
      });
  }, [db.bills, companyId]);

  const expenses = useMemo(() => {
    return safeArray(db.expenses)
      .filter((e) => e.companyId === companyId)
      .sort((a, b) => {
        const da = String(a.date || '');
        const dbb = String(b.date || '');
        if (da !== dbb) return da < dbb ? 1 : -1;
        return Number(b.id) - Number(a.id);
      });
  }, [db.expenses, companyId]);

  const outstandingDocs = useMemo(() => {
    const vid = Number(formData.vendorId);
    if (!Number.isFinite(vid) || !vid) return [];

    const billRows = bills
      .filter((b) => Number(b.vendorId) === vid)
      .filter((b) => canPayDoc(b))
      .map((b) => ({
        key: `bill:${b.id}`,
        voucherType: 'bill',
        id: Number(b.id),
        number: b.number,
        date: b.date,
        balance: getDocBalance(b),
      }));

    const expenseRows = expenses
      .filter((e) => Number(e.vendorId) === vid)
      .filter((e) => canPayDoc(e))
      .map((e) => ({
        key: `expense:${e.id}`,
        voucherType: 'expense',
        id: Number(e.id),
        number: e.number,
        date: e.date,
        balance: getDocBalance(e),
      }));

    return [...billRows, ...expenseRows].sort((a, b) => {
      const da = String(a.date || '');
      const dbb = String(b.date || '');
      if (da !== dbb) return da < dbb ? 1 : -1;
      return Number(b.id) - Number(a.id);
    });
  }, [bills, expenses, formData.vendorId]);

  const computed = useMemo(() => {
    const payAmountRaw = Number(formData.amount ?? 0);
    const totalAmount = Number.isFinite(payAmountRaw) ? Math.max(0, payAmountRaw) : 0;

    let allocated = 0;
    const lines = [];

    for (const d of outstandingDocs) {
      const row = allocations[d.key];
      if (!row?.selected) continue;
      const want = Number(row?.amount ?? 0);
      const amt = Number.isFinite(want) ? Math.max(0, want) : 0;
      if (amt <= 0) continue;

      const capped = Math.min(d.balance, amt);
      if (capped <= 0) continue;

      allocated = round2(allocated + capped);
      lines.push({
        voucherType: d.voucherType,
        voucherId: d.id,
        documentNumber: d.number,
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
  }, [allocations, formData.amount, outstandingDocs]);

  const toggleDoc = (doc, selected) => {
    setAllocations((prev) => {
      const next = { ...prev };
      const existing = next[doc.key] || { selected: false, amount: 0 };

      const nextSelected = Boolean(selected);
      let nextAmount = existing.amount;

      if (nextSelected && (!Number(nextAmount) || Number(nextAmount) <= 0)) {
        const payAmountRaw = Number(formData.amount ?? 0);
        const totalAmount = Number.isFinite(payAmountRaw) ? Math.max(0, payAmountRaw) : 0;

        const alreadyAllocated = Object.entries(prev)
          .filter(([k, v]) => k !== doc.key && v?.selected)
          .reduce((sum, [, v]) => {
            const amt = Number(v?.amount ?? 0);
            return sum + (Number.isFinite(amt) ? Math.max(0, amt) : 0);
          }, 0);

        const remaining = Math.max(0, totalAmount - alreadyAllocated);
        const suggested = Math.min(doc.balance, remaining || doc.balance);
        nextAmount = round2(suggested);
      }

      next[doc.key] = { ...existing, selected: nextSelected, amount: nextAmount };
      return next;
    });
  };

  const setDocAmount = (doc, amount) => {
    setAllocations((prev) => {
      const next = { ...prev };
      const existing = next[doc.key] || { selected: true, amount: 0 };
      next[doc.key] = { ...existing, selected: true, amount };
      return next;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const amount = Number(formData.amount ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      alert('Payment amount must be greater than 0');
      return;
    }

    const vendorIdNum = Number(formData.vendorId);
    if (!Number.isFinite(vendorIdNum) || !vendorIdNum) {
      alert('Party (Vendor) is required');
      return;
    }

    if (computed.allocated > amount + 0.0001) {
      alert('Total allocated cannot be more than payment amount');
      return;
    }

    // Validate each allocation against latest balances
    const billsList = safeArray(db.bills).filter((b) => b.companyId === companyId);
    const expensesList = safeArray(db.expenses).filter((x) => x.companyId === companyId);

    for (const line of computed.lines) {
      const list = line.voucherType === 'bill' ? billsList : expensesList;
      const doc = list.find((d) => Number(d.id) === Number(line.voucherId));
      if (!doc) {
        alert('One of the selected documents was not found. Please refresh and try again.');
        return;
      }
      if (!canPayDoc(doc)) {
        alert(`Cannot record against ${line.voucherType} ${doc.number || ''} (Draft/No balance).`);
        return;
      }
      const balance = getDocBalance(doc);
      if (Number(line.amount) > balance + 0.0001) {
        alert(`Allocation exceeds outstanding for ${line.voucherType} ${doc.number || ''}.`);
        return;
      }
    }

    if (!hideMode && !String(ledgerAccountId || "").trim()) {
      alert('Choose the cash or bank account the money was paid from');
      return;
    }

    const vendors = safeArray(db.vendors).filter((v) => v.companyId === companyId);
    const vendor = vendors.find((v) => Number(v.id) === vendorIdNum) || null;
    const vendorName = vendor?.name || vendor?.displayName || vendor?.companyName || vendor?.legalName || '';

    const paymentId = safeArray(db.payments).length + 1;

    // Post to the server first: it allocates the number and writes the
    // double-entry. Bills and expenses are still client-only, so nothing is
    // allocated server-side yet — the payment posts against the vendor control
    // account, which keeps cash and the AP total correct.
    let posted = null;
    if (!hideMode) {
      setSaving(true);
      try {
        posted = await createPayment({
          direction: 'PAYMENT',
          date: formData.date,
          partyType: 'VENDOR',
          partyId: /^\d+$/.test(String(formData.vendorId).trim()) ? null : String(formData.vendorId).trim() || null,
          partyName: vendorName || null,
          ledgerAccountId: String(ledgerAccountId).trim(),
          instrumentRef: formData.reference || null,
          amount: round2(amount),
          notes: formData.notes || null,
        });
      } catch (err) {
        setSaving(false);
        alert(String(err?.message || 'Unable to record the payment.'));
        return;
      }
      setSaving(false);
    }

    const paymentNo = String(posted?.number || '').trim() || `PAY-${paymentId}`;

    const paymentRecord = {
      id: paymentId,
      companyId,
      voucherType: 'payment',
      voucherId: null,
      direction: 'OUT',
      cashBankAccountId:
        initial.cashBankAccountId !== undefined && initial.cashBankAccountId !== null && String(initial.cashBankAccountId) !== ''
          ? Number(initial.cashBankAccountId)
          : undefined,
      sourceBankTransactionId:
        initial.sourceBankTransactionId !== undefined && initial.sourceBankTransactionId !== null && String(initial.sourceBankTransactionId) !== ''
          ? Number(initial.sourceBankTransactionId)
          : undefined,
      paymentNo,
      date: formData.date,
      vendorId: vendorIdNum,
      vendorName,
      amount: round2(amount),
      allocatedAmount: round2(computed.allocated),
      advanceAmount: round2(computed.advance),
      allocations: computed.lines.map((l) => ({
        voucherType: l.voucherType,
        voucherId: l.voucherId,
        documentNumber: l.documentNumber,
        amount: round2(l.amount),
      })),
      mode: formData.mode,
      // Links the local row to the posted server payment and the ledger the
      // money actually left from.
      backendPaymentId: posted?.id ? String(posted.id) : undefined,
      ledgerAccountId: String(ledgerAccountId || "").trim() || undefined,
      reference: formData.reference,
      notes: formData.notes,
      createdAt: new Date().toISOString(),
    };

    const nowIso = new Date().toISOString();

    const nextBills = safeArray(db.bills).map((b) => {
      if (b.companyId !== companyId) return b;
      const line = paymentRecord.allocations.find((a) => a.voucherType === 'bill' && Number(a.voucherId) === Number(b.id));
      if (!line) return b;

      const total = Number(b.total ?? 0);
      const alreadyPaid = Number(b.paidAmount ?? 0);
      const nextPaid = round2(Math.min(total, alreadyPaid + Number(line.amount ?? 0)));

      const rawStatus = String(b.status || '').trim();
      const nextStatus =
        rawStatus === 'Draft'
          ? 'Draft'
          : total > 0 && nextPaid >= total - 0.0001
            ? 'Paid'
            : nextPaid > 0
              ? 'Partial'
              : 'Unpaid';

      return {
        ...b,
        paidAmount: nextPaid,
        status: nextStatus,
        updatedAt: nowIso,
      };
    });

    const nextExpenses = safeArray(db.expenses).map((ex) => {
      if (ex.companyId !== companyId) return ex;
      const line = paymentRecord.allocations.find((a) => a.voucherType === 'expense' && Number(a.voucherId) === Number(ex.id));
      if (!line) return ex;

      const total = Number(ex.total ?? 0);
      const alreadyPaid = Number(ex.paidAmount ?? 0);
      const nextPaid = round2(Math.min(total, alreadyPaid + Number(line.amount ?? 0)));

      const rawStatus = String(ex.status || '').trim();
      const nextStatus =
        rawStatus === 'Draft'
          ? 'Draft'
          : total > 0 && nextPaid >= total - 0.0001
            ? 'Paid'
            : nextPaid > 0
              ? 'Partial'
              : 'Unpaid';

      return {
        ...ex,
        paidAmount: nextPaid,
        status: nextStatus,
        updatedAt: nowIso,
      };
    });

    setDb({
      ...db,
      bills: nextBills,
      expenses: nextExpenses,
      payments: [...safeArray(db.payments), paymentRecord],
    });

    onSaved?.(paymentRecord);

    alert(computed.advance > 0 ? 'Payment recorded (with advance)!' : 'Payment recorded!');
    onClose?.();
  };

  const selectedCount = useMemo(() => {
    return Object.values(allocations).filter((v) => Boolean(v?.selected)).length;
  }, [allocations]);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Payment Date</label>
          <input
            type="date"
            value={formData.date}
            onChange={(e) => setFormData((p) => ({ ...p, date: e.target.value }))}
            className="w-full px-3 py-2 border rounded-lg"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Amount Paid</label>
          <input
            type="number"
            value={formData.amount}
            onChange={(e) => setFormData((p) => ({ ...p, amount: e.target.value }))}
            className="w-full px-3 py-2 border rounded-lg"
            min="0"
            step="0.01"
            required
          />
        </div>

        <div className="col-span-2">
          <VendorPicker
            db={db}
            setDb={setDb}
            currentCompany={currentCompany}
            value={formData.vendorId}
            onChange={(vendorId) => {
              setFormData((p) => ({ ...p, vendorId }));
              setAllocations({});
            }}
            label="Vendor"
          />
        </div>

        {!hideMode ? (
          <div>
            <label className="block text-sm font-medium mb-1">
              Paid from <span className="text-red-600">*</span>
            </label>
            <select
              value={ledgerAccountId}
              onChange={(e) => setFormData((p) => ({ ...p, ledgerAccountId: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg"
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
            className="w-full px-3 py-2 border rounded-lg"
            placeholder="Txn / UTR / Cheque no"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 text-sm bg-gray-50 border rounded-lg p-3">
        <div>
          <div className="text-gray-500">Allocated</div>
          <div className="font-semibold">{formatMoney(computed.allocated, currentCompany)}</div>
        </div>
        <div>
          <div className="text-gray-500">Advance</div>
          <div className="font-semibold">{formatMoney(computed.advance, currentCompany)}</div>
        </div>
        <div>
          <div className="text-gray-500">Selected</div>
          <div className="font-semibold">{selectedCount}</div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">Outstanding Bills / Expenses</div>
          {formData.vendorId ? (
            <div className="text-sm text-gray-500">{outstandingDocs.length} document(s)</div>
          ) : (
            <div className="text-sm text-gray-500">Select vendor to load documents</div>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm overflow-hidden border">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-12">Sel</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-24">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Number</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Outstanding</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Allocate</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {!formData.vendorId ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                    Select party name to see outstanding bills/expenses
                  </td>
                </tr>
              ) : outstandingDocs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                    No outstanding documents. This payment will be recorded as advance.
                  </td>
                </tr>
              ) : (
                outstandingDocs.map((d) => {
                  const selected = Boolean(allocations[d.key]?.selected);
                  const allocValue = allocations[d.key]?.amount ?? '';

                  return (
                    <tr key={d.key} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <input type="checkbox" checked={selected} onChange={(e) => toggleDoc(d, e.target.checked)} />
                      </td>
                      <td className="px-4 py-3">{d.voucherType === 'bill' ? 'Bill' : 'Expense'}</td>
                      <td className="px-4 py-3 font-medium">{d.number || '-'}</td>
                      <td className="px-4 py-3">{d.date || '-'}</td>
                      <td className="px-4 py-3 text-right font-semibold">{formatMoney(d.balance, currentCompany)}</td>
                      <td className="px-4 py-3 text-right">
                        <input
                          type="number"
                          value={allocValue}
                          onChange={(e) => setDocAmount(d, e.target.value)}
                          className="w-32 px-2 py-1 border rounded text-right"
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
          className="w-full px-3 py-2 border rounded-lg"
          rows={3}
        />
      </div>

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="px-4 py-2 border rounded-lg hover:bg-gray-50">
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 bg-stone-900 text-white rounded-lg hover:bg-stone-900 disabled:opacity-50"
        >
          Record Payment
        </button>
      </div>
    </form>
  );
};

export default RecordDisbursementForm;
