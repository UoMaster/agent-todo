import { mkdir } from 'node:fs/promises'
import { serve } from '@hono/node-server'
import { app } from './app.ts'
import { config } from './config.ts'
import { closeDb, getSqlClient } from './db.ts'
import { runMigrations } from './migrations.ts'

async function bootstrap() {
  // 上传目录（未来的图片上传）：提前建好，顺便验证数据卷可写
  try {
    await mkdir(config.uploadsDir, { recursive: true })
  } catch (error) {
    console.error(`[server] 无法创建上传目录 ${config.uploadsDir}`, error)
  }

  // 启动时自动迁移：失败不阻塞启动，状态可以在 /api/health 里看到
  const sql = getSqlClient()
  if (sql) {
    try {
      await runMigrations(sql, config.migrationsDir)
    } catch (error) {
      console.error('[server] 数据库迁移失败，服务仍会启动（/api/health 会显示数据库状态）', error)
    }
  } else {
    console.warn('[server] 未配置 DATABASE_URL，数据库相关功能不可用')
  }

  const server = serve({ fetch: app.fetch, port: config.port, hostname: config.hostname }, (info) => {
    console.log(`🟠 agent-todo server: http://${config.hostname}:${info.port}`)
    console.log(`   静态目录: ${config.staticDir ?? '(未开启，纯 API 模式)'}`)
    console.log(`   上传目录: ${config.uploadsDir}`)
  })

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      server.close(() => {
        void closeDb().finally(() => process.exit(0))
      })
    })
  }
}

void bootstrap()
