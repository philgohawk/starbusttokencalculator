import 'dotenv/config'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'

import type { CompareRequestBody } from './compare.js'
import { runCompare } from './compare.js'

const app = new Hono()

app.use(
  '/*',
  cors({
    origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  }),
)

app.get('/api/health', (c) => c.json({ ok: true as const }))

app.post('/api/compare-context', async (c) => {
  let body: CompareRequestBody | undefined
  try {
    const j = await c.req.json()
    if (j && typeof j === 'object') body = j as CompareRequestBody
  } catch {
    body = undefined
  }
  const result = await runCompare(body)
  if (!result.ok) return c.json(result, 400)
  return c.json(result)
})

const port = Number(process.env.PORT) || 8787

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`API listening on http://localhost:${info.port}`)
})
