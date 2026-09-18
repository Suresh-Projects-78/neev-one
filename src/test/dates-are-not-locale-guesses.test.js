/**
 * @vitest-environment node
 *
 * No accounting date is rendered by asking the browser what shape a date is.
 *
 * `toLocaleDateString()` with no locale hands the decision to whatever machine
 * the page opened on. Seven screens did that, and on a US-locale browser a
 * ledger dated 2026-12-09 read as the twelfth of September — the right number
 * and the wrong day, on a document someone files a return from.
 *
 * The product's format is `dd/mm/yyyy`, produced by `formatDateIn`. A call
 * that passes an explicit locale AND options is a deliberate choice (a chart's
 * month label, a datetime beside a login) and is left alone; a bare call is
 * not a choice at all.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/*
 * Exports carry the same defect and are not fixed yet: the ledger statement
 * PDF, CSV and HTML still head themselves with a browser-shaped date. They are
 * listed so this test guards the screens today without pretending the
 * documents are clean — delete the entry when they are fixed, never add one.
 */
const KNOWN = new Set(['src/utils/ledgerExport.js']);

const sources = () =>
  execSync("git ls-files 'src/**/*.js' 'src/**/*.jsx' 'src/*.jsx'", { cwd: root, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .filter((f) => !f.includes('.test.'));

/** A locale-free date call: `toLocaleDateString()` with nothing passed. */
const BARE = /\.toLocaleDateString\(\s*\)/g;

const offenders = () => {
  const out = [];
  for (const file of sources()) {
    const rel = relative(root, resolve(root, file));
    if (KNOWN.has(rel)) continue;
    const lines = readFileSync(resolve(root, file), 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (BARE.test(line)) out.push(`${rel}:${i + 1}`);
      BARE.lastIndex = 0;
    });
  }
  return out;
};

describe('accounting dates', () => {
  it('are never left to the browser locale', () => {
    expect(offenders()).toEqual([]);
  });

  it('still has the export defect on the list, so the list stays honest', () => {
    /* If someone fixes ledgerExport.js and forgets to remove it from KNOWN,
       this fails and tells them to. */
    const stillBare = readFileSync(resolve(root, 'src/utils/ledgerExport.js'), 'utf8');
    expect(stillBare).toMatch(BARE);
  });

  it('has files to check, so an empty search cannot pass it', () => {
    expect(sources().length).toBeGreaterThan(100);
  });
});
