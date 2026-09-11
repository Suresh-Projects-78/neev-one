import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = dirname(dirname(fileURLToPath(import.meta.url)));
const CSS = readFileSync(join(SRC, 'index.css'), 'utf8');
const APP = readFileSync(join(SRC, 'App.jsx'), 'utf8');

/**
 * Every glyph in the rail sits on one line.
 *
 * The rail indents a child under its module — that is how rank is read in a
 * tree. The collapse control carries no `data-level`, so it matched the child
 * rule and was pushed 2rem in: its icon sat half an inch right of every other
 * icon in the rail, under nothing.
 */

describe('the rail has one left edge', () => {
  it('does not indent the collapse control as a child', () => {
    /*
     * Every child rule the collapse could match excludes it by name. The
     * selected-child rules are not among them: they require
     * [data-active='true'], which the collapse never carries.
     */
    const childRules = [...CSS.matchAll(/\.ui-nav-item:not\(\[data-level='module'\]\)([^{]*)\{/g)]
      .map((m) => m[0])
      .filter((rule) => !rule.includes('data-active'));

    expect(childRules.length).toBeGreaterThan(0);
    for (const rule of childRules) {
      expect(rule).toContain(":not(.ui-nav-collapse)");
    }
  });

  it('still indents a real child', () => {
    /* The exclusion is for the collapse alone — the rule itself stands. */
    expect(CSS).toMatch(/:not\(\.ui-nav-collapse\)\s*\{[^}]*padding-inline-start:\s*2rem/);
  });

  it('keeps the control in the rail, where the icons are', () => {
    expect(APP).toMatch(/ui-nav-item ui-nav-collapse/);
  });
});
