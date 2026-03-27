import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  assistantMessageToText,
  chatCompletionOutputCap,
  measureChatCompletionUsage,
  modelSupportsCustomTemperature,
  normalizeAssistantContent,
} from './llmUsage.js'

describe('normalizeAssistantContent', () => {
  it('handles string', () => {
    expect(normalizeAssistantContent('hi')).toBe('hi')
  })

  it('handles content parts array', () => {
    expect(
      normalizeAssistantContent([
        { type: 'text', text: 'a' },
        { type: 'text', text: 'b' },
      ]),
    ).toBe('ab')
  })

  it('joins output_text parts (GPT-5-style)', () => {
    expect(
      normalizeAssistantContent([
        { type: 'output_text', output_text: 'x' },
        { type: 'output_text', output_text: 'y' },
      ]),
    ).toBe('xy')
  })
})

describe('assistantMessageToText', () => {
  it('reads output_text-only content array', () => {
    expect(
      assistantMessageToText({
        role: 'assistant',
        content: [{ type: 'output_text', output_text: 'lake plan' }],
      }),
    ).toBe('lake plan')
  })

  it('falls back to top-level refusal', () => {
    expect(
      assistantMessageToText({
        role: 'assistant',
        content: null,
        refusal: 'nope',
      }),
    ).toBe('nope')
  })
})

describe('modelSupportsCustomTemperature', () => {
  it('is false for gpt-5 and o-series', () => {
    expect(modelSupportsCustomTemperature('gpt-5.4-nano')).toBe(false)
    expect(modelSupportsCustomTemperature('o3-mini')).toBe(false)
  })

  it('is true for gpt-4 class', () => {
    expect(modelSupportsCustomTemperature('gpt-4o-mini')).toBe(true)
  })
})

describe('chatCompletionOutputCap', () => {
  it('uses max_completion_tokens for gpt-5 models', () => {
    expect(chatCompletionOutputCap('gpt-5.4-nano', 512)).toEqual({
      max_completion_tokens: 512,
    })
  })

  it('uses max_tokens for gpt-4-style models', () => {
    expect(chatCompletionOutputCap('gpt-4o-mini', 512)).toEqual({
      max_tokens: 512,
    })
  })
})

describe('measureChatCompletionUsage', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.OPENAI_API_KEY
    delete process.env.OPENAI_MODEL
  })

  it('sends max_completion_tokens for gpt-5 models', async () => {
    process.env.OPENAI_API_KEY = 'sk-test'
    process.env.OPENAI_MODEL = 'gpt-5.4-nano'

    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () =>
        JSON.stringify({
          model: 'gpt-5.4-nano',
          choices: [
            { message: { role: 'assistant', content: 'nano-out' } },
          ],
          usage: {
            prompt_tokens: 1,
            completion_tokens: 1,
            total_tokens: 2,
          },
        }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const u = await measureChatCompletionUsage({
      systemContent: 's',
      userContent: 'u',
      maxCompletionTokens: 99,
    })

    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)
    expect(body.max_completion_tokens).toBe(99)
    expect(body.max_tokens).toBeUndefined()
    expect(body.temperature).toBeUndefined()
    expect(u.outputText).toBe('nano-out')
  })

  it('parses usage from JSON response', async () => {
    process.env.OPENAI_API_KEY = 'sk-test'

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        text: async () =>
          JSON.stringify({
            model: 'gpt-4o-mini',
            choices: [
              {
                message: { role: 'assistant', content: 'SELECT 1' },
              },
            ],
            usage: {
              prompt_tokens: 100,
              completion_tokens: 42,
              total_tokens: 142,
            },
          }),
      })),
    )

    const fetchFn = vi.mocked(globalThis.fetch)
    const u = await measureChatCompletionUsage({
      systemContent: 'sys',
      userContent: 'user',
    })
    const reqBody = JSON.parse(fetchFn.mock.calls[0]?.[1]?.body as string)
    expect(reqBody.temperature).toBe(0)
    expect(u.promptTokens).toBe(100)
    expect(u.completionTokens).toBe(42)
    expect(u.totalTokens).toBe(142)
    expect(u.model).toBe('gpt-4o-mini')
    expect(u.outputText).toBe('SELECT 1')
  })

  it('throws when key missing', async () => {
    await expect(
      measureChatCompletionUsage({ systemContent: 'a', userContent: 'b' }),
    ).rejects.toThrow(/OPENAI_API_KEY/)
  })
})
