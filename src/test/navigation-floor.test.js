import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SRC = dirname(dirname(fileURLToPath(import.meta.url)));
const APP = readFileSync(join(SRC, 'App.jsx'), 'utf8');

/**
 * What is left when every module is switched off.
 *
 * A person who ticks nothing at signup must still be able to reach their own
 * data and their own settings — otherwise the product they land in cannot be
 * turned back on, and the choice they made ten seconds ago is unrecoverable.
 *
 * So the floor is: the core of Master Data and the core of Settings carry no
 * feature gate at all. Anything genuinely specific to a module — price lists,
 * discount rules, branches — is gated, and rightly.
 */

const groupSlice = (label) => {
  const at = APP.indexOf(`label: '${label}'`);
  expect(at).toBeGreaterThan(-1);
  return APP.slice(at, at + 6000);
};

const entryHasFeature = (slice, key) => {
  const m = slice.match(new RegExp(`\\{ key: '${key}',[^}]*\\}`));
  return m ? /feature:/.test(m[0]) : null;
};

describe('the navigation floor', () => {
  /* Without these a company cannot enter anything at all. */
  it('never hides the core of Master Data', () => {
    const slice = groupSlice('Master Data');
    for (const key of ['items', 'uoms', 'itemCategories', 'bankCash', 'gstRates']) {
      expect(`${key}:${entryHasFeature(slice, key)}`).toBe(`${key}:false`);
    }
  });

  /* Without these the choice made at signup could never be changed. */
  it('never hides the core of Settings', () => {
    const slice = groupSlice('Settings');
    for (const key of ['settingsModules', 'settingsFeatures', 'settingsCompany', 'settingsUsers', 'settingsRoles']) {
      expect(`${key}:${entryHasFeature(slice, key)}`).toBe(`${key}:false`);
    }
  });

  /*
   * Modules in particular. If that one were ever gated behind a feature, a user
   * who switched everything off would have no way back — the screen that turns
   * modules on would be the screen they had just turned off.
   */
  it('never hides the screen that turns modules back on', () => {
    expect(entryHasFeature(groupSlice('Settings'), 'settingsModules')).toBe(false);
  });
});
