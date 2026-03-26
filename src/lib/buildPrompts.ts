import type { BuildPromptOptions, PromptParts, TableDef } from './types'

const PREAMBLE_STANDARD =
  'You are an expert SQL assistant. Given the full database schema (DDL) and few-shot examples, write accurate, dialect-appropriate SQL for the user question.\n\n'

const PREAMBLE_STARBUST =
  'You are an expert SQL assistant. Given a compact schema summary (identifiers and types only), write accurate SQL for the user question.\n\n'

const SCHEMA_LABEL_STD = '## Schema (full DDL)\n'
const SCHEMA_LABEL_SB = '## Schema (compact)\n'
const FEW_SHOT_LABEL = '## Few-shot examples\n'
const QUESTION_LABEL = '## User question\n'

/** Pretty-print CREATE TABLE DDL for the Standard LLM-to-SQL path. */
export function formatFullSchema(tables: TableDef[]): string {
  if (tables.length === 0) return '(no tables defined)\n'

  return tables
    .map((table) => {
      const lines = table.columns.map((col) => {
        const base = `  ${col.name} ${col.type}`
        const c = col.comment?.trim()
        return c ? `${base} -- ${c}` : base
      })
      return `CREATE TABLE ${table.name} (\n${lines.join(',\n')}\n);`
    })
    .join('\n\n')
}

/**
 * One line per table: `table(col:type, ...)`
 * Starbust path default: no comments, minimal whitespace.
 */
export function formatAbbreviatedSchema(tables: TableDef[]): string {
  if (tables.length === 0) return '(no tables)\n'

  return (
    tables
      .map((t) => {
        const cols = t.columns.map((c) => `${c.name}:${c.type}`).join(', ')
        return `${t.name}(${cols})`
      })
      .join('\n') + '\n'
  )
}

export function buildStandardParts(
  tables: TableDef[],
  opts: BuildPromptOptions,
): PromptParts {
  const schema = formatFullSchema(tables)
  const fewBody = opts.fewShotText.trim() || '(none provided)\n'
  return {
    preamble: PREAMBLE_STANDARD + SCHEMA_LABEL_STD,
    schema,
    fewShotSection: `${FEW_SHOT_LABEL}${fewBody.endsWith('\n') ? fewBody : `${fewBody}\n`}`,
    questionSection: `${QUESTION_LABEL}${opts.userQuestion.trim() || '(empty)'}\n`,
  }
}

export function buildStarbustParts(
  tables: TableDef[],
  opts: BuildPromptOptions,
): PromptParts {
  const schema = formatAbbreviatedSchema(tables)
  const trimmedFew = opts.fewShotText.trim()
  const fewBlock =
    opts.starbustIncludeFewShots && trimmedFew.length > 0
      ? `${FEW_SHOT_LABEL}${trimmedFew.endsWith('\n') ? trimmedFew : `${trimmedFew}\n`}`
      : ''
  return {
    preamble: PREAMBLE_STARBUST + SCHEMA_LABEL_SB,
    schema,
    fewShotSection: fewBlock,
    questionSection: `${QUESTION_LABEL}${opts.userQuestion.trim() || '(empty)'}\n`,
  }
}

export function joinParts(parts: PromptParts): string {
  return (
    parts.preamble +
    parts.schema +
    (parts.schema.endsWith('\n') ? '' : '\n') +
    parts.fewShotSection +
    parts.questionSection
  )
}

export function buildStandardPrompt(
  tables: TableDef[],
  opts: BuildPromptOptions,
): string {
  return joinParts(buildStandardParts(tables, opts))
}

export function buildStarbustPrompt(
  tables: TableDef[],
  opts: BuildPromptOptions,
): string {
  return joinParts(buildStarbustParts(tables, opts))
}
