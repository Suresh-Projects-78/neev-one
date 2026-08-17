import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { requireTenantContext } from '../middleware/tenantContext.js';
import { requirePermission } from '../middleware/rbac.js';
import { PermissionAction } from '../constants/enums.js';
import { isKnownFeature } from '../constants/featureCatalog.js';
import { getFeatureCatalogWithValues, getFeatures } from '../services/features.js';

export const featuresRouter = Router();
featuresRouter.use(requireAuth, requireTenantContext);

const orgOk = (req: any, res: any) => {
  if (String(req.params.orgId) !== req.tenant!.orgId) {
    res.status(403).json({ error: 'orgId mismatch' });
    return false;
  }
  return true;
};

/**
 * Effective flags for the active org. Deliberately readable by any member:
 * the client needs it to render, and knowing that warehouses are switched off
 * is not privileged information.
 */
featuresRouter.get('/orgs/:orgId/features', async (req, res) => {
  if (!orgOk(req, res)) return;
  const values = await getFeatures(req.tenant!.accountId, req.tenant!.orgId);
  res.json({ features: values });
});

/** Catalog plus values, for the Settings screen. */
featuresRouter.get(
  '/orgs/:orgId/features/catalog',
  requirePermission('SETTINGS', PermissionAction.VIEW, 'Company Profile'),
  async (req, res) => {
    if (!orgOk(req, res)) return;
    const data = await getFeatureCatalogWithValues(req.tenant!.accountId, req.tenant!.orgId);
    res.json(data);
  }
);

const putSchema = z.object({ features: z.record(z.boolean()) });

featuresRouter.put(
  '/orgs/:orgId/features',
  requirePermission('SETTINGS', PermissionAction.EDIT, 'Company Profile'),
  async (req, res) => {
    if (!orgOk(req, res)) return;
    const { accountId, orgId } = req.tenant!;
    const body = putSchema.parse(req.body);

    for (const key of Object.keys(body.features)) {
      if (!isKnownFeature(key)) return res.status(400).json({ error: `Unknown feature: ${key}` });
    }

    for (const [key, enabled] of Object.entries(body.features)) {
      await prisma.featureSetting.upsert({
        where: { orgId_key: { orgId, key } },
        update: { enabled, updatedByUserId: req.auth!.userId },
        create: { accountId, orgId, key, enabled, updatedByUserId: req.auth!.userId },
      });
    }

    await prisma.auditLog.create({
      data: {
        accountId,
        orgId,
        branchId: req.tenant!.branchId,
        entity: 'Features',
        entityId: orgId,
        action: 'EDIT',
        message: `Features updated: ${Object.keys(body.features).join(', ')}`,
        createdByUserId: req.auth!.userId,
      },
    });

    // Dependencies mean the stored value is not always the effective one.
    const values = await getFeatures(accountId, orgId);
    res.json({ features: values });
  }
);
