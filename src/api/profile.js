import { apiFetch } from './http';

export const getProfile = () =>
  apiFetch('/auth/me', { skipBranchHeader: true, skipWarehouseHeader: true });

export const updateProfile = (fullName) =>
  apiFetch('/auth/me', {
    method: 'PATCH',
    body: { fullName },
    skipBranchHeader: true,
    skipWarehouseHeader: true,
  });
