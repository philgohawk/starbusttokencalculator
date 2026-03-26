import { describe, expect, it } from 'vitest'
import {
  formatS3DirectLlmContext,
  formatStarburstSqlEngineContext,
} from './contextFormatters.js'

describe('formatStarburstSqlEngineContext', () => {
  it('includes catalog, schema, and column lines', () => {
    const s = formatStarburstSqlEngineContext({
      catalog: 'lake',
      schema: 'sales',
      columns: [
        { tableName: 'orders', columnName: 'id', dataType: 'bigint' },
        { tableName: 'orders', columnName: 'total', dataType: 'double' },
      ],
      truncated: false,
    })
    expect(s).toContain('catalog=lake')
    expect(s).toContain('schema=sales')
    expect(s).toContain('orders\tid\tbigint')
    expect(s).not.toContain('[truncated')
  })

  it('marks truncation', () => {
    const s = formatStarburstSqlEngineContext({
      catalog: 'c',
      schema: 's',
      columns: [],
      truncated: true,
    })
    expect(s).toContain('[truncated')
  })

  it('includes table_filter when scoped', () => {
    const s = formatStarburstSqlEngineContext({
      catalog: 'lake',
      schema: 'public',
      tableFilter: 'kaggle_tx_data',
      columns: [],
      truncated: false,
    })
    expect(s).toContain('table_filter=kaggle_tx_data')
  })
})

describe('formatS3DirectLlmContext', () => {
  it('includes bucket, keys, and sizes', () => {
    const s = formatS3DirectLlmContext({
      bucket: 'my-bucket',
      prefix: 'data/',
      objects: [
        { key: 'data/a.parquet', size: 1024, lastModified: '2025-01-01T00:00:00.000Z' },
      ],
      truncated: false,
    })
    expect(s).toContain('bucket=my-bucket')
    expect(s).toContain('prefix=data/')
    expect(s).toContain('data/a.parquet\t1024')
    expect(s).toContain('infer file formats')
  })
})
