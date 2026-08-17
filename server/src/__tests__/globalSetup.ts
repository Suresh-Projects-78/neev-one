import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Gives the test suite its own SQLite file.
 *
 * The suite used to run against the same dev.db the dev server writes to, so
 * `npm test` while `npm start` was up produced intermittent failures that had
 * nothing to do with the code under test — two processes writing one SQLite
 * file. Tests now own their database and start from a known-empty schema.
 */
export default function setup() {
  const serverRoot = resolve(__dirname, '../..');
  const dbFile = resolve(serverRoot, 'prisma/test.db');

  // Start clean: a schema left over from an older run would hide migrations
  // that never got applied.
  for (const suffix of ['', '-journal']) {
    rmSync(`${dbFile}${suffix}`, { force: true });
  }

  execFileSync('npx', ['prisma', 'db', 'push', '--skip-generate', '--accept-data-loss'], {
    cwd: serverRoot,
    env: { ...process.env, DATABASE_URL: `file:${dbFile}` },
    stdio: 'inherit',
  });
}
