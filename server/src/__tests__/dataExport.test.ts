import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { buildApp } from '../app.js';

/**
 * A company's own books, in a file its owner can keep.
 *
 * The one defect that would matter here is one company's export containing
 * another's — so most of what follows is about that, and about the export
 * carrying nothing it should not.
 */

const app = buildApp().listen(0);
afterAll(() => new Promise((done) => app.close(done)));
const rnd = () => Math.random().toString(36).slice(2, 8);

type Ctx = { token: string; orgId: string; branchId: string };
const auth = (c: Ctx) => ({
  Authorization: `Bearer ${c.token}`,
  'x-org-id': c.orgId,
  'x-branch-id': c.branchId,
});

const makeOwner = async (label: string): Promise<Ctx> => {
  const email = `exp.${label}.${Date.now()}.${rnd()}@example.com`;
  const signup = await request(app)
    .post('/api/auth/signup')
    .send({ email, password: 'Passw0rd!23', name: `${label} owner` })
    .expect(200);
  const setup = await request(app)
    .post('/api/auth/setup-company')
    .set('Authorization', `Bearer ${signup.body.token}`)
    .send({ companyName: `Exp ${label} ${Date.now()}-${rnd()}`, state: 'Karnataka' })
    .expect(200);
  return { token: signup.body.token, orgId: setup.body.company.orgId, branchId: setup.body.branch.id };
};

const raiseInvoice = async (c: Ctx, customerName: string) => {
  const res = await request(app)
    .post(`/api/orgs/${c.orgId}/invoices`)
    .set(auth(c))
    .send({
      number: `INV-${rnd()}`,
      date: '2026-09-09',
      customerName,
      subtotal: 1000,
      gstTotal: 180,
      total: 1180,
      status: 'Unpaid',
      items: [{ description: 'MS Angle', quantity: 1, rate: 1000, gstRate: 18, amount: 1000 }],
    })
    .expect(201);
  return res.body.invoice;
};

let mine: Ctx;
beforeAll(async () => {
  mine = await makeOwner('mine');
  await raiseInvoice(mine, 'My Customer');
}, 60_000);

describe('exporting a company', () => {
  it('returns the company’s own records', async () => {
    const res = await request(app).get(`/api/orgs/${mine.orgId}/export`).set(auth(mine)).expect(200);
    expect(res.body.export.format).toBe('neev-one/company-export');
    expect(res.body.export.company.id).toBe(mine.orgId);
    expect(res.body.data.invoices.length).toBeGreaterThan(0);
    expect(res.body.data.invoices[0].customerName).toBe('My Customer');
    // The branch created at setup is in there, so this is more than documents.
    expect(res.body.data.branches.length).toBeGreaterThan(0);
  });

  it('says what it contains, so the file explains itself later', async () => {
    const res = await request(app).get(`/api/orgs/${mine.orgId}/export`).set(auth(mine)).expect(200);
    expect(res.body.export.counts.invoices).toBe(res.body.data.invoices.length);
    expect(res.body.export.takenAt).toBeTruthy();
    expect(res.body.export.company.name).toBeTruthy();
  });

  /* Money as numbers, not as the Decimal objects the client returns. */
  it('writes money as numbers a spreadsheet can read', async () => {
    const res = await request(app).get(`/api/orgs/${mine.orgId}/export`).set(auth(mine)).expect(200);
    expect(typeof res.body.data.invoices[0].total).toBe('number');
    expect(res.body.data.invoices[0].total).toBe(1180);
  });

  /*
   * The defect that would matter. A customer handed a file containing another
   * customer's books is the worst outcome this feature has.
   */
  it("contains no other company's data", async () => {
    const theirs = await makeOwner('theirs');
    await raiseInvoice(theirs, 'Someone Else Entirely');

    const res = await request(app).get(`/api/orgs/${mine.orgId}/export`).set(auth(mine)).expect(200);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('Someone Else Entirely');
    expect(body).not.toContain(theirs.orgId);
  });

  /* Two companies on ONE account — the case an account-level check hides. */
  it("contains no sibling company's data either", async () => {
    const second = await request(app)
      .post('/api/auth/setup-company')
      .set('Authorization', `Bearer ${mine.token}`)
      .send({ companyName: `Sibling ${Date.now()}-${rnd()}`, state: 'Kerala' })
      .expect(200);
    const sibling: Ctx = { token: mine.token, orgId: second.body.company.orgId, branchId: second.body.branch.id };
    await raiseInvoice(sibling, 'Sibling Customer');

    const res = await request(app).get(`/api/orgs/${mine.orgId}/export`).set(auth(mine)).expect(200);
    expect(JSON.stringify(res.body)).not.toContain('Sibling Customer');
  });

  /* Books, not credentials. */
  it('carries no passwords, sessions or secrets', async () => {
    const res = await request(app).get(`/api/orgs/${mine.orgId}/export`).set(auth(mine)).expect(200);
    const body = JSON.stringify(res.body);
    for (const leak of ['passwordHash', 'refreshTokenHash', 'clientSecretEnc', 'JWT_SECRET']) {
      expect(body).not.toContain(leak);
    }
    expect(res.body.data.users).toBeUndefined();
    expect(res.body.data.sessions).toBeUndefined();
  });

  it('refuses an org the caller is not in', async () => {
    const stranger = await makeOwner('stranger');
    await request(app).get(`/api/orgs/${stranger.orgId}/export`).set(auth(mine)).expect(403);
  });
});
