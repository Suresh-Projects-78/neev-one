import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // The suite shares one SQLite file; parallel files would deadlock on writes.
    fileParallelism: false,
    hookTimeout: 60_000,
    testTimeout: 60_000,
  },
});
