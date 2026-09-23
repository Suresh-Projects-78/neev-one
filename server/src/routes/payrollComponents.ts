import { Router } from 'express';
import { z } from 'zod';

import { accountingFor } from '../services/payroll/accounting/client.js';
import { payrollPrisma } from '../utils/payrollPrisma.js';
import { requireAuth } from '../middleware/auth.js';
import { requireTenantContext } from '../middleware/tenantContext.js';
import { requirePermission } from '../middleware/rbac.js';
import { PermissionAction } from '../constants/enums.js';
import { validateFormula } from '../services/payroll/formula.js';
import { PAYROLL_MODULE, PAYROLL_RESOURCE, payrollRouteOk } from '../services/payroll/guards.js';

/**
 * The lines a payslip can be built from.
 *
 * A salary component is the one place a payroll decision is written down:
 * whether an amount is taxable, whether it shrinks when somebody joins
 * mid-month, whether it counts towards PF wages, and which ledgers it lands in.
 * None of that belongs in a screen or in the engine — an organisation that pays
 * a site allowance which is taxable but outside PF wages should be able to say
 * so without anybody changing code.
 *
 * Two rules this route enforces because nothing downstream can recover from
 * them being broken. A formula is validated here, before it is stored, so the
 * engine never meets an expression it cannot evaluate in the middle of a run of
 * six hundred people. And a component that has already been used on a payslip
 * keeps its code and its type forever: the payslip stores its own snapshot, but
 * the code is how a report finds the same component across periods, and letting
 * an EARNING become a DEDUCTION would silently rewrite what past months meant.
 */
export const payrollComponentsRouter = Router();
payrollComponentsRouter.use(requireAuth, requireTenantContext);

const MODULE = PAYROLL_MODULE;
const RESOURCE = PAYROLL_RESOURCE.settings;

export const COMPONENT_TYPES = ['EARNING', 'DEDUCTION', 'EMPLOYER_CONTRIBUTION'] as const;
export const CALCULATION_METHODS = ['FIXED', 'PERCENTAGE', 'FORMULA', 'VARIABLE', 'STATUTORY', 'BALANCING'] as const;
export const ROUNDING_MODES = ['NONE', 'NEAREST', 'UP', 'DOWN'] as const;
export const STATUTORY_SCHEMES = ['PF', 'ESI', 'PT', 'TDS', 'LWF'] as const;

const bodySchema = z.object({
  name: z.string().trim().min(1, 'A component needs a name.').max(120),
  /* Uppercased on the way in: the code is what a formula refers to, and
     `BASIC` and `basic` meaning two different things is a trap. */
  code: z
    .string()
    .trim()
    .min(1, 'A component needs a code.')
    .max(40)
    .regex(/^[A-Za-z][A-Za-z0-9_]*$/, 'A code starts with a letter and holds only letters, digits and underscores.'),
  type: z.enum(COMPONENT_TYPES),
  description: z.string().trim().max(500).optional().nullable(),

  calculationMethod: z.enum(CALCULATION_METHODS).default('FIXED'),
  amount: z.number().finite().min(0).default(0),
  percentage: z.number().finite().min(0).max(1000).default(0),
  formula: z.string().trim().max(500).optional().nullable(),
  calculationBase: z.string().trim().max(40).optional().nullable(),
  rounding: z.enum(ROUNDING_MODES).default('NEAREST'),
  statutoryScheme: z.enum(STATUTORY_SCHEMES).optional().nullable(),

  isTaxable: z.boolean().default(true),
  prorate: z.boolean().default(true),
  includeInPfWage: z.boolean().default(false),
  includeInEsiWage: z.boolean().default(false),
  includeInGratuityWage: z.boolean().default(false),
  includeInGross: z.boolean().default(true),
  includeInNetPay: z.boolean().default(true),
  isVariable: z.boolean().default(false),
  isFlexibleBenefit: z.boolean().default(false),

  expenseLedgerId: z.string().trim().optional().nullable(),
  liabilityLedgerId: z.string().trim().optional().nullable(),
  costCentreBehaviour: z.enum(['EMPLOYEE', 'STRUCTURE', 'NONE']).default('EMPLOYEE'),

  displayOrder: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});

type Body = z.infer<typeof bodySchema>;

/**
 * What the chosen method actually requires.
 *
 * Zod can say a percentage is a number; it cannot say that a PERCENTAGE
 * component with no base is meaningless. These are the combinations that would
 * pass the schema and then produce nothing, or worse, a zero that looks
 * deliberate on a payslip.
 */
