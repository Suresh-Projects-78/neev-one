import { useEffect, useRef } from 'react';

import { hasApiSession, listDocsApi } from '../api/purchaseDocs';
import { listInvoicesApi } from '../api/invoices';
import {
  COLLECTION_FOR_KIND,
  listCustomers,
  listDeliveryChallans,
  listFixedAssets,
  listItems,
  listOrgMasters,
  listSalesmen,
  listVendors,
} from '../api/masters';
import { listPayments } from '../api/payments';
import { listBankBook } from '../api/bankBook';
import { listSchedules } from '../api/recurring';

/**
 * Pull-hydration: documents saved to the server come BACK on a fresh browser.
 *
 * Write-through alone closed only half the localStorage risk — a new browser
 * profile still opened onto empty lists while the server held the books. On
 * sign-in this fetches every server-backed document kind and merges the ones
 * the local db does not know yet.
 *
 * Merge rules, deliberately additive:
 * - match by backend id first, then by document number — a doc the browser
 *   already has (it wrote it) is never duplicated;
 * - nothing local is ever deleted here. Legacy local-only documents stay
 *   until their owner deals with them; hydration must never eat data.
 */

const num = (v) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const mapCommon = (d, companyId, idKey) => ({
  companyId,
  [idKey]: d.id,
  number: d.number,
  date: d.date,
  dueDate: d.dueDate || '',
  refNo: d.refNo || '',
  refDate: d.refDate || '',
  status: d.status || 'Unpaid',
  subtotal: num(d.subtotal),
  cgstTotal: num(d.cgstTotal),
  sgstTotal: num(d.sgstTotal),
  igstTotal: num(d.igstTotal),
  gstTotal: num(d.gstTotal),
  total: num(d.total),
  paidAmount: num(d.settledAmount),
  items: Array.isArray(d.items) ? d.items : [],
  placeOfSupplyState: d.placeOfSupplyState || '',
  taxType: d.taxType || '',
  createdAt: d.createdAt,
  hydratedFromServer: true,
});

const GST_REGISTRATION = {
  REGULAR: 'Registered',
  COMPOSITION: 'Composition',
  UNREGISTERED: 'Unregistered',
  SEZ: 'SEZ',
};

/** A server party as the browser's books store one. */
const mapParty = (p, companyId) => ({
  companyId,
  backendPartyId: p.id,
  name: p.name || '',
  displayName: p.legalName || p.name || '',
  gstin: p.gstin || '',
  gstRegistration: GST_REGISTRATION[String(p.gstRegistrationType || '').toUpperCase()] || 'Unregistered',
  email: p.email || '',
  phone: p.phone || '',
  contactPerson: p.contactPerson || '',
  billingAddress: {
    line1: p.billingLine1 || '',
    line2: p.billingLine2 || '',
    city: p.billingCity || '',
    state: p.billingState || p.placeOfSupplyState || '',
    pincode: p.billingPincode || '',
    country: p.billingCountry || 'India',
  },
  openingBalance: num(p.openingBalance),
  openingBalanceType: p.openingBalanceType === 'CR' ? 'Cr' : 'Dr',
  balance: 0,
  hydratedFromServer: true,
});

const mapItem = (it, companyId) => ({
  companyId,
  backendItemId: it.id,
  code: it.code || '',
  name: it.name || '',
  description: it.description || '',
  type: String(it.itemType || '').toUpperCase() === 'SERVICE' ? 'Service' : 'Goods',
  unit: it.unit || 'Pcs',
  hsnSac: it.hsnSac || '',
  gstRate: num(it.gstRate),
  salePrice: num(it.salePrice),
  purchasePrice: num(it.purchasePrice),
  openingQty: num(it.openingQty),
  stock: num(it.openingQty),
  reorderLevel: num(it.reorderLevel),
  trackingType: String(it.trackBy || 'NONE').toUpperCase(),
  hydratedFromServer: true,
});

