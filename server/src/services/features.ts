import { prisma } from '../utils/prisma.js';
import { FEATURE_CATALOG, resolveFeatures } from '../constants/featureCatalog.js';
import { entitlementFor, upgradeHintFor } from './entitlements.js';

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

  const resolved = resolveFeatures(overrides);

  /*
   * The entitlement is a ceiling, not a switch.
   *
   * A feature is on only if the account may have it AND the org has turned it
   * on. The org's own preference is left exactly as it was underneath — so a
   * downgrade closes the ceiling without erasing what the customer chose, and
   * an upgrade gives it back as they left it rather than as a default.
   *
   * An account with no entitlement row is on the default plan, which entitles
   * everything, so this changes nothing for anyone until a plan is assigned.
   */
  const entitlement = await entitlementFor(accountId);
  const effective: Record<string, boolean> = {};
  for (const [key, on] of Object.entries(resolved)) {
    effective[key] = on && entitlement.features.has(key);
  }
  return effective;
}

export async function isFeatureEnabled(accountId: string, orgId: string, key: string) {
  const features = await getFeatures(accountId, orgId);
  return Boolean(features[key]);
}

/**
 * Catalog plus current values, for the Settings screen.
 *
 * A feature the account is not entitled to is returned marked, not omitted. A
 * module that simply is not there reads as a product that cannot do it; one
 * that says which plan carries it is the only version of this that can ever
 * sell anything.
 */
export async function getFeatureCatalogWithValues(accountId: string, orgId: string) {
  const values = await getFeatures(accountId, orgId);
  const entitlement = await entitlementFor(accountId);
  return {
    features: FEATURE_CATALOG.map((f) => {
      const entitled = entitlement.features.has(f.key);
      return {
        ...f,
        enabled: values[f.key],
        entitled,
        upgradeHint: entitled ? null : upgradeHintFor(f.key),
      };
    }),
    values,
    plan: { key: entitlement.planKey, name: entitlement.planName, status: entitlement.status },
  };
}
