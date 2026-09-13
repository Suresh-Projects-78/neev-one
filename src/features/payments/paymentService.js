import { createPayment } from '../../api/payments';
import { hasApiSession } from '../../api/purchaseDocs';
import { bumpCompanyNextNumber, nextFreeVoucherNumber } from '../../utils/docSettings';
import { round2 } from '../../utils/money';
import { payableOutstanding, sourceTdsOf } from '../../utils/onAccount';

/**
 * The payment engine, callable without its form.
 *
 * The disbursement form owns the interactive path; this module is the same
 * accounting reached programmatically, for the caller that settles several
 * vendors out of ONE bank movement and must not walk a person through ten
 * separate forms to do it. Everything the form's save does is done here the
 * same way — the server posting, the voucher record, the bills' paid amounts
 * moving through their own status ladder, the series bump — because a payment
 * that skipped any of those would be a different kind of payment, and there
 * is only one kind.
 */

const safeArray = (v) => (Array.isArray(v) ? v : []);

/** What is still owed TO THE VENDOR, after the document's own source TDS
 *  and debit notes — the deduction is owed to the department, not the party. */
export const docBalance = (doc, notes) => payableOutstanding(doc, notes).outstanding;

const payable = (doc, notes) => {
  if (String(doc?.status || '').trim() === 'Draft') return false;
  return docBalance(doc, notes) > 0.0001;
};

/**
 * A vendor's queue: the bills and expenses still carrying a balance, oldest
 * first, because that is the order they are settled in.
 */
export const outstandingDocsForVendor = (db, companyId, vendorId) => {
  const vid = Number(vendorId);
  if (!Number.isFinite(vid) || !vid) return [];
  const notes = safeArray(db?.debitNotes);
  const rows = [];
  for (const b of safeArray(db?.bills)) {
    if (b.companyId !== companyId || Number(b.vendorId) !== vid || !payable(b, notes)) continue;
    rows.push({ key: `bill:${b.id}`, voucherType: 'bill', id: Number(b.id), number: b.number, date: b.date, total: Number(b.total ?? 0), balance: docBalance(b, notes) });
  }
  for (const e of safeArray(db?.expenses)) {
    if (e.companyId !== companyId || Number(e.vendorId) !== vid || !payable(e, notes)) continue;
    rows.push({ key: `expense:${e.id}`, voucherType: 'expense', id: Number(e.id), number: e.number, date: e.date, total: Number(e.total ?? e.amount ?? 0), balance: docBalance(e, notes) });
  }
  return rows.sort((a, b) => {
    const da = String(a.date || '');
    const dbb = String(b.date || '');
    if (da !== dbb) return da < dbb ? -1 : 1;
    return Number(a.id) - Number(b.id);
  });
};

/**
 * One vendor payment, built and (best-effort) posted to the server.
 *
 * `lines` are `{ voucherType: 'bill'|'expense', voucherId, amount }` — the
 * bills this payment settles; the amount past their sum is recorded as an
 * advance, exactly as the form records one. `extra.takenNumbers` lets a bulk
 * caller thread the numbers already handed out earlier in the same batch, so
 * five payments raised together take five consecutive numbers.
 *
 * Returns the local record; the caller writes it with `applyVendorPayments`,
 * which also moves the bills. Throws when the server refuses — a bulk
 * settlement where payment three silently failed is worse than one that
 * stopped and said so.
 */
