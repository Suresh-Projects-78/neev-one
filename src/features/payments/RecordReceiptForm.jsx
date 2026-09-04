import React, { useMemo, useState, useRef } from 'react';
import { useDocumentFormKeys } from '../../components/ui/useDocumentFormKeys';
import { DocFormActions } from '../../components/DocumentForm';
import { notify } from '../../components/ui/notify';
import { useFieldErrors } from '../../components/ui/useFieldErrors';
import { FieldError, FieldErrorSummary } from '../../components/ui/Primitives';

import CustomerPicker from '../../components/pickers/CustomerPicker';
import { createPayment } from '../../api/payments';
import usePaymentModes, { modeLabel } from './usePaymentModes';
import { getNextNumericId } from '../../utils/ids';
import { formatMoney, round2 } from '../../utils/money';
import { documentOutstanding } from '../../utils/onAccount';

const safeArray = (v) => (Array.isArray(v) ? v : []);

/**
 * What the customer still owes on an invoice, after credit notes.
 *
 * Was total minus paid, which ignores a sales return: after crediting an
 * invoice this screen still asked for the full amount, so collecting "the
 * balance" took money the customer no longer owed.
 */
const getInvoiceBalance = (inv, notes) => documentOutstanding(inv, notes).outstanding;

const canCollectAgainstInvoice = (inv, notes) => {
  const rawStatus = String(inv?.status || '').trim();
  if (rawStatus === 'Draft') return false;
  if (rawStatus === 'Cancelled') return false;
  return getInvoiceBalance(inv, notes) > 0.0001;
};

