import { apiFetch } from './http';

const orgId = () => {
  const id = String(localStorage.getItem('activeOrgId') || '').trim();
  if (!id) throw new Error('Missing active org. Please select an organization.');
  return id;
};
const base = () => `/orgs/${encodeURIComponent(orgId())}`;
const opts = { skipWarehouseHeader: true };

/**
 * The POS day close — the Z report.
 *
 * The over/short figure is what the owner reviews, so the count cannot live
 * only on the till that produced it.
 */
export const listPosDayCloses = () => apiFetch(`${base()}/pos-day-closes`, opts);

export const createPosDayClose = (record) =>
  apiFetch(`${base()}/pos-day-closes`, { method: 'POST', body: record, ...opts });
