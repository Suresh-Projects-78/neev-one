import { apiFetch } from './http';

const orgId = () => {
  const id = String(localStorage.getItem('activeOrgId') || '').trim();
  if (!id) throw new Error('Missing active org. Please select an organization.');
  return id;
};

export const getFeatures = () =>
  apiFetch(`/orgs/${encodeURIComponent(orgId())}/features`, { skipWarehouseHeader: true });

export const getFeatureCatalog = () =>
  apiFetch(`/orgs/${encodeURIComponent(orgId())}/features/catalog`, { skipWarehouseHeader: true });

export const setFeatures = (features) =>
  apiFetch(`/orgs/${encodeURIComponent(orgId())}/features`, {
    method: 'PUT',
    body: { features },
    skipWarehouseHeader: true,
  });