function methodProblems(body: Body): string | null {
  if (body.calculationMethod === 'PERCENTAGE') {
    if (!body.percentage) return 'A percentage component needs a percentage above zero.';
    if (!String(body.calculationBase || '').trim()) {
      return 'A percentage component needs to say what it is a percentage of.';
    }
  }
  if (body.calculationMethod === 'FIXED' && body.amount <= 0 && !body.isVariable) {
    return 'A fixed component needs an amount, or it should be marked as entered each month.';
  }
  if (body.calculationMethod === 'FORMULA') {
    const formula = String(body.formula || '').trim();
    if (!formula) return 'A formula component needs a formula.';
    const verdict = validateFormula(formula);
    if (!verdict.ok) return verdict.error;
  }
  if (body.calculationMethod === 'STATUTORY' && !body.statutoryScheme) {
    return 'A statutory component needs to say which scheme computes it — PF, ESI, PT or TDS.';
  }
  if (body.calculationMethod !== 'STATUTORY' && body.statutoryScheme) {
    return 'Only a statutory component may name a scheme.';
  }
  /* An employer contribution is a cost the company carries. Letting one into
     net pay would take it off the employee's take-home, which is the opposite
     of what it is. */
  if (body.type === 'EMPLOYER_CONTRIBUTION' && body.includeInNetPay) {
    return 'An employer contribution is a company cost and cannot be part of net pay.';
  }
  return null;
}

const shape = (row: any) => ({
  id: row.id,
  name: row.name,
  code: row.code,
  type: row.type,
  description: row.description || '',
  calculationMethod: row.calculationMethod,
  amount: Number(row.amount ?? 0),
  percentage: Number(row.percentage ?? 0),
  formula: row.formula || '',
  calculationBase: row.calculationBase || '',
  rounding: row.rounding,
  statutoryScheme: row.statutoryScheme || null,
  isTaxable: !!row.isTaxable,
  prorate: !!row.prorate,
  includeInPfWage: !!row.includeInPfWage,
  includeInEsiWage: !!row.includeInEsiWage,
  includeInGratuityWage: !!row.includeInGratuityWage,
  includeInGross: !!row.includeInGross,
  includeInNetPay: !!row.includeInNetPay,
  isVariable: !!row.isVariable,
  isFlexibleBenefit: !!row.isFlexibleBenefit,
  expenseLedgerId: row.expenseLedgerId || null,
  liabilityLedgerId: row.liabilityLedgerId || null,
  costCentreBehaviour: row.costCentreBehaviour,
  displayOrder: row.displayOrder ?? 0,
  isActive: !!row.isActive,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

/** Whether any payslip has already been built on this component. */
async function isInUse(orgId: string, componentId: string) {
  const used = await payrollPrisma.salarySlipLine.findFirst({ where: { orgId, componentId }, select: { id: true } });
  return Boolean(used);
}

payrollComponentsRouter.get(
  '/orgs/:orgId/payroll/components',
  requirePermission(MODULE, PermissionAction.VIEW, RESOURCE),
  async (req, res) => {
    if (!(await payrollRouteOk(req, res))) return;
    const { accountId, orgId } = req.tenant!;

    const rows = await payrollPrisma.salaryComponent.findMany({
      where: {
        accountId,
        orgId,
        ...(String(req.query.type || '').trim() ? { type: String(req.query.type) } : {}),
        ...(String(req.query.active || '') === 'true' ? { isActive: true } : {}),
      },
      orderBy: [{ type: 'asc' }, { displayOrder: 'asc' }, { name: 'asc' }],
    });
    res.json({ components: rows.map(shape) });
  }
);

payrollComponentsRouter.post(
  '/orgs/:orgId/payroll/components',
  requirePermission(MODULE, PermissionAction.EDIT, RESOURCE),
  async (req, res) => {
    if (!(await payrollRouteOk(req, res))) return;
    const { accountId, orgId } = req.tenant!;

    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid component.' });
    }
    const body = { ...parsed.data, code: parsed.data.code.toUpperCase() };
    const problem = methodProblems(body);
    if (problem) return res.status(400).json({ error: problem });

    const clash = await payrollPrisma.salaryComponent.findFirst({ where: { orgId, code: body.code }, select: { id: true } });
    if (clash) return res.status(409).json({ error: `A component with the code ${body.code} already exists.` });

    const row = await payrollPrisma.salaryComponent.create({
      data: { ...body, accountId, orgId, createdByUserId: req.auth!.userId },
    });
    res.status(201).json({ component: shape(row) });
  }
);

/**
 * Where a component posts, on its own.
 *
 * Separate from editing the component because it is a different decision made
 * by a different person: what somebody is paid is a compensation question, and
 * which ledger it lands in is an accounting one. Keeping them apart also means
 * a component already on a payslip can still be mapped — which is the case that
 * matters, because a company discovers it has no mapping at the moment it first
 * tries to post, by which time payslips exist.
 */
payrollComponentsRouter.put(
  '/orgs/:orgId/payroll/components/:id/ledgers',
  requirePermission(MODULE, PermissionAction.EDIT, RESOURCE),
  async (req, res) => {
    if (!(await payrollRouteOk(req, res))) return;
    const { accountId, orgId } = req.tenant!;

    const existing = await payrollPrisma.salaryComponent.findFirst({ where: { id: String(req.params.id), accountId, orgId } });
    if (!existing) return res.status(404).json({ error: 'No such salary component.' });

    const schema = z.object({
      expenseLedgerId: z.string().trim().min(1).optional().nullable(),
      liabilityLedgerId: z.string().trim().min(1).optional().nullable(),
    });
    const parsed = schema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: 'Say which accounts this posts to.' });

    /* An account that has been deleted or deactivated would post to nothing,
       and the failure would surface only at the moment somebody tries to post
       a month's payroll. */
    const wanted = [parsed.data.expenseLedgerId, parsed.data.liabilityLedgerId].filter(Boolean) as string[];
    if (wanted.length) {
      const accounting = accountingFor(accountId);
      for (const id of wanted) {
        const ledger = await accounting.getLedger(orgId, id);
        if (!ledger) return res.status(404).json({ error: 'No such ledger account.' });
        if (!ledger.isActive) return res.status(409).json({ error: `${ledger.name} is no longer active.` });
      }
    }

    const row = await payrollPrisma.salaryComponent.update({
      where: { id: existing.id },
      data: {
        expenseLedgerId: parsed.data.expenseLedgerId ?? null,
        liabilityLedgerId: parsed.data.liabilityLedgerId ?? null,
      },
    });
    res.json({ component: shape(row) });
  }
);

