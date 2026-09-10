/**
 * Applies outstanding migrations, baselining an existing database first.
 *
 * Deploys used to run `prisma db push --accept-data-loss`: Prisma looks at the
 * schema, looks at the database, and works out the difference itself. That is
 * fine while nothing is at stake and wrong once there is data — no history, no
 * rollback, nothing to review before it runs, and no record of what was applied
 * where.
 *
 * The catch in switching is that every database that already exists was built
 * by `db push` and already has the tables the baseline migration would create.
 * Running it would fail on the first CREATE TABLE. So the baseline is recorded
 * as applied instead, once, and only when it has not been recorded already.
 *
 * Safe to run on every deploy and on a brand-new database, which is the point:
 * one command that does the right thing in both cases, rather than a step
 * somebody has to remember.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
// This package is ESM, so __dirname has to be derived.
const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = resolve(HERE, '..');
const MIGRATIONS = resolve(SERVER_ROOT, 'prisma/migrations');

const run = (args: string[]) =>
  execFileSync('npx', ['prisma', ...args], { cwd: SERVER_ROOT, stdio: 'inherit' });

/** The first migration on disk, which is the baseline by definition. */
const baselineName = () => {
  const dirs = readdirSync(MIGRATIONS, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  return dirs[0] || null;
};

async function alreadyRecorded(name: string) {
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ n: number }>>(
      'SELECT COUNT(*) AS n FROM _prisma_migrations WHERE migration_name = ?',
      name
    );
    return Number(rows?.[0]?.n || 0) > 0;
  } catch {
    // No _prisma_migrations table: this database has never been migrated.
    return false;
  }
}

/** Whether this database has any of our tables — i.e. db push built it. */
async function hasExistingSchema() {
  try {
    await prisma.$queryRawUnsafe('SELECT 1 FROM Account LIMIT 1');
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const baseline = baselineName();
  if (!baseline) {
    console.error('No migrations found. Nothing to apply.');
    process.exit(1);
  }

  const recorded = await alreadyRecorded(baseline);
  const existing = await hasExistingSchema();

  if (!recorded && existing) {
    /*
     * Built by db push before migrations existed. Record the baseline rather
     * than run it — the tables are already there and running it would fail on
     * the first CREATE TABLE.
     */
    console.log(`Baselining an existing database: marking ${baseline} as applied.`);
    await prisma.$disconnect();
    run(['migrate', 'resolve', '--applied', baseline]);
  } else {
    await prisma.$disconnect();
    if (!recorded) console.log('New database: the baseline will be applied like any other migration.');
  }

  run(['migrate', 'deploy']);
}

main().catch(async (e) => {
  console.error('Migration failed:', e instanceof Error ? e.message : e);
  await prisma.$disconnect();
  process.exit(1);
});
