import { prisma } from '../utils/prisma.js';
import { FEATURE_CATALOG, resolveFeatures } from '../constants/featureCatalog.js';

/**
 * Effective feature flags for an organisation.
 *
 * Read on the server before doing anything a disabled feature would imply, and
 * served to the client so navigation and forms hide the same things.
 */
export async function getFeatures(accountId: string, orgId: string) {
  const rows = await prisma.featureSetting.findMany({
    where: { accountId, orgId },
    select: { key: true, enabled: true },
  });

  const overrides: Record<string, boolean> = {};
  for (const r of rows) overrides[r.key] = r.enabled;

  return resolveFeatures(overrides);
}

export async function isFeatureEnabled(accountId: string, orgId: string, key: string) {
  const features = await getFeatures(accountId, orgId);
  return Boolean(features[key]);
}

/** Catalog plus current values, for the Settings screen. */
export async function getFeatureCatalogWithValues(accountId: string, orgId: string) {
  const values = await getFeatures(accountId, orgId);
  return {
    features: FEATURE_CATALOG.map((f) => ({ ...f, enabled: values[f.key] })),
    values,
  };
}
