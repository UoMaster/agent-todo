import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// 开发时把 /api 请求代理到 server，避免跨域问题
const serverUrl = process.env.AGENT_TODO_SERVER ?? 'http://localhost:3001'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: serverUrl, changeOrigin: true },
    },
  },
})
