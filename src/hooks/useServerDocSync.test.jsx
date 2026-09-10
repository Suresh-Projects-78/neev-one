import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const api = {
  listCustomers: vi.fn(),
  listVendors: vi.fn(),
  listItems: vi.fn(),
  listDeliveryChallans: vi.fn(),
  listSalesmen: vi.fn(),
  listFixedAssets: vi.fn(),
  listOrgMasters: vi.fn(),
};
const listPayments = vi.fn();
const listDocsApi = vi.fn();
const listInvoicesApi = vi.fn();

vi.mock('../api/masters', () => ({
  COLLECTION_FOR_KIND: { UOM: 'uoms', PRICE_LIST: 'priceLists' },
  listCustomers: (...a) => api.listCustomers(...a),
  listVendors: (...a) => api.listVendors(...a),
  listItems: (...a) => api.listItems(...a),
  listDeliveryChallans: (...a) => api.listDeliveryChallans(...a),
  listSalesmen: (...a) => api.listSalesmen(...a),
  listFixedAssets: (...a) => api.listFixedAssets(...a),
  listOrgMasters: (...a) => api.listOrgMasters(...a),
}));
vi.mock('../api/payments', () => ({ listPayments: (...a) => listPayments(...a) }));
vi.mock('../api/purchaseDocs', () => ({
  hasApiSession: () => true,
  listDocsApi: (...a) => listDocsApi(...a),
}));
vi.mock('../api/invoices', () => ({ listInvoicesApi: (...a) => listInvoicesApi(...a) }));

import { useServerDocSync } from './useServerDocSync';

const Harness = ({ setDb, companyId = 1 }) => {
  useServerDocSync({ enabled: true, currentCompanyId: companyId, setDb });
  return null;
};

/** Runs the hook once and returns the book it produced from `start`. */
const hydrate = async (start = {}) => {
  let book = start;
  const setDb = (fn) => {
    book = typeof fn === 'function' ? fn(book) : fn;
  };
  render(<Harness setDb={setDb} />);
  await waitFor(() => expect(book).not.toBe(start));
  return book;
};

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset().mockResolvedValue({});
  listPayments.mockReset().mockResolvedValue([]);
  listDocsApi.mockReset().mockResolvedValue([]);
  listInvoicesApi.mockReset().mockResolvedValue([]);
  api.listOrgMasters.mockResolvedValue({ masters: [] });
});

/*
 * Three collections were given a table so they would stop living in one
 * browser, and then nothing fetched them — which fixes half the problem it was
 * meant to fix. Payments were the worst: created through the API and never read
 * back, so a new machine showed no receipts, no payments, and an empty book
 * side against a full bank statement.
 */
