import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/* src/test/ → src/ */
const SRC = dirname(dirname(fileURLToPath(import.meta.url)));

/**
 * A series is corrected on the document that is using it.
 *
 * The invoice and the bill each grew the gear separately and every other
 * document had none, so changing a purchase order's prefix meant abandoning a
 * half-typed order for Settings. A series is nearly always realised to be
 * wrong WHILE a document is being typed — the year turned over, or the prefix
 * is last company's — and that is the moment it has to be reachable.
 */

/** Every file that allots a number from a local series. */
const filesAllotting = (voucherKey) =>
  execSync(`grep -rl "voucherKey: '${voucherKey}'" ${JSON.stringify(SRC)} --include=*.jsx || true`, {
    encoding: 'utf8',
  })
    .split('\n')
    .filter(Boolean)
    .filter((f) => !/\.test\.jsx?$/.test(f));

/** Whether that file also offers the series control. */
const carriesTheGear = (file) => {
  const src = readFileSync(file, 'utf8');
  return /DocNumberField|DocNumberingPopover|numbering=\{\{/.test(src);
};

describe('the numbering control', () => {
  /*
   * Receipts are missing on purpose: their number comes back from the server's
   * own series, so a local series panel would edit something the document does
   * not use. That is a different fix — see the numbering decision — and a
   * panel that silently edits the wrong series is worse than none.
   */
  const LOCAL_SERIES = [
    'invoice',
    'bill',
    'estimate',
    'creditNote',
    'debitNote',
    'purchaseOrder',
    'salesOrder',
    'deliveryChallan',
    'expense',
    'journalEntry',
  ];

  for (const key of LOCAL_SERIES) {
    it(`is on the form that allots a ${key} number`, () => {
      const files = filesAllotting(key);
      expect(files.length).toBeGreaterThan(0);
      expect(files.filter((f) => !carriesTheGear(f))).toEqual([]);
    });
  }
});
