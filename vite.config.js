import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Quick tunnels get a fresh random hostname each time they start, so the
    // host cannot be listed literally. Vite rejects unknown Host headers by
    // default (CVE-2025-31486), which shows up as a bare 403 from the tunnel.
    allowedHosts: ['.trycloudflare.com', 'localhost', '127.0.0.1'],
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4001',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  /**
   * The tunnel serves the built app, not the dev server.
   *
   * `vite dev` ships every source file as its own request — this app loads in
   * 611 of them. On this machine that is instant; through a tunnel, at well
   * over a second of latency each, the page takes minutes and some requests
   * simply never arrive, which is what "the external link does not work" was.
   * The build is a handful of files, so it travels.
   *
   * Preview needs its own host list and proxy: the `server` block above
   * applies to `vite dev` only.
   */
  preview: {
    allowedHosts: ['.trycloudflare.com', 'localhost', '127.0.0.1'],
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4001',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
