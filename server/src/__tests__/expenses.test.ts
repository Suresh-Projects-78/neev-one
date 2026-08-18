import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { buildApp } from '../app.js';

/**
 * One listening server for the whole file — see ledger.test.ts for why
 * (per-request listeners were the suite's flake source).
 */
const app = buildApp().listen(0);
afterAll(() => new Promise((done) => app.close(done)));

type Ctx = { token: string; orgId: string; branchId: string; accountId: string; userId: string };

let A: Ctx;

async function makeTenant(label: string): Promise<Ctx> {
  const email = `${label}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}@example.com`;
  const signup = await request(app)
    .post('/api/auth/signup')
    .send({ email, password: 'Passw0rd!23', name: `${label} owner` })
    .expect(200);
  const token = signup.body.token as string;
  const setup = await request(app)
    .post('/api/auth/setup-company')
    .set('Authorization', `Bearer ${token}`)
    .send({ companyName: `${label} Co ${Date.now()}` })
    .expect(200);
  return {
    token,
    orgId: setup.body.company.orgId,
    branchId: setup.body.branch.id,
    accountId: signup.body.user.accountId,
    userId: signup.body.user.id,
  };
}

const auth = (c: Ctx) => ({
  Authorization: `Bearer ${c.token}`,
  'x-org-id': c.orgId,
  'x-branch-id': c.branchId,
});

const expensePayload = (over: Record<string, unknown> = {}) => ({
  date: '2026-08-18',
  partyName: 'City Landlord',
  category: 'Rent',
  description: 'August office rent',
  subtotal: 10000,
  cgstTotal: 900,
  sgstTotal: 900,
  igstTotal: 0,
  gstTotal: 1800,
  total: 11800,
  items: [{ description: 'Office rent', quantity: 1, rate: 10000, gstRate: 18 }],
  ...over,
});

beforeAll(async () => {
  A = await makeTenant('tenant-exp');
}, 60_000);

describe('expense vouchers on the server', () => {
  it('creates an expense, posts it, and the trial balance stays footed', async () => {
    const res = await request(app)
      .post(`/api/orgs/${A.orgId}/expenses`)
      .set(auth(A))
      .send(expensePayload())
      .expect(201);

    expect(res.body.document.number).toMatch(/^EXP-/);
    expect(res.body.document.category).toBe('Rent');

    const tb = await request(app).get(`/api/orgs/${A.orgId}/ledger/trial-balance`).set(auth(A)).expect(200);
    expect(tb.body.totals.balanced).toBe(true);

    const byName = new Map(tb.body.rows.map((r: any) => [r.name, r]));
    const exp = byName.get('Indirect Expenses') as any;
    const ap = byName.get('Accounts Payable') as any;
    expect(exp.debit).toBeCloseTo(10000, 2);
    expect(ap.credit).toBeCloseTo(11800, 2);
    // input GST is an asset claim, not a cost
    expect((byName.get('Input CGST') as any).debit).toBeCloseTo(900, 2);
  });

  it('deleting an expense reverses its posting instead of editing history', async () => {
    const created = await request(app)
      .post(`/api/orgs/${A.orgId}/expenses`)
      .set(auth(A))
      .send(expensePayload({ partyName: 'Cab Co', category: 'Travel', subtotal: 500, cgstTotal: 0, sgstTotal: 0, gstTotal: 0, total: 500 }))
      .expect(201);

    const before = await request(app).get(`/api/orgs/${A.orgId}/ledger/trial-balance`).set(auth(A)).expect(200);

    const del = await request(app)
      .delete(`/api/orgs/${A.orgId}/expenses/${created.body.document.id}`)
      .set(auth(A))
      .expect(200);
    expect(del.body.reversedEntries).toBe(1);

    const after = await request(app).get(`/api/orgs/${A.orgId}/ledger/trial-balance`).set(auth(A)).expect(200);
    expect(after.body.totals.balanced).toBe(true);
    // net effect of create+reverse is zero: AP net equals what it was before this voucher
    const apNet = (r: any) => {
      const row = r.body.rows.find((x: any) => x.name === 'Accounts Payable');
      return (row?.debit || 0) - (row?.credit || 0);
    };
    expect(apNet(after)).toBeCloseTo(apNet(before) + 500, 2);
  });

  it('lists expenses for the branch', async () => {
    const list = await request(app).get(`/api/orgs/${A.orgId}/expenses`).set(auth(A)).expect(200);
    expect(Array.isArray(list.body.documents)).toBe(true);
    expect(list.body.documents.length).toBeGreaterThanOrEqual(1);
  });

  it('respects the expenses feature switch', async () => {
    const current = await request(app).get(`/api/orgs/${A.orgId}/features`).set(auth(A)).expect(200);
    await request(app)
      .put(`/api/orgs/${A.orgId}/features`)
      .set(auth(A))
      .send({ features: { ...current.body.features, expenses: false } })
      .expect(200);
    try {
      const res = await request(app)
        .post(`/api/orgs/${A.orgId}/expenses`)
        .set(auth(A))
        .send(expensePayload({ partyName: 'Nobody' }))
        .expect(400);
      expect(String(res.body.error)).toMatch(/switched off/i);
    } finally {
      await request(app)
        .put(`/api/orgs/${A.orgId}/features`)
        .set(auth(A))
        .send({ features: { ...current.body.features, expenses: true } })
        .expect(200);
    }
  });
});
