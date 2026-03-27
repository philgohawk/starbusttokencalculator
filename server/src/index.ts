import { config } from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'

import type { CompareRequestBody } from './compare.js'
import { runCompare } from './compare.js'
import {
  hasOpenAiConfigured,
  MEASURE_SYSTEM_PROMPT,
  measureChatCompletionUsage,
} from './llmUsage.js'

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = path.resolve(serverRoot, '..')
/** Repo root first, then server paths with override so a real key in server/src/.env or server/.env wins over an empty shell/root value. */
config({ path: path.join(repoRoot, '.env') })
config({ path: path.join(serverRoot, 'src', '.env'), override: true })
config({ path: path.join(serverRoot, '.env'), override: true })

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

type MeasureBody = { standardPrompt?: string; starbustPrompt?: string }

app.post('/api/measure-llm-tokens', async (c) => {
  if (!hasOpenAiConfigured()) {
    return c.json(
      {
        ok: false as const,
        error: 'OPENAI_API_KEY is not set',
        hints: [
          'Add OPENAI_API_KEY to server/.env (or repo root .env). Optional: OPENAI_MODEL, OPENAI_BASE_URL for compatible gateways.',
        ],
      },
      400,
    )
  }

  let body: MeasureBody = {}
  try {
    const j = await c.req.json()
    if (j && typeof j === 'object') body = j as MeasureBody
  } catch {
    body = {}
  }

  const standard = typeof body.standardPrompt === 'string' ? body.standardPrompt : ''
  const starbust = typeof body.starbustPrompt === 'string' ? body.starbustPrompt : ''
  if (!standard.trim() && !starbust.trim()) {
    return c.json(
      { ok: false as const, error: 'Provide standardPrompt and/or starbustPrompt strings.' },
      400,
    )
  }

  try {
    let standardUsage: {
      promptTokens: number
      completionTokens: number
      outputText: string
    } | null = null
    let starbustUsage: {
      promptTokens: number
      completionTokens: number
      outputText: string
    } | null = null
    let model = ''

    if (standard.trim()) {
      const u = await measureChatCompletionUsage({
        systemContent: MEASURE_SYSTEM_PROMPT,
        userContent:
          `${standard}\n\n---\n\nRespond with SQL (dialect-appropriate) and a brief rationale for the user question implied above.`,
      })
      model = u.model
      standardUsage = {
        promptTokens: u.promptTokens,
        completionTokens: u.completionTokens,
        outputText: u.outputText,
      }
    }

    if (starbust.trim()) {
      const u = await measureChatCompletionUsage({
        systemContent: MEASURE_SYSTEM_PROMPT,
        userContent:
          `${starbust}\n\n---\n\nRespond with SQL and a brief rationale for the user question implied above (compact schema path).`,
      })
      model = u.model
      starbustUsage = {
        promptTokens: u.promptTokens,
        completionTokens: u.completionTokens,
        outputText: u.outputText,
      }
    }

    return c.json({
      ok: true as const,
      model,
      standard: standardUsage,
      starbust: starbustUsage,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return c.json({ ok: false as const, error: msg }, 502)
  }
})

const port = Number(process.env.PORT) || 8787

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`API listening on http://localhost:${info.port}`)
})
