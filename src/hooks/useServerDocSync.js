import { useEffect, useRef } from 'react';

import { hasApiSession, listDocsApi } from '../api/purchaseDocs';
import { listInvoicesApi } from '../api/invoices';
import { listCustomers, listItems, listVendors } from '../api/masters';

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

      for (const [collection, , fetcher, pick, mapper] of MASTER_KINDS) {
        try {
          const rows = pick(await fetcher()) || [];
          collected[collection] = rows.map((r) => mapper(r, currentCompanyId));
        } catch {
          // Same rule as the documents: what does not arrive hydrates nothing.
        }
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

        for (const [collection, idKey] of MASTER_KINDS) {
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

        for (const [, collection, idKey] of [...KINDS, ['invoice', 'invoices', 'backendInvoiceId']]) {
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
