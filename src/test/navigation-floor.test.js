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

  /*
   * Without these the choice made at signup could never be changed.
   *
   * Settings is no longer a group in the rail — it is a workspace of its own,
   * built from the registry — so the floor is checked where the settings now
   * live rather than where they used to be listed.
   */
  it('never hides the core of Settings', async () => {
    const { SETTINGS_ITEMS } = await import('../features/settings/settingsRegistry');
    for (const key of ['settingsModules', 'settingsFeatures', 'settingsCompany', 'settingsUsers', 'settingsRoles']) {
      const item = SETTINGS_ITEMS.find((i) => i.key === key);
      expect(`${key}:${Boolean(item)}`).toBe(`${key}:true`);
      expect(`${key}:${item.feature ?? 'none'}`).toBe(`${key}:none`);
    }
  });

  /*
   * Modules in particular. If that one were ever gated behind a feature, a user
   * who switched everything off would have no way back — the screen that turns
   * modules on would be the screen they had just turned off.
   */
  it('never hides the screen that turns modules back on', async () => {
    const { SETTINGS_ITEMS } = await import('../features/settings/settingsRegistry');
    expect(SETTINGS_ITEMS.find((i) => i.key === 'settingsModules')?.feature ?? 'none').toBe('none');
  });

  /* And Settings itself is still one entry in the rail, reachable from it. */
  it('keeps a Settings entry in the rail', () => {
    expect(APP).toMatch(/key: 'settings', label: 'Settings'/);
  });
});
