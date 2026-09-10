import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = dirname(dirname(fileURLToPath(import.meta.url)));

const jsxFiles = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return jsxFiles(full);
    if (!name.endsWith('.jsx') || name.includes('.test.')) return [];
    return [full];
  });

/*
 * Four lists had their toolbar's period filter and export configuration spliced
 * into an unrelated element — a row's actions button, a Knock off button, a
 * table row. React put them on the DOM node as stray attributes and warned, and
 * the toolbar above the list quietly lost its date filter and its export
 * columns. Purchase orders, debit notes, quotations and credit notes were all
 * affected, and the lists looked fine.
 *
 * The signature is unmistakable: a run of ListToolbar props sitting at the
 * toolbar's own indentation inside something that is not a ListToolbar.
 */
const TOOLBAR_PROPS = ['period=', 'onPeriodChange=', 'exportColumns=', 'exportRows=', 'exportSheetName='];

/* FiltersButton takes the period props in its own right — it is the control
   the toolbar delegates them to. */
const LEGITIMATE_HOSTS = new Set(['ListToolbar', 'FiltersButton']);

describe('list toolbars keep their own props', () => {
  it('has no toolbar props stranded outside a ListToolbar', () => {
    const strays = [];
    for (const file of jsxFiles(SRC)) {
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, idx) => {
        if (!TOOLBAR_PROPS.some((p) => line.trim().startsWith(p))) return;
        // Walk back to the element this prop is an attribute of.
        for (let k = idx - 1; k >= 0 && idx - k < 60; k -= 1) {
          const open = lines[k].match(/<([A-Za-z][\w.]*)/);
          if (!open) continue;
          if (lines[k].trim().startsWith('</')) continue;
          if (!LEGITIMATE_HOSTS.has(open[1])) strays.push(`${relative(SRC, file)}:${idx + 1} on <${open[1]}>`);
          return;
        }
      });
    }
    expect(strays).toEqual([]);
  });
});
