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
})
