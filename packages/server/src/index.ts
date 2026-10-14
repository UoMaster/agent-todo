import { Elysia } from 'elysia'

const port = Number(process.env.PORT ?? 3001)

export const app = new Elysia().get('/', () => 'agent-todo server')

app.listen({ port, hostname: 'localhost' })

console.log(`🦊 agent-todo server: http://localhost:${app.server?.port ?? port}`)
