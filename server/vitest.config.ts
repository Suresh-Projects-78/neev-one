import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Creates prisma/test.db and pushes the schema before any test runs.
    globalSetup: ['src/__tests__/globalSetup.ts'],
    env: {
      // The suite owns its database. Sharing dev.db with a running dev server
      // made runs fail intermittently on SQLite write contention, which looked
      // like flaky application code and was not.
      // Relative SQLite paths resolve from the schema's directory
      // (server/prisma), the same way the dev URL "file:./dev.db" does.
      DATABASE_URL: 'file:./test.db',
      // Deterministic and fast: rate limiting is exercised by one test that
      // enables it explicitly, and 4 bcrypt rounds keep the suite quick.
      DISABLE_RATE_LIMIT: 'true',
      BCRYPT_ROUNDS: '4',
      JWT_SECRET: 'test-secret-do-not-use-in-production',
      // Failure-path tests point at a host that does not answer; a short
      // timeout keeps them fast instead of waiting on the OS.
      SMTP_TIMEOUT_MS: '800',
    },
    include: ['src/**/*.test.ts'],
    // The suite shares one SQLite file; parallel files would deadlock on writes.
    fileParallelism: false,
    hookTimeout: 60_000,
    testTimeout: 60_000,
  },
});
