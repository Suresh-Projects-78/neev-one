// In dev, Vite proxies `/api` to the backend (see vite.config.js).
// Use a relative default to avoid CORS/mixed-content issues that often show up as "Failed to fetch".
// Exported so callers that must bypass apiFetch — a file download, where the
// response is CSV rather than JSON — still hit the same origin.
export const API_BASE = import.meta.env?.VITE_API_BASE || '/api';

function getToken() {
  return String(localStorage.getItem('token') || '').trim();
}

function getRefreshToken() {
  return String(localStorage.getItem('refreshToken') || '').trim();
}

/**
 * Exchanges the refresh token for a new pair.
 *
 * Concurrent 401s must not each start their own refresh: the first rotation
 * would invalidate the token the others are holding, which the server treats as
 * theft and responds to by ending every session. One in-flight promise is
 * shared by all callers.
 */
let refreshInFlight = null;

async function refreshSession() {
  if (refreshInFlight) return refreshInFlight;

  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  refreshInFlight = (async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (!data?.token) return null;
      localStorage.setItem('token', data.token);
      if (data.refreshToken) localStorage.setItem('refreshToken', data.refreshToken);
      return data.token;
    } catch {
      return null;
    } finally {
      // Cleared on the next tick so callers awaiting this promise all see it.
      setTimeout(() => {
        refreshInFlight = null;
      }, 0);
    }
  })();

  return refreshInFlight;
}

function endSession(message) {
  try {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
  } catch {
    // ignore
  }
  const err = new Error(message || 'Your session has expired. Please sign in again.');
  err.status = 401;
  err.sessionExpired = true;
  window.dispatchEvent(new CustomEvent('auth:session-expired'));
  return err;
}

function getOrgId() {
  return String(localStorage.getItem('activeOrgId') || '').trim();
}

function getBranchId() {
  return String(localStorage.getItem('activeBranchId') || localStorage.getItem('branchId') || '').trim();
}

function getWarehouseId() {
  return String(localStorage.getItem('activeWarehouseId') || '').trim();
}

/**
 * What to tell someone when the reply is not JSON.
 *
 * A failure that never reaches the server comes back as somebody else's error
 * page — Cloudflare's, a proxy's — and the first 300 characters of it used to
 * be handed to the user as the message. Trying to save a purchase order and
 * being shown `<!doctype html> <!--[if lt IE 7]>` says nothing about the order
 * and nothing about what to do next.
 *
 * The page body is still logged for whoever is debugging; it is just not the
 * thing on screen.
 */
function describeHttpFailure(status, text) {
  const raw = String(text || '').trim();
  const isHtml = /^\s*<(!doctype|html|head|body)/i.test(raw);

  if (isHtml || !raw) {
    if (raw) console.error(`Non-JSON ${status} response from the API:`, raw.slice(0, 500));
    if (status === 502 || status === 503 || status === 504) {
      return `The server could not be reached (${status}). It may be restarting — try again in a moment.`;
    }
    if (status >= 500) return `The server could not complete that (${status}). Nothing was saved.`;
    return `Request failed (${status}).`;
  }

  return raw.slice(0, 300);
}

export async function apiFetch(
  path,
  {
    method = 'GET',
    body,
    headers,
    skipBranchHeader = false,
    skipWarehouseHeader = false,
    isRetry = false,
  } = {}
) {
  const token = getToken();
  const orgId = getOrgId();
  const branchId = getBranchId();
  const warehouseId = getWarehouseId();

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(orgId ? { 'x-org-id': orgId } : {}),
        ...(!skipBranchHeader && branchId ? { 'x-branch-id': branchId } : {}),
        ...(!skipWarehouseHeader && warehouseId ? { 'x-warehouse-id': warehouseId } : {}),
        ...(headers || {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    const err = new Error('Failed to fetch. Check that the backend is running and VITE_API_BASE is correct.');
    err.cause = e;
    throw err;
  }

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (res.status === 401 && !isRetry) {
    // The access token is short-lived by design. Try one silent refresh before
    // treating this as a sign-out.
    const refreshed = await refreshSession();
    if (refreshed) {
      return apiFetch(path, { method, body, headers, skipBranchHeader, skipWarehouseHeader, isRetry: true });
    }
    throw endSession(data?.error);
  }

  if (res.status === 401) {
    throw endSession(data?.error);
  }

  if (!res.ok) {
    const err = new Error(data?.error || describeHttpFailure(res.status, text));
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}
