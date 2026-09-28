import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { buildApp } from '../app.js';
import { prisma } from '../utils/prisma.js';

/**
 * Role administration cannot be turned against the organisation.
 *
 * Two families of guard. Nobody hands out more than they hold: a person who
 * may edit roles cannot write the whole catalogue onto their own role, and a
 * person who may edit users cannot hand themselves Administrator. And the
 * organisation always keeps an administrator: the last one cannot be removed,
 * deactivated or demoted, and an Administrator role cannot be stripped of the
 * permissions needed to administer.
 */

const app = buildApp().listen(0);
afterAll(() => new Promise((done) => app.close(done)));

type Ctx = { token: string; orgId: string; branchId: string; userId: string; roleId?: string };
let owner: Ctx;

const auth = (c: Ctx) => ({
  Authorization: `Bearer ${c.token}`,
  'x-org-id': c.orgId,
  'x-branch-id': c.branchId,
});

const uid = () => `${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;

async function makeOwner(): Promise<Ctx> {
  const email = `guard.${uid()}@example.com`;
  const signup = await request(app)
    .post('/api/auth/signup')
    .send({ email, password: 'Passw0rd!23', name: 'Guard owner' })
    .expect(200);
  const setup = await request(app)
    .post('/api/auth/setup-company')
    .set('Authorization', `Bearer ${signup.body.token}`)
    .send({ companyName: `Guard Co ${uid()}`, state: 'Karnataka' })
    .expect(200);
  const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${signup.body.token}`).expect(200);
  return {
    token: signup.body.token,
    orgId: setup.body.company.orgId,
    branchId: setup.body.branch.id,
    userId: String(me.body.user?.id || me.body.id),
  };
}

/** A member holding one CUSTOM role with exactly these permissions. */
async function makeMember(keys: string[], label: string): Promise<Ctx> {
  const role = await request(app)
    .post(`/api/orgs/${owner.orgId}/roles`)
    .set(auth(owner))
    .send({ name: `${label} ${uid()}`, roleType: 'CUSTOM', permissions: keys })
    .expect(201);
  const roleId = role.body.role.id;

  const email = `member.${uid()}@example.com`;
  const user = await request(app)
    .post('/api/users')
    .set(auth(owner))
    .send({
      email,
      fullName: label,
      password: 'Passw0rd!23',
      orgIds: [owner.orgId],
      branchIdsByOrg: { [owner.orgId]: [owner.branchId] },
    })
    .expect(201);

  await request(app)
    .post(`/api/orgs/${owner.orgId}/users/${user.body.user.id}/roles`)
    .set(auth(owner))
    .send({ roleId, branchId: null })
    .expect(201);

  const login = await request(app)
    .post('/api/auth/login')
    .send({ emailOrUsername: email, password: 'Passw0rd!23' })
    .expect(200);

  return { token: login.body.token, orgId: owner.orgId, branchId: owner.branchId, userId: user.body.user.id, roleId };
}

const ROLE_ADMIN_KEYS = [
  'SETTINGS::Roles::VIEW',
  'SETTINGS::Roles::CREATE',
  'SETTINGS::Roles::EDIT',
  'SETTINGS::Roles::DELETE',
  'SETTINGS::Users::VIEW',
  'SETTINGS::Users::EDIT',
  'SETTINGS::Users::DELETE',
];

async function adminRoleId() {
  const roles = await request(app).get(`/api/orgs/${owner.orgId}/roles`).set(auth(owner)).expect(200);
  const admin = roles.body.roles.find((r: any) => r.roleType === 'ADMIN' && r.name === 'Administrator');
  return String(admin.id);
}

beforeAll(async () => {
  owner = await makeOwner();
}, 60_000);

