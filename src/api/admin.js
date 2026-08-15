import { apiFetch } from './http';

// Branches
export function listBranches(orgId) {
  return apiFetch(`/orgs/${encodeURIComponent(orgId)}/branches`, { skipWarehouseHeader: true });
}

export function createBranch(orgId, payload) {
  return apiFetch(`/orgs/${encodeURIComponent(orgId)}/branches`, { method: 'POST', body: payload, skipWarehouseHeader: true });
}

export function updateBranch(orgId, branchId, payload) {
  return apiFetch(`/orgs/${encodeURIComponent(orgId)}/branches/${encodeURIComponent(branchId)}`, { method: 'PATCH', body: payload, skipWarehouseHeader: true });
}

export function deleteBranch(orgId, branchId) {
  return apiFetch(`/orgs/${encodeURIComponent(orgId)}/branches/${encodeURIComponent(branchId)}`, { method: 'DELETE', skipWarehouseHeader: true });
}

// Roles
export function listRoles(orgId) {
  return apiFetch(`/orgs/${encodeURIComponent(orgId)}/roles`, { skipWarehouseHeader: true });
}

export function createRole(orgId, payload) {
  return apiFetch(`/orgs/${encodeURIComponent(orgId)}/roles`, { method: 'POST', body: payload, skipWarehouseHeader: true });
}

export function updateRole(orgId, roleId, payload) {
  return apiFetch(`/orgs/${encodeURIComponent(orgId)}/roles/${encodeURIComponent(roleId)}`, { method: 'PATCH', body: payload, skipWarehouseHeader: true });
}

export function deleteRole(orgId, roleId) {
  return apiFetch(`/orgs/${encodeURIComponent(orgId)}/roles/${encodeURIComponent(roleId)}`, { method: 'DELETE', skipWarehouseHeader: true });
}

// Users
export function listUsers(orgId) {
  return apiFetch(`/orgs/${encodeURIComponent(orgId)}/users`, { skipWarehouseHeader: true });
}

export function createUser(payload) {
  return apiFetch(`/users`, { method: 'POST', body: payload, skipWarehouseHeader: true });
}

export function deleteUser(orgId, userId) {
  return apiFetch(`/orgs/${encodeURIComponent(orgId)}/users/${encodeURIComponent(userId)}`, { method: 'DELETE', skipWarehouseHeader: true });
}

export function updateUser(orgId, userId, payload) {
  return apiFetch(`/orgs/${encodeURIComponent(orgId)}/users/${encodeURIComponent(userId)}`, { method: 'PATCH', body: payload, skipWarehouseHeader: true });
}

export function setUserPrimaryRole(orgId, userId, roleId) {
  return apiFetch(`/orgs/${encodeURIComponent(orgId)}/users/${encodeURIComponent(userId)}/role`, {
    method: 'PUT',
    body: { roleId: roleId || null },
    skipWarehouseHeader: true,
  });
}

export function changeUserPassword(orgId, userId, password) {
  return apiFetch(`/orgs/${encodeURIComponent(orgId)}/users/${encodeURIComponent(userId)}/password`, {
    method: 'POST',
    body: { password },
    skipWarehouseHeader: true,
  });
}

export function assignUserBranches(orgId, userId, branchIds) {
  return apiFetch(`/orgs/${encodeURIComponent(orgId)}/users/${encodeURIComponent(userId)}/branches`, {
    method: 'POST',
    body: { branchIds },
    skipWarehouseHeader: true,
  });
}

export function getUserBranches(orgId, userId) {
  return apiFetch(`/orgs/${encodeURIComponent(orgId)}/users/${encodeURIComponent(userId)}/branches`, {
    skipWarehouseHeader: true,
  });
}

export function assignUserRole(orgId, userId, roleId, branchId = null) {
  return apiFetch(`/orgs/${encodeURIComponent(orgId)}/users/${encodeURIComponent(userId)}/roles`, {
    method: 'POST',
    body: { roleId, branchId },
    skipWarehouseHeader: true,
  });
}

// Warehouses
export function listWarehouses(orgId) {
  return apiFetch(`/orgs/${encodeURIComponent(orgId)}/warehouses`, { skipWarehouseHeader: true });
}

export function createWarehouse(orgId, payload) {
  return apiFetch(`/orgs/${encodeURIComponent(orgId)}/warehouses`, { method: 'POST', body: payload, skipWarehouseHeader: true });
}

export function updateWarehouse(orgId, warehouseId, payload) {
  return apiFetch(`/orgs/${encodeURIComponent(orgId)}/warehouses/${encodeURIComponent(warehouseId)}`, {
    method: 'PATCH',
    body: payload,
    skipWarehouseHeader: true,
  });
}

export function deleteWarehouse(orgId, warehouseId) {
  return apiFetch(`/orgs/${encodeURIComponent(orgId)}/warehouses/${encodeURIComponent(warehouseId)}`, {
    method: 'DELETE',
    skipWarehouseHeader: true,
  });
}

export function assignUserWarehouses(orgId, userId, warehouseIds) {
  return apiFetch(`/orgs/${encodeURIComponent(orgId)}/users/${encodeURIComponent(userId)}/warehouses`, {
    method: 'POST',
    body: { warehouseIds },
    skipWarehouseHeader: true,
  });
}
