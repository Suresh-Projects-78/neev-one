import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { buildApp } from '../app.js';
import { prisma } from '../utils/prisma.js';

const app = buildApp();
const rnd = () => Math.random().toString(36).slice(2, 8);

/** Rate limiting is disabled for most tests so the limiter does not mask the
 *  behaviour under test; one test turns it back on deliberately. */
beforeAll(() => {
  process.env.DISABLE_RATE_LIMIT = 'true';
});

async function makeUser() {
  const email = `auth.${Date.now()}.${rnd()}@example.com`;
  const password = 'Passw0rd!23';
  const signup = await request(app)
    .post('/api/auth/signup')
    .send({ email, password, name: 'Auth user' })
    .expect(200);
  return { email, password, token: signup.body.token as string, refreshToken: signup.body.refreshToken as string, id: signup.body.user.id as string };
}

describe('sessions', () => {
  it('issues an access token and a refresh token on signup and login', async () => {
    const u = await makeUser();
    expect(u.token).toBeTruthy();
    expect(u.refreshToken).toBeTruthy();

    const login = await request(app)
      .post('/api/auth/login')
      .send({ emailOrUsername: u.email, password: u.password })
      .expect(200);

    expect(login.body.refreshToken).toBeTruthy();
    expect(login.body.refreshToken).not.toBe(u.refreshToken);
  });

  it('rotates the refresh token and retires the old one', async () => {
    const u = await makeUser();

    const first = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: u.refreshToken })
      .expect(200);

    expect(first.body.refreshToken).not.toBe(u.refreshToken);
    expect(first.body.token).toBeTruthy();

    // The rotated token still works.
    await request(app).post('/api/auth/refresh').send({ refreshToken: first.body.refreshToken }).expect(200);
  });

  it('revokes every session when a retired refresh token is replayed', async () => {
    const u = await makeUser();

    const rotated = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: u.refreshToken })
      .expect(200);

    // Replaying the original, already-rotated token is the theft signal.
    const replay = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: u.refreshToken })
      .expect(401);
    expect(String(replay.body.error)).toMatch(/no longer valid/i);

    // And the legitimate holder is signed out too, deliberately.
    await request(app).post('/api/auth/refresh').send({ refreshToken: rotated.body.refreshToken }).expect(401);
  });

  it('logs out server-side so the refresh token stops working', async () => {
    const u = await makeUser();

    await request(app).post('/api/auth/logout').send({ refreshToken: u.refreshToken }).expect(200);
    await request(app).post('/api/auth/refresh').send({ refreshToken: u.refreshToken }).expect(401);
  });

  it('lists active sessions and can end them all', async () => {
    const u = await makeUser();
    await request(app).post('/api/auth/login').send({ emailOrUsername: u.email, password: u.password }).expect(200);

    const list = await request(app).get('/api/auth/sessions').set('Authorization', `Bearer ${u.token}`).expect(200);
    expect(list.body.sessions.length).toBeGreaterThanOrEqual(2);

    await request(app)
      .post('/api/auth/sessions/revoke-all')
      .set('Authorization', `Bearer ${u.token}`)
      .expect(200);

    const after = await request(app).get('/api/auth/sessions').set('Authorization', `Bearer ${u.token}`).expect(200);
    expect(after.body.sessions).toHaveLength(0);
  });
});

describe('lockout', () => {
  it('locks the account after repeated wrong passwords and says so', async () => {
    const u = await makeUser();

    let lockedResponse: any = null;
    for (let i = 0; i < 10; i += 1) {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ emailOrUsername: u.email, password: 'wrong-password' });
      if (res.status === 429) {
        lockedResponse = res;
        break;
      }
      expect(res.status).toBe(401);
      // The failure message must not reveal whether the account exists.
      expect(String(res.body.error)).toBe('Invalid credentials');
    }

    expect(lockedResponse).toBeTruthy();
    expect(String(lockedResponse.body.error)).toMatch(/too many failed attempts/i);

    // Even the correct password is refused while locked.
    await request(app)
      .post('/api/auth/login')
      .send({ emailOrUsername: u.email, password: u.password })
      .expect(429);
  });

  it('clears the counter after a successful sign-in', async () => {
    const u = await makeUser();
    await request(app).post('/api/auth/login').send({ emailOrUsername: u.email, password: 'nope' }).expect(401);
    await request(app).post('/api/auth/login').send({ emailOrUsername: u.email, password: u.password }).expect(200);

    const row = await prisma.user.findUnique({ where: { id: u.id }, select: { failedLoginCount: true, lastLoginAt: true } });
    expect(row?.failedLoginCount).toBe(0);
    expect(row?.lastLoginAt).toBeTruthy();
  });
});

