import { BasicAuth, Trino, type QueryResult } from 'trino-client'

import type { StarburstColumnRow } from './contextFormatters.js'

export type StarburstEnv = {
  server: string
  user: string
  password: string
  catalog: string
  schema: string
  /** When set, restrict metadata to this table (e.g. kaggle_tx_data). */
  table?: string
  maxMetadataRows: number
}

export function loadStarburstEnv(): StarburstEnv | null {
  const server = process.env.STARBURST_SERVER?.trim()
  const user = process.env.STARBURST_USER?.trim()
  const password = process.env.STARBURST_PASSWORD ?? ''
  const catalog = process.env.STARBURST_CATALOG?.trim()
  const schema = process.env.STARBURST_SCHEMA?.trim()
  const tableRaw = process.env.STARBURST_TABLE?.trim()
  const table = tableRaw && tableRaw.length > 0 ? tableRaw : undefined
  const maxMetadataRows = Math.min(
    20_000,
    Math.max(50, Number(process.env.MAX_METADATA_ROWS) || 800),
  )

  if (!server || !user || !catalog || !schema) return null
  return { server, user, password, catalog, schema, table, maxMetadataRows }
}

export function createTrino(env: StarburstEnv): Trino {
  const server = env.server.replace(/\/$/, '')
  return Trino.create({
    server,
    catalog: env.catalog,
    schema: env.schema,
    auth: new BasicAuth(env.user, env.password),
    ssl: { rejectUnauthorized: true },
  })
}

async function collectAllData(
  iter: AsyncIterable<QueryResult>,
): Promise<{ columns: string[]; rows: unknown[][] }> {
  const columns: string[] = []
  const rows: unknown[][] = []
  for await (const qr of iter) {
    if (qr.error) {
      throw new Error(qr.error.message ?? 'Trino query error')
    }
    if (qr.columns?.length && columns.length === 0) {
      columns.push(...qr.columns.map((c) => c.name))
    }
    if (qr.data?.length) rows.push(...qr.data)
  }
  return { columns, rows }
}

export async function fetchStarburstColumnMetadata(
  env: StarburstEnv,
): Promise<{ columns: StarburstColumnRow[]; truncated: boolean; warnings: string[] }> {
  const warnings: string[] = []
  const trino = createTrino(env)
  const limit = env.maxMetadataRows
  const tableClause = env.table
    ? `AND lower(table_name) = lower('${escapeSqlLiteral(env.table)}')`
    : ''
  const sql = `
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_catalog = '${escapeSqlLiteral(env.catalog)}'
  AND table_schema = '${escapeSqlLiteral(env.schema)}'
  ${tableClause}
ORDER BY table_name, ordinal_position
LIMIT ${limit + 1}
`
  const iter = await trino.query(sql)
  const { rows } = await collectAllData(iter)
  let truncated = false
  if (rows.length > limit) {
    truncated = true
    rows.pop()
    warnings.push(
      `Starburst: result row cap hit (${limit}); metadata truncated. Increase MAX_METADATA_ROWS if needed.`,
    )
  }
  const columns: StarburstColumnRow[] = rows.map((r) => ({
    tableName: String(r[0] ?? ''),
    columnName: String(r[1] ?? ''),
    dataType: String(r[2] ?? ''),
  }))
  if (columns.length === 0) {
    const scope = env.table
      ? `table "${env.table}" (case-insensitive match)`
      : 'this catalog/schema'
    warnings.push(
      `Starburst: no columns returned for ${scope} — check names, permissions, and STARBURST_TABLE.`,
    )
  }
  return { columns, truncated, warnings }
}

/** Minimal escaping for identifiers used only as literal comparisons (not identifiers). */
function escapeSqlLiteral(s: string): string {
  return s.replaceAll("'", "''")
}
