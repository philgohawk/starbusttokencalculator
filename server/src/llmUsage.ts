const DEFAULT_BASE = 'https://api.openai.com/v1'

export type ChatCompletionUsage = {
  promptTokens: number
  completionTokens: number
  totalTokens: number
  model: string
  /** Decoded assistant message (completion) text. */
  outputText: string
}

function contentPartToText(part: unknown): string {
  if (typeof part === 'string') return part
  if (typeof part !== 'object' || part === null) return ''
  const o = part as Record<string, unknown>
  const typ = o.type
  if (typ === 'refusal' && typeof o.refusal === 'string') return o.refusal
  for (const k of ['text', 'output_text']) {
    const v = o[k]
    if (typeof v === 'string') return v
  }
  return ''
}

/** Normalize `message.content` from Chat Completions (string or content-part array). */
export function normalizeAssistantContent(content: unknown): string {
  if (content == null) return ''
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content.map(contentPartToText).filter(Boolean).join('')
  }
  return String(content)
}

/** Decode visible assistant text from a Chat Completions `message` object. */
export function assistantMessageToText(message: unknown): string {
  if (message == null || typeof message !== 'object') return ''
  const m = message as Record<string, unknown>
  const fromContent = normalizeAssistantContent(m.content).trim()
  if (fromContent) return fromContent

  if (typeof m.refusal === 'string' && m.refusal.trim()) return m.refusal

  const audio = m.audio
  if (typeof audio === 'object' && audio !== null) {
    const tr = (audio as Record<string, unknown>).transcript
    if (typeof tr === 'string' && tr.trim()) return tr
  }

  const tc = m.tool_calls
  if (Array.isArray(tc) && tc.length > 0) {
    const names = tc.map((t) => {
      if (typeof t === 'object' && t !== null) {
        const fn = (t as Record<string, unknown>).function
        if (
          typeof fn === 'object' &&
          fn !== null &&
          typeof (fn as Record<string, unknown>).name === 'string'
        ) {
          return (fn as { name: string }).name
        }
      }
      return '(tool)'
    })
    return `(Assistant returned ${tc.length} tool call(s): ${names.join(', ')}.)`
  }

  return ''
}

function assistantTextFromChatJson(json: {
  choices?: Array<{ message?: unknown; finish_reason?: string }>
}): string {
  const choices = json.choices ?? []
  for (const ch of choices) {
    const t = assistantMessageToText(ch?.message)
    if (t.trim()) return t
  }
  const first = choices[0]
  if (first?.finish_reason === 'content_filter') {
    return '(Assistant output was withheld: content_filter.)'
  }
  if (first?.finish_reason === 'length') {
    return '(Assistant text was empty; finish_reason=length — try raising max_completion_tokens.)'
  }
  return ''
}

/** GPT-5 / o-series often only support default sampling; omit `temperature` for them. */
export function modelSupportsCustomTemperature(model: string): boolean {
  const m = model.trim().toLowerCase()
  return !m.startsWith('gpt-5') && !/^o\d/.test(m)
}

export function hasOpenAiConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim())
}

export function openAiModel(): string {
  return process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini'
}

/**
 * GPT-5 / some o-series Chat Completions reject `max_tokens` and require
 * `max_completion_tokens`. GPT-4-style models still expect `max_tokens`.
 * Set OPENAI_USE_MAX_COMPLETION_TOKENS=1 for compatible gateways that match the new shape only.
 */
export function chatCompletionOutputCap(
  model: string,
  max: number,
): { max_tokens: number } | { max_completion_tokens: number } {
  const m = model.trim().toLowerCase()
  if (
    process.env.OPENAI_USE_MAX_COMPLETION_TOKENS?.trim() === '1' ||
    m.startsWith('gpt-5') ||
    /^o\d/.test(m)
  ) {
    return { max_completion_tokens: max }
  }
  return { max_tokens: max }
}

/**
 * One chat completion; returns billable usage from the API response (not local BPE).
 * Works with OpenAI and most OpenAI-compatible gateways ((OPENAI_BASE_URL)/chat/completions).
 */
export async function measureChatCompletionUsage(params: {
  systemContent: string
  userContent: string
  maxCompletionTokens?: number
}): Promise<ChatCompletionUsage> {
  const key = process.env.OPENAI_API_KEY?.trim()
  if (!key) throw new Error('OPENAI_API_KEY is not set')

  const base = (process.env.OPENAI_BASE_URL ?? DEFAULT_BASE).replace(/\/$/, '')
  const model = openAiModel()

  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: 'system', content: params.systemContent },
      { role: 'user', content: params.userContent },
    ],
    ...chatCompletionOutputCap(model, params.maxCompletionTokens ?? 2048),
  }
  if (modelSupportsCustomTemperature(model)) {
    body.temperature = 0
  }

  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const raw = await res.text()
  if (!res.ok) {
    throw new Error(
      `Chat Completions HTTP ${res.status}: ${raw.slice(0, 600)}`,
    )
  }

  let json: {
    model?: string
    choices?: Array<{ message?: unknown; finish_reason?: string }>
    usage?: {
      prompt_tokens?: number
      completion_tokens?: number
      total_tokens?: number
    }
  }
  try {
    json = JSON.parse(raw) as typeof json
  } catch {
    throw new Error('Chat Completions: invalid JSON body')
  }

  const u = json.usage
  if (
    u == null ||
    typeof u.prompt_tokens !== 'number' ||
    typeof u.completion_tokens !== 'number'
  ) {
    throw new Error('Chat Completions response missing usage.prompt_tokens / completion_tokens')
  }

  const outputText = assistantTextFromChatJson(json)

  return {
    promptTokens: u.prompt_tokens,
    completionTokens: u.completion_tokens,
    totalTokens:
      typeof u.total_tokens === 'number'
        ? u.total_tokens
        : u.prompt_tokens + u.completion_tokens,
    model: typeof json.model === 'string' ? json.model : model,
    outputText,
  }
}

export const MEASURE_SYSTEM_PROMPT =
  'You are a benchmarking assistant. The user message is a full context payload (tool output style). Produce a realistic substantive answer someone would use next: warehouse-style contexts should include executable Trino SQL plus brief assumptions; raw-object / S3-style contexts should include structured analysis and next tool steps without assuming a SQL engine. Stay factual to the provided context.'
