import { defineConfig } from 'vitest/config';

/**
 * One database per run, not one database.
 *
 * The suite shared `prisma/test.db`, and globalSetup resets it before anything
 * starts. Two runs at once — a watch and a one-off, two terminals, a script
 * touching the file — meant the second reset the database out from under the
 * first, and tests failed to collect with nothing wrong with them. It looked
 * like flakiness and was contention.
 *
 * Keyed on the process id so concurrent runs cannot collide. Overridable with
 * TEST_DATABASE_URL, which is also how the same suite is pointed at Postgres:
 *
 *   TEST_DATABASE_URL=postgresql://…  npm test
 */
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL || `file:./test-${process.pid}.db?connection_limit=1`;

// globalSetup runs in this same process and reads it from here.
process.env.DATABASE_URL = TEST_DATABASE_URL;

export default defineConfig({
  test: {
    environment: 'node',
    // Kills global-agent keep-alive; see the file for the port-reuse race.
    setupFiles: ['src/__tests__/setupAgent.ts'],
    // Creates prisma/test.db and pushes the schema before any test runs.
    globalSetup: ['src/__tests__/globalSetup.ts'],
    env: {
      // The suite owns its database. Sharing dev.db with a running dev server
      // made runs fail intermittently on SQLite write contention, which looked
      // like flaky application code and was not.
      // Relative SQLite paths resolve from the schema's directory
      // (server/prisma), the same way the dev URL "file:./dev.db" does.
      // connection_limit=1: Prisma keeps a small pool even for SQLite, and two
      // connections to one file turn into "database is locked" retries and
      // occasional stale reads right after a write. One connection makes every
      // query strictly serial, which is exactly what a test suite wants.
      // Set above, and shared with globalSetup through the environment so both
      // halves of the run agree on which database they are using.
      DATABASE_URL: TEST_DATABASE_URL,
      // Deterministic and fast: rate limiting is exercised by one test that
      // enables it explicitly, and 4 bcrypt rounds keep the suite quick.
      DISABLE_RATE_LIMIT: 'true',
      BCRYPT_ROUNDS: '4',
      JWT_SECRET: 'test-secret-do-not-use-in-production',
      // CI has no .env; without these jsonwebtoken rejects sign options.
      JWT_ISSUER: 'accounting',
      JWT_AUDIENCE: 'accounting-web',
      // Failure-path tests point at a host that does not answer; a short
      // timeout keeps them fast instead of waiting on the OS.
      SMTP_TIMEOUT_MS: '800',
    },
    include: ['src/**/*.test.ts'],
    // The suite shares one SQLite file; parallel files would deadlock on writes.
    fileParallelism: false,
    // One process for the whole suite, not one worker per file. With a worker
    // per file, fire-and-forget async work from a finished file (mailer
    // deliveries writing outbox rows) keeps hitting SQLite while the next
    // file's worker starts its own connection — "database is locked" then
    // surfaces as random 401/403/500s and socket hangups. A single fork means
    // one Prisma client serialising every write.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    hookTimeout: 60_000,
    testTimeout: 60_000,
  },
});
