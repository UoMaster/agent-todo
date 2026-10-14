import { serve } from '@hono/node-server'
import { app } from './app.ts'

const port = Number(process.env.PORT ?? 3001)

const server = serve({ fetch: app.fetch, port, hostname: 'localhost' }, (info) => {
  console.log(`🟠 agent-todo server: http://localhost:${info.port}`)
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0))
  })
}