describe('nobody hands out more than they hold', () => {
  let clerk: Ctx;
  beforeAll(async () => {
    clerk = await makeMember(ROLE_ADMIN_KEYS, 'Role clerk');
  });

  it('refuses to write an unheld permission onto a role through the matrix', async () => {
    const res = await request(app)
      .put(`/api/orgs/${owner.orgId}/roles/${clerk.roleId}/permissions`)
      .set(auth(clerk))
      .send({ permissions: [...ROLE_ADMIN_KEYS, 'SALES::Invoices::DELETE'] })
      .expect(403);
    expect(res.body.code).toBe('cannot_grant_unheld');
    expect(res.body.permissions).toEqual(['SALES::Invoices::DELETE']);

    // And nothing changed on the way to being refused.
    const after = await request(app)
      .get(`/api/orgs/${owner.orgId}/roles/${clerk.roleId}/permissions`)
      .set(auth(clerk))
      .expect(200);
    expect(after.body.permissions).not.toContain('SALES::Invoices::DELETE');
  });

  it('refuses it on the role form too, on create and on edit', async () => {
    await request(app)
      .post(`/api/orgs/${owner.orgId}/roles`)
      .set(auth(clerk))
      .send({ name: `Sneaky ${uid()}`, permissions: ['ACCOUNTING::Ledger::VIEW'] })
      .expect(403);

    const ok = await request(app)
      .post(`/api/orgs/${owner.orgId}/roles`)
      .set(auth(clerk))
      .send({ name: `Honest ${uid()}`, permissions: ['SETTINGS::Users::VIEW'] })
      .expect(201);

    await request(app)
      .patch(`/api/orgs/${owner.orgId}/roles/${ok.body.role.id}`)
      .set(auth(clerk))
      .send({ permissions: ['SETTINGS::Users::VIEW', 'ACCOUNTING::Ledger::VIEW'] })
      .expect(403);
  });

  it('lets a role be trimmed by someone who could not have granted it', async () => {
    // The owner grants the clerk's role something the clerk does not hold...
    await request(app)
      .put(`/api/orgs/${owner.orgId}/roles/${clerk.roleId}/permissions`)
      .set(auth(owner))
      .send({ permissions: [...ROLE_ADMIN_KEYS, 'REPORTS::Sales Reports::VIEW'] })
      .expect(200);
    // ...and the clerk may still take it back off, since removing is not granting.
    await request(app)
      .put(`/api/orgs/${owner.orgId}/roles/${clerk.roleId}/permissions`)
      .set(auth(clerk))
      .send({ permissions: ROLE_ADMIN_KEYS })
      .expect(200);
  });

  it('rejects a permission the catalogue does not know, on the role form', async () => {
    const res = await request(app)
      .post(`/api/orgs/${owner.orgId}/roles`)
      .set(auth(owner))
      .send({ name: `Bogus ${uid()}`, permissions: ['SALES::Invoices::VIEW', 'NOPE::Thing::VIEW'] })
      .expect(400);
    expect(res.body.error).toMatch(/Unknown permission/);
  });

  it('keeps ADMIN-type roles for administrators only', async () => {
    const res = await request(app)
      .post(`/api/orgs/${owner.orgId}/roles`)
      .set(auth(clerk))
      .send({ name: `Self admin ${uid()}`, roleType: 'ADMIN', permissions: [] })
      .expect(403);
    expect(res.body.code).toBe('admin_only');

    await request(app)
      .patch(`/api/orgs/${owner.orgId}/roles/${clerk.roleId}`)
      .set(auth(clerk))
      .send({ roleType: 'ADMIN' })
      .expect(403);

    const admin = await adminRoleId();
    await request(app)
      .put(`/api/orgs/${owner.orgId}/roles/${admin}/permissions`)
      .set(auth(clerk))
      .send({ permissions: ROLE_ADMIN_KEYS })
      .expect(403);
    await request(app).delete(`/api/orgs/${owner.orgId}/roles/${admin}`).set(auth(clerk)).expect(403);
  });

  it('does not let a user administrator hand out Administrator, to themselves or anyone', async () => {
    const admin = await adminRoleId();
    const res = await request(app)
      .put(`/api/orgs/${owner.orgId}/users/${clerk.userId}/role`)
      .set(auth(clerk))
      .send({ roleId: admin })
      .expect(403);
    expect(res.body.code).toBe('admin_only');

    await request(app)
      .post(`/api/orgs/${owner.orgId}/users/${clerk.userId}/roles`)
      .set(auth(clerk))
      .send({ roleId: admin, branchId: null })
      .expect(403);
  });

  it('does not let a user administrator assign a role that grants more than they hold', async () => {
    const accountant = (await request(app).get(`/api/orgs/${owner.orgId}/roles`).set(auth(owner)).expect(200)).body.roles.find(
      (r: any) => r.name === 'Accountant'
    );
    const res = await request(app)
      .put(`/api/orgs/${owner.orgId}/users/${clerk.userId}/role`)
      .set(auth(clerk))
      .send({ roleId: accountant.id })
      .expect(403);
    expect(res.body.code).toBe('cannot_grant_unheld');
  });

  it('does not let a profile smuggle an Administrator role past the same rule', async () => {
    const admin = await adminRoleId();
    const profile = await request(app)
      .post(`/api/orgs/${owner.orgId}/role-profiles`)
      .set(auth(owner))
      .send({ name: `Everything ${uid()}`, roleIds: [admin] })
      .expect(201);
    const res = await request(app)
      .post(`/api/orgs/${owner.orgId}/users/${clerk.userId}/role-profiles`)
      .set(auth(clerk))
      .send({ profileIds: [profile.body.profile.id] })
      .expect(403);
    expect(res.body.code).toBe('admin_only');
  });

  it('only assigns roles to people who are already members', async () => {
    const stranger = await makeOwner();
    const viewer = (await request(app).get(`/api/orgs/${owner.orgId}/roles`).set(auth(owner)).expect(200)).body.roles.find(
      (r: any) => r.name === 'Viewer'
    );
    await request(app)
      .put(`/api/orgs/${owner.orgId}/users/${stranger.userId}/role`)
      .set(auth(owner))
      .send({ roleId: viewer.id })
      .expect(404);
    await request(app)
      .post(`/api/orgs/${owner.orgId}/users/${stranger.userId}/roles`)
      .set(auth(owner))
      .send({ roleId: viewer.id, branchId: null })
      .expect(404);
    expect(
      await prisma.userOrgMembership.count({ where: { orgId: owner.orgId, userId: stranger.userId } })
    ).toBe(0);
  });

  it('tells the client whether it is an administrator', async () => {
    const me = await request(app).get(`/api/orgs/${owner.orgId}/permissions/me`).set(auth(owner)).expect(200);
    expect(me.body.isAdmin).toBe(true);
    const them = await request(app).get(`/api/orgs/${owner.orgId}/permissions/me`).set(auth(clerk)).expect(200);
    expect(them.body.isAdmin).toBe(false);
  });
});

