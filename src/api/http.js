// In dev, Vite proxies `/api` to the backend (see vite.config.js).
// Use a relative default to avoid CORS/mixed-content issues that often show up as "Failed to fetch".
const API_BASE = import.meta.env?.VITE_API_BASE || '/api';

function getToken() {
  return String(localStorage.getItem('token') || '').trim();
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

export async function apiFetch(
  path,
  {
    method = 'GET',
    body,
    headers,
    skipBranchHeader = false,
    skipWarehouseHeader = false,
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
  if (res.status === 401) {
    // The session is gone (expired or revoked). Without this the app keeps
    // running with an empty permission set, which looks like "everything
    // disappeared" rather than "you are signed out".
    try {
      localStorage.removeItem('token');
    } catch {
      // ignore
    }
    const err = new Error(data?.error || 'Your session has expired. Please sign in again.');
    err.status = 401;
    err.sessionExpired = true;
    window.dispatchEvent(new CustomEvent('auth:session-expired'));
    throw err;
  }

  if (!res.ok) {
    const raw = String(text || '').trim();
    const msg =
      data?.error ||
      (raw ? raw.slice(0, 300) : '') ||
      `Request failed (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}
