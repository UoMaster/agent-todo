import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import UnoCSS from '@unocss/vite'
import { defineConfig } from 'vite'

// 开发时把 /api 请求代理到 server，避免跨域问题
const serverUrl = process.env.AGENT_TODO_SERVER ?? 'http://localhost:3001'

// 显式指定 UnoCSS 配置：默认按 process.cwd() 查找，从仓库根跑（pnpm test / verify）会找不到
const unoConfigFile = fileURLToPath(new URL('./uno.config.ts', import.meta.url))

export default defineConfig({
  plugins: [UnoCSS({ configFile: unoConfigFile }), react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: serverUrl, changeOrigin: true },
    },
  },
})
