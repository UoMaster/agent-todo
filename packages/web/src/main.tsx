import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// 全局样式：设计令牌 + 全局规则（index.css）→ UnoCSS 工具类（虚拟模块）
import './index.css'
import 'virtual:uno.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
