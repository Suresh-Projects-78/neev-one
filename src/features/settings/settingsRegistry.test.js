import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  SETTINGS_CATEGORIES,
  SETTINGS_ITEMS,
  breadcrumbFor,
  isSettingsKey,
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

describe('a whole screen is not framed as a settings panel', () => {
  /*
   * Recurring Invoices arrived in Settings with its own title, toolbar, five
   * summary tiles and a filterable table — and the settings frame added a
   * breadcrumb and a second copy of the title above it, then squeezed the
   * table into the column left over beside the settings nav.
   *
   * The rule that catches the next one: if the screen a setting opens renders
   * DocumentListShell, it is a list, not a setting, and must not be framed.
   */
  const SRC_DIR = SRC;

  /** The component App returns for a key, read from its case arm. */
  const componentFor = (key) => {
    const at = APP.indexOf(`case '${key}':`);
    if (at < 0) return null;
    const arm = APP.slice(at, at + 800);
    const m = arm.match(/return\s*\(?\s*<([A-Z][A-Za-z0-9]*)/);
    return m ? m[1] : null;
  };

  /**
   * Whether that component builds a document list.
   *
   * Scoped to the component's own body, not its file: most of these live in
   * App.jsx, which mentions DocumentListShell in dozens of screens that have
   * nothing to do with this one. A file-level grep called every one of them a
   * list.
   */
  const isDocumentList = (name) => {
    if (!name) return false;
    const files = execSync(
      `grep -rl "const ${name} = \\|function ${name}(" ${JSON.stringify(SRC_DIR)} --include=*.jsx || true`,
      { encoding: 'utf8' }
    )
      .split('\n')
      .filter(Boolean);

    return files.some((f) => {
      const src = readFileSync(f, 'utf8');
      const at = Math.max(src.indexOf(`const ${name} = `), src.indexOf(`function ${name}(`));
      if (at < 0) return false;
      /* To the next top-level declaration, which is where this one ends. */
      const rest = src.slice(at + 1);
      const next = rest.search(/\n(?:export )?(?:const|function) [A-Z]/);
      return (next < 0 ? rest : rest.slice(0, next)).includes('DocumentListShell');
    });
  };

  it('no framed setting opens onto a document list', () => {
    const framed = SETTINGS_ITEMS.filter((i) => !i.standalone);
    const wrong = framed.filter((i) => isDocumentList(componentFor(i.key)));
    expect(wrong.map((i) => i.key)).toEqual([]);
  });

  it('opens the standalone ones outside the frame', () => {
    expect(isSettingsKey('recurringInvoices')).toBe(false);
    expect(isSettingsKey('paymentReminders')).toBe(false);
    /* A real settings panel still gets the frame. */
    expect(isSettingsKey('settingsTax')).toBe(true);
  });

  it('still lists and finds them in Settings', () => {
    /* Leaving the frame must not mean leaving Settings — this is where people
       look for them. */
    expect(searchSettings('recurring', all).map((i) => i.key)).toContain('recurringInvoices');
    const business = visibleCategories(all).find((c) => c.id === 'business');
    expect(business.items.map((i) => i.key)).toContain('recurringInvoices');
  });
});
