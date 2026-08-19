import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { buildApp } from '../app.js';
import { prisma } from '../utils/prisma.js';
import { registerOnIrp, getEInvoiceConfig } from '../services/einvoice.js';

/**
 * e-Invoice (IRP) integration: settings round-trip (secrets never echoed),
 * gateway registration via injected fetch, and the invoice endpoint storing
 * the IRN on the row.
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

async function makeOwner(): Promise<Ctx> {
  const email = `einv.${Date.now()}.${rnd()}@example.com`;
  const signup = await request(app)
    .post('/api/auth/signup')
    .send({ email, password: 'Passw0rd!23', name: 'EInvoice owner' })
    .expect(200);
  const setup = await request(app)
    .post('/api/auth/setup-company')
    .set('Authorization', `Bearer ${signup.body.token}`)
    .send({ companyName: `EInv Co ${Date.now()}-${rnd()}` })
    .expect(200);
  return { token: signup.body.token, orgId: setup.body.company.orgId, branchId: setup.body.branch.id };
}

const setFeature = async (key: string, enabled: boolean) => {
  const current = await request(app).get(`/api/orgs/${owner.orgId}/features`).set(auth(owner)).expect(200);
  const features = { ...(current.body.features || {}), [key]: enabled };
  await request(app).put(`/api/orgs/${owner.orgId}/features`).set(auth(owner)).send({ features }).expect(200);
};

beforeAll(async () => {
  owner = await makeOwner();
}, 60_000);

describe('e-invoice settings', () => {
  it('stores the gateway config and never echoes secrets', async () => {
    const put = await request(app)
      .put(`/api/orgs/${owner.orgId}/einvoice/settings`)
      .set(auth(owner))
      .send({
        mode: 'SANDBOX',
        baseUrl: 'https://gsp.example.test/einvoice',
        gstin: '29ABCDE1234F1Z5',
        username: 'apiuser',
        password: 'topsecret',
        clientId: 'client-1',
        clientSecret: 'supersecret',
        autoRegister: true,
      })
      .expect(200);

    expect(put.body.settings.baseUrl).toBe('https://gsp.example.test/einvoice');
    expect(put.body.settings.hasPassword).toBe(true);
    expect(put.body.settings.hasClientSecret).toBe(true);
    expect(JSON.stringify(put.body)).not.toContain('topsecret');
    expect(JSON.stringify(put.body)).not.toContain('supersecret');

    const get = await request(app).get(`/api/orgs/${owner.orgId}/einvoice/settings`).set(auth(owner)).expect(200);
    expect(get.body.settings.username).toBe('apiuser');
    expect(JSON.stringify(get.body)).not.toContain('topsecret');

    // Decryption round-trips for the caller that actually needs the secret.
    const cfg = await getEInvoiceConfig(owner.orgId);
    expect(cfg?.password).toBe('topsecret');
    expect(cfg?.clientSecret).toBe('supersecret');
  });

  it('rejects extra headers that are not a JSON object', async () => {
    await request(app)
      .put(`/api/orgs/${owner.orgId}/einvoice/settings`)
      .set(auth(owner))
      .send({ headersJson: 'not json' })
      .expect(400);
  });
});

describe('IRP registration', () => {
  it('parses a wrapped gateway success into IRN fields', async () => {
    const doFetch = async () => ({
      status: 200,
      json: async () => ({
        data: {
          Irn: 'a1b2c3irn',
          AckNo: '112010036563',
          AckDt: '2026-08-19 12:00:00',
          SignedQRCode: 'signed.qr.jwt',
        },
      }),
      text: async () => '',
    });
    const result = await registerOnIrp(owner.orgId, { Version: '1.1' }, doFetch as any);
    expect(result.ok).toBe(true);
    expect(result.irn).toBe('a1b2c3irn');
    expect(result.ackNo).toBe('112010036563');
    expect(result.signedQr).toBe('signed.qr.jwt');
  });

  it('surfaces NIC-style error details as a readable message', async () => {
    const doFetch = async () => ({
      status: 200,
      json: async () => ({ ErrorDetails: [{ ErrorCode: '2150', ErrorMessage: 'Duplicate IRN' }] }),
      text: async () => '',
    });
    const result = await registerOnIrp(owner.orgId, {}, doFetch as any);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Duplicate IRN');
  });

  it('registers an invoice and stores the IRN on the row', async () => {
    await setFeature('einvoice', true);

    const created = await request(app)
      .post(`/api/orgs/${owner.orgId}/invoices`)
      .set(auth(owner))
      .send({
        date: '2026-08-01',
        customerName: 'Buyer Co',
        subtotal: 1000,
        cgstTotal: 90,
        sgstTotal: 90,
        gstTotal: 180,
        total: 1180,
        status: 'Unpaid',
        items: [{ description: 'Widget', quantity: 1, rate: 1000, gstRate: 18 }],
      })
      .expect(201);
    const invoiceId = created.body.invoice.id;

    // The route uses global fetch; point the gateway at a stubbed one.
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async () => ({
      status: 200,
      json: async () => ({ Irn: 'irn-for-row', AckNo: '9', AckDt: '2026-08-19', SignedQRCode: 'qr' }),
      text: async () => '',
    })) as any;
    try {
      const reg = await request(app)
        .post(`/api/orgs/${owner.orgId}/invoices/${invoiceId}/einvoice`)
        .set(auth(owner))
        .send({ payload: { Version: '1.1', DocDtls: { No: created.body.invoice.number } } })
        .expect(200);
      expect(reg.body.irn).toBe('irn-for-row');
    } finally {
      globalThis.fetch = origFetch;
    }

    const row = await prisma.invoice.findUnique({ where: { id: invoiceId } });
    expect(row?.irn).toBe('irn-for-row');
    expect(row?.irnStatus).toBe('REGISTERED');

    // Second registration refuses: the IRN is immutable.
    const again = await request(app)
      .post(`/api/orgs/${owner.orgId}/invoices/${invoiceId}/einvoice`)
      .set(auth(owner))
      .send({ payload: {} })
      .expect(409);
    expect(String(again.body.error)).toContain('irn-for-row');
  });

  it('refuses when the feature flag is off', async () => {
    await setFeature('einvoice', false);
    await request(app)
      .post(`/api/orgs/${owner.orgId}/invoices/nonexistent/einvoice`)
      .set(auth(owner))
      .send({ payload: {} })
      .expect(400);
  });
});
