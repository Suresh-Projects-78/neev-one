/**
 * What this deploy will do to the data that is already there.
 *
 * Run against the LIVE database before deploying. It changes nothing unless
 * asked.
 *
 *   npx tsx scripts/preflight.ts          # report only
 *   npx tsx scripts/preflight.ts --fix    # also backfill company handles
 *
 * Exit code 1 means do not deploy yet.
 *
 * Deliberately standalone: it imports nothing from src/ and nothing that this
 * deploy adds. It runs on the server as it is NOW — which is the only moment a
 * pre-deploy check is any use — so every helper it needs is inlined rather than
 * imported. Two earlier versions of this file failed on exactly that, first by
 * querying a column the deploy had not created yet and then by importing a
 * module the deploy had not copied yet.
 *
 * The one change here that is not additive: `User.email` moves from
 * unique-per-account to unique across the product. If two accounts have
 * registered the same address, `prisma db push` either refuses or takes rows
 * with it. That is the blocking check.
 */
import { readFileSync } from 'node:fs';

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const FIX = process.argv.includes('--fix');
let blocking = 0;

/* Inlined from src/services/slug.ts, which is not on the server before deploy. */
const RESERVED = new Set(['www', 'api', 'app', 'admin', 'mail', 'static', 'assets', 'help', 'status', 'billing']);
const normaliseSlug = (raw: string) =>
  String(raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);

async function freeSlug(name: string, taken: Set<string>) {
  const base = normaliseSlug(name) || 'company';
  const seed = base.length >= 3 ? base : `${base}-co`;
  for (let n = 0; n < 50; n += 1) {
    const candidate = (n === 0 ? seed : `${seed}-${n + 1}`).slice(0, 32);
    if (RESERVED.has(candidate) || /^\d+$/.test(candidate)) continue;
    if (!taken.has(candidate)) return candidate;
  }
  return `${seed.slice(0, 25)}-${Date.now().toString(36).slice(-5)}`;
}

async function main() {
  console.log('Pre-deploy check\n================\n');

  /* 1. The only change that can lose rows. */
  const dupes = await prisma.$queryRawUnsafe<Array<{ email: string; n: number }>>(
    'SELECT lower(email) AS email, COUNT(*) AS n FROM User GROUP BY lower(email) HAVING n > 1'
  );
  if (dupes.length === 0) {
    console.log('email uniqueness   OK — no address is registered twice, so the constraint can tighten safely.');
  } else {
    blocking += 1;
    console.log(`email uniqueness   BLOCKED — ${dupes.length} address(es) registered more than once:`);
    for (const d of dupes.slice(0, 20)) console.log(`                     ${d.email}  x${d.n}`);
    console.log('                   Resolve these by hand first. db push cannot.');
  }

  /*
   * 2. Handles. Queried through raw SQL and guarded, because before the deploy
   * the column does not exist and the generated client does not know the field.
   */
  let orgRows: Array<{ id: string; name: string; slug: string | null }> | null = null;
  try {
    orgRows = await prisma.$queryRawUnsafe<Array<{ id: string; name: string; slug: string | null }>>(
      'SELECT id, name, slug FROM Org'
    );
  } catch {
    orgRows = null;
  }

  if (orgRows === null) {
    console.log('company handles    not applicable yet — the column arrives with this deploy. Re-run with');
    console.log('                   --fix afterwards to allot handles to the companies already there.');
  } else {
    const missing = orgRows.filter((o) => !o.slug);
    if (missing.length === 0) {
      console.log('company handles    OK — every company already has one.');
    } else if (!FIX) {
      console.log(`company handles    ${missing.length} company(ies) have none. Not blocking — nothing breaks without a`);
      console.log('                   handle — but they show none until backfilled. Re-run with --fix.');
    } else {
      const taken = new Set(orgRows.map((o) => o.slug).filter(Boolean) as string[]);
      console.log(`company handles    backfilling ${missing.length}...`);
      for (const org of missing) {
        const slug = await freeSlug(org.name || 'company', taken);
        taken.add(slug);
        await prisma.$executeRawUnsafe('UPDATE Org SET slug = ? WHERE id = ?', slug, org.id);
        console.log(`                     ${org.name} -> ${slug}`);
      }
    }
  }

  /*
   * What this deploy will actually add, read rather than recited.
   *
   * This paragraph used to be a hard-coded sentence naming the tables of the
   * deploy it was written for. It went on saying "AccountEntitlement,
   * PartyAddress, PartyContact" for every deploy after that one — so a reader
   * was told the check had verified this release when it had looked at nothing
   * of the kind. A safety report that describes the wrong release is worse than
   * one that says nothing, because it is believed.
   *
   * The schema file is next to this script and ships with it, so the models it
   * declares can be compared against the tables the live database actually has.
   */
  const declared = (() => {
    try {
      const schema = readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
      return [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map((m) => m[1]);
    } catch {
      return [];
    }
  })();

  const live = new Set(
    (
      await prisma.$queryRawUnsafe<Array<{ name: string }>>(
        "SELECT name FROM sqlite_master WHERE type = 'table'"
      )
    ).map((r) => r.name)
  );

  const arriving = declared.filter((m) => !live.has(m));
  if (!declared.length) {
    console.log('\nnew tables         could not read the schema next to this script, so this deploy has');
    console.log('                   not been compared against the live database. Check by hand.');
  } else if (arriving.length) {
    console.log(`\nnew tables         ${arriving.length} arriving: ${arriving.join(', ')}`);
    console.log('                   New tables touch no existing row.');
  } else {
    console.log('\nnew tables         none — every model this deploy declares already exists.');
  }

  const [{ n: orgs }] = await prisma.$queryRawUnsafe<Array<{ n: number }>>('SELECT COUNT(*) AS n FROM Org');
  const [{ n: users }] = await prisma.$queryRawUnsafe<Array<{ n: number }>>('SELECT COUNT(*) AS n FROM User');
  const [{ n: parties }] = await prisma.$queryRawUnsafe<Array<{ n: number }>>('SELECT COUNT(*) AS n FROM Party');
  console.log(`\nlive data          ${orgs} companies · ${users} users · ${parties} customers and vendors`);

  console.log(blocking ? '\nRESULT: DO NOT DEPLOY. Resolve the blocking item above.' : '\nRESULT: safe to deploy.');
  await prisma.$disconnect();
  process.exit(blocking ? 1 : 0);
}

main().catch(async (e) => {
  console.error('Pre-deploy check failed to run:', e);
  await prisma.$disconnect();
  process.exit(1);
});
