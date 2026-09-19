/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * A column owns its geometry.
 *
 * Header and cell used to agree on their boundary — table cells cannot do
 * otherwise — and disagree on everything inside it: a money heading ended
 * 26px short of its figures because the sort chevron sat after the label; a
 * left heading pushed its chevron to the far edge of the column; a plain
 * `.ui-th` padded 8px against cells padded 12. These pin the contract that
 * puts the header on the same edge as the cells, from the shared layer only.
 */

const SRC = dirname(dirname(fileURLToPath(import.meta.url)));
const CSS = readFileSync(join(SRC, 'index.css'), 'utf8');
const HEADER = readFileSync(join(SRC, 'components/ColumnFilters.jsx'), 'utf8');

const block = (selector) => {
  const at = CSS.indexOf(selector);
  expect(at, `${selector} not found in index.css`).toBeGreaterThan(-1);
  return CSS.slice(at, CSS.indexOf('}', at));
};
const padding = (rule) => /padding:\s*([^;]+);/.exec(rule)?.[1].trim();

describe('the sortable header inherits its column', () => {
  it('writes the alignment onto the <th> from the align prop', () => {
    expect(HEADER).toContain('const headClass = `ui-col-h ui-col-h-${align} ${className}`.trim();');
    expect(HEADER).toMatch(/<th scope="col" className=\{headClass\}>\{label\}<\/th>/);
    expect(HEADER).toMatch(/<th scope="col" className=\{headClass\}>\s*<button/);
  });

  it('packs the control toward the column edge, never across it', () => {
    /* row-reverse + justify-START: main-start is the right edge once the row
       is reversed, so this is what lands the label on the figures' edge. */
    expect(HEADER).toContain("align === 'right' ? 'justify-start flex-row-reverse'");
    expect(HEADER).not.toContain('justify-end flex-row-reverse');
    expect(HEADER).toContain("align === 'center' ? 'justify-center' : 'justify-start'");
    expect(HEADER).not.toContain('justify-between');
  });

  it('cancels its own inset so the label sits on the cell content edge', () => {
    expect(HEADER).toMatch(/px-1 -mx-1 py-1\.5 -my-1\.5/);
    /* 100% + the two 4px margins, or the box stops 4px short on the right. */
    expect(HEADER).toContain('w-[calc(100%+0.5rem)]');
    expect(HEADER).not.toMatch(/className=\{`w-full flex items-center gap-1/);
  });
});

describe('header and cell share one horizontal inset', () => {
  it('in a .ui-table', () => {
    const th = block('.ui-table thead th {');
    const td = block('.ui-table tbody td {');
    expect(padding(th)).toBe('0.625rem 0.75rem');
    expect(padding(td)).toBe('var(--row-pad-y) 0.75rem');
  });

  it('and on a plain .ui-th heading', () => {
    expect(padding(block('.ui-th {'))).toBe('0.625rem 0.75rem');
  });
});

describe('semantic alignment', () => {
  it('money and numeric headers are right-aligned by class, not by caller', () => {
    const rule = block('.ui-table thead th.ui-col-h-right,');
    expect(rule).toMatch(/text-align:\s*right/);
    expect(CSS).toMatch(/\.ui-table tbody td\.ui-col-amount \{\s*text-align:\s*right/);
  });

  it('shrinks the sized columns so the descriptive one absorbs the width', () => {
    const rule = block('.ui-table thead th.ui-num,\n  .ui-table thead th.ui-col-h-right,');
    for (const sel of ['td.ui-col-amount', 'td.ui-col-date', 'td.ui-col-id', 'td:has(> .ui-pill)']) {
      expect(rule).toContain(sel);
    }
    expect(rule).toMatch(/width:\s*1%/);
    expect(rule).toMatch(/white-space:\s*nowrap/);
  });

  it('centres the checkbox and action columns, header and body alike', () => {
    const rule = block('.ui-table th.w-8,');
    for (const sel of ['.ui-table th.w-8', '.ui-table td.w-8', '.ui-table th.w-10', '.ui-table td.w-10']) {
      expect(rule).toContain(sel);
    }
    expect(rule).toMatch(/text-align:\s*center/);
  });
});

/* No page may undo the contract from the call site. */
const PRINT = new Set(['InvoicePreview.jsx', 'ExpenseVoucher.jsx', 'DocumentPrintView.jsx', 'SharedInvoice.jsx', 'BillPreview.jsx']);
const jsx = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return jsx(full);
    if (!name.endsWith('.jsx') || name.includes('.test.') || PRINT.has(name)) return [];
    return [full];
  });

describe('no call site breaks the contract', () => {
  it('every right-aligned sortable header says so with align="right"', () => {
    const offenders = [];
    for (const file of jsx(SRC)) {
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(/<ColumnHeader[^>]*ui-num[^>]*\/>/g)) {
        if (!m[0].includes('align="right"')) offenders.push(`${relative(SRC, file)}: ${m[0].slice(0, 60)}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('never centres a money cell', () => {
    const offenders = [];
    for (const file of jsx(SRC)) {
      const src = readFileSync(file, 'utf8');
      if (/ui-col-amount[^"]*text-center|text-center[^"]*ui-col-amount/.test(src)) offenders.push(relative(SRC, file));
    }
    expect(offenders).toEqual([]);
  });
});
