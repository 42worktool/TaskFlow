import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

// 개발 브라우저는 Vite 한 곳에만 접속하고, API·업로드·WebSocket 요청은 backend로
// 프록시한다. 같은 origin을 유지해 운영 nginx 경로와 개발 동작의 차이를 줄인다.
export default defineConfig({
  plugins: [vue(), tailwindcss()],
  server: {
    allowedHosts: ['transcendence.kro.kr'],
    proxy: {
      '/api': {
        target: process.env.VITE_PROXY_TARGET || 'http://localhost:3000',
      },
      '/uploads': {
        target: process.env.VITE_PROXY_TARGET || 'http://localhost:3000',
      },
      '/ws': {
        target: process.env.VITE_PROXY_TARGET || 'http://localhost:3000',
        // 일반 HTTP 프록시와 달리 upgrade 연결을 전달해야 realtime 연결이 유지된다.
        ws: true,
      },
    },
  },
})
