import { apiFetch } from './http';

const orgId = () => {
  const id = String(localStorage.getItem('activeOrgId') || '').trim();
  if (!id) throw new Error('Missing active org. Please select an organization.');
  return id;
};

/**
 * A copy of this company's own books.
 *
 * Not the server backup: that is the whole multi-tenant database and belongs to
 * whoever runs the service. This is one company's data, for the people whose
 * data it is.
 */
export const exportCompanyData = () =>
  apiFetch(`/orgs/${encodeURIComponent(orgId())}/export`, { skipWarehouseHeader: true });
