import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { buildApp } from '../app.js';
import { prisma } from '../utils/prisma.js';

/**
 * Three things that lived only in the browser, and why each had to stop.
 *
 * A delivery challan is a document under Rule 55: it travels with the goods, an
 * e-way bill is raised against it, and it may have to be produced. A fixed
 * asset appears on the balance sheet. A salesman is the axis of the Sales by
 * Salesman report. So none of the three was an incomplete feature — each made
 * the same company show different figures, or hold different records, on
 * different machines.
 *
 * Discount rules, cost centres and price lists are still browser-only on
 * purpose: nothing reports on them and no document is one.
 */

const app = buildApp().listen(0);
afterAll(() => new Promise((done) => app.close(done)));
const rnd = () => Math.random().toString(36).slice(2, 8);

type Ctx = { token: string; orgId: string; branchId: string };
let owner: Ctx;
const auth = (c: Ctx) => ({
  Authorization: `Bearer ${c.token}`,
  'x-org-id': c.orgId,
  'x-branch-id': c.branchId,
});

beforeAll(async () => {
  const email = `bom.${Date.now()}.${rnd()}@example.com`;
  const signup = await request(app)
    .post('/api/auth/signup')
    .send({ email, password: 'Passw0rd!23', name: 'BOM owner' })
    .expect(200);
  const setup = await request(app)
    .post('/api/auth/setup-company')
    .set('Authorization', `Bearer ${signup.body.token}`)
    .send({ companyName: `BOM Co ${Date.now()}-${rnd()}`, state: 'Karnataka' })
    .expect(200);
  owner = { token: signup.body.token, orgId: setup.body.company.orgId, branchId: setup.body.branch.id };
}, 60_000);

describe('delivery challans', () => {
  it('are stored, numbered and listed', async () => {
    const created = await request(app)
      .post(`/api/orgs/${owner.orgId}/delivery-challans`)
      .set(auth(owner))
      .send({
        date: '2026-08-01',
        partyName: 'Acme Traders',
        purpose: 'JOB_WORK',
        subtotal: 1000,
        total: 1000,
        items: [{ description: 'Casting', quantity: 10, rate: 100 }],
      })
      .expect(201);

    const doc = created.body.doc || created.body.estimate || created.body.document;
    expect(doc.number).toMatch(/^DC-/);
    expect(doc.status).toBe('Open'); // not Draft: a challan exists the moment goods move
    expect(doc.purpose).toBe('JOB_WORK');

    const list = await request(app)
      .get(`/api/orgs/${owner.orgId}/delivery-challans`)
      .set(auth(owner))
      .expect(200);
    const rows = list.body.docs || list.body.documents || list.body.estimates || [];
    expect(rows.some((r: any) => r.id === doc.id)).toBe(true);
  });

  /*
   * The billed-once guard. It used to live in the browser, so the same
   * consignment could be invoiced twice from a second machine.
   */
  it('remember that they have been converted', async () => {
    const made = await request(app)
      .post(`/api/orgs/${owner.orgId}/delivery-challans`)
      .set(auth(owner))
      .send({ date: '2026-08-02', partyName: 'Acme', total: 500, items: [] })
      .expect(201);
    const doc = made.body.doc || made.body.document;

    await request(app)
      .patch(`/api/orgs/${owner.orgId}/delivery-challans/${doc.id}`)
      .set(auth(owner))
      .send({ status: 'Converted', convertedInvoiceId: 'inv_123' })
      .expect(200);

    const row = await prisma.deliveryChallan.findUnique({ where: { id: doc.id } });
    expect(row?.status).toBe('Converted');
    expect(row?.convertedInvoiceId).toBe('inv_123');
  });

  it('carry an e-way bill number', async () => {
    const made = await request(app)
      .post(`/api/orgs/${owner.orgId}/delivery-challans`)
      .set(auth(owner))
      .send({ date: '2026-08-03', partyName: 'Acme', total: 900, items: [], ewayBillNo: '351234567890' })
      .expect(201);
    const doc = made.body.doc || made.body.document;
    const row = await prisma.deliveryChallan.findUnique({ where: { id: doc.id } });
    expect(row?.ewayBillNo).toBe('351234567890');
  });
});

