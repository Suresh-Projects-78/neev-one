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

  /*
   * Payroll is a separate database, so it is a separate push. Relative SQLite
   * paths resolve from the schema's own directory, which for payroll is
   * `prisma/payroll` — the file lands beside its schema, not beside the
   * accounting one.
   */
  const pushPayroll = (url: string) =>
    execFileSync(
      'npx',
      ['prisma', 'db', 'push', '--schema', 'prisma/payroll/schema.prisma', '--skip-generate', '--accept-data-loss', '--force-reset'],
      { cwd: serverRoot, env: { ...process.env, PAYROLL_DATABASE_URL: url }, stdio: 'inherit' }
    );

  const pushPeople = (url: string) =>
    execFileSync(
      'npx',
      ['prisma', 'db', 'push', '--schema', 'prisma/people/schema.prisma', '--skip-generate', '--accept-data-loss', '--force-reset'],
      { cwd: serverRoot, env: { ...process.env, PEOPLE_DATABASE_URL: url }, stdio: 'inherit' }
    );

  const peopleUrl = String(process.env.PEOPLE_DATABASE_URL || '').trim();
  const peopleFile = peopleUrl.startsWith('file:')
    ? resolve(serverRoot, 'prisma/people', peopleUrl.slice('file:'.length).split('?')[0].replace(/^\.\//, ''))
    : '';

  const payrollUrl = String(process.env.PAYROLL_DATABASE_URL || '').trim();
  const payrollFile = payrollUrl.startsWith('file:')
    ? resolve(serverRoot, 'prisma/payroll', payrollUrl.slice('file:'.length).split('?')[0].replace(/^\.\//, ''))
    : '';

  /*
   * Pointed at Postgres, there is no file to delete and the schema is pushed to
   * whatever TEST_DATABASE_URL names. The suite itself is identical either way.
   */
  const external = String(process.env.TEST_DATABASE_URL || '').trim();
  if (external) {
    execFileSync('npx', ['prisma', 'db', 'push', '--skip-generate', '--accept-data-loss', '--force-reset'], {
      cwd: serverRoot,
      env: { ...process.env, DATABASE_URL: external },
      stdio: 'inherit',
    });
    if (payrollUrl) pushPayroll(payrollUrl);
    if (peopleUrl) pushPeople(peopleUrl);
    return;
  }

  /*
   * The file vitest.config.ts chose for this run. Reading it back rather than
   * naming it again keeps the two halves of the run from disagreeing about
   * which database they are using — which is how one run came to reset another
   * run's database mid-flight.
   */
  const configured = String(process.env.DATABASE_URL || '').trim();
  const fromUrl = configured.startsWith('file:')
    ? configured.slice('file:'.length).split('?')[0]
    : 'prisma/test.db';
  const dbFile = resolve(serverRoot, fromUrl.startsWith('/') ? fromUrl : `prisma/${fromUrl.replace(/^\.\//, '')}`);

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

  if (payrollUrl) {
    for (const suffix of ['', '-journal']) rmSync(`${payrollFile}${suffix}`, { force: true });
    pushPayroll(payrollUrl);
  }
  if (peopleUrl) {
    for (const suffix of ['', '-journal']) rmSync(`${peopleFile}${suffix}`, { force: true });
    pushPeople(peopleUrl);
  }

  // Per-run databases would otherwise pile up in prisma/ one file per run.
  return () => {
    for (const suffix of ['', '-journal']) {
      rmSync(`${dbFile}${suffix}`, { force: true });
      if (payrollFile) rmSync(`${payrollFile}${suffix}`, { force: true });
      if (peopleFile) rmSync(`${peopleFile}${suffix}`, { force: true });
    }
  };
}