const RecordReceiptForm = ({ db, setDb, currentCompany, onClose, initialData = null, onSaved, hideMode = false }) => {
  const formRef = useRef(null);
  const fieldErrors = useFieldErrors('receipt');
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
    // Deducted on the way: tax the customer withheld, and what the bank took.
    tdsAmount: initialData?.tdsAmount ? String(initialData.tdsAmount) : '',
    bankCharges: initialData?.bankCharges ? String(initialData.bankCharges) : '',
    otherCharges: initialData?.otherCharges ? String(initialData.otherCharges) : '',
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

  /*
   * Opened against one invoice, that invoice is already ticked.
   *
   * Recording a receipt from an invoice row used to prefill only the customer
   * and the outstanding amount, so the money arrived unallocated and the
   * invoice it came from stayed open — the one thing the operator was
   * certainly trying to close.
   */
  const [allocations, setAllocations] = useState(() => {
    const id = initialData?.allocateInvoiceId;
    const amt = Number(initialData?.amount ?? 0);
    if (!id || !(amt > 0)) return {};
    return { [String(id)]: { selected: true, amount: round2(amt) } };
  });

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

  const creditNotes = safeArray(db?.creditNotes);

  const outstandingInvoices = useMemo(() => {
    const cid = Number(formData.customerId);
    if (!Number.isFinite(cid) || !cid) return [];

    return invoices
      .filter((inv) => Number(inv.customerId) === cid)
      .filter((inv) => canCollectAgainstInvoice(inv, creditNotes));
  }, [formData.customerId, invoices]);

  const selectedInvoiceIds = useMemo(() => {
    return Object.entries(allocations)
      .filter(([, v]) => Boolean(v?.selected))
      .map(([k]) => Number(k))
      .filter((n) => Number.isFinite(n));
  }, [allocations]);

  const computed = useMemo(() => {
    const receiptAmount = Number(formData.amount ?? 0);
    /*
     * "Amount received" is what the invoice was settled by, not what reached
     * the bank.
     *
     * A customer who owes 10,000 and withholds 1,000 of TDS has settled
     * 10,000 — the invoice is discharged in full even though 9,000 arrived.
     * So allocation is measured against this figure, and the cash is what is
     * left after the deductions.
     */
    const totalAmount = Number.isFinite(receiptAmount) ? Math.max(0, receiptAmount) : 0;
    const pos = (v) => {
      const n = Number(v ?? 0);
      return Number.isFinite(n) ? Math.max(0, n) : 0;
    };
    const tds = pos(formData.tdsAmount);
    const bankCharges = pos(formData.bankCharges);
    const otherCharges = pos(formData.otherCharges);
    const deductions = round2(tds + bankCharges + otherCharges);
    const netCash = round2(totalAmount - deductions);

    let allocated = 0;
    const lines = [];

    for (const inv of outstandingInvoices) {
      const key = String(inv.id);
      const row = allocations[key];
      if (!row?.selected) continue;
      const want = Number(row?.amount ?? 0);
      const amt = Number.isFinite(want) ? Math.max(0, want) : 0;
      if (amt <= 0) continue;
      const balance = getInvoiceBalance(inv, creditNotes);
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
      tds,
      bankCharges,
      otherCharges,
      deductions,
      netCash,
    };
  }, [
    allocations,
    creditNotes,
    formData.amount,
    formData.tdsAmount,
    formData.bankCharges,
    formData.otherCharges,
    outstandingInvoices,
  ]);

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
        const suggested = Math.min(getInvoiceBalance(inv, creditNotes), remaining || getInvoiceBalance(inv, creditNotes));
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
    const customerIdNum = Number(formData.customerId);

    // Collected in one pass and shown at the fields. Allocation problems below
    // name a specific invoice, so they stay in the corner — there is no single
    // box to point them at.
    fieldErrors.reset();
    fieldErrors.check('amount', Number.isFinite(amount) && amount > 0, 'Enter an amount greater than zero');
    fieldErrors.check('customerId', Number.isFinite(customerIdNum) && !!customerIdNum, 'Customer is required');
    if (!hideMode) {
      fieldErrors.require('ledgerAccountId', ledgerAccountId, 'Choose where the money was received');
    }
    if (fieldErrors.failed()) return;

    // Validate allocations are within invoice balances
    for (const line of computed.lines) {
      const inv = safeArray(db.invoices).find((i) => i.companyId === companyId && Number(i.id) === Number(line.invoiceId));
      if (!inv) {
        notify.error('One of the selected invoices was not found. Please refresh and try again.');
        return;
      }
      if (!canCollectAgainstInvoice(inv, creditNotes)) {
        notify.error(`Cannot record against invoice ${inv.number || ''} (Draft/Cancelled/No balance).`);
        return;
      }
      const balance = getInvoiceBalance(inv, creditNotes);
      if (Number(line.amount) > balance + 0.0001) {
        notify.error(`Allocation exceeds outstanding for invoice ${inv.number || ''}.`);
        return;
      }
    }

    if (computed.allocated > amount + 0.0001) {
      notify.error('Total allocated cannot be more than receipt amount');
      return;
    }

    // More deducted than received leaves a negative amount in the bank, which
    // is not a receipt — it is a typo.
    if (computed.deductions > amount + 0.0001) {
      notify.error('Deductions cannot be more than the amount received');
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
          // The cash, not the settlement: the bank ledger must only ever see
          // what reached the bank. The deductions below are posted to their own
          // accounts and the customer is credited with the sum of both.
          amount: round2(computed.netCash),
          notes: formData.notes || null,
          allocations: serverAllocations,
          deductions: [
            computed.tds > 0 ? { kind: 'TDS', amount: round2(computed.tds) } : null,
            computed.bankCharges > 0 ? { kind: 'BANK_CHARGES', amount: round2(computed.bankCharges) } : null,
            computed.otherCharges > 0 ? { kind: 'OTHER', amount: round2(computed.otherCharges) } : null,
          ].filter(Boolean),
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
      tdsAmount: round2(computed.tds),
      bankCharges: round2(computed.bankCharges),
      otherCharges: round2(computed.otherCharges),
      netCashAmount: round2(computed.netCash),
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

    notify.success(computed.advance > 0 ? 'Receipt recorded (with advance)!' : 'Receipt recorded!');
    onClose?.();
  };

  /*
   * The shared document contract. A receipt has no line grid, so this is the
   * part that matters on a settlement screen: Ctrl+S saves, Ctrl+Enter
   * commits, and Enter moves to the next field instead of posting the moment
   * the cursor is in the amount box.
   */
  const onFormKeyDown = useDocumentFormKeys({ formRef });

  return (
    <form ref={formRef} onSubmit={handleSubmit} onKeyDown={onFormKeyDown} noValidate className="space-y-6">
      <DocFormActions
        primaryLabel={saving ? 'Recording…' : 'Record Receipt'}
        disabled={saving}
        secondaryLabel="Cancel"
        onSecondary={onClose}
      />

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
          <p className="mt-1 text-xs ui-muted">What the invoice is settled by, before deductions.</p>
        </div>

        {/*
          What came off the payment on the way.

          None of these reached the bank and all of them settled the invoice,
          so they are stated here and posted as their own ledger lines — TDS to
          the receivable it is, charges to the expense they are — with the
          customer credited for the whole amount above.
        */}
        <div
          className="col-span-2 rounded-xl p-3"
          style={{ backgroundColor: 'rgb(var(--accent-soft))', border: '1px solid rgb(var(--brand) / 0.18)' }}
        >
          <div className="ui-t-sec mb-2">Deductions</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { k: 'tdsAmount', label: 'TDS deduction' },
              { k: 'bankCharges', label: 'Bank charges' },
              { k: 'otherCharges', label: 'Other charges' },
            ].map((f) => (
              <div key={f.k}>
                <label className="block text-sm font-medium mb-1" htmlFor={`rcpt-${f.k}`}>
                  {f.label}
                </label>
                <input
                  id={`rcpt-${f.k}`}
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  className="ui-input ui-mono w-full px-3 py-2"
                  value={formData[f.k]}
                  onChange={(e) => setFormData((p) => ({ ...p, [f.k]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          {computed.deductions > 0 ? (
            <p className="mt-2 text-xs ui-muted">
              {formatMoney(computed.deductions, currentCompany)} deducted ·{' '}
              {formatMoney(computed.netCash, currentCompany)} actually received into the account.
            </p>
          ) : null}
        </div>

        <div
          className="col-span-2"
          ref={(el) => fieldErrors.register('customerId', el)}
          data-invalid-within={fieldErrors.error('customerId') ? 'true' : undefined}
        >
          <CustomerPicker
            db={db}
            setDb={setDb}
            currentCompany={currentCompany}
            value={formData.customerId}
            onChange={(customerId) => {
              fieldErrors.clearField('customerId');
              setFormData((p) => ({ ...p, customerId }));
              setAllocations({});
            }}
          />
          <FieldError error={fieldErrors.error('customerId')} id={fieldErrors.errorId('customerId')} />
        </div>

        {!hideMode ? (
          <div>
            <label className="block text-sm font-medium mb-1">
              Received into <span className="text-[rgb(var(--neg))]">*</span>
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
            <FieldError error={fieldErrors.error('ledgerAccountId')} id={fieldErrors.errorId('ledgerAccountId')} />
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

      {/*
        The receipt in one column: what settled the invoice, what came off it,
        and what actually reached the account. The last figure is the one that
        should match the bank statement, so it is the one set apart.
      */}
      <div className="ui-card p-4">
        <div className="ui-t-sec mb-3">Receipt summary</div>
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="ui-muted">Amount received</span>
            <span className="ui-mono">{formatMoney(computed.totalAmount, currentCompany)}</span>
          </div>
          {computed.tds > 0 ? (
            <div className="flex justify-between">
              <span className="ui-muted">TDS deduction</span>
              <span className="ui-mono">− {formatMoney(computed.tds, currentCompany)}</span>
            </div>
          ) : null}
          {computed.bankCharges > 0 ? (
            <div className="flex justify-between">
              <span className="ui-muted">Bank charges</span>
              <span className="ui-mono">− {formatMoney(computed.bankCharges, currentCompany)}</span>
            </div>
          ) : null}
          {computed.otherCharges > 0 ? (
            <div className="flex justify-between">
              <span className="ui-muted">Other charges</span>
              <span className="ui-mono">− {formatMoney(computed.otherCharges, currentCompany)}</span>
            </div>
          ) : null}

          <div className="flex justify-between pt-1.5" style={{ borderTop: '1px solid rgb(var(--border))' }}>
            <span className="ui-muted">Total allocated</span>
            <span className="ui-mono">{formatMoney(computed.allocated, currentCompany)}</span>
          </div>
          <div className="flex justify-between">
            <span className="ui-muted">Advance (unallocated)</span>
            <span className="ui-mono">{formatMoney(computed.advance, currentCompany)}</span>
          </div>
          <div className="flex justify-between">
            <span className="ui-muted">Invoices selected</span>
            <span className="ui-mono">{selectedInvoiceIds.length}</span>
          </div>

          <div className="ui-total-row pt-2" style={{ borderTop: '1px solid rgb(var(--border))' }}>
            <span>Net into the account</span>
            <span>{formatMoney(computed.netCash, currentCompany)}</span>
          </div>
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
                <th className="ui-th w-12">Sel</th>
                <th className="ui-th">Invoice #</th>
                <th className="ui-th">Date</th>
                <th className="ui-th ui-num">Outstanding</th>
                <th className="ui-th ui-num">Allocate</th>
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
                  const bal = getInvoiceBalance(inv, creditNotes);

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
                      <td className="ui-col-amount px-4 py-3 text-right">{formatMoney(bal, currentCompany)}</td>
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

      <div className="flex justify-end items-center gap-2">
        <FieldErrorSummary errors={fieldErrors.errors} />
      </div>
    </form>
  );
};

export default RecordReceiptForm;
