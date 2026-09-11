import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  SETTINGS_CATEGORIES,
  SETTINGS_ITEMS,
  breadcrumbFor,
  groupedForCategory,
  searchSettings,
  visibleCategories,
  visibleSettings,
} from './settingsRegistry';

/* src/features/settings/ → src/ */
const SRC = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const APP = readFileSync(join(SRC, 'App.jsx'), 'utf8');

const all = { can: () => true, isEnabled: () => true };

describe('nothing was lost on the way in', () => {
  /*
   * The rail group this replaces held thirty-four settings. A redesign that
   * quietly drops one is worse than the long rail it replaced: the setting is
   * still there, still doing something, and now unreachable.
   */
  it('every setting points at a screen the application already renders', () => {
    const missing = SETTINGS_ITEMS.filter((item) => !APP.includes(`case '${item.key}'`));
    expect(missing.map((m) => m.key)).toEqual([]);
  });

  it('every setting belongs to a category that exists', () => {
    const ids = new Set(SETTINGS_CATEGORIES.map((c) => c.id));
    expect(SETTINGS_ITEMS.filter((i) => !ids.has(i.category)).map((i) => i.key)).toEqual([]);
  });

  it('names each screen once', () => {
    const keys = SETTINGS_ITEMS.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('what a person may open', () => {
  /* The same two tests the rail applies, or a card counts what it cannot open. */
  it('hides a setting whose permission is refused', () => {
    const can = (p) => p !== 'SETTINGS::Users::VIEW';
    const keys = visibleSettings({ can, isEnabled: () => true }).map((i) => i.key);
    expect(keys).not.toContain('settingsUsers');
    expect(keys).toContain('settingsCompany');
  });

  it('hides a setting whose feature is switched off', () => {
    const isEnabled = (f) => f !== 'branches';
    const keys = visibleSettings({ can: () => true, isEnabled }).map((i) => i.key);
    expect(keys).not.toContain('settingsBranches');
  });

  it('drops a category once nothing in it is left', () => {
    const can = (p) => !['SETTINGS::Tax Settings::VIEW', 'MASTERS::GST Rates::VIEW'].includes(p);
    const ids = visibleCategories({ can, isEnabled: () => true }).map((c) => c.id);
    expect(ids).not.toContain('tax');
    expect(ids).toContain('organisation');
  });

  it('counts only what the card can open', () => {
    const can = (p) => p !== 'MASTERS::Company/Branch setup::VIEW';
    const org = visibleCategories({ can, isEnabled: () => true }).find((c) => c.id === 'organisation');
    expect(org.items.map((i) => i.key)).not.toContain('settingsBranches');
    expect(org.items.map((i) => i.key)).not.toContain('settingsWarehouses');
  });
});

describe('local navigation', () => {
  it('groups a long category under its own headings', () => {
    const groups = groupedForCategory('security', all);
    expect(groups.map((g) => g.name)).toEqual(['Access', 'Security']);
  });

  /* One heading over the whole list says nothing the page title has not said. */
  it('leaves a short category ungrouped', () => {
    const groups = groupedForCategory('tax', all);
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe('');
    expect(groups[0].items.map((i) => i.key)).toEqual(['settingsTax', 'gstRates']);
  });
});

describe('search finds what people type', () => {
  it('matches a word the title does not contain', () => {
    expect(searchSettings('password', all).map((i) => i.key)).toContain('settingsSecurity');
    expect(searchSettings('tds', all).map((i) => i.key)).toContain('settingsPaymentsReceipts');
    expect(searchSettings('godown', all).map((i) => i.key)).toContain('settingsWarehouses');
  });

  it('puts the setting actually called that first', () => {
    expect(searchSettings('gst', all)[0].key).toBe('settingsTax');
    expect(searchSettings('roles', all)[0].key).toBe('settingsRoles');
  });

  it('finds every invoice-related page from one word', () => {
    const keys = searchSettings('invoice', all).map((i) => i.key);
    expect(keys).toEqual(expect.arrayContaining(['settingsInvoiceFields', 'invoiceTemplates', 'recurringInvoices']));
  });

  it('never offers what the person cannot open', () => {
    const can = (p) => p !== 'SETTINGS::Users::VIEW';
    expect(searchSettings('users', { can, isEnabled: () => true }).map((i) => i.key)).not.toContain('settingsUsers');
  });

  it('returns nothing for nothing', () => {
    expect(searchSettings('   ', all)).toEqual([]);
  });
});

describe('breadcrumbs', () => {
  it('reads Settings / category / setting, with the last one not a link', () => {
    const crumbs = breadcrumbFor('settingsRoles');
    expect(crumbs.map((c) => c.label)).toEqual(['Settings', 'Users & Security', 'Roles']);
    expect(crumbs[0].target).toBe('settings');
    expect(crumbs[1].target).toBe('category:security');
    expect(crumbs.at(-1).target).toBeNull();
  });

  it('falls back to Settings alone for a key it does not know', () => {
    expect(breadcrumbFor('nonsense').map((c) => c.label)).toEqual(['Settings']);
  });
});