/**
 * Masters, fetched the same way documents are.
 *
 * Without these a browser that had never seen this company — a new machine, a
 * cleared site, a different URL for the same server — opened onto documents
 * with no customers, no vendors and no items behind them: the invoice list
 * showed a customer name because the invoice carries one, while the customer
 * list was empty and no new invoice could be raised against them.
 *
 * The chart of accounts does not have to be built here. normalizeDB gives any
 * party without a ledger one, and it runs on every write.
 */
const MASTER_KINDS = [
  ['customers', 'backendPartyId', listCustomers, (r) => r?.customers, mapParty],
  ['vendors', 'backendPartyId', listVendors, (r) => r?.vendors, mapParty],
  ['items', 'backendItemId', listItems, (r) => r?.items, mapItem],
];

/**
 * The six reference lists, hydrated by name the same way a customer is.
 *
 * They arrive from one endpoint keyed by kind, so unlike the masters above
 * there is nothing to fetch per collection — the rows are split on the way in.
 */
const REFERENCE_COLLECTIONS = Object.values(COLLECTION_FOR_KIND).map((collection) => [collection, 'backendMasterId']);

/**
 * Written through and never read back.
 *
 * A challan, a salesman and a fixed asset were each given a table so they would
 * stop living in one browser — and then nothing fetched them, which fixes only
 * half of the problem it was meant to fix: the server holds the record and a
 * fresh browser still opens onto an empty list.
 *
 * Payments are the worst of the four. They are created through the API and
 * never read back, so a new machine showed no receipts, no payments, and — now
 * that reconciliation exists — an empty book side against a full statement,
 * which would report every line as money nobody had recorded.
 */
const mapChallan = (d, companyId) => ({
  companyId,
  backendDocId: d.id,
  number: d.number,
  date: d.date,
  customerId: d.partyId || '',
  customerName: d.partyName || '',
  purpose: String(d.purpose || '')
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase()),
  vehicleNo: d.vehicleNo || '',
  notes: d.notes || '',
  items: Array.isArray(d.items) ? d.items : [],
  value: num(d.total ?? d.subtotal),
  status: d.status || 'Open',
  warehouseId: d.warehouseId || '',
  createdAt: d.createdAt,
  hydratedFromServer: true,
});

const mapSalesman = (r, companyId) => ({
  companyId,
  backendSalesmanId: r.id,
  name: r.name,
  phone: r.phone || '',
  email: r.email || '',
  commissionPct: num(r.commissionRate),
  active: r.isActive !== false,
  createdAt: r.createdAt,
  hydratedFromServer: true,
});

const mapFixedAsset = (r, companyId) => ({
  companyId,
  backendAssetId: r.id,
  name: r.name,
  category: r.category || '',
  purchaseDate: r.purchaseDate || '',
  cost: num(r.cost),
  salvageValue: num(r.salvageValue),
  method: r.depreciationMethod || '',
  rate: num(r.depreciationRate),
  usefulLifeYears: r.usefulLifeYears ?? null,
  accumulatedDepreciation: num(r.accumulatedDepreciation),
  status: r.status || 'Active',
  createdAt: r.createdAt,
  hydratedFromServer: true,
});

/**
 * A recurring schedule as the browser's screen stores one.
 *
 * The server owns the schedule and raises its invoices; the local row exists so
 * the screen keeps working. `active` rather than `isActive` because that is
 * what the screen has always called it.
 */