describe('salesmen', () => {
  it('are stored and listed', async () => {
    const name = `Ravi ${rnd()}`;
    const made = await request(app)
      .post(`/api/orgs/${owner.orgId}/salesmen`)
      .set(auth(owner))
      .send({ name, code: 'S-01', phone: '9876543210', commissionRate: 2.5 })
      .expect(201);
    expect(made.body.salesman.commissionRate).toBe(2.5);

    const list = await request(app).get(`/api/orgs/${owner.orgId}/salesmen`).set(auth(owner)).expect(200);
    expect(list.body.salesmen.some((s: any) => s.name === name)).toBe(true);
  });

  /*
   * Deactivated, never deleted: documents already carry the salesman, and
   * deleting the row would leave them pointing at nothing.
   */
  it('are deactivated rather than deleted', async () => {
    const made = await request(app)
      .post(`/api/orgs/${owner.orgId}/salesmen`)
      .set(auth(owner))
      .send({ name: `Gone ${rnd()}` })
      .expect(201);

    await request(app)
      .delete(`/api/orgs/${owner.orgId}/salesmen/${made.body.salesman.id}`)
      .set(auth(owner))
      .expect(200);

    const row = await prisma.salesman.findUnique({ where: { id: made.body.salesman.id } });
    expect(row).not.toBeNull();
    expect(row?.isActive).toBe(false);
  });

  it('will not take the same name twice', async () => {
    const name = `Twice ${rnd()}`;
    await request(app).post(`/api/orgs/${owner.orgId}/salesmen`).set(auth(owner)).send({ name }).expect(201);
    await request(app).post(`/api/orgs/${owner.orgId}/salesmen`).set(auth(owner)).send({ name }).expect(409);
  });
});

describe('fixed assets', () => {
  it('are stored with what the balance sheet needs', async () => {
    const made = await request(app)
      .post(`/api/orgs/${owner.orgId}/fixed-assets`)
      .set(auth(owner))
      .send({
        name: 'Delivery van',
        category: 'Vehicles',
        purchaseDate: '2026-04-01',
        cost: 800000,
        salvageValue: 80000,
        depreciationMethod: 'WDV',
        depreciationRate: 15,
        accumulatedDepreciation: 120000,
      })
      .expect(201);

    const a = made.body.asset;
    expect(a.cost).toBe(800000);
    expect(a.depreciationMethod).toBe('WDV');
    /* Net block is derived, never stored, so it cannot drift from its parts. */
    expect(a.netBlock).toBe(680000);
  });

  it('record a disposal without losing the original cost', async () => {
    const made = await request(app)
      .post(`/api/orgs/${owner.orgId}/fixed-assets`)
      .set(auth(owner))
      .send({ name: 'Old press', purchaseDate: '2020-04-01', cost: 500000 })
      .expect(201);

    const res = await request(app)
      .patch(`/api/orgs/${owner.orgId}/fixed-assets/${made.body.asset.id}`)
      .set(auth(owner))
      .send({ status: 'DISPOSED', disposalDate: '2026-08-01', disposalValue: 60000 })
      .expect(200);

    expect(res.body.asset.status).toBe('DISPOSED');
    expect(res.body.asset.disposalValue).toBe(60000);
    expect(res.body.asset.cost).toBe(500000);
  });

  it('are listed for the company', async () => {
    const list = await request(app).get(`/api/orgs/${owner.orgId}/fixed-assets`).set(auth(owner)).expect(200);
    expect(list.body.assets.length).toBeGreaterThan(0);
    for (const a of list.body.assets) expect(a.netBlock).toBe(a.cost - a.accumulatedDepreciation);
  });
});

describe('tenant isolation holds for the new tables', () => {
  it('does not list another company\'s salesmen or assets', async () => {
    const email = `bom2.${Date.now()}.${rnd()}@example.com`;
    const signup = await request(app)
      .post('/api/auth/signup')
      .send({ email, password: 'Passw0rd!23', name: 'Other' })
      .expect(200);
    const setup = await request(app)
      .post('/api/auth/setup-company')
      .set('Authorization', `Bearer ${signup.body.token}`)
      .send({ companyName: `Other ${Date.now()}-${rnd()}`, state: 'Karnataka' })
      .expect(200);
    const other: Ctx = { token: signup.body.token, orgId: setup.body.company.orgId, branchId: setup.body.branch.id };

    const s = await request(app).get(`/api/orgs/${other.orgId}/salesmen`).set(auth(other)).expect(200);
    const a = await request(app).get(`/api/orgs/${other.orgId}/fixed-assets`).set(auth(other)).expect(200);
    expect(s.body.salesmen).toEqual([]);
    expect(a.body.assets).toEqual([]);
  });
});
