/// <reference types="vitest/browser" />

import 'vitest'

declare module 'vitest' {
  // 通过 globalSetup 的 provide / 测试里的 inject 传递的上下文
  interface ProvidedContext {
    /** 假 server 的地址（测试控制端点 /__test/* 用） */
    fakeServerUrl: string
  }
}
