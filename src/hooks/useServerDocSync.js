import { useEffect, useRef } from 'react';

import { hasApiSession, listDocsApi } from '../api/purchaseDocs';
import { listInvoicesApi } from '../api/invoices';

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
