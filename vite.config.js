import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/kwim/',
  server: {
    host: '0.0.0.0', // Listen on all interfaces (Tailscale, LAN)
    port: 5173,
    proxy: {
      // Proxy API requests to backend
      '/api': {
        target: 'http://localhost:3002',
        changeOrigin: true,
      },
      // Proxy Socket.io connections to backend
      '/socket.io': {
        target: 'http://localhost:3002',
        ws: true,
        changeOrigin: true,
      },
    },
  },
})