describe('password reset', () => {
  it('issues a single-use token that is stored only as a hash', async () => {
    const u = await makeUser();

    const forgot = await request(app).post('/api/auth/forgot-password').send({ email: u.email }).expect(200);
    const token = forgot.body.devToken;
    expect(token).toBeTruthy();

    // The raw token must not be recoverable from the database.
    const stored = await prisma.passwordResetToken.findFirst({ where: { userId: u.id, usedAt: null } });
    expect(stored?.tokenHash).toBeTruthy();
    expect(stored?.tokenHash).not.toBe(token);

    await request(app).post('/api/auth/reset-password').send({ token, password: 'BrandNew!234' }).expect(200);

    // Single use.
    const second = await request(app)
      .post('/api/auth/reset-password')
      .send({ token, password: 'Another!234' })
      .expect(400);
    expect(String(second.body.error)).toMatch(/already been used/i);

    // The new password works, the old one does not.
    await request(app).post('/api/auth/login').send({ emailOrUsername: u.email, password: 'BrandNew!234' }).expect(200);
    await request(app).post('/api/auth/login').send({ emailOrUsername: u.email, password: u.password }).expect(401);
  });

  it('ends every session when the password is reset', async () => {
    const u = await makeUser();
    const forgot = await request(app).post('/api/auth/forgot-password').send({ email: u.email }).expect(200);

    await request(app)
      .post('/api/auth/reset-password')
      .send({ token: forgot.body.devToken, password: 'Rotated!2345' })
      .expect(200);

    // The session held before the reset is dead.
    await request(app).post('/api/auth/refresh').send({ refreshToken: u.refreshToken }).expect(401);
  });

  it('invalidates an earlier reset link when a new one is requested', async () => {
    const u = await makeUser();
    const first = await request(app).post('/api/auth/forgot-password').send({ email: u.email }).expect(200);
    const second = await request(app).post('/api/auth/forgot-password').send({ email: u.email }).expect(200);

    await request(app)
      .post('/api/auth/reset-password')
      .send({ token: first.body.devToken, password: 'Whatever!234' })
      .expect(400);

    await request(app)
      .post('/api/auth/reset-password')
      .send({ token: second.body.devToken, password: 'Whatever!234' })
      .expect(200);
  });

  it('answers the same way for an unknown address', async () => {
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: `ghost.${rnd()}@example.com` })
      .expect(200);
    expect(String(res.body.message)).toMatch(/if an account exists/i);
    expect(res.body.devToken).toBeUndefined();
  });
});

describe('rate limiting', () => {
  it('blocks a burst of sign-in attempts', async () => {
    process.env.DISABLE_RATE_LIMIT = 'false';
    const email = `burst.${Date.now()}.${rnd()}@example.com`;

    let limited = false;
    for (let i = 0; i < 15; i += 1) {
      const res = await request(app).post('/api/auth/login').send({ emailOrUsername: email, password: 'x' });
      if (res.status === 429 && /too many sign-in/i.test(String(res.body.error))) {
        limited = true;
        break;
      }
    }
    process.env.DISABLE_RATE_LIMIT = 'true';
    expect(limited).toBe(true);
  });

  /**
   * Regression: the key generator used to pass the response object where
   * ipKeyGenerator expects an IPv6 subnet mask, so every rate-limited route
   * answered "Invalid subnet mask." instead of doing its job.
   *
   * The burst test above never caught it because supertest connects over IPv4
   * and the subnet mask is only consulted for IPv6 — while a browser reaching
   * `localhost` on macOS arrives as ::1 and took the broken path. Sign-up,
   * sign-in and password reset were all unusable on a real deployment.
   */
  it('accepts an IPv6 client on a rate-limited route', async () => {
    process.env.DISABLE_RATE_LIMIT = 'false';
    const email = `v6.${Date.now()}.${rnd()}@example.com`;

    const res = await request(app)
      .post('/api/auth/signup')
      .set('X-Forwarded-For', '2001:db8::1')
      .send({ email, password: 'Passw0rd!23', name: 'IPv6 user' });

    process.env.DISABLE_RATE_LIMIT = 'true';

    expect(String(res.body.error || '')).not.toMatch(/subnet/i);
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
  });
});

describe('auth audit', () => {
  it('records successes, failures and logouts', async () => {
    const u = await makeUser();
    await request(app).post('/api/auth/login').send({ emailOrUsername: u.email, password: 'wrong' }).expect(401);
    await request(app).post('/api/auth/login').send({ emailOrUsername: u.email, password: u.password }).expect(200);
    await request(app).post('/api/auth/logout').send({ refreshToken: u.refreshToken }).expect(200);

    const events = await prisma.authEvent.findMany({ where: { userId: u.id }, select: { eventType: true } });
    const types = events.map((e) => e.eventType);
    expect(types).toContain('LOGIN_FAILED');
    expect(types).toContain('LOGIN_SUCCESS');
    expect(types).toContain('LOGOUT');
  });
});
