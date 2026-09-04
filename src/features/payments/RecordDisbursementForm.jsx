import React, { useMemo, useState, useRef } from 'react';
import { useDocumentFormKeys } from '../../components/ui/useDocumentFormKeys';
import { DocFormActions } from '../../components/DocumentForm';
import { notify } from '../../components/ui/notify';

import VendorPicker from '../../components/pickers/VendorPicker';
import { useFieldErrors } from '../../components/ui/useFieldErrors';
import { FieldError, FieldErrorSummary } from '../../components/ui/Primitives';
import { createPayment } from '../../api/payments';
import usePaymentModes, { modeLabel } from './usePaymentModes';
import { formatMoney, round2 } from '../../utils/money';
import { documentOutstanding } from '../../utils/onAccount';

const safeArray = (v) => (Array.isArray(v) ? v : []);

/**
 * What is still owed on a bill, after debit notes.
 *
 * This was total minus paid, which ignores a purchase return entirely. Raise a
 * debit note against a bill and this screen still offered the full original
 * amount — so paying "the outstanding balance" paid the vendor a second time
 * for goods that had already gone back.
 */
const getDocBalance = (doc, notes) => documentOutstanding(doc, notes).outstanding;

const canPayDoc = (doc, notes) => {
  const rawStatus = String(doc?.status || '').trim();
  if (rawStatus === 'Draft') return false;
  return getDocBalance(doc, notes) > 0.0001;
};

