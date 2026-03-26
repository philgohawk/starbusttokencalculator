import { describe, expect, it } from 'vitest'
import { countPromptParts, countTokens } from './countTokens'
import type { PromptParts } from './types'

describe('countTokens', () => {
  it('counts known short string with cl100k_base', () => {
    expect(countTokens('hello world')).toBeGreaterThan(0)
    expect(countTokens('')).toBe(0)
  })
})

describe('countPromptParts', () => {
  const parts: PromptParts = {
    preamble: 'aa ',
    schema: 'bbbb ',
    fewShotSection: '',
    questionSection: 'c',
  }

  it('applies multiplier to schema tokens only', () => {
    const full = countPromptParts(parts, 1)
    const half = countPromptParts(parts, 0.5)
    const schemaTok = countTokens(parts.schema)
    expect(full - half).toBe(Math.round(schemaTok * 0.5))
  })
})
