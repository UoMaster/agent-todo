/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 前端直接请求的 API 前缀，默认 /api（走 Vite 开发代理） */
  readonly VITE_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
