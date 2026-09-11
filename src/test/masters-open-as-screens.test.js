import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/* src/test/ → src/ */
const SRC = dirname(dirname(fileURLToPath(import.meta.url)));
const APP = readFileSync(join(SRC, 'App.jsx'), 'utf8');

/**
 * A master is a longer job than an invoice, not a shorter one.
 *
 * Master Data was a set of dialogs: a form in a box over a greyed-out list,
 * with Save at the foot of whatever scrolled inside it. Documents in Sales and
 * Purchases have never worked that way — a new invoice takes the screen, names
 * itself top left, and keeps every way out of it top right.
 *
 * Stated against the source, because what was wrong is the call site: a master
 * form handed to the modal is the bug, wherever it is written.
 */

const MASTER_TITLES = [
  'New Item',
  'Edit Item',
  'New Customer',
  'New Vendor',
];

describe('master forms are screens', () => {
  it('none of them is handed to the modal with a title', () => {
    const offenders = MASTER_TITLES.filter((t) => APP.includes(`title: '${t}'`));
    expect(offenders).toEqual([]);
  });

  it('the item master renders full page from its own list', () => {
    expect(APP).toMatch(/const \[itemForm, setItemForm\] = useState\(null\)/);
    expect(APP).toMatch(/<ItemForm\s*\n\s*fullPage/);
  });

  /*
   * The exception, and it is one rule not a list of names: creating a master in
   * the middle of a document stays a dialog. Sending the document off screen to
   * name a customer is how you lose the document.
   */
  it('keeps the quick create inside a document a dialog', () => {
    expect(APP).toMatch(/title: 'New Ledger'/);
  });
});