const mapSchedule = (r, companyId) => ({
  companyId,
  backendScheduleId: r.id,
  name: r.name || '',
  customerId: r.partyId || '',
  customerName: r.partyName || '',
  branchId: r.branchId || '',
  warehouseId: r.warehouseId || '',
  frequency: r.frequency || 'MONTHLY',
  interval: Number(r.interval) || 1,
  nextRunDate: r.nextRunDate || '',
  endDate: r.endDate || null,
  maxOccurrences: r.maxOccurrences ?? null,
  generatedCount: Number(r.generatedCount) || 0,
  dueDays: Number.isFinite(Number(r.dueDays)) ? Number(r.dueDays) : 30,
  active: r.isActive !== false,
  notes: r.notes || '',
  items: Array.isArray(r.template?.items) ? r.template.items : [],
  subtotal: num(r.template?.subtotal),
  cgstTotal: num(r.template?.cgstTotal),
  sgstTotal: num(r.template?.sgstTotal),
  igstTotal: num(r.template?.igstTotal),
  gstTotal: num(r.template?.gstTotal),
  total: num(r.template?.total),
  lastRunAt: r.lastRunAt || null,
  createdAt: r.createdAt,
  hydratedFromServer: true,
});

/**
 * A cash or bank book line as the browser stores one.
 *
 * `cashBankAccountId` and `ledgerId` are the browser's own numeric chart ids
 * and mean nothing on the server, so what comes back carries the server ledger
 * ids and the cash-book screen resolves them against its chart. A line whose
 * account cannot be resolved locally is still hydrated — losing it would be
 * worse than showing it under an account the browser has not caught up with.
 */
const mapBankEntry = (r, companyId) => ({
  companyId,
  backendBankEntryId: r.id,
  serverLedgerAccountId: r.ledgerAccountId,
  serverContraLedgerAccountId: r.contraLedgerAccountId || null,
  date: String(r.date || '').slice(0, 10),
  direction: String(r.direction || 'IN').toUpperCase(),
  amount: num(r.amount),
  narration: r.narration || '',
  description: r.narration || '',
  reference: r.reference || '',
  source: r.source || 'MANUAL',
  reconciled: r.reconciled === true,
  bankDate: r.bankDate || null,
  statementRef: r.statementRef || '',
  createdAt: r.createdAt,
  hydratedFromServer: true,
});

/**
 * A payment as the browser's books store one.
 *
 * `reconciled` comes across because the reconciliation screen reads it: a
 * payment already tied off against a statement must not be offered again on
 * the next machine that opens the book.
 */
const mapPayment = (p, companyId) => ({
  companyId,
  backendPaymentId: p.id,
  id: p.id,
  number: p.number || '',
  date: String(p.date || '').slice(0, 10),
  voucherType: String(p.direction || '').toUpperCase() === 'RECEIPT' ? 'receipt' : 'payment',
  amount: num(p.amount),
  partyName: p.partyName || '',
  customerName: String(p.partyType || '') === 'CUSTOMER' ? p.partyName || '' : '',
  vendorName: String(p.partyType || '') === 'VENDOR' ? p.partyName || '' : '',
  ledgerAccountId: p.ledgerAccountId || '',
  notes: p.notes || '',
  reconciled: p.reconciled === true,
  bankDate: p.bankDate || null,
  statementRef: p.statementRef || '',
  createdAt: p.createdAt,
  hydratedFromServer: true,
});

/**
 * [db collection, backend id field, fetcher, pick, mapper]
 *
 * Split by what makes a row the same row. A challan carries a number, so a
 * challan the browser wrote is recognised by it; a salesman has only a name.
 * Getting that wrong duplicates: the same person under two ids, and a
 * commission report that counts their invoices once each.
 */
const WRITE_THROUGH_BY_NUMBER = [
  ['deliveryChallans', 'backendDocId', listDeliveryChallans, (r) => r?.documents, mapChallan],
];

const WRITE_THROUGH_BY_NAME = [
  ['recurringTemplates', 'backendScheduleId', listSchedules, (r) => r?.schedules, mapSchedule],
  ['salesmen', 'backendSalesmanId', listSalesmen, (r) => r?.salesmen, mapSalesman],
  ['fixedAssets', 'backendAssetId', listFixedAssets, (r) => r?.assets, mapFixedAsset],
];

const WRITE_THROUGH_KINDS = [...WRITE_THROUGH_BY_NUMBER, ...WRITE_THROUGH_BY_NAME];

