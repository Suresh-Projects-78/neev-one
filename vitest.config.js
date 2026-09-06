import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * The web tests. `npm test` runs the server suite; this is the other half.
 *
 * It exists because the keyboard in this product kept being fixed by
 * reasoning about it. Focus, portals and event order are precisely the things
 * that cannot be read off the source — a picker whose arrows look correct in
 * the file can still be answering to the form behind it — so they get run
 * instead of argued about.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{js,jsx}'],
    setupFiles: ['src/test/setup.js'],
    globals: true,
    css: false,
  },
});