export const buildVendorPayment = async ({
  db,
  currentCompany,
  vendorId,
  date,
  amount,
  lines = [],
  ledgerAccountId = '',
  cashBankAccountId = undefined,
  sourceBankTransactionId = undefined,
  notes = '',
  nextLocalId,
  takenNumbers = [],
}) => {
  const companyId = currentCompany.id;
  const vendor = safeArray(db.vendors).find((v) => Number(v.id) === Number(vendorId)) || null;
  const vendorName = vendor?.name || vendor?.displayName || vendor?.companyName || vendor?.legalName || '';

  const cleanLines = safeArray(lines)
    .map((l) => ({
      voucherType: l.voucherType === 'expense' ? 'expense' : 'bill',
      voucherId: Number(l.voucherId),
      amount: round2(Math.abs(Number(l.amount || 0))),
    }))
    .filter((l) => l.amount > 0.005);
  const allocated = round2(cleanLines.reduce((t, l) => t + l.amount, 0));
  const total = round2(Math.abs(Number(amount || 0)));

  /* The same guards the form runs, without its screen. */
  const debitNotes = safeArray(db.debitNotes);
  for (const l of cleanLines) {
    const list = l.voucherType === 'bill' ? safeArray(db.bills) : safeArray(db.expenses);
    const doc = list.find((d) => d.companyId === companyId && Number(d.id) === l.voucherId);
    if (!doc) throw new Error(`A selected ${l.voucherType} was not found.`);
    if (!payable(doc, debitNotes)) throw new Error(`${doc.number || `That ${l.voucherType}`} has no balance to pay.`);
    if (l.amount > docBalance(doc, debitNotes) + 0.0001) {
      throw new Error(`Allocation exceeds outstanding on ${doc.number || `${l.voucherType} ${l.voucherId}`}.`);
    }
  }
  if (allocated > total + 0.005) throw new Error(`${vendorName || 'A vendor'}: bills exceed the amount allotted to them.`);

  const number = nextFreeVoucherNumber({
    db,
    company: currentCompany,
    voucherKey: 'payment',
    takenNumbers: [
      ...safeArray(db.payments)
        .filter((x) => x.companyId === companyId)
        .map((x) => String(x.number || '').trim())
        .filter(Boolean),
      ...takenNumbers,
    ],
  });

  const documentNumberOf = (l) => {
    const list = l.voucherType === 'bill' ? safeArray(db.bills) : safeArray(db.expenses);
    return String(list.find((d) => Number(d.id) === l.voucherId)?.number || '');
  };

  /* Server first, as the form does: it writes the double-entry against the
     vendor control account. Local-only stores keep working (no session). */
  let posted = null;
  if (hasApiSession() && String(ledgerAccountId || '').trim()) {
    posted = await createPayment({
      direction: 'PAYMENT',
      date,
      partyType: 'VENDOR',
      partyId: vendor?.backendPartyId ? String(vendor.backendPartyId) : null,
      partyName: vendorName || null,
      ledgerAccountId: String(ledgerAccountId).trim(),
      amount: total,
      notes: notes || null,
    });
  }

  return {
    id: nextLocalId,
    companyId,
    voucherType: 'payment',
    voucherId: null,
    direction: 'OUT',
    cashBankAccountId,
    sourceBankTransactionId,
    paymentNo: String(posted?.number || '').trim() || `PAY-${nextLocalId}`,
    date,
    vendorId: Number(vendorId),
    vendorName,
    amount: total,
    allocatedAmount: allocated,
    advanceAmount: round2(Math.max(0, total - allocated)),
    allocations: cleanLines.map((l) => ({ ...l, documentNumber: documentNumberOf(l) })),
    mode: 'Bank',
    backendPaymentId: posted?.id ? String(posted.id) : undefined,
    ledgerAccountId: String(ledgerAccountId || '').trim() || undefined,
    number: String(number || '').trim() || `PAY-${nextLocalId}`,
    netCash: total,
    notes,
    createdAt: new Date().toISOString(),
  };
};

/** A customer's collectible invoices, oldest first. */
export const outstandingInvoicesForCustomer = (db, companyId, customerId) => {
  const cid = Number(customerId);
  if (!Number.isFinite(cid) || !cid) return [];
  const balanceOf = (i) => round2(Math.max(0, Number(i.total ?? 0) - Number(i.paidAmount ?? 0)));
  return safeArray(db?.invoices)
    .filter((i) => i.companyId === companyId && Number(i.customerId) === cid)
    .filter((i) => !['Draft', 'Cancelled'].includes(String(i.status || '').trim()))
    .filter((i) => balanceOf(i) > 0.0001)
    .map((i) => ({ key: `invoice:${i.id}`, voucherType: 'invoice', id: Number(i.id), number: i.number, date: i.date, total: Number(i.total ?? 0), balance: balanceOf(i) }))
    .sort((a, b) => {
      const da = String(a.date || '');
      const dbb = String(b.date || '');
      if (da !== dbb) return da < dbb ? -1 : 1;
      return Number(a.id) - Number(b.id);
    });
};

/**
 * One customer receipt, the mirror of `buildVendorPayment`: invoice lines
 * instead of bills, the receipt series instead of the payment series, and the
 * amount past the invoices staying on record as the customer's advance —
 * exactly what the receipt form would have written.
 */
