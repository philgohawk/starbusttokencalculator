import { BasicAuth, Trino, type QueryResult } from 'trino-client'

import type { StarburstColumnRow } from './contextFormatters.js'

/**
 * Trino JS client uses Axios with an HTTP(S) base URL + `/v1/statement`.
 * Galaxy users often paste the JDBC URL — convert that to `https://host[:port]`.
 */
export function normalizeTrinoHttpBaseUrl(raw: string): string {
  const s = raw.trim()
  if (!s) {
    throw new Error('STARBURST_SERVER is empty')
  }

  let candidate = s

  if (/^jdbc:trino:\/\//i.test(candidate)) {
    const rest = candidate.slice('jdbc:trino://'.length)
    const beforeQuery = rest.split('?')[0] ?? ''
    const hostPort = beforeQuery.split('/')[0] ?? ''
    if (!hostPort) {
      throw new Error(
        'STARBURST_SERVER JDBC URL is missing a host after jdbc:trino://',
      )
    }
    candidate = `https://${hostPort}`
  } else if (!/^https?:\/\//i.test(candidate)) {
    candidate = `https://${candidate.replace(/^\/+/, '')}`
  }

  candidate = candidate.replace(/\/+$/, '')

  let u: URL
  try {
    u = new URL(candidate)
  } catch {
    throw new Error(
      `STARBURST_SERVER must be https://your-cluster.trino.galaxy.starburst.io or a full jdbc:trino://… URL (invalid value, check for typos or spaces).`,
    )
  }

  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error(`STARBURST_SERVER must use http(s), not ${u.protocol}`)
  }

  return u.origin
}

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

/** Trim and remove one pair of surrounding ' or " from .env values (avoids 401 from quoted passwords). */
function unquoteEnv(s: string): string {
  const t = s.trim()
  if (
    t.length >= 2 &&
    ((t[0] === '"' && t[t.length - 1] === '"') ||
      (t[0] === "'" && t[t.length - 1] === "'"))
  ) {
    return t.slice(1, -1)
  }
  return t
}

export function loadStarburstEnv(): StarburstEnv | null {
  const server = process.env.STARBURST_SERVER?.trim()
  const user = process.env.STARBURST_USER
    ? unquoteEnv(process.env.STARBURST_USER)
    : undefined
  const password = unquoteEnv(process.env.STARBURST_PASSWORD ?? '')
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
  const server = normalizeTrinoHttpBaseUrl(env.server)
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
): Promise<{
  columns: StarburstColumnRow[]
  truncated: boolean
  warnings: string[]
  /**
   * When set, include `table_filter=` in the LLM context; when undefined, list all tables
   * in the schema section (used after retry if STARBURST_TABLE matched no columns).
   */
  contextTableFilter?: string
}> {
  const warnings: string[] = []
  const trino = createTrino(env)
  const limit = env.maxMetadataRows

  const buildSql = (tableClause: string) => `
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_catalog = '${escapeSqlLiteral(env.catalog)}'
  AND table_schema = '${escapeSqlLiteral(env.schema)}'
  ${tableClause}
ORDER BY table_name, ordinal_position
LIMIT ${limit + 1}
`

  async function runQuery(
    tableClause: string,
  ): Promise<{ rows: unknown[][]; truncated: boolean }> {
    const iter = await trino.query(buildSql(tableClause))
    const { rows } = await collectAllData(iter)
    let truncated = false
    if (rows.length > limit) {
      truncated = true
      rows.pop()
      warnings.push(
        `Starburst: result row cap hit (${limit}); metadata truncated. Increase MAX_METADATA_ROWS if needed.`,
      )
    }
    return { rows, truncated }
  }

  let contextTableFilter: string | undefined = env.table
  const tableClause = env.table
    ? `AND lower(table_name) = lower('${escapeSqlLiteral(env.table)}')`
    : ''

  let { rows, truncated } = await runQuery(tableClause)

  if (rows.length === 0 && env.table) {
    warnings.push(
      `Starburst: STARBURST_TABLE="${env.table}" matched no columns in ${env.catalog}.${env.schema} — retrying without table filter (all tables in schema).`,
    )
    contextTableFilter = undefined
    ;({ rows, truncated } = await runQuery(''))
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
  return { columns, truncated, warnings, contextTableFilter }
}

/** Minimal escaping for identifiers used only as literal comparisons (not identifiers). */
function escapeSqlLiteral(s: string): string {
  return s.replaceAll("'", "''")
}