payrollComponentsRouter.put(
  '/orgs/:orgId/payroll/components/:id',
  requirePermission(MODULE, PermissionAction.EDIT, RESOURCE),
  async (req, res) => {
    if (!(await payrollRouteOk(req, res))) return;
    const { accountId, orgId } = req.tenant!;

    const existing = await payrollPrisma.salaryComponent.findFirst({ where: { id: String(req.params.id), accountId, orgId } });
    if (!existing) return res.status(404).json({ error: 'No such salary component.' });

    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid component.' });
    }
    const body = { ...parsed.data, code: parsed.data.code.toUpperCase() };
    const problem = methodProblems(body);
    if (problem) return res.status(400).json({ error: problem });

    /*
     * Identity is fixed once a payslip has used it. The slip carries its own
     * snapshot of the amount, so history does not change — but the code is how
     * a register groups the same component across twelve months, and the type
     * is what decides which side of the payslip it was on. Renaming is fine;
     * becoming a different thing is not.
     */
    if (body.code !== existing.code || body.type !== existing.type) {
      if (await isInUse(orgId, existing.id)) {
        return res.status(409).json({
          error:
            'This component is already on a payslip, so its code and type can no longer change. ' +
            'Make it inactive and add a new component instead.',
          code: 'PAYROLL_COMPONENT_IN_USE',
        });
      }
      const clash = await payrollPrisma.salaryComponent.findFirst({
        where: { orgId, code: body.code, NOT: { id: existing.id } },
        select: { id: true },
      });
      if (clash) return res.status(409).json({ error: `A component with the code ${body.code} already exists.` });
    }

    const row = await payrollPrisma.salaryComponent.update({ where: { id: existing.id }, data: body });
    res.json({ component: shape(row) });
  }
);

payrollComponentsRouter.delete(
  '/orgs/:orgId/payroll/components/:id',
  requirePermission(MODULE, PermissionAction.EDIT, RESOURCE),
  async (req, res) => {
    if (!(await payrollRouteOk(req, res))) return;
    const { accountId, orgId } = req.tenant!;

    const existing = await payrollPrisma.salaryComponent.findFirst({ where: { id: String(req.params.id), accountId, orgId } });
    if (!existing) return res.status(404).json({ error: 'No such salary component.' });

    /* Deleting one that a payslip used would leave that payslip pointing at
       nothing. Deactivating keeps every past payslip readable and stops the
       component appearing on the next structure. */
    if (await isInUse(orgId, existing.id)) {
      return res.status(409).json({
        error: 'This component is on a payslip and cannot be deleted. Make it inactive instead.',
        code: 'PAYROLL_COMPONENT_IN_USE',
      });
    }
    const onStructure = await payrollPrisma.salaryStructureComponent.findFirst({
      where: { orgId, componentId: existing.id },
      select: { id: true },
    });
    if (onStructure) {
      return res.status(409).json({
        error: 'This component is used by a salary structure. Remove it there first, or make it inactive.',
        code: 'PAYROLL_COMPONENT_ON_STRUCTURE',
      });
    }

    await payrollPrisma.salaryComponent.delete({ where: { id: existing.id } });
    res.json({ ok: true });
  }
);

/** Check a formula without saving one, so the screen can say why it is wrong. */
payrollComponentsRouter.post(
  '/orgs/:orgId/payroll/components/validate-formula',
  requirePermission(MODULE, PermissionAction.VIEW, RESOURCE),
  async (req, res) => {
    if (!(await payrollRouteOk(req, res))) return;
    const formula = String(req.body?.formula || '').trim();
    const verdict = validateFormula(formula);
    res.json(verdict);
  }
);