describe('collections that were written through but never read back', () => {
  it('brings delivery challans back', async () => {
    api.listDeliveryChallans.mockResolvedValue({
      documents: [
        { id: 'dc1', number: 'DC-1', date: '2026-09-01', partyName: 'Acme', purpose: 'JOB_WORK', total: 400, items: [], status: 'Open' },
      ],
    });
    const book = await hydrate();
    expect(book.deliveryChallans).toHaveLength(1);
    expect(book.deliveryChallans[0].number).toBe('DC-1');
    expect(book.deliveryChallans[0].customerName).toBe('Acme');
    // The server's SCREAMING_SNAKE becomes what the form shows.
    expect(book.deliveryChallans[0].purpose).toBe('Job Work');
  });

  it('brings salesmen back with their commission', async () => {
    api.listSalesmen.mockResolvedValue({ salesmen: [{ id: 's1', name: 'Ravi', commissionRate: 2.5, isActive: true }] });
    const book = await hydrate();
    expect(book.salesmen[0].name).toBe('Ravi');
    expect(book.salesmen[0].commissionPct).toBe(2.5);
  });

  it('brings fixed assets back', async () => {
    api.listFixedAssets.mockResolvedValue({
      assets: [{ id: 'a1', name: 'Lathe', cost: 100000, accumulatedDepreciation: 20000, depreciationRate: 15 }],
    });
    const book = await hydrate();
    expect(book.fixedAssets[0].name).toBe('Lathe');
    expect(book.fixedAssets[0].cost).toBe(100000);
  });

  /*
   * Asking once would hydrate the money coming in and quietly leave out the
   * money going out — `listPayments` defaults to receipts.
   */
  it('asks for both directions of payment', async () => {
    listPayments.mockImplementation(({ direction }) =>
      Promise.resolve(
        direction === 'RECEIPT'
          ? [{ id: 'p1', number: 'RCP-1', date: '2026-09-01', direction: 'RECEIPT', amount: 5000, partyType: 'CUSTOMER', partyName: 'Acme' }]
          : [{ id: 'p2', number: 'PAY-1', date: '2026-09-02', direction: 'PAYMENT', amount: 1200, partyType: 'VENDOR', partyName: 'Steel Co' }]
      )
    );
    const book = await hydrate();
    expect(listPayments).toHaveBeenCalledTimes(2);
    expect(book.payments).toHaveLength(2);
    expect(book.payments.find((p) => p.number === 'RCP-1').voucherType).toBe('receipt');
    expect(book.payments.find((p) => p.number === 'PAY-1').voucherType).toBe('payment');
  });

  /*
   * A payment already tied off against a statement must not be offered again on
   * the next machine that opens the book.
   */
  it('carries the reconciled flag across', async () => {
    listPayments.mockImplementation(({ direction }) =>
      Promise.resolve(
        direction === 'RECEIPT'
          ? [{ id: 'p1', number: 'RCP-1', date: '2026-09-01', direction: 'RECEIPT', amount: 5000, reconciled: true, statementRef: 'HDFC · NEFT' }]
          : []
      )
    );
    const book = await hydrate();
    expect(book.payments[0].reconciled).toBe(true);
    expect(book.payments[0].statementRef).toBe('HDFC · NEFT');
  });
});

describe('hydration never duplicates what the browser already has', () => {
  it('recognises a challan the browser wrote by its server id', async () => {
    api.listDeliveryChallans.mockResolvedValue({
      documents: [{ id: 'dc1', number: 'DC-1', date: '2026-09-01', partyName: 'Acme', total: 400, items: [] }],
    });
    const book = await hydrate({
      deliveryChallans: [{ id: 1, companyId: 1, backendDocId: 'dc1', number: 'DC-1', date: '2026-09-01' }],
    });
    expect(book.deliveryChallans).toHaveLength(1);
  });

  /* Written on another machine, so the browser has no server id for it — the
     number is what says it is the same document. */
  it('recognises a challan by its number when it has no server id', async () => {
    api.listDeliveryChallans.mockResolvedValue({
      documents: [{ id: 'dc9', number: 'DC-7', date: '2026-09-01', partyName: 'Acme', total: 400, items: [] }],
    });
    const book = await hydrate({
      deliveryChallans: [{ id: 1, companyId: 1, number: 'DC-7', date: '2026-09-01' }],
    });
    expect(book.deliveryChallans).toHaveLength(1);
  });

  /* The same person under two ids means a commission report counts their
     invoices once each. */
  it('recognises a salesman by name', async () => {
    api.listSalesmen.mockResolvedValue({ salesmen: [{ id: 's1', name: 'Ravi', commissionRate: 2 }] });
    const book = await hydrate({ salesmen: [{ id: 1, companyId: 1, name: 'Ravi' }] });
    expect(book.salesmen).toHaveLength(1);
  });

  it('keeps a local row the server has never seen', async () => {
    api.listSalesmen.mockResolvedValue({ salesmen: [{ id: 's1', name: 'Ravi', commissionRate: 2 }] });
    const book = await hydrate({ salesmen: [{ id: 1, companyId: 1, name: 'Only here' }] });
    expect(book.salesmen).toHaveLength(2);
  });
});
