import { apiFetch } from './http';

/**
 * The platform's own API: who you are, and which companies you belong to.
 *
 * Separate from every app's client because it is the one set of calls no app
 * may make. An application asks the platform for the company it is running
 * for; it never signs anybody in, and it never changes which companies exist.
 *
 * `skipAuth` on sign-in and sign-up is not a convenience: a stale token in the
 * browser must not travel with a request whose whole purpose is to establish
 * which session this is.
 */

export const login = ({ email, password }) =>
  apiFetch('/auth/login', { method: 'POST', body: { email, password }, skipAuth: true });

/* The server calls it `name`; sending `fullName` was a silent 400. */
export const signup = ({ email, password, fullName, mobile }) =>
  apiFetch('/auth/signup', {
    method: 'POST',
    body: { email, password, name: fullName, ...(mobile ? { mobile } : {}) },
    skipAuth: true,
  });

/** The first company of a new account: name, state, and a chart of accounts. */
export const setupCompany = (payload) =>
  apiFetch('/auth/setup-company', { method: 'POST', body: payload, skipBranchHeader: true, skipWarehouseHeader: true });

export const me = () => apiFetch('/auth/me', { skipBranchHeader: true, skipWarehouseHeader: true });

export const logout = () => apiFetch('/auth/logout', { method: 'POST', skipAuth: true });

/**
 * Which apps a company has.
 *
 * There is no subscriptions table yet, and inventing one here would be a
 * second source of truth for something the server already decides. A company
 * has Accounting because it has a ledger; it has Payroll when the payroll
 * feature is switched on for it. Adding an app switches the feature on, which
 * is exactly what the More apps screen means by "add".
 */
/*
 * The branch is passed in, not read from the context.
 *
 * The shell asks this the moment it learns which companies exist, which is one
 * render before the context it publishes has reached the transport — so the
 * first call went out with no `x-branch-id` and came back 400. It was caught,
 * the company fell back to "accounting only", and a company that had bought
 * Payroll did not see it until the page was reloaded.
 */
const tenantHeaders = (orgId, branchId) => ({
  'x-org-id': orgId,
  ...(branchId ? { 'x-branch-id': branchId } : {}),
});

export const featuresFor = (orgId, branchId) =>
  apiFetch(`/orgs/${encodeURIComponent(orgId)}/features`, {
    headers: tenantHeaders(orgId, branchId),
    skipWarehouseHeader: true,
  });

export const setFeature = (orgId, branchId, key, enabled) =>
  apiFetch(`/orgs/${encodeURIComponent(orgId)}/features`, {
    method: 'PUT',
    body: { features: { [key]: enabled } },
    headers: tenantHeaders(orgId, branchId),
    skipWarehouseHeader: true,
  });

export const APP_FEATURE = { payroll: 'payroll' };

export const appsFromFeatures = (features) => {
  const on = features && typeof features === 'object' ? features : {};
  /* Accounting is not a feature flag: a company that keeps books has it, and
     every company on the platform keeps books today. */
  const apps = ['accounting'];
  if (on.payroll) apps.push('payroll');
  return apps;
};
