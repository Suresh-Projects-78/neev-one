/**
 * What this deploy will do to the data that is already there.
 *
 * The deploy applies the schema with `prisma db push`, and the comment beside
 * it in deploy.sh says that is safe to repeat because it "leaves the data
 * alone". That has been true for every deploy so far, and it is NOT true for
 * this one: `User.email` moves from unique-per-account to unique across the
 * product. If two accounts have registered the same address, push either
 * refuses or takes rows with it.
 *
 * So this is run against the live database BEFORE deploying. It changes
 * nothing unless asked.
 *
 *   npx tsx scripts/preflight.ts          # report only
 *   npx tsx scripts/preflight.ts --fix    # also backfill the company handles
 *
 * Exit code 1 means do not deploy yet.
 */
import { prisma } from '../src/utils/prisma.js';
import { suggestSlug } from '../src/services/slug.js';

const FIX = process.argv.includes('--fix');
let blocking = 0;

async function main() {
  console.log('Pre-deploy check\n================\n');

  /* 1. The one change that can lose rows. */
  const dupes = await prisma.$queryRawUnsafe<Array<{ email: string; n: number }>>(
    'SELECT lower(email) AS email, COUNT(*) AS n FROM User GROUP BY lower(email) HAVING n > 1'
  );
  if (dupes.length === 0) {
    console.log('email uniqueness   OK — no address is registered twice, so the constraint can tighten safely.');
  } else {
    blocking += 1;
    console.log(`email uniqueness   BLOCKED — ${dupes.length} address(es) registered more than once:`);
    for (const d of dupes.slice(0, 20)) console.log(`                     ${d.email}  ×${d.n}`);
    console.log('                   Resolve these by hand before deploying. `db push` cannot.');
  }

  /* 2. Additive, but the feature is dead for existing rows until backfilled. */
  const noSlug = await prisma.org.findMany({
    where: { OR: [{ slug: null }, { slug: '' }] },
    select: { id: true, name: true },
  });
  if (noSlug.length === 0) {
    console.log('company handles    OK — every company already has one.');
  } else if (!FIX) {
    console.log(`company handles    ${noSlug.length} company(ies) have no handle. Not blocking — nothing breaks without`);
    console.log('                   one — but they will show none until backfilled. Re-run with --fix.');
  } else {
    console.log(`company handles    backfilling ${noSlug.length}…`);
    for (const org of noSlug) {
      const slug = await suggestSlug(org.name || 'company');
      await prisma.org.update({ where: { id: org.id }, data: { slug } });
      console.log(`                     ${org.name} -> ${slug}`);
    }
  }

  /* 3. Everything else in this deploy is additive; say so explicitly. */
  console.log('\nadditive only      AccountEntitlement, PartyAddress, PartyContact, and the new nullable');
  console.log('                   Party columns. These add tables and columns and touch no existing row.');

  const orgs = await prisma.org.count();
  const users = await prisma.user.count();
  const parties = await prisma.party.count();
  console.log(`\nlive data          ${orgs} companies · ${users} users · ${parties} customers and vendors`);

  console.log(
    blocking
      ? '\nRESULT: DO NOT DEPLOY. Resolve the blocking item above first.'
      : '\nRESULT: safe to deploy.'
  );
  process.exit(blocking ? 1 : 0);
}

main().catch((e) => {
  console.error('Pre-deploy check failed to run:', e);
  process.exit(1);
});
