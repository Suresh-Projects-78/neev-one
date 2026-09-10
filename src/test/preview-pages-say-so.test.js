import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
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
 * Screens for billing, single sign-on and company subdomains were built ahead
 * of the services behind them. That is a reasonable way to build — the layout,
 * the copy and the shape of the data get settled while the integration is still
 * a decision.
 *
 * What is not reasonable is a screen that looks live and is not. Somebody
 * demonstrates it to a customer, the customer believes the product does this
 * today, and nobody finds out until it has been promised.
 *
 * So: any page carrying invented data has to render <NotConnected>, and the
 * rule is enforced here rather than remembered.
 */
const PREVIEW_PAGES = ['features/account/BillingPreview.jsx', 'features/account/SsoSettings.jsx'];

describe('a page that is not wired says so', () => {
  it.each(PREVIEW_PAGES)('%s declares itself a preview', (rel) => {
    const text = readFileSync(join(SRC, rel), 'utf8');
    expect(text).toMatch(/<NotConnected/);
  });

  /*
   * Sample data is the specific danger, because it is the part a viewer reads
   * as fact. Anything naming its rows SAMPLE_ must also say they are samples.
   */
  it('marks invented figures as invented', () => {
    const unmarked = [];
    for (const file of jsxFiles(SRC)) {
      const text = readFileSync(file, 'utf8');
      if (!/\bSAMPLE_[A-Z_]+\s*=/.test(text)) continue;
      if (!/sample\b/i.test(text) || !/<NotConnected[^>]*\bsample\b/.test(text)) {
        unmarked.push(relative(SRC, file));
      }
    }
    expect(unmarked).toEqual([]);
  });

  /*
   * The one mock that is genuinely unsafe. A control that appears to sign
   * somebody in and does not is telling them something untrue about who can
   * reach their books, so the SSO page carries no interactive control at all.
   */
  it('offers no sign-in control on a page where sign-on does not work', () => {
    const text = readFileSync(join(SRC, 'features/account/SsoSettings.jsx'), 'utf8');
    expect(text).not.toMatch(/<button/i);
    expect(text).not.toMatch(/<input/i);
    expect(text).not.toMatch(/<form/i);
  });
});
