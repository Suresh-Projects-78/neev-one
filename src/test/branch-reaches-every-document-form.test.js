/**
 * @vitest-environment node
 *
 * This file reads source, it does not render it. A jsdom for it costs about
 * twenty-five seconds of wall clock and is never touched.
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/* src/test/ → src/ */
const SRC = dirname(dirname(fileURLToPath(import.meta.url)));

/**
 * A document form asks which branch the document belongs to.
 *
 * Both the invoice and the bill take a `branches` list and ask. A screen that
 * renders one of them and forgets the list still shows the field — it just
 * offers an empty list, so the answer is "All branches" and the document is
 * filed nowhere in particular. That is worse than the old silence, because it
 * looks like a question that was asked and answered.
 *
 * This is a source scan rather than a render test on purpose: the point is
 * that no CALL SITE is missed, and only reading the call sites can say that.
 */

const FORMS = ['InvoiceForm', 'BillForm'];

/** Every file under src/ that renders one of these forms, tests aside. */
const filesRendering = (name) =>
  execSync(`grep -rl "<${name}$" ${JSON.stringify(SRC)} --include=*.jsx || true`, { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .filter((f) => !/\.test\.jsx?$/.test(f));

/**
 * The props of each `<Form ... />` element in a file.
 *
 * Stops at the first `/>` or `>` that ends the opening tag, which is enough:
 * these are all multi-line elements with one prop per line.
 */
const elementsOf = (src, name) => {
  const out = [];
  const open = `<${name}\n`;
  let at = src.indexOf(open);
  while (at >= 0) {
    const rest = src.slice(at);
    const end = rest.search(/\n\s*\/?>/);
    out.push(rest.slice(0, end < 0 ? 400 : end));
    at = src.indexOf(open, at + 1);
  }
  return out;
};

describe('the branch list reaches every document form', () => {
  for (const name of FORMS) {
    it(`every <${name}> is handed its branches`, () => {
      const missing = [];
      for (const file of filesRendering(name)) {
        const src = readFileSync(file, 'utf8');
        elementsOf(src, name).forEach((el, i) => {
          if (!/\bbranches=/.test(el)) missing.push(`${relative(SRC, file)} #${i + 1}`);
        });
      }
      expect(missing).toEqual([]);
    });
  }

  /* And the form itself still asks — a test that only checks the plumbing
     passes just as well once the field is deleted. */
  it('the bill form renders a branch field', () => {
    const src = readFileSync(join(SRC, 'features/purchase/index.jsx'), 'utf8');
    expect(src).toContain('id="bill-branch-field"');
    expect(src).toContain('label="Branch"');
  });
});
