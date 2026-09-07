import { readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Emphasis is spent, not sprayed.
 *
 * Two rules added on 2026-09-08, both of which reverse an earlier pass that
 * raised the wrong thing:
 *
 *   - Money is monospace and right-aligned, and that is already enough to mark
 *     a figure as money. Putting a weight on top made every amount in every
 *     table an emphasis, so a screen that is mostly amounts had none.
 *   - A status hue is a background, never type. Seven saturated words in the
 *     filter strip competed with each other and with the figures beside them.
 *
 * Both are one-line CSS changes that a later pass would undo without noticing,
 * which is why they are checked here rather than trusted to memory.
 */

const CSS = readFileSync(join(dirname(dirname(fileURLToPath(import.meta.url))), 'index.css'), 'utf8');

/** The declaration block for a selector, so a rule is read in isolation. */
const block = (selector) => {
  const at = CSS.indexOf(selector);
  expect(at, `${selector} not found in index.css`).toBeGreaterThan(-1);
  const open = CSS.indexOf('{', at);
  return CSS.slice(open + 1, CSS.indexOf('}', open));
};

const weightOf = (selector) => {
  const m = /font-weight:\s*(\d+)/.exec(block(selector));
  return m ? Number(m[1]) : null;
};

describe('money is not emphasis', () => {
  it('the table money cell is normal weight', () => {
    expect(weightOf('.ui-col-amount.ui-col-amount')).toBe(400);
  });

  it('no money role reintroduces a weight', () => {
    const roles = CSS.match(/\.ui-cell-money\[data-role='[a-z]+'\][^}]*}/g) || [];
    expect(roles.length).toBeGreaterThan(3);
    for (const rule of roles) {
      const m = /font-weight:\s*(\d+)/.exec(rule);
      // A role may set a colour; none of them may shout.
      expect(`${rule.slice(0, 42)} -> ${m ? m[1] : '400'}`).toBe(`${rule.slice(0, 42)} -> 400`);
    }
  });

  /* Monospace and right alignment are what mark money instead. */
  it('keeps the signals that replaced the weight', () => {
    const money = block('.ui-col-amount.ui-col-amount');
    expect(money).toMatch(/Geist Mono/);
    expect(money).toMatch(/text-align:\s*right/);
    expect(money).toMatch(/tabular-nums/);
  });
});

describe('a status hue is a background, never type', () => {
  it('the filter tab takes its text colour from the neutral ramp', () => {
    const unselected = block('.ui-segment {\n    background-color');
    expect(unselected).toMatch(/color:\s*rgb\(var\(--fg-muted\)\)/);
    expect(unselected).not.toMatch(/--seg-ink/);
    // The hue is still there — behind the text, not in it.
    expect(unselected).toMatch(/--seg-soft/);
  });

  it('the selected tab is neutral too, and carries the hue in its ring', () => {
    const selected = block(".ui-segment[aria-selected='true']");
    expect(selected).toMatch(/color:\s*rgb\(var\(--fg\)\)/);
    expect(selected).not.toMatch(/--seg-ink/);
    expect(selected).toMatch(/border-color:\s*rgb\(var\(--seg-key/);
  });

  it('the status pill follows the same rule', () => {
    const pill = block('.ui-pill-status {');
    expect(pill).toMatch(/color:\s*rgb\(var\(--fg-muted\)\)/);
    expect(pill).not.toMatch(/--seg-ink/);
  });
});

describe('detail panels state rather than emphasise', () => {
  it('a value is grey, normal weight and centred', () => {
    const value = block('.ui-detail-value {');
    expect(value).toMatch(/font-weight:\s*400/);
    expect(value).toMatch(/color:\s*rgb\(var\(--fg-muted\)\)/);
    expect(value).toMatch(/text-align:\s*center/);
  });

  it('a money value in a panel keeps the mono face', () => {
    expect(block('.ui-detail-value.ui-detail-mono')).toMatch(/Geist Mono/);
  });
});

/**
 * Every amount wears the money face, everywhere.
 *
 * DESIGN.md rule 4 says every displayed amount is monospace. Four classes were
 * doing that job at two different weights — `.ui-money`, `.ui-amount`,
 * `.ui-col-amount` and a bare `.ui-mono` — and a further hundred amounts
 * carried none of them and rendered in the sans face beside figures that did.
 * A rule applied in four ways in some places and not at all in others is what
 * made the product look inconsistent page to page.
 */

import { readdirSync, statSync } from 'node:fs';

const SRC = dirname(dirname(fileURLToPath(import.meta.url)));

/* The printed document is black on white and outside the app's type rules. */
const PRINT_SURFACES = new Set(['InvoicePreview.jsx', 'ExpenseVoucher.jsx']);

const jsxFiles = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return jsxFiles(full);
    if (!name.endsWith('.jsx') || name.includes('.test.')) return [];
    if (PRINT_SURFACES.has(name)) return [];
    return [full];
  });

const MONEY_MARK = /ui-col-amount|ui-cell-money|ui-detail-mono|ui-money|ui-amount|ui-mono|MoneyValue/;

describe('every amount wears the money face', () => {
  it('no element renders formatMoney in the sans face', () => {
    const offenders = [];
    for (const file of jsxFiles(SRC)) {
      const source = readFileSync(file, 'utf8');
      /*
       * `[^<}]` on purpose. A looser class spans nested markup, so a container
       * div wrapping a table of amounts matches as though it were the amount —
       * which is exactly the mistake the codemod behind this rule made before
       * the check was written.
       */
      const el = /<(span|div|td)((?:\s+[^<>]*?)?)>\s*\{[^<}]*formatMoney\(/g;
      let m;
      while ((m = el.exec(source)) !== null) {
        if (!MONEY_MARK.test(m[2])) {
          offenders.push(`${relative(SRC, file)}:${source.slice(0, m.index).split('\n').length}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  /* The two inline money classes must not drift apart on weight again. */
  it('the inline money classes agree on weight 400', () => {
    const shared = block('.ui-money,\n  .ui-amount');
    expect(shared).toMatch(/font-weight:\s*400/);
    expect(shared).toMatch(/Geist Mono/);
  });

  /* A headline figure is emphasised by its size, not by its weight as well. */
  it('the KPI figure is not also bold', () => {
    const weights = [...CSS.matchAll(/\.ui-kpi\s*\{[^}]*font-weight:\s*(\d+)/g)].map((m) => Number(m[1]));
    expect(weights.length).toBeGreaterThan(0);
    for (const w of weights) expect(w).toBeLessThanOrEqual(500);
  });
});
