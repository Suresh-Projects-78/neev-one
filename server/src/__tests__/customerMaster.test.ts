import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { buildApp } from '../app.js';
import { prisma } from '../utils/prisma.js';

/**
 * The customer master, as the spec asks for it.
 *
 * Three of the requested things could not be held by the old shape at all:
 * more than two addresses, more than one contact, and a party group. A single
 * `contactPerson` string cannot hold both the accounts clerk and the person who
 * signs off the order, and those are rarely the same person.
 *
 * Billing and shipping stay as columns — every invoice and the document sync
 * read them, and moving them would have been a migration with no visible gain.
 * Everything past those two lives in `PartyAddress`, and the API returns all of
 * them as one list so the form never sees the split.
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
  const email = `cm.${Date.now()}.${rnd()}@example.com`;
  const signup = await request(app)
    .post('/api/auth/signup')
    .send({ email, password: 'Passw0rd!23', name: 'CM owner' })
    .expect(200);
  const setup = await request(app)
    .post('/api/auth/setup-company')
    .set('Authorization', `Bearer ${signup.body.token}`)
    .send({ companyName: `CM Co ${Date.now()}-${rnd()}`, state: 'Karnataka' })
    .expect(200);
  owner = { token: signup.body.token, orgId: setup.body.company.orgId, branchId: setup.body.branch.id };
}, 60_000);

const create = (body: Record<string, unknown>) =>
  request(app).post(`/api/orgs/${owner.orgId}/customers`).set(auth(owner)).send(body);

describe('addresses', () => {
  it('keeps billing and shipping, and takes any number of named places beyond them', async () => {
    const res = await create({
      name: `Acme ${rnd()}`,
      billingLine1: '12 MG Road',
      billingCity: 'Bengaluru',
      billingDistrict: 'Bengaluru Urban',
      billingState: 'Karnataka',
      extraAddresses: [
        { label: 'Shipping 2', line1: '9 Industrial Estate', city: 'Hosur', district: 'Krishnagiri', state: 'Tamil Nadu' },
        { label: 'Site office', line1: 'Plot 4', city: 'Mysuru', state: 'Karnataka' },
      ],
    }).expect(201);

    const addresses = res.body.party.addresses;
    // One list: the two built-in places first, then the named ones.
    expect(addresses.map((a: any) => a.label)).toEqual(['Billing', 'Shipping', 'Shipping 2', 'Site office']);
    expect(addresses[0].district).toBe('Bengaluru Urban');
    expect(addresses[2].district).toBe('Krishnagiri');
    expect(addresses[0].builtIn).toBe(true);
    expect(addresses[2].builtIn).toBe(false);
  });

  /* The form edits the whole list and saves once. */
  it('replaces the list on edit rather than accumulating it', async () => {
    const made = await create({ name: `Repl ${rnd()}`, extraAddresses: [{ label: 'A' }, { label: 'B' }] }).expect(201);
    const id = made.body.party.id;

    const res = await request(app)
      .patch(`/api/orgs/${owner.orgId}/customers/${id}`)
      .set(auth(owner))
      .send({ extraAddresses: [{ label: 'C' }] })
      .expect(200);

    expect(res.body.party.addresses.map((a: any) => a.label)).toEqual(['Billing', 'Shipping', 'C']);
    expect(await prisma.partyAddress.count({ where: { partyId: id } })).toBe(1);
  });
});

describe('contacts', () => {
  it('holds several people, each with a position', async () => {
    const res = await create({
      name: `Contacts ${rnd()}`,
      contacts: [
        { name: 'Priya Nair', position: 'Accounts', email: 'priya@acme.example', mobile: '9876543210' },
        { name: 'Ravi Kumar', position: 'Purchase', mobile: '9876500000' },
      ],
    }).expect(201);

    expect(res.body.party.contacts).toHaveLength(2);
    expect(res.body.party.contacts[0].position).toBe('Accounts');
    // The first is the primary unless one is named, so a document always has someone to address.
    expect(res.body.party.contacts[0].isPrimary).toBe(true);
    expect(res.body.party.contacts[1].isPrimary).toBe(false);
  });
});

describe('the rest of the master', () => {
  it('stores group, currency, MSME and the other statutory field', async () => {
    const res = await create({
      name: `Fields ${rnd()}`,
      partyGroup: 'Sundry Debtors — North',
      currency: 'usd',
      msmeNumber: 'UDYAM-KR-03-0001234',
      statutoryOther: 'IEC 0512345678',
    }).expect(201);

    const p = res.body.party;
    expect(p.partyGroup).toBe('Sundry Debtors — North');
    expect(p.currency).toBe('USD'); // stored uppercase, whatever was typed
    expect(p.msmeNumber).toBe('UDYAM-KR-03-0001234');
    expect(p.statutoryOther).toBe('IEC 0512345678');
  });

  /*
   * A code the user did not supply. Deliberately NOT from NumberSeries: a party
   * code identifies a record, and it must never consume from the counter a GST
   * return is reconciled against.
   */
  it('generates a customer code when none is given, and keeps one that is', async () => {
    const a = await create({ name: `Auto ${rnd()}` }).expect(201);
    expect(a.body.party.code).toMatch(/^CUS-\d{4}$/);

    const b = await create({ name: `Auto ${rnd()}` }).expect(201);
    expect(b.body.party.code).not.toBe(a.body.party.code);

    const c = await create({ name: `Manual ${rnd()}`, code: 'LEGACY-77' }).expect(201);
    expect(c.body.party.code).toBe('LEGACY-77');
  });
});

describe('the customer code is a feature, in a format the business sets', () => {
  /*
   * Some books identify a customer by a code and some only ever by name. A code
   * nobody uses is still a column somebody has to explain, so it is a switch —
   * and where it is on, the shape of it belongs to the business rather than to
   * whoever wrote the default.
   */
  const setPartyCodes = (orgId: string, cfg: Record<string, unknown> | null) =>
    prisma.org.update({
      where: { id: orgId },
      data: { profileJson: cfg ? JSON.stringify({ partyCodes: cfg }) : null },
    });

  const setFeature = (accountId: string, orgId: string, enabled: boolean) =>
    prisma.featureSetting.upsert({
      where: { orgId_key: { orgId, key: 'partyCodes' } },
      update: { enabled },
      create: { accountId, orgId, key: 'partyCodes', enabled, updatedByUserId: 'test' },
    });

  it('allots nothing when the feature is off', async () => {
    const org = await prisma.org.findUnique({ where: { id: owner.orgId }, select: { accountId: true } });
    await setFeature(org!.accountId, owner.orgId, false);

    const res = await create({ name: `NoCode ${rnd()}` }).expect(201);
    expect(res.body.party.code).toBeNull();

    await setFeature(org!.accountId, owner.orgId, true);
  });

  it('follows the prefix and padding the business set', async () => {
    await setPartyCodes(owner.orgId, { customerPrefix: 'ACME/C/', padding: 6 });
    const res = await create({ name: `Custom ${rnd()}` }).expect(201);
    expect(res.body.party.code).toMatch(/^ACME\/C\/\d{6}$/);
    await setPartyCodes(owner.orgId, null);
  });

  it('still keeps a code that was typed, whatever the format says', async () => {
    await setPartyCodes(owner.orgId, { customerPrefix: 'ACME/C/', padding: 6 });
    const res = await create({ name: `Typed ${rnd()}`, code: 'LEGACY-9' }).expect(201);
    expect(res.body.party.code).toBe('LEGACY-9');
    await setPartyCodes(owner.orgId, null);
  });
});
