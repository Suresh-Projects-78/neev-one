import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { buildApp } from '../app.js';
import { prisma } from '../utils/prisma.js';

/**
 * The state a business registers in, captured at signup.
 *
 * It used to be hard-coded: every organisation created through the product was
 * born in Karnataka, whatever the owner typed, because the field was never
 * asked for. That is not a cosmetic default. The head office state decides
 * whether a sale inside the state splits into CGST + SGST or leaves as IGST,
 * so a business in Maharashtra billing a customer in Maharashtra was charging
 * the wrong tax on its first invoice and every one after it, with nothing on
 * screen to say why.
 */

const app = buildApp().listen(0);
afterAll(() => new Promise((done) => app.close(done)));

const rnd = () => Math.random().toString(36).slice(2, 8);

async function newOwner() {
  const email = `st.${Date.now()}.${rnd()}@example.com`;
  const signup = await request(app)
    .post('/api/auth/signup')
    .send({ email, password: 'Passw0rd!23', name: 'State owner' })
    .expect(200);
  return signup.body.token as string;
}

const setup = (token: string, body: Record<string, unknown>) =>
  request(app)
    .post('/api/auth/setup-company')
    .set('Authorization', `Bearer ${token}`)
    .send(body);

describe('setup-company captures where the business is', () => {
  it('stores the state that was chosen, not a default', async () => {
    const token = await newOwner();
    const res = await setup(token, { companyName: `Maha Co ${Date.now()}-${rnd()}`, state: 'Maharashtra' }).expect(200);

    const branch = await prisma.branch.findUnique({
      where: { id: res.body.branch.id },
      select: { state: true, gstin: true, gstRegistrationType: true },
    });
    expect(branch?.state).toBe('Maharashtra');
    expect(branch?.state).not.toBe('Karnataka');
    // No GSTIN given, so the business is not claiming registration.
    expect(branch?.gstin).toBeNull();
    expect(branch?.gstRegistrationType).toBe('UNREGISTERED');
  });

  it('refuses a state it does not recognise rather than guessing one', async () => {
    const token = await newOwner();
    await setup(token, { companyName: `Nowhere ${Date.now()}-${rnd()}`, state: 'Atlantis' }).expect(400);
  });

  it('requires a state at all', async () => {
    const token = await newOwner();
    await setup(token, { companyName: `Stateless ${Date.now()}-${rnd()}` }).expect(400);
  });

  /*
   * A GSTIN carries its own state in the first two digits. If it disagrees
   * with the state chosen, one of the two is wrong and the tenant should not
   * be created with either.
   */
  it('rejects a GSTIN whose state contradicts the one chosen', async () => {
    const token = await newOwner();
    const res = await setup(token, {
      companyName: `Mismatch ${Date.now()}-${rnd()}`,
      state: 'Maharashtra', // 27
      gstin: '29AABCU9603R1ZJ', // 29 — Karnataka
    });
    expect(res.status).toBe(400);
    expect(String(res.body.error)).toMatch(/does not match|state/i);
  });

  it('marks a business registered once it supplies a valid GSTIN', async () => {
    const token = await newOwner();
    const res = await setup(token, {
      companyName: `Reg Co ${Date.now()}-${rnd()}`,
      state: 'Karnataka',
      gstin: '29AABCU9603R1ZJ',
    }).expect(200);

    const branch = await prisma.branch.findUnique({
      where: { id: res.body.branch.id },
      select: { state: true, gstin: true, gstRegistrationType: true },
    });
    expect(branch?.state).toBe('Karnataka');
    expect(branch?.gstin).toBe('29AABCU9603R1ZJ');
    expect(branch?.gstRegistrationType).toBe('REGULAR');
  });
});