const RecordDisbursementForm = ({ db, setDb, currentCompany, onClose, initialData = null, onSaved, hideMode = false }) => {
  const formRef = useRef(null);
  const fieldErrors = useFieldErrors('payment');
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
  //
  // hideMode is the cash/bank book, where the account is implied by the book
  // you are standing in. It still has to resolve to a real ledger, otherwise a
  // payment entered from the bank book would never reach the general ledger --
  // which is exactly what happens to every payment once the standalone screens
  // are switched off.
  const impliedByBook = useMemo(() => {
    if (!hideMode) return '';
    const wanted = String(formData.mode || '').toLowerCase() === 'cash' ? 'CASH' : 'BANK';
    return modes.find((m) => m.controlKind === wanted)?.id || modes[0]?.id || '';
  }, [hideMode, formData.mode, modes]);

  const ledgerAccountId =
    formData.ledgerAccountId || (modes.length === 1 ? modes[0].id : '') || impliedByBook;

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

  const debitNotes = safeArray(db?.debitNotes);

  const outstandingDocs = useMemo(() => {
    const vid = Number(formData.vendorId);
    if (!Number.isFinite(vid) || !vid) return [];

    const billRows = bills
      .filter((b) => Number(b.vendorId) === vid)
      .filter((b) => canPayDoc(b, debitNotes))
      .map((b) => ({
        key: `bill:${b.id}`,
        voucherType: 'bill',
        id: Number(b.id),
        number: b.number,
        date: b.date,
        balance: getDocBalance(b, debitNotes),
      }));

    const expenseRows = expenses
      .filter((e) => Number(e.vendorId) === vid)
      .filter((e) => canPayDoc(e, debitNotes))
      .map((e) => ({
        key: `expense:${e.id}`,
        voucherType: 'expense',
        id: Number(e.id),
        number: e.number,
        date: e.date,
        balance: getDocBalance(e, debitNotes),
      }));

    return [...billRows, ...expenseRows].sort((a, b) => {
      const da = String(a.date || '');
      const dbb = String(b.date || '');
      if (da !== dbb) return da < dbb ? 1 : -1;
      return Number(b.id) - Number(a.id);
    });
  }, [bills, expenses, debitNotes, formData.vendorId]);

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
    const vendorIdNum = Number(formData.vendorId);

    // One pass, each failure at its own field. Allocation problems below name a
    // specific document, so they keep their toast.
    fieldErrors.reset();
    fieldErrors.check('amount', Number.isFinite(amount) && amount > 0, 'Enter an amount greater than zero');
    fieldErrors.check('vendorId', Number.isFinite(vendorIdNum) && !!vendorIdNum, 'Vendor is required');
    if (!hideMode) {
      fieldErrors.require('ledgerAccountId', ledgerAccountId, 'Choose where the money was paid from');
    }
    if (fieldErrors.failed()) return;

    if (computed.allocated > amount + 0.0001) {
      notify.error('Total allocated cannot be more than payment amount');
      return;
    }

    // Validate each allocation against latest balances
    const billsList = safeArray(db.bills).filter((b) => b.companyId === companyId);
    const expensesList = safeArray(db.expenses).filter((x) => x.companyId === companyId);

    for (const line of computed.lines) {
      const list = line.voucherType === 'bill' ? billsList : expensesList;
      const doc = list.find((d) => Number(d.id) === Number(line.voucherId));
      if (!doc) {
        notify.error('One of the selected documents was not found. Please refresh and try again.');
        return;
      }
      if (!canPayDoc(doc, debitNotes)) {
        notify.error(`Cannot record against ${line.voucherType} ${doc.number || ''} (Draft/No balance).`);
        return;
      }
      const balance = getDocBalance(doc, debitNotes);
      if (Number(line.amount) > balance + 0.0001) {
        notify.error(`Allocation exceeds outstanding for ${line.voucherType} ${doc.number || ''}.`);
        return;
      }
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
    if (String(ledgerAccountId || "").trim()) {
      setSaving(true);
      try {
        posted = await createPayment({
          direction: 'PAYMENT',
          date: formData.date,
          partyType: 'VENDOR',
          partyId: vendor?.backendPartyId ? String(vendor.backendPartyId) : null,
          partyName: vendorName || null,
          ledgerAccountId: String(ledgerAccountId).trim(),
          instrumentRef: formData.reference || null,
          amount: round2(amount),
          notes: formData.notes || null,
        });
      } catch (err) {
        setSaving(false);
        notify.error(String(err?.message || 'Unable to record the payment.'));
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

    notify.success(computed.advance > 0 ? 'Payment recorded (with advance)!' : 'Payment recorded!');
    onClose?.();
  };

  const selectedCount = useMemo(() => {
    return Object.values(allocations).filter((v) => Boolean(v?.selected)).length;
  }, [allocations]);

  /*
   * The shared document contract. A payment has no line grid, so this is the
   * part that matters on a settlement screen: Ctrl+S saves, Ctrl+Enter
   * commits, and Enter moves to the next field instead of posting the moment
   * the cursor is in the amount box.
   */
  const onFormKeyDown = useDocumentFormKeys({ formRef });

  return (
    <form ref={formRef} onSubmit={handleSubmit} onKeyDown={onFormKeyDown} noValidate className="space-y-6">
      <DocFormActions
        primaryLabel={saving ? 'Recording…' : 'Record Payment'}
        disabled={saving}
        secondaryLabel="Cancel"
        onSecondary={onClose}
      />

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Payment Date</label>
          <input
            type="date"
            value={formData.date}
            onChange={(e) => setFormData((p) => ({ ...p, date: e.target.value }))}
            className="ui-input w-full px-3 py-2"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Amount Paid</label>
          <input
            type="number"
            value={formData.amount}
            onChange={(e) => {
              fieldErrors.clearField('amount');
              setFormData((p) => ({ ...p, amount: e.target.value }));
            }}
            className="ui-input w-full px-3 py-2"
            min="0"
            step="0.01"
            required
            {...fieldErrors.props('amount')}
          />
          <FieldError error={fieldErrors.error('amount')} id={fieldErrors.errorId('amount')} />
        </div>

        <div
          className="col-span-2"
          ref={(el) => fieldErrors.register('vendorId', el)}
          data-invalid-within={fieldErrors.error('vendorId') ? 'true' : undefined}
        >
          <VendorPicker
            db={db}
            setDb={setDb}
            currentCompany={currentCompany}
            value={formData.vendorId}
            onChange={(vendorId) => {
              fieldErrors.clearField('vendorId');
              setFormData((p) => ({ ...p, vendorId }));
              setAllocations({});
            }}
            label="Vendor"
          />
          <FieldError error={fieldErrors.error('vendorId')} id={fieldErrors.errorId('vendorId')} />
        </div>

        {!hideMode ? (
          <div>
            <label className="block text-sm font-medium mb-1">
              Paid from <span className="text-[rgb(var(--neg))]">*</span>
            </label>
            <select
              value={ledgerAccountId}
              onChange={(e) => {
                fieldErrors.clearField('ledgerAccountId');
                setFormData((p) => ({ ...p, ledgerAccountId: e.target.value }));
              }}
              className="ui-select w-full px-3 py-2"
              disabled={modesLoading}
              required
              {...fieldErrors.props('ledgerAccountId')}
            >
              <option value="">{modesLoading ? 'Loading accounts…' : 'Select cash or bank account'}</option>
              {modes.map((m) => (
                <option key={m.id} value={m.id}>
                  {modeLabel(m)}
                </option>
              ))}
            </select>
            {modesError ? (
              <p className="mt-1 text-sm text-[rgb(var(--neg))]">{modesError}</p>
            ) : !modesLoading && modes.length === 0 ? (
              <p className="mt-1 text-sm text-[rgb(var(--warn-ink))]">
                No cash or bank accounts yet. Add one under Master Data → Chart of Accounts, under the Bank
                Accounts or Cash-in-Hand group, and it appears here.
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
          <div className="ui-muted">Selected</div>
          <div className="font-semibold">{selectedCount}</div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">Outstanding Bills / Expenses</div>
          {formData.vendorId ? (
            <div className="text-sm ui-muted">{outstandingDocs.length} document(s)</div>
          ) : (
            <div className="text-sm ui-muted">Select vendor to load documents</div>
          )}
        </div>

        <div className="ui-surface rounded-xl shadow-sm overflow-hidden border">
          <table className="ui-table w-full">
            <thead className="ui-sunken border-b">
              <tr>
                <th className="ui-th w-12">Sel</th>
                <th className="ui-th w-24">Type</th>
                <th className="ui-th">Number</th>
                <th className="ui-th">Date</th>
                <th className="ui-th ui-num">Outstanding</th>
                <th className="ui-th ui-num">Allocate</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {!formData.vendorId ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center ui-muted">
                    Select party name to see outstanding bills/expenses
                  </td>
                </tr>
              ) : outstandingDocs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center ui-muted">
                    No outstanding documents. This payment will be recorded as advance.
                  </td>
                </tr>
              ) : (
                outstandingDocs.map((d) => {
                  const selected = Boolean(allocations[d.key]?.selected);
                  const allocValue = allocations[d.key]?.amount ?? '';

                  return (
                    <tr key={d.key} className="ui-hover-sunken">
                      <td className="px-4 py-3">
                        <input type="checkbox" checked={selected} onChange={(e) => toggleDoc(d, e.target.checked)} />
                      </td>
                      <td className="ui-col-meta px-4 py-3">{d.voucherType === 'bill' ? 'Bill' : 'Expense'}</td>
                      <td className="ui-col-meta px-4 py-3 font-medium">{d.number || '-'}</td>
                      <td className="ui-col-date px-4 py-3">{d.date || '-'}</td>
                      <td className="ui-col-amount px-4 py-3 text-right">{formatMoney(d.balance, currentCompany)}</td>
                      <td className="px-4 py-3 text-right">
                        <input
                          type="number"
                          value={allocValue}
                          onChange={(e) => setDocAmount(d, e.target.value)}
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

      <div className="flex justify-end items-center gap-2">
        <FieldErrorSummary errors={fieldErrors.errors} />
      </div>
    </form>
  );
};

export default RecordDisbursementForm;
