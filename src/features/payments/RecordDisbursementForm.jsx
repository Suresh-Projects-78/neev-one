import React, { useMemo, useState, useRef } from 'react';
import { useDocumentFormKeys } from '../../components/ui/useDocumentFormKeys';
import { DocFormActions, DocFormFootnote, AmountInWordsBand } from '../../components/DocumentForm';
import { notify } from '../../components/ui/notify';

import VendorPicker from '../../components/pickers/VendorPicker';
import { useFieldErrors } from '../../components/ui/useFieldErrors';
import { FieldError, FieldErrorSummary } from '../../components/ui/Primitives';
import { createPayment } from '../../api/payments';
import { amountInWordsInr } from '../../utils/money';
import usePaymentModes, { modeLabel } from './usePaymentModes';
import { formatMoney, round2 } from '../../utils/money';
import { documentOutstanding } from '../../utils/onAccount';
import { bumpCompanyNextNumber, nextFreeVoucherNumber } from '../../utils/docSettings';
import { DocDate } from '../../components/docs';
import { priorBaseFor, resolveTds, tdsEventFrom, tdsLedgersFor } from '../tds/engine';
import { natureForSection } from '../tds/ruleMaster';
import { tdsGroupSide } from '../../utils/tdsLedgers';

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

const RecordDisbursementForm = ({ db, setDb, currentCompany, onClose, screenTitle = '', onBack = null, initialData = null, onSaved, hideMode = false }) => {
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
      number: String(d?.number || '').trim(),
      reference: String(d?.reference || '').trim(),
      referenceDate: String(d?.referenceDate || '').slice(0, 10),
      /*
       * What comes off the payment before it leaves the bank.
       *
       * A vendor bill of 10,000 with 1,000 of TDS settles the bill in full and
       * moves 9,000 out of the account. Without these the two had to be entered
       * as different numbers on different screens, or the TDS was simply not
       * recorded against the payment it belonged to.
       */
      tdsAmount: d?.tdsAmount ? String(d.tdsAmount) : '',
      tdsLedgerId: String(d?.tdsLedgerId || ''),
      bankCharges: d?.bankCharges ? String(d.bankCharges) : '',
      otherCharges: d?.otherCharges ? String(d.otherCharges) : '',
      notes: String(d?.notes || '').trim(),
      cashBankAccountId: d?.cashBankAccountId,
      sourceBankTransactionId: d?.sourceBankTransactionId,
    };
  }, [initialData]);

  /*
   * The voucher's own number, from the company's series.
   *
   * Every other document here is numbered and a payment was not, so the only
   * way to cite one afterwards was its date and amount. The series — prefix,
   * next number, width — is the one already configured under Numbering; this
   * screen does not invent a second scheme.
   */
  const takenPaymentNumbers = useMemo(
    () =>
      safeArray(db.payments)
        .filter((x) => x.companyId === currentCompany?.id)
        .map((x) => String(x.number || '').trim())
        .filter(Boolean),
    [db.payments, currentCompany]
  );

  const [formData, setFormData] = useState(() => ({
    date: initial.date,
    number:
      initial.number ||
      nextFreeVoucherNumber({
        db,
        company: currentCompany,
        voucherKey: 'payment',
        takenNumbers: safeArray(db.payments)
          .filter((x) => x.companyId === currentCompany?.id)
          .map((x) => String(x.number || '').trim())
          .filter(Boolean),
      }),
    vendorId: initial.vendorId,
    amount: initial.amount,
    mode: initial.mode,
    ledgerAccountId: initial.ledgerAccountId,
    reference: initial.reference,
    referenceDate: initial.referenceDate,
    tdsAmount: initial.tdsAmount,
    bankCharges: initial.bankCharges,
    otherCharges: initial.otherCharges,
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
        /* The bill's own figure and when it falls due: the table shows both, so
           the row has to carry both rather than the balance alone. */
        dueDate: b.dueDate || '',
        total: Number(b.total ?? 0),
        balance: getDocBalance(b, debitNotes),
        /* What the bill itself deducted, and on what — so a payment against it
           does not deduct the same obligation twice. */
        taxableValue: Number(b.taxableValue ?? b.subtotal ?? 0),
        tdsAmount: Number(b.tdsAmount ?? 0),
        tdsNatureCode: String(b.tdsNatureCode || ''),
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
        dueDate: e.dueDate || '',
        total: Number(e.total ?? e.amount ?? 0),
        balance: getDocBalance(e, debitNotes),
      }));

    /*
     * Oldest first, which is the order they are paid in.
     *
     * A list is usually newest first, and this one is not a list — it is a
     * queue. The bill that has been waiting longest is the one somebody
     * settles, and it was at the bottom.
     */
    return [...billRows, ...expenseRows].sort((a, b) => {
      const da = String(a.date || '');
      const dbb = String(b.date || '');
      if (da !== dbb) return da < dbb ? -1 : 1;
      return Number(a.id) - Number(b.id);
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
        /* Carried so the deduction can tell which obligations already had TDS
           taken at the bill and which did not. */
        taxableValue: Number(d.taxableValue ?? 0),
        alreadyDeducted: Number(d.tdsAmount ?? 0),
        tdsNatureCode: String(d.tdsNatureCode || ''),
      });
    }

    const advance = round2(Math.max(0, totalAmount - allocated));

    /*
     * Two different figures, and the screen has to show both.
     *
     * `totalAmount` is what the bills are being settled by; `netCash` is what
     * actually leaves the account once TDS and charges are held back. Showing
     * one and calling it the other is how a bank reconciliation ends up short
     * by exactly the tax deducted.
     */
    const pos = (v) => {
      const n = Number(v ?? 0);
      return Number.isFinite(n) && n > 0 ? round2(n) : 0;
    };
    const tds = pos(formData.tdsAmount);
    const bankCharges = pos(formData.bankCharges);
    const otherCharges = pos(formData.otherCharges);
    const deductions = round2(tds + bankCharges + otherCharges);
    const netCash = round2(Math.max(0, totalAmount - deductions));

    return {
      totalAmount: round2(totalAmount),
      allocated: round2(allocated),
      advance,
      tds,
      bankCharges,
      otherCharges,
      deductions,
      netCash,
      lines,
    };
  }, [
    allocations,
    formData.amount,
    formData.tdsAmount,
    formData.bankCharges,
    formData.otherCharges,
    outstandingDocs,
  ]);

  /*
   * TDS at the payment stage.
   *
   * The rule is "credit or payment, whichever is earlier", so the deduction
   * belongs here only for what was NOT already deducted when the bill was
   * entered. §16 makes that mandatory: a bill that credited TDS Payable and a
   * payment that deducted again would take the tax twice from one obligation
   * and leave the vendor short by it.
   */
  const tdsLedgerMaster = useMemo(() => {
    const groups = (db?.accountGroups || []).filter((g) => Number(g?.companyId) === Number(currentCompany?.id));
    return (db?.chartOfAccounts || [])
      .filter((a) => Number(a?.companyId) === Number(currentCompany?.id))
      .map((a) => ({ ...a, tdsSide: String(a?.tdsSide || '').toUpperCase() || tdsGroupSide(groups, a.groupId) }))
      .filter((a) => a.tdsSide);
  }, [db?.chartOfAccounts, db?.accountGroups, currentCompany?.id]);

  const vendorRecord = useMemo(
    () => (db?.vendors || []).find((v) => Number(v.id) === Number(formData.vendorId)) || null,
    [db?.vendors, formData.vendorId]
  );

  /* What the bills being settled already deducted for themselves. */
  const tdsAtBill = round2(computed.lines.reduce((t, l) => t + Number(l.alreadyDeducted || 0), 0));

  /* And the taxable value of the ones that did not. */
  const tdsUndeductedBase = round2(
    computed.lines
      .filter((l) => Number(l.alreadyDeducted || 0) <= 0)
      .reduce((t, l) => t + Number(l.taxableValue || 0), 0)
  );

  const tdsNatureCode =
    String(vendorRecord?.tdsNatureCode || '').trim() || natureForSection(vendorRecord?.tdsSection)?.code || '';

  const tdsPriorValue = useMemo(
    () =>
      priorBaseFor((db?.bills || []).filter((b) => b.companyId === currentCompany?.id), {
        partyId: formData.vendorId,
        natureCode: tdsNatureCode,
        onDate: formData.date,
      }),
    [db?.bills, currentCompany?.id, formData.vendorId, tdsNatureCode, formData.date]
  );

  const tds = resolveTds({
    company: currentCompany,
    party: vendorRecord,
    transactionDate: formData.date,
    taxableBase: tdsUndeductedBase,
    side: 'PAYABLE',
    priorBase: tdsPriorValue,
    ledgers: tdsLedgerMaster,
    /* The duplicate check §16 demands, answered from the documents this
       payment is settling rather than from a flag somebody has to remember. */
    existingEventFor: () => (tdsAtBill > 0 ? { sourceType: 'bill', tdsAmount: tdsAtBill } : null),
  });

  const tdsLedgersHere = tds.natureCode
    ? tdsLedgersFor(tdsLedgerMaster, { natureCode: tds.natureCode, side: 'PAYABLE' })
    : [];

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
    /*
     * A number, and only one payment wearing it.
     *
     * Two payments with the same number cannot be told apart in a ledger or on
     * a bank statement, and the series can be typed over — so the clash has to
     * be caught here rather than assumed away.
     */
    const paymentNumber = String(formData.number || '').trim();
    fieldErrors.require('number', paymentNumber, 'A payment number is required');
    fieldErrors.check(
      'number',
      !paymentNumber ||
        !takenPaymentNumbers.some((n) => n.toLowerCase() === paymentNumber.toLowerCase()),
      'That number is already used by another payment.'
    );

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
          /* What left the account, which is the gross less what was held back —
             posting the gross here overstates the bank by the TDS every time. */
          amount: round2(computed.netCash),
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
      number: paymentNumber,
      reference: formData.reference,
      referenceDate: String(formData.referenceDate || '').slice(0, 10) || undefined,
      /*
       * Kept with the payment they came off, not merely subtracted from it. A
       * TDS figure that exists only as the difference between two numbers
       * cannot be reported, and the 26Q return is built from exactly these.
       */
      tdsAmount: computed.tds || undefined,
      /* Which nature and ledger it was taken under — the register reads these,
         and without them a figure on a payment is a number with no tax on it. */
      tdsNatureCode: computed.tds > 0 ? tds.natureCode || undefined : undefined,
      tdsLedgerId: computed.tds > 0 ? String(formData.tdsLedgerId || tds.ledgerId || '') || undefined : undefined,
      tdsRuleVersionId: computed.tds > 0 ? tds.ruleVersionId || undefined : undefined,
      bankCharges: computed.bankCharges || undefined,
      otherCharges: computed.otherCharges || undefined,
      netCash: computed.netCash,
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

    /*
     * The compliance record for a payment-stage deduction.
     *
     * Written only where the payment itself deducted: where the bill already
     * had, its own event is the one the return reads, and a second event here
     * would report the same tax twice.
     */
    const tdsEvents = safeArray(db.tdsTransactions);
    const tdsEvent =
      computed.tds > 0 && tds.natureCode
        ? {
            id: tdsEvents.reduce((m, t) => Math.max(m, Number(t?.id) || 0), 0) + 1,
            ...tdsEventFrom(
              { ...tds, tdsAmount: computed.tds, ledgerId: String(formData.tdsLedgerId || tds.ledgerId || '') },
              {
                company: currentCompany,
                party: vendorRecord,
                source: { type: 'payment', id: paymentRecord.id, number: paymentRecord.number },
                date: formData.date,
              }
            ),
          }
        : null;

    setDb({
      ...db,
      tdsTransactions: tdsEvent ? [...tdsEvents, tdsEvent] : db.tdsTransactions,
      bills: nextBills,
      expenses: nextExpenses,
      payments: [...safeArray(db.payments), paymentRecord],
      /* The series moves on past the number this payment just took, so the next
         one does not open on a number already in the book. */
      companies: bumpCompanyNextNumber({
        db,
        companyId,
        voucherKey: 'payment',
        usedNumber: paymentRecord.number,
      }),
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
      {/* The bar every document form carries: the name on the left, every way
          out of it on the right, pinned so Record stays reachable from the
          bottom of a long list of open bills. */}
      <DocFormActions
        title={screenTitle}
        onBack={onBack}
        sticky={Boolean(screenTitle)}
        primaryLabel={saving ? 'Recording…' : 'Record Payment'}
        disabled={saving}
        secondaryLabel="Cancel"
        onSecondary={onClose}
      />

      {/*
        The head of the document, in the invoice's two columns: who was paid and
        where the money left from on the left, the paperwork — date and amount —
        on the right, ruled off between them.
      */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-x-6 gap-y-4">
        <div className="lg:col-span-6 space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {!hideMode ? (
          <div>
            <label className="ui-label">
              Pay from <span className="text-[rgb(var(--neg))]">*</span>
            </label>
            <select
              value={ledgerAccountId}
              onChange={(e) => {
                fieldErrors.clearField('ledgerAccountId');
                setFormData((p) => ({ ...p, ledgerAccountId: e.target.value }));
              }}
              className="ui-select w-full"
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

          <div className="min-w-0">
            <label className="ui-label" htmlFor="pay-ref">Reference</label>
            <input
              id="pay-ref"
              type="text"
              value={formData.reference}
              onChange={(e) => setFormData((p) => ({ ...p, reference: e.target.value }))}
              className="ui-input w-full"
              placeholder="Txn / UTR / Cheque no"
            />
          </div>
        </div>

        <div
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
            label="Supplier"
          />
          <FieldError error={fieldErrors.error('vendorId')} id={fieldErrors.errorId('vendorId')} />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="min-w-0">
            <label className="ui-label" htmlFor="pay-mode">Payment mode</label>
            <select
              id="pay-mode"
              value={formData.mode}
              onChange={(e) => setFormData((p) => ({ ...p, mode: e.target.value }))}
              className="ui-select w-full"
            >
              {['Cash', 'Bank Transfer', 'UPI', 'Cheque', 'Card', 'Other'].map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          <div className="min-w-0">
            <label className="ui-label" htmlFor="pay-ref-date">Reference date</label>
            <input
              id="pay-ref-date"
              type="date"
              value={formData.referenceDate}
              onChange={(e) => setFormData((p) => ({ ...p, referenceDate: e.target.value }))}
              className="ui-input w-full"
            />
          </div>
        </div>
        </div>

        <div
          className="lg:col-span-6 space-y-4 lg:ps-6"
          style={{ borderInlineStart: '1px solid rgb(var(--border))' }}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="min-w-0">
              <label className="ui-label" htmlFor="pay-number">Payment No.</label>
              <input
                id="pay-number"
                type="text"
                value={formData.number}
                onChange={(e) => {
                  fieldErrors.clearField('number');
                  setFormData((p) => ({ ...p, number: e.target.value }));
                }}
                className="ui-input ui-mono w-full"
                {...fieldErrors.props('number')}
              />
              <FieldError error={fieldErrors.error('number')} id={fieldErrors.errorId('number')} />
              <p className="ui-caption mt-1">Auto from settings; type over if needed.</p>
            </div>

            <div className="min-w-0">
              <label className="ui-label" htmlFor="pay-date">
                Payment Date <span className="text-[rgb(var(--neg-ink))]">*</span>
              </label>
              <input
                id="pay-date"
                type="date"
                value={formData.date}
                onChange={(e) => setFormData((p) => ({ ...p, date: e.target.value }))}
                className="ui-input w-full"
                required
              />
            </div>
          </div>

        </div>
      </div>

      {/*
        What comes off the payment, beside what it is.
        Held together in one tinted band because they are read as one figure —
        the amount, less what is held back — and split across the form they
        were three unrelated boxes nobody totalled.
      */}
      <div
        className="rounded-xl p-4"
        style={{ backgroundColor: 'rgb(var(--brand) / 0.06)', border: '1px solid rgb(var(--brand) / 0.18)' }}
      >
        <h3 className="ui-t-label">Payment amount and deductions</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {/* The amount leads the band that is named after it; it used to sit
              up in the header, three fields away from what comes off it. */}
          <div className="min-w-0">
            <label className="ui-label" htmlFor="pay-amount">
              Amount paid <span className="text-[rgb(var(--neg-ink))]">*</span>
            </label>
            <input
              id="pay-amount"
              type="number"
              value={formData.amount}
              onChange={(e) => {
                fieldErrors.clearField('amount');
                setFormData((p) => ({ ...p, amount: e.target.value }));
              }}
              className="ui-input ui-money w-full"
              min="0"
              step="0.01"
              required
              placeholder="0.00"
              {...fieldErrors.props('amount')}
            />
            <FieldError error={fieldErrors.error('amount')} id={fieldErrors.errorId('amount')} />
            <p className="ui-caption mt-1">What the bills are settled by.</p>
          </div>

          {/*
            The deduction, and where it posts.

            The figure is the engine's — the same one the bill uses — and it is
            offered only for what has not already been deducted. A bill that
            took TDS when it was entered says so here instead, because taking
            it again would pay the department twice out of one vendor.
          */}
          <div className="min-w-0">
            <label className="ui-label" htmlFor="pay-tdsAmount">TDS deduction</label>
            <input
              id="pay-tdsAmount"
              type="number"
              min="0"
              step="0.01"
              value={formData.tdsAmount}
              onChange={(e) => setFormData((p) => ({ ...p, tdsAmount: e.target.value }))}
              className="ui-input ui-money w-full"
              placeholder="0.00"
            />
            {/* The engine's own answer, not a second opinion formed here: it
                is what decides whether a deduction may be made at all. */}
            {tds.duplicateOf ? (
              <p className="ui-caption mt-1">
                Already deducted on the bills being settled:{' '}
                {formatMoney(Number(tds.duplicateOf.tdsAmount || tdsAtBill), currentCompany)}. Deducting again here
                would take it twice.
              </p>
            ) : tds.tdsAmount > 0 ? (
              <p className="ui-caption mt-1">
                {tds.statutoryReference} suggests {formatMoney(tds.tdsAmount, currentCompany)} at {tds.rate}% on{' '}
                {formatMoney(tds.baseAmount, currentCompany)}.{' '}
                <button
                  type="button"
                  className="underline underline-offset-2"
                  onClick={() =>
                    setFormData((p) => ({
                      ...p,
                      tdsAmount: String(tds.tdsAmount),
                      tdsLedgerId: String(tds.ledgerId || p.tdsLedgerId || ''),
                    }))
                  }
                >
                  Use it
                </button>
              </p>
            ) : (
              <p className="ui-caption mt-1">Held back and paid to the department.</p>
            )}

            {Number(formData.tdsAmount || 0) > 0 && tdsLedgersHere.length ? (
              <div className="mt-2">
                <label className="ui-label" htmlFor="pay-tds-ledger">TDS ledger</label>
                <select
                  id="pay-tds-ledger"
                  className="ui-select w-full"
                  value={formData.tdsLedgerId || tds.ledgerId || ''}
                  onChange={(e) => setFormData((p) => ({ ...p, tdsLedgerId: e.target.value }))}
                >
                  <option value="">Select ledger</option>
                  {tdsLedgersHere.map((l) => (
                    <option key={l.id} value={String(l.id)}>{l.name}</option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>

          {[
            { k: 'bankCharges', label: 'Bank charges', hint: 'What the bank took for the transfer.' },
            { k: 'otherCharges', label: 'Other deductions', hint: 'Anything else withheld.' },
          ].map((f) => (
            <div key={f.k} className="min-w-0">
              <label className="ui-label" htmlFor={`pay-${f.k}`}>{f.label}</label>
              <input
                id={`pay-${f.k}`}
                type="number"
                min="0"
                step="0.01"
                value={formData[f.k]}
                onChange={(e) => setFormData((p) => ({ ...p, [f.k]: e.target.value }))}
                className="ui-input ui-money w-full"
                placeholder="0.00"
              />
              <p className="ui-caption mt-1">{f.hint}</p>
            </div>
          ))}

        </div>
      </div>


      {/*
        The bills on the left and what the payment comes to on the right,
        because the summary is read while the allocation is being typed —
        underneath it, the two figures that catch a mistake were off the
        bottom of the screen exactly when they mattered.
      */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-start">
        <div className="min-w-0 space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">Outstanding bills</div>
            {formData.vendorId ? (
              <div className="text-sm ui-muted">Select bills to allocate</div>
            ) : (
              <div className="text-sm ui-muted">Select a supplier to load bills</div>
            )}
          </div>

          <div className="ui-surface rounded-xl shadow-sm overflow-hidden border">
            <table className="ui-table w-full">
              <thead className="ui-sunken border-b">
                <tr>
                  <th className="ui-th w-12">
                    <input
                      type="checkbox"
                      aria-label="Select every bill"
                      checked={outstandingDocs.length > 0 && selectedCount === outstandingDocs.length}
                      onChange={(e) => {
                        const on = e.target.checked;
                        for (const d of outstandingDocs) toggleDoc(d, on);
                      }}
                    />
                  </th>
                  <th className="ui-th">Bill #</th>
                  <th className="ui-th">Date</th>
                  <th className="ui-th">Due date</th>
                  {/* The bill's own figure beside what is left of it: the pair
                      is what tells a part-paid bill from an untouched one. */}
                  <th className="ui-th ui-num">Bill amount</th>
                  <th className="ui-th ui-num">Outstanding</th>
                  <th className="ui-th ui-num">Allocate</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {!formData.vendorId ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center ui-muted">
                      Select party name to see outstanding bills/expenses
                    </td>
                  </tr>
                ) : outstandingDocs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center ui-muted">
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
                        <td className="ui-col-meta px-4 py-3">{d.number || '-'}</td>
                        <td className="ui-col-date px-4 py-3">{d.date || '-'}</td>
                        <td className="ui-col-date px-4 py-3">{d.dueDate || '-'}</td>
                        <td className="ui-col-amount px-4 py-3 text-right">{formatMoney(d.total ?? d.balance, currentCompany)}</td>
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

              {outstandingDocs.length ? (
                <tfoot>
                  <tr className="ui-sunken font-medium">
                    <td className="px-4 py-3" colSpan={4}>Total</td>
                    <td className="ui-col-amount px-4 py-3 text-right">
                      {formatMoney(outstandingDocs.reduce((t, d) => t + Number(d.total ?? d.balance ?? 0), 0), currentCompany)}
                    </td>
                    <td className="ui-col-amount px-4 py-3 text-right">
                      {formatMoney(outstandingDocs.reduce((t, d) => t + Number(d.balance ?? 0), 0), currentCompany)}
                    </td>
                    <td className="ui-col-amount px-4 py-3 text-right">
                      {formatMoney(computed.allocated, currentCompany)}
                    </td>
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>

          <p className="ui-caption">You can also allocate the amount directly and adjust later.</p>
        </div>

        <div>
          <label className="ui-label">Notes</label>
          <textarea
            value={formData.notes}
            onChange={(e) => setFormData((p) => ({ ...p, notes: e.target.value }))}
            className="ui-input w-full"
            rows={3}
          />
        </div>

        </div>

        <div className="min-w-0">
        {/*
          The payment in one column: what settles the bills, what is held back,
          what was put against something, and what is left over. The last two are
          the ones that catch a mistake — money allocated to nothing, or a payment
          that settles less than it moves.
        */}
        <section className="ui-card p-4" aria-label="Payment summary">
          <h3 className="ui-t-sec">Payment summary</h3>
          <dl className="mt-3 space-y-2 text-sm">
            {[
              ['Amount paid', computed.totalAmount],
              ['TDS deduction', computed.tds],
              ['Bank charges', computed.bankCharges],
              ['Other deductions', computed.otherCharges],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-3">
                <dt className="ui-muted">{label}</dt>
                <dd className="ui-money">{formatMoney(value, currentCompany)}</dd>
              </div>
            ))}

            <div
              className="flex items-center justify-between gap-3 border-t pt-2"
              style={{ borderColor: 'rgb(var(--border))' }}
            >
              <dt className="ui-muted">Total deductions</dt>
              <dd className="ui-money">{formatMoney(computed.deductions, currentCompany)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="ui-muted">Total allocated</dt>
              <dd className="ui-money">{formatMoney(computed.allocated, currentCompany)}</dd>
            </div>
          </dl>

          <div
            className="mt-3 flex items-center justify-between gap-3 rounded-xl px-3 py-2.5"
            style={{ backgroundColor: 'rgb(var(--brand) / 0.08)' }}
          >
            <span className="text-sm font-medium">Advance (unallocated)</span>
            <span className="ui-money">{formatMoney(computed.advance, currentCompany)}</span>
          </div>

          <div
            className="mt-2 flex items-center justify-between gap-3 rounded-xl px-3 py-3"
            style={{ backgroundColor: 'rgb(var(--brand) / 0.12)' }}
          >
            <span className="text-sm font-medium">Net payment amount</span>
            <span className="ui-money-lg">{formatMoney(computed.netCash, currentCompany)}</span>
          </div>

          <AmountInWordsBand words={amountInWordsInr(computed.netCash)} />
        </section>
        </div>
      </div>

      {/* The footnote already knows how to carry one; a payment against the
          wrong bill is a dispute six months later, and this is the line that
          says somebody checked. */}
      <DocFormFootnote declaration="the payment above is against the documents selected, and the details are correct." />

      {/* What actually leaves the account, kept on screen while bills are
          ticked off — the invoice form's running total, for the figure that has
          to match the bank statement. */}
      <div className="ui-entry-summary">
        {/* What actually leaves, since that is what the label says. With TDS
            held back this read the gross and disagreed with the summary a few
            inches above it. */}
        <span className="ui-t-label">Paid from the account</span>
        <span className="ui-money-lg">{formatMoney(computed.netCash, currentCompany)}</span>
        <span className="ui-caption">{selectedCount} bill(s) allocated</span>
        <FieldErrorSummary errors={fieldErrors.errors} />
      </div>
    </form>
  );
};

export default RecordDisbursementForm;