/** kind → [db collection, backend id field, party field, extra mapper] */
const KINDS = [
  ['bill', 'bills', 'backendDocId', 'vendorName', null],
  ['expense', 'expenses', 'backendDocId', 'vendorName', (d) => ({ category: d.category || '', description: d.description || '', taxableTotal: num(d.subtotal) })],
  ['estimate', 'estimates', 'backendDocId', 'customerName', (d) => ({ validUntil: d.validUntil || '' })],
  ['purchaseOrder', 'purchaseOrders', 'backendDocId', 'vendorName', (d) => ({ expectedDate: d.expectedDate || '', warehouseId: d.warehouseId || '' })],
  ['salesOrder', 'salesOrders', 'backendDocId', 'customerName', (d) => ({ expectedDate: d.expectedDate || '', warehouseId: d.warehouseId || '' })],
  ['creditNote', 'creditNotes', 'backendDocId', 'customerName', (d) => ({ originalInvoiceNumber: d.refNo || '', customerGstin: d.partyGstin || '' })],
  ['debitNote', 'debitNotes', 'backendDocId', 'vendorName', (d) => ({ originalBillNumber: d.refNo || '', vendorGstin: d.partyGstin || '' })],
];

export function useServerDocSync({ enabled, currentCompanyId, setDb }) {
  // One sync per session per company: hydration is a boot concern, not a poll.
  const syncedFor = useRef('');

  useEffect(() => {
    const key = String(currentCompanyId || '');
    if (!enabled || !key || !hasApiSession()) return;
    if (syncedFor.current === key) return;
    syncedFor.current = key;

    /**
     * The claim above is released again if this run does not finish.
     *
     * It used to be permanent, and the run that made it almost never got to
     * use it: the effect is set up, torn down and set up again during boot
     * (React's development remount, and again when the company id arrives),
     * so the run holding the claim was cancelled while its fetches were still
     * in the air and dropped every document it had just downloaded. Each
     * later run then found the key already claimed and returned immediately.
     * The result was hydration that never once merged anything — an invoice,
     * a customer and a payment sat on the server, and the browser showed
     * empty lists with no way to ever see them.
     */
    let cancelled = false;
    let merged = false;

    (async () => {
      const collected = {};

      for (const [kind, collection, idKey, partyField, extra] of KINDS) {
        try {
          const docs = await listDocsApi(kind);
          collected[collection] = docs.map((d) => ({
            ...mapCommon(d, currentCompanyId, idKey),
            [partyField]: d.partyName || '',
            partyGstin: d.partyGstin || '',
            ...(extra ? extra(d) : {}),
          }));
        } catch {
          // A kind that fails (permissions, feature off) hydrates nothing;
          // the rest still land.
        }
      }

      for (const [collection, , fetcher, pick, mapper] of [...MASTER_KINDS, ...WRITE_THROUGH_KINDS]) {
        try {
          const rows = pick(await fetcher()) || [];
          collected[collection] = rows.map((r) => mapper(r, currentCompanyId));
        } catch {
          // Same rule as the documents: what does not arrive hydrates nothing.
        }
      }

      try {
        const entries = (await listBankBook())?.entries || [];
        collected.bankTransactions = entries.map((r) => mapBankEntry(r, currentCompanyId));
      } catch {
        /* same rule: what does not arrive hydrates nothing */
      }

      try {
        /*
         * Both directions. `listPayments` defaults to receipts, so asking once
         * would have hydrated the money coming in and quietly left out the
         * money going out.
         */
        const [receipts, paid] = await Promise.all([
          listPayments({ direction: 'RECEIPT' }).catch(() => []),
          listPayments({ direction: 'PAYMENT' }).catch(() => []),
        ]);
        collected.payments = [...receipts, ...paid].map((p) => mapPayment(p, currentCompanyId));
      } catch {
        /* same rule: what does not arrive hydrates nothing */
      }

      try {
        const rows = (await listOrgMasters())?.masters || [];
        for (const r of rows) {
          const collection = COLLECTION_FOR_KIND[r.kind];
          if (!collection) continue;
          if (!collected[collection]) collected[collection] = [];
          collected[collection].push({
            // `data` first so a stored payload can never overwrite the identity
            // the server keeps in its own columns.
            ...(r.data && typeof r.data === 'object' ? r.data : {}),
            companyId: currentCompanyId,
            backendMasterId: r.id,
            name: r.name,
            active: r.isActive !== false,
            hydratedFromServer: true,
          });
        }
      } catch {
        /* same rule: what does not arrive hydrates nothing */
      }

      try {
        const invoices = await listInvoicesApi();
        collected.invoices = invoices.map((d) => ({
          ...mapCommon(d, currentCompanyId, 'backendInvoiceId'),
          customerName: d.partyName || d.customerName || '',
          customerId: d.partyId || '',
        }));
      } catch {
        /* same: partial hydration beats none */
      }

      if (cancelled) return;

      setDb((prev) => {
        const next = { ...prev };

        for (const [collection, idKey] of [...MASTER_KINDS, ...REFERENCE_COLLECTIONS, ...WRITE_THROUGH_BY_NAME]) {
          const incoming = collected[collection];
          if (!incoming || !incoming.length) continue;
          const existing = Array.isArray(prev[collection]) ? prev[collection] : [];
          const knownIds = new Set(existing.map((x) => String(x?.[idKey] || '')).filter(Boolean));
          // Masters have no document number, so the second test is the name —
          // a customer the browser already knows must not arrive twice under
          // two ids and split their ledger in half.
          const knownNames = new Set(
            existing
              .filter((x) => x.companyId === currentCompanyId)
              .map((x) => String(x?.name || '').trim().toLowerCase())
              .filter(Boolean)
          );
          let nextId = existing.reduce((m, x) => Math.max(m, Number(x?.id || 0)), 0);
          const fresh = incoming
            .filter(
              (d) =>
                !knownIds.has(String(d[idKey])) && !knownNames.has(String(d.name || '').trim().toLowerCase())
            )
            .map((d) => ({ ...d, id: ++nextId }));
          if (fresh.length) next[collection] = [...existing, ...fresh];
        }

        for (const [, collection, idKey] of [
          ...KINDS,
          ['invoice', 'invoices', 'backendInvoiceId'],
          ['deliveryChallan', 'deliveryChallans', 'backendDocId'],
          // A payment's number is its voucher number, which is exactly what
          // makes two rows the same payment.
          ['payment', 'payments', 'backendPaymentId'],
          // A bank book line has no number of its own, so the server id is the
          // only test — which is right: two identical charges on one day are
          // two charges, not one recorded twice.
          ['bankBookEntry', 'bankTransactions', 'backendBankEntryId'],
        ]) {
          const incoming = collected[collection];
          if (!incoming || !incoming.length) continue;
          const existing = Array.isArray(prev[collection]) ? prev[collection] : [];
          const knownIds = new Set(existing.map((x) => String(x?.[idKey] || '')).filter(Boolean));
          const knownNumbers = new Set(
            existing
              .filter((x) => x.companyId === currentCompanyId)
              .map((x) => String(x?.number || '').trim())
              .filter(Boolean)
          );
          let nextId = existing.reduce((m, x) => Math.max(m, Number(x?.id || 0)), 0);
          const fresh = incoming
            .filter((d) => !knownIds.has(String(d[idKey])) && !knownNumbers.has(String(d.number).trim()))
            .map((d) => ({ ...d, id: ++nextId }));
          if (fresh.length) next[collection] = [...existing, ...fresh];
        }
        return next;
      });
      merged = true;
    })();

    return () => {
      cancelled = true;
      // Cancelled before it merged: give the claim back so the next run redoes
      // the work, rather than leaving the session permanently un-hydrated.
      if (!merged) syncedFor.current = '';
    };
  }, [enabled, currentCompanyId, setDb]);
}
