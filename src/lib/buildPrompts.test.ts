import { describe, expect, it } from 'vitest'
import {
  buildStandardParts,
  buildStandardPrompt,
  buildStarbustParts,
  formatAbbreviatedSchema,
  formatFullSchema,
  joinParts,
} from './buildPrompts'
import type { BuildPromptOptions, TableDef } from './types'

const sampleTables: TableDef[] = [
  {
    name: 't1',
    columns: [
      { name: 'id', type: 'INT', comment: 'pk' },
      { name: 'name', type: 'TEXT' },
    ],
  },
]

const baseOpts: BuildPromptOptions = {
  fewShotText: 'SELECT 1;',
  userQuestion: 'Hello?',
  starbustIncludeFewShots: false,
  starbustSchemaTokenMultiplier: 1,
}

describe('formatFullSchema', () => {
  it('includes CREATE TABLE and column comments', () => {
    const s = formatFullSchema(sampleTables)
    expect(s).toContain('CREATE TABLE t1')
    expect(s).toContain('id INT -- pk')
    expect(s).toContain('name TEXT')
  })
})

describe('formatAbbreviatedSchema', () => {
  it('uses compact table(col:type) lines', () => {
    expect(formatAbbreviatedSchema(sampleTables).trim()).toBe(
      't1(id:INT, name:TEXT)',
    )
  })
})

describe('buildStandardParts', () => {
  it('includes few-shot section', () => {
    const p = joinParts(buildStandardParts(sampleTables, baseOpts))
    expect(p).toContain('## Few-shot examples')
    expect(p).toContain('SELECT 1;')
    expect(p).toContain('## Schema (full DDL)')
  })
})

describe('buildStarbustParts', () => {
  it('omits few-shots by default', () => {
    const p = joinParts(buildStarbustParts(sampleTables, baseOpts))
    expect(p).not.toContain('## Few-shot examples')
    expect(p).toContain('## Schema (compact)')
    expect(p).toContain('t1(id:INT, name:TEXT)')
  })

  it('includes few-shots when flag set', () => {
    const p = joinParts(
      buildStarbustParts(sampleTables, {
        ...baseOpts,
        starbustIncludeFewShots: true,
      }),
    )
    expect(p).toContain('## Few-shot examples')
    expect(p).toContain('SELECT 1;')
  })
})

describe('buildStandardPrompt', () => {
  it('contains user question section', () => {
    const full = buildStandardPrompt(sampleTables, baseOpts)
    expect(full).toContain('## User question')
    expect(full).toContain('Hello?')
  })
})