describe('the organisation always keeps an administrator', () => {
  it('refuses to clear, remove or deactivate the last administrator', async () => {
    const cleared = await request(app)
      .put(`/api/orgs/${owner.orgId}/users/${owner.userId}/role`)
      .set(auth(owner))
      .send({ roleId: null })
      .expect(409);
    expect(cleared.body.code).toBe('last_admin');

    await request(app).delete(`/api/orgs/${owner.orgId}/users/${owner.userId}`).set(auth(owner)).expect(409);

    await request(app)
      .patch(`/api/orgs/${owner.orgId}/users/${owner.userId}`)
      .set(auth(owner))
      .send({ isActive: false })
      .expect(409);

    // Still an administrator, still signed in.
    await request(app).get(`/api/orgs/${owner.orgId}/roles`).set(auth(owner)).expect(200);
  });

  it('allows it once somebody else is an administrator', async () => {
    const admin = await adminRoleId();
    const second = await makeMember(['SETTINGS::Users::VIEW'], 'Second admin');
    await request(app)
      .put(`/api/orgs/${owner.orgId}/users/${second.userId}/role`)
      .set(auth(owner))
      .send({ roleId: admin })
      .expect(200);

    // Now the second admin can demote the owner (and reinstate them).
    const viewer = (await request(app).get(`/api/orgs/${owner.orgId}/roles`).set(auth(second)).expect(200)).body.roles.find(
      (r: any) => r.name === 'Viewer'
    );
    await request(app)
      .put(`/api/orgs/${owner.orgId}/users/${owner.userId}/role`)
      .set(auth(second))
      .send({ roleId: viewer.id })
      .expect(200);
    // ...but not themselves, now that they are the only one left.
    await request(app)
      .put(`/api/orgs/${owner.orgId}/users/${second.userId}/role`)
      .set(auth(second))
      .send({ roleId: viewer.id })
      .expect(409);
    await request(app)
      .put(`/api/orgs/${owner.orgId}/users/${owner.userId}/role`)
      .set(auth(second))
      .send({ roleId: admin })
      .expect(200);
  });

  it('keeps the Administrator role able to administer', async () => {
    const admin = await adminRoleId();
    const res = await request(app)
      .put(`/api/orgs/${owner.orgId}/roles/${admin}/permissions`)
      .set(auth(owner))
      .send({ permissions: ['SALES::Invoices::VIEW'] })
      .expect(400);
    expect(res.body.code).toBe('admin_lockout');
    expect(res.body.permissions).toContain('SETTINGS::Roles::EDIT');

    await request(app)
      .patch(`/api/orgs/${owner.orgId}/roles/${admin}`)
      .set(auth(owner))
      .send({ permissions: ['SALES::Invoices::VIEW'] })
      .expect(400);
  });

  it('will not demote the only Administrator role to a custom one', async () => {
    const admin = await adminRoleId();
    const res = await request(app)
      .patch(`/api/orgs/${owner.orgId}/roles/${admin}`)
      .set(auth(owner))
      .send({ roleType: 'CUSTOM' })
      .expect(409);
    expect(res.body.code).toBe('last_admin');
  });
});

