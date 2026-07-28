import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  server: {
    allowedHosts: ['transcendence.kro.kr'],
    proxy: {
      '/api': {
        target: process.env.VITE_PROXY_TARGET || 'http://localhost:3000',
      },
      '/ws': {
        target: process.env.VITE_PROXY_TARGET || 'http://localhost:3000',
        ws: true,
      },
    },
  },
})