export const buildCustomerReceipt = async ({
  db,
  currentCompany,
  customerId,
  date,
  amount,
  lines = [],
  ledgerAccountId = '',
  cashBankAccountId = undefined,
  sourceBankTransactionId = undefined,
  notes = '',
  nextLocalId,
  takenNumbers = [],
}) => {
  const companyId = currentCompany.id;
  const customer = safeArray(db.customers).find((c) => Number(c.id) === Number(customerId)) || null;
  const customerName = customer?.displayName || customer?.name || '';

  const queue = outstandingInvoicesForCustomer(db, companyId, customerId);
  const cleanLines = safeArray(lines)
    .map((l) => ({ voucherType: 'invoice', voucherId: Number(l.voucherId), amount: round2(Math.abs(Number(l.amount || 0))) }))
    .filter((l) => l.amount > 0.005);
  const allocated = round2(cleanLines.reduce((t, l) => t + l.amount, 0));
  const total = round2(Math.abs(Number(amount || 0)));

  for (const l of cleanLines) {
    const doc = queue.find((d) => d.id === l.voucherId);
    if (!doc) throw new Error('A selected invoice was not found or has no balance.');
    if (l.amount > doc.balance + 0.0001) {
      throw new Error(`Allocation exceeds outstanding on ${doc.number || `invoice ${l.voucherId}`}.`);
    }
  }
  if (allocated > total + 0.005) throw new Error(`${customerName || 'A customer'}: invoices exceed the amount allotted to them.`);

  const number = nextFreeVoucherNumber({
    db,
    company: currentCompany,
    voucherKey: 'receipt',
    takenNumbers: [
      ...safeArray(db.payments)
        .filter((x) => x.companyId === companyId)
        .map((x) => String(x.number || '').trim())
        .filter(Boolean),
      ...takenNumbers,
    ],
  });

  let posted = null;
  if (hasApiSession() && String(ledgerAccountId || '').trim()) {
    const invoiceById = new Map(safeArray(db.invoices).map((i) => [Number(i.id), i]));
    posted = await createPayment({
      direction: 'RECEIPT',
      number: String(number || '').trim() || undefined,
      date,
      partyType: 'CUSTOMER',
      partyId: customer?.backendPartyId ? String(customer.backendPartyId) : null,
      partyName: customerName || null,
      ledgerAccountId: String(ledgerAccountId).trim(),
      amount: total,
      notes: notes || null,
      allocations: cleanLines
        .map((l) => {
          const backendId = String(invoiceById.get(l.voucherId)?.backendInvoiceId || '').trim();
          return backendId ? { docType: 'INVOICE', docId: backendId, amount: l.amount } : null;
        })
        .filter(Boolean),
    });
  }

  const serverNo = String(posted?.number || '').trim();
  return {
    id: nextLocalId,
    companyId,
    voucherType: 'receipt',
    voucherId: null,
    direction: 'IN',
    cashBankAccountId,
    sourceBankTransactionId,
    receiptNo: serverNo || String(number || '').trim() || `RCPT-${nextLocalId}`,
    number: serverNo || String(number || '').trim() || `RCPT-${nextLocalId}`,
    date,
    customerId: Number(customerId),
    customerName,
    amount: total,
    allocatedAmount: allocated,
    advanceAmount: round2(Math.max(0, total - allocated)),
    netCashAmount: total,
    allocations: cleanLines.map((l) => ({
      ...l,
      documentNumber: String(safeArray(db.invoices).find((i) => Number(i.id) === l.voucherId)?.number || ''),
    })),
    mode: 'Bank',
    backendPaymentId: posted?.id ? String(posted.id) : undefined,
    ledgerAccountId: String(ledgerAccountId || '').trim() || undefined,
    notes,
    createdAt: new Date().toISOString(),
  };
};

/**
 * Writes a batch of built payments into the book: the vouchers themselves,
 * every settled document's paid amount and status, and the series moved past
 * each number taken. One pass, so a five-vendor settlement is one state
 * change. Handles both sides: bill/expense lines from payments, invoice
 * lines from receipts.
 */
export const applyVendorPayments = (prev, companyId, records) => {
  if (!safeArray(records).length) return prev;
  const stamp = new Date().toISOString();

  const paidByDoc = new Map();
  for (const r of records) {
    for (const a of safeArray(r.allocations)) {
      const key = `${a.voucherType}:${a.voucherId}`;
      paidByDoc.set(key, round2((paidByDoc.get(key) || 0) + Number(a.amount || 0)));
    }
  }

  const settle = (doc, kind) => {
    const add = paidByDoc.get(`${kind}:${Number(doc.id)}`);
    if (!add || doc.companyId !== companyId) return doc;
    const total = Number(doc.total ?? doc.amount ?? 0);
    /* A bill that deducted at source is settled when the NET reaches the
       vendor — the TDS slice was discharged the day it posted. An invoice's
       tdsAmount is only an expectation, so its target stays the total. */
    const target = kind === 'invoice' ? total : round2(Math.max(0, total - sourceTdsOf(doc)));
    const nextPaid = round2(Math.min(target, Number(doc.paidAmount ?? 0) + add));
    const rawStatus = String(doc.status || '').trim();
    const nextStatus =
      rawStatus === 'Draft'
        ? 'Draft'
        : target > 0 && nextPaid >= target - 0.0001
          ? 'Paid'
          : nextPaid > 0
            ? 'Partial'
            : 'Unpaid';
    return { ...doc, paidAmount: nextPaid, status: nextStatus, updatedAt: stamp };
  };

  let companies = prev.companies;
  for (const r of records) {
    companies = bumpCompanyNextNumber({
      db: { ...prev, companies },
      companyId,
      voucherKey: String(r.voucherType) === 'receipt' ? 'receipt' : 'payment',
      usedNumber: r.number,
    });
  }

  return {
    ...prev,
    payments: [...safeArray(prev.payments), ...records],
    bills: safeArray(prev.bills).map((b) => settle(b, 'bill')),
    expenses: safeArray(prev.expenses).map((e) => settle(e, 'expense')),
    invoices: safeArray(prev.invoices).map((i) => settle(i, 'invoice')),
    companies,
  };
};