describe('deleting a role', () => {
  it('deletes an unused role and cleans up its profile links', async () => {
    const role = await request(app)
      .post(`/api/orgs/${owner.orgId}/roles`)
      .set(auth(owner))
      .send({ name: `Disposable ${uid()}`, permissions: ['SALES::Invoices::VIEW'] })
      .expect(201);
    const profile = await request(app)
      .post(`/api/orgs/${owner.orgId}/role-profiles`)
      .set(auth(owner))
      .send({ name: `Holds disposable ${uid()}`, roleIds: [role.body.role.id] })
      .expect(201);

    await request(app).delete(`/api/orgs/${owner.orgId}/roles/${role.body.role.id}`).set(auth(owner)).expect(200);

    expect(await prisma.role.count({ where: { id: role.body.role.id } })).toBe(0);
    expect(await prisma.roleProfileRole.count({ where: { profileId: profile.body.profile.id } })).toBe(0);
    await request(app).delete(`/api/orgs/${owner.orgId}/roles/${role.body.role.id}`).set(auth(owner)).expect(404);
  });

  it('does not re-seed a standard role that was deleted on purpose', async () => {
    const before = await request(app).get(`/api/orgs/${owner.orgId}/roles`).set(auth(owner)).expect(200);
    const reports = before.body.roles.find((r: any) => r.name === 'Reports Only');
    await request(app).delete(`/api/orgs/${owner.orgId}/roles/${reports.id}`).set(auth(owner)).expect(200);
    const after = await request(app).get(`/api/orgs/${owner.orgId}/roles`).set(auth(owner)).expect(200);
    expect(after.body.roles.map((r: any) => r.name)).not.toContain('Reports Only');
  });

  it('refuses while somebody still holds it', async () => {
    const member = await makeMember(['SALES::Invoices::VIEW'], 'Holder');
    const res = await request(app).delete(`/api/orgs/${owner.orgId}/roles/${member.roleId}`).set(auth(owner)).expect(409);
    expect(res.body.code).toBe('role_in_use');
    expect(res.body.assignedUsersCount).toBe(1);
  });

  it('refuses while an approval rule names it as the approver', async () => {
    const role = await request(app)
      .post(`/api/orgs/${owner.orgId}/roles`)
      .set(auth(owner))
      .send({ name: `Approver ${uid()}`, permissions: ['SALES::Credit Notes::APPROVE'] })
      .expect(201);
    const rule = await request(app)
      .post(`/api/orgs/${owner.orgId}/approval-rules`)
      .set(auth(owner))
      .send({ docType: 'INVOICE', name: `Big ones ${uid()}`, minAmount: 100000, approverRoleId: role.body.role.id });
    expect(`${rule.status} ${JSON.stringify(rule.body)}`).toMatch(/^201/);
    const res = await request(app).delete(`/api/orgs/${owner.orgId}/roles/${role.body.role.id}`).set(auth(owner)).expect(409);
    expect(res.body.approvalRulesCount).toBe(1);
  });
});

describe('editing a role on the Roles screen', () => {
  it('keeps the field levels the matrix set on permissions the role retains', async () => {
    const role = await request(app)
      .post(`/api/orgs/${owner.orgId}/roles`)
      .set(auth(owner))
      .send({ name: `Levelled ${uid()}`, permissions: ['SALES::Invoices::CREATE', 'SALES::Invoices::VIEW'] })
      .expect(201);
    const id = role.body.role.id;

    await request(app)
      .put(`/api/orgs/${owner.orgId}/roles/${id}/permissions`)
      .set(auth(owner))
      .send({ permissions: ['SALES::Invoices::CREATE', 'SALES::Invoices::VIEW'], levels: { 'SALES::Invoices::CREATE': 1 } })
      .expect(200);

    // The Roles form resends the whole set, minus one.
    await request(app)
      .patch(`/api/orgs/${owner.orgId}/roles/${id}`)
      .set(auth(owner))
      .send({ permissions: ['SALES::Invoices::CREATE'] })
      .expect(200);

    const after = await request(app).get(`/api/orgs/${owner.orgId}/roles/${id}/permissions`).set(auth(owner)).expect(200);
    expect(after.body.permissions).toEqual(['SALES::Invoices::CREATE']);
    expect(after.body.levels['SALES::Invoices::CREATE']).toBe(1);
  });
});
