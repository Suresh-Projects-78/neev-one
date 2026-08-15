import { apiFetch } from './http';

export async function getMyAuthContext() {
  return apiFetch('/auth/me', {
    method: 'GET',
    skipBranchHeader: true,
    skipWarehouseHeader: true,
  });
}
