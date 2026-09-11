import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (p) => readFileSync(join(SRC, p), 'utf8');

/**
 * Every landing screen opens with the same band.
 *
 * Home had it and the modules did not: Sales, Purchases and Inventory each
 * opened with a plain heading and a sentence, so moving from Home into a module
 * changed the shape and the ground at the top of the page for no reason a
 * reader could name.
 *
 * Stated as "they all use the one component", not "they all look alike",
 * because two copies of the same markup drift and a shared one cannot.
 */

const LANDINGS = [
  'features/dashboard/DashboardOverview.jsx',
  'features/sales/SalesOverview.jsx',
  'features/purchase/PurchaseOverview.jsx',
];

describe('the landing band is one component', () => {
  it('is used by Home and by the module overviews', () => {
    for (const file of LANDINGS) {
      const source = read(file);
      expect(source).toMatch(/import HeroBand from/);
      expect(source).toMatch(/<HeroBand/);
    }
  });

  it('none of them prints its own heading instead', () => {
    /* A landing that still writes <h1 className="ui-t-page"> by hand is one
       that has drifted back out of the band. */
    for (const file of LANDINGS.slice(1)) {
      expect(read(file)).not.toMatch(/<h1 className="ui-t-page">/);
    }
  });

  it('the band owns the shape, so a caller cannot set it', () => {
    const band = read('components/ui/HeroBand.jsx');
    /* Size, spacing and the actions row live here and take no prop. */
    expect(band).toMatch(/fontSize: '1\.75rem'/);
    expect(band).toMatch(/ui-btn ui-btn-primary/);
    expect(band).not.toMatch(/className=\{.*props/);
  });
});
