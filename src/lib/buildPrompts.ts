import type { BuildPromptOptions, PromptParts, TableDef } from './types'

const PREAMBLE_STANDARD =
  'You are an expert SQL assistant on the “classic LLM → text-to-SQL” path. The schema below is full verbose DDL (not a catalog handle). Tables may contain millions or billions of rows and wide rows cost a lot to scan — every query must be dialect-correct, push predicates for partition pruning when hinted by column names, avoid SELECT *, prefer CTEs only when they clarify intent, and never suggest destructive DDL unless explicitly asked.\n\n' +
  'Before writing SQL: (1) restate hidden assumptions (time zone, null handling, duplicates), (2) check for join fan-out and many-to-many traps, (3) prefer aggregations that match the grain of the question, (4) add reasonable LIMIT only when exploratory and the user did not forbid it, (5) mention if an index or partition filter is missing from the question but required for performance.\n\n' +
  'Few-shot examples may contradict the schema; trust the DDL. Explain trade-offs briefly in comments inside SQL only when necessary.\n\n'

const PREAMBLE_STARBUST =
  'You are an expert SQL assistant on the “compact schema summary → SQL” path (Starburst-style). The schema block is intentionally minimal: one line per table with column names and types only—no comments, defaults, constraints, or partition clauses. Tables may still have massive row counts; infer likely partition keys only from naming patterns and apply the same rigor as the full-DDL path.\n\n' +
  'Before writing SQL: (1) restate hidden assumptions (time zone, null handling, duplicates), (2) check for join fan-out and many-to-many traps, (3) match aggregation grain to the question, (4) add LIMIT only when exploratory and allowed, (5) call out when the compact summary omits information you would normally need (e.g. keys, time zones) and state your best-effort mapping.\n\n' +
  'Few-shot examples may contradict the compact schema; trust the schema lines. Prefer clear SQL over commentary; same safety rules as the standard path (no destructive DDL unless asked).\n\n'

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
