import { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma.js';
import { resolveRoleIds } from './access.js';

/**
 * Amount-based approval thresholds.
 *
 * A document whose amount matches an active rule is held until someone holding
 * the approver role signs it off. While it is held it must not reach the
 * ledger: an unapproved invoice that had already posted would defeat the point.
 */

export type ApprovalOutcome = {
  required: boolean;
  ruleId?: string;
  ruleName?: string;
  autoApproved?: boolean;
};

/** The active rule covering this amount, if any. Lowest sequence wins. */
export async function findMatchingRule(opts: {
  accountId: string;
  orgId: string;
  branchId: string;
  docType: string;
  amount: number;
}) {
  const rules = await prisma.approvalRule.findMany({
    where: {
      accountId: opts.accountId,
      orgId: opts.orgId,
      docType: opts.docType,
      isActive: true,
      OR: [{ branchId: null }, { branchId: opts.branchId }],
    },
    orderBy: [{ sequence: 'asc' }, { createdAt: 'asc' }],
  });

  const amount = Number(opts.amount || 0);
  return (
    rules.find((r) => {
      const min = Number(r.minAmount ?? 0);
      const max = r.maxAmount === null || r.maxAmount === undefined ? null : Number(r.maxAmount);
      if (amount < min) return false;
      if (max !== null && amount >= max) return false;
      return true;
    }) || null
  );
}

/**
 * Decide whether a document needs approval, and record the request if so.
 *
 * A user who already holds the approver role approves their own document
 * implicitly — requiring them to approve what they just raised is friction with
 * no control value, since they could approve it a second later anyway.
 */
export async function evaluateApproval(opts: {
  accountId: string;
  orgId: string;
  branchId: string;
  userId: string;
  docType: string;
  docId: string;
  amount: number;
}): Promise<ApprovalOutcome> {
  const rule = await findMatchingRule(opts);
  if (!rule) return { required: false };

  const roleIds = await resolveRoleIds(opts.accountId, opts.orgId, opts.userId, opts.branchId);
  if (roleIds.includes(rule.approverRoleId)) {
    return { required: false, ruleId: rule.id, ruleName: rule.name, autoApproved: true };
  }

  await prisma.approvalRequest.create({
    data: {
      accountId: opts.accountId,
      orgId: opts.orgId,
      branchId: opts.branchId,
      docType: opts.docType,
      docId: opts.docId,
      ruleId: rule.id,
      sequence: rule.sequence,
      amount: new Prisma.Decimal(Number(opts.amount || 0).toFixed(2)),
      status: 'PENDING',
      requestedByUserId: opts.userId,
    },
  });

  return { required: true, ruleId: rule.id, ruleName: rule.name };
}

/** True when the document is waiting on someone. */
export async function isPending(accountId: string, orgId: string, docType: string, docId: string) {
  const row = await prisma.approvalRequest.findFirst({
    where: { accountId, orgId, docType, docId, status: 'PENDING' },
    select: { id: true },
  });
  return Boolean(row);
}

export class ApprovalError extends Error {
  status: number;
  constructor(message: string, status = 403) {
    super(message);
    this.name = 'ApprovalError';
    this.status = status;
  }
}

/** Approve or reject. Only a holder of the rule's approver role may decide. */
export async function decide(opts: {
  accountId: string;
  orgId: string;
  branchId: string;
  userId: string;
  requestId: string;
  approve: boolean;
  comment?: string;
}) {
  const request = await prisma.approvalRequest.findFirst({
    where: { id: opts.requestId, accountId: opts.accountId, orgId: opts.orgId },
    include: { rule: true },
  });
  if (!request) throw new ApprovalError('Approval request not found', 404);
  if (request.status !== 'PENDING') throw new ApprovalError('This request has already been decided', 409);

  const roleIds = await resolveRoleIds(opts.accountId, opts.orgId, opts.userId, opts.branchId);
  if (!roleIds.includes(request.rule.approverRoleId)) {
    throw new ApprovalError('You do not hold the role required to approve this document');
  }
  if (request.requestedByUserId === opts.userId) {
    throw new ApprovalError('You cannot approve a document you raised');
  }

  return prisma.approvalRequest.update({
    where: { id: request.id },
    data: {
      status: opts.approve ? 'APPROVED' : 'REJECTED',
      decidedByUserId: opts.userId,
      decidedAt: new Date(),
      comment: opts.comment || null,
    },
    include: { rule: true },
  });
}
