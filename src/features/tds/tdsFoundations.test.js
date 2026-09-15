/**
 * @vitest-environment node
 *
 * Reads source and computes; never renders. A jsdom for it is about
 * twenty-five seconds of wall clock that nothing touches.
 */
import { describe, expect, it } from 'vitest';

import { normalizeDB } from '../../data/db';
import { tdsGroupSide } from '../../utils/tdsLedgers';
import { tdsEventFrom } from './engine';

/**
 * The V1 foundations the rest of TDS stands on.
 *
 * Everything hangs off the chart: the ledger form's TDS tab, the engine's
 * side detection, the journal's deduction recognition — all read the TDS
 * groups. So a fresh company gets both groups seeded, on the right sides,
 * under the parents an accountant expects. And every normalized event is
 * stamped with its regime, so TCS later is new rows and a report filter,
 * not a second store.
 */

describe('the seeded TDS groups', () => {
  const db = normalizeDB({ companies: [{ id: 1, name: 'Neev Steels' }] });
  const groups = db.accountGroups.filter((g) => g.companyId === 1);
  const byName = (name) => groups.find((g) => String(g.name).toLowerCase() === name) || null;

  it('a fresh company has TDS Payable and TDS Receivable as system groups, not hidden', () => {
    const payable = byName('tds payable');
    const receivable = byName('tds receivable');
    expect(payable).toBeTruthy();
    expect(receivable).toBeTruthy();
    expect(payable.isLegacy).toBe(false);
    expect(receivable.isLegacy).toBe(false);
    expect(payable.isSystem).toBe(true);
    expect(receivable.isSystem).toBe(true);
  });

  /* The specified hierarchy, and room beside it: Statutory Payables /
     Receivables are the parents, so TCS and other statutory heads join
     later as siblings rather than a re-parenting. */
  it('each sits under its Statutory parent', () => {
    const payable = byName('tds payable');
    const receivable = byName('tds receivable');
    const statPay = byName('statutory payables');
    const statRec = byName('statutory receivables');
    expect(String(statPay?.id)).toBe(String(payable.parentGroupId));
    expect(String(statRec?.id)).toBe(String(receivable.parentGroupId));
    expect(statPay.isSystem).toBe(true);
    expect(statRec.isSystem).toBe(true);
    /* And the parents hang off the right types' roots. */
    expect(statPay.parentGroupId ?? null).toBeNull();
    expect(statRec.parentGroupId ?? null).toBeNull();
  });

  it('the engine reads the right side off each, nesting included', () => {
    const payable = byName('tds payable');
    const receivable = byName('tds receivable');
    expect(tdsGroupSide(groups, payable.id)).toBe('PAYABLE');
    expect(tdsGroupSide(groups, receivable.id)).toBe('RECEIVABLE');

    /* A user-created section group nested under a seeded one inherits its
       side from the chain — no extra mapping to type. */
    const nested = [...groups, { id: 9901, companyId: 1, name: '194C — Contractors', parentGroupId: payable.id }];
    expect(tdsGroupSide(nested, 9901)).toBe('PAYABLE');
  });
});

describe('the normalized event is regime-stamped', () => {
  it('every event says TDS, so a TCS row can join the same store later', () => {
    const event = tdsEventFrom(
      { natureCode: 'CONTRACT', ruleVersionId: 'v1', statutoryReference: '194C', sectionCode: '194C', baseAmount: 100000, rate: 2, tdsAmount: 2000, ledgerId: '200', side: 'PAYABLE' },
      {
        company: { id: 1, name: 'Neev Steels', profile: { taxCompliances: { tds: { enabled: true, tan: 'BLRN12345F' } } } },
        party: { id: 2, name: 'Sharp Contractors', pan: 'ABCDE1234F' },
        source: { type: 'bill', id: 7, number: 'BILL-7' },
        date: '2026-09-01',
      }
    );
    expect(event.regime).toBe('TDS');
    expect(event.returnQuarter).toMatch(/Q2/);
  });
});
