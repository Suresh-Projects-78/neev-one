import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The two rules from DESIGN.md that a person cannot hold in their head across
 * 91 screens, checked mechanically instead.
 *
 * Both were cleaned up once and had drifted back by the time anyone looked:
 * DESIGN.md's own migration note claimed the palette cleanup was finished when
 * nine violations were still live. A rule nobody can check is a rule that
 * quietly stops being true, so these two are checked here and run in the gate.
 */

const SRC = dirname(dirname(fileURLToPath(import.meta.url)));

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.jsx?$/.test(name) ? [full] : [];
  });

const sources = () =>
  walk(SRC)
    .filter((f) => !/\.test\.jsx?$/.test(f))
    .map((f) => ({ path: relative(SRC, f), text: readFileSync(f, 'utf8') }));

/**
 * A printed invoice is black on white whatever theme the app is in, so these
 * three are exempt by design — see the Decisions Log in DESIGN.md.
 */
const PRINT_SURFACES = [
  'features/sales/InvoicePreview.jsx',
  'features/expenses/ExpenseVoucher.jsx',
  // Every literal in App.jsx lives inside TemplatePreview, which previews the
  // printed sheet rather than dressing the app.
  'App.jsx',
  // The accent a company chooses for its own printed template. A brand colour
  // picked by the customer is theirs, not the product's palette, and it must
  // print as chosen rather than follow whatever theme the operator is in.
  'utils/docSettings.js',
];

describe('DESIGN.md rules', () => {
  /*
   * `.ui-input` owns its padding. A `px-3 py-2` beside it is a utility, so it
   * wins, and the field ends up a different size to every other field in the
   * product. 390 call sites did this before it was mechanised.
   */
  it('no field restates the padding the token already sets', () => {
    const offenders = [];
    for (const { path, text } of sources()) {
      for (const m of text.matchAll(/(ui-input|ui-select)([^"`}]*)/g)) {
        const tail = m[2];
        if (/\bpx-3\b|\bpl-3\b/.test(tail) && /\bpy-2\b/.test(tail)) {
          offenders.push(`${path}: ${m[0].trim()}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  /*
   * Palette literals do not flip with the theme, so anything wearing one shows
   * its light-mode colour on a dark ground. The exception is paper.
   */
  it('app chrome carries no raw palette classes', () => {
    const PALETTE =
      /\b(?:bg|text|border)-(?:gray|slate|zinc|neutral|stone|red|green|blue|amber|yellow|indigo|purple)-\d{2,3}\b/g;
    const offenders = [];
    for (const { path, text } of sources()) {
      if (PRINT_SURFACES.includes(path)) continue;
      const hits = text.match(PALETTE);
      if (hits) offenders.push(`${path}: ${[...new Set(hits)].join(', ')}`);
    }
    expect(offenders).toEqual([]);
  });
});
