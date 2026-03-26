import { countTokens as cl100kCount } from 'gpt-tokenizer/encoding/cl100k_base'

import type { PromptParts } from './types'

/** Token count for plain text using cl100k_base (OpenAI-class models). */
export function countTokens(text: string): number {
  if (!text) return 0
  return cl100kCount(text)
}

/**
 * Sum token counts per section so Starbust schema multiplier can apply to schema only.
 * Slightly differs from counting the joined string due to BPE boundaries; good UX tradeoff.
 */
export function countPromptParts(
  parts: PromptParts,
  schemaMultiplier: number,
): number {
  const m = Math.min(1, Math.max(0.05, schemaMultiplier))
  return (
    countTokens(parts.preamble) +
    Math.round(countTokens(parts.schema) * m) +
    countTokens(parts.fewShotSection) +
    countTokens(parts.questionSection)
  )
}

export function estimateCostUsd(
  tokens: number,
  pricePerMillionInputTokens: number,
): number {
  if (pricePerMillionInputTokens <= 0) return 0
  return (tokens / 1_000_000) * pricePerMillionInputTokens
}
