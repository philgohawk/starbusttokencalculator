/**
 * Pure formatters for “LLM context” payloads — unit-tested with fixtures only.
 */

export type StarburstColumnRow = {
  tableName: string
  columnName: string
  dataType: string
}

export type S3ListItem = {
  key: string
  size: number
  lastModified?: string
}

const STAR_PREAMBLE = `You are an AI assistant helping a user query structured data via a SQL engine (Starburst / Trino).
The following metadata was retrieved with bounded catalog queries (information_schema). Use it to answer questions accurately.

`

const S3_PREAMBLE = `You are an AI assistant. The user's data lives as objects in Amazon S3 (no SQL engine in this path).
You must reason about layouts from object keys, infer file formats, and plan reads/heuristics. Typical agents need:
- broad object inventory (often paginated and large),
- instructions for parsing Parquet/JSON/CSV/AVRO from partial paths,
- glue/hive path guessing when table metadata is missing,
- caution against loading full objects into context.

Below is a capped object listing plus sizes. This is representative of the prompt/tool payload an LLM-driven S3 workflow accumulates before it can even draft a “query”.

`

export function formatStarburstSqlEngineContext(params: {
  catalog: string
  schema: string
  /** When metadata was scoped to one table (information_schema filter). */
  tableFilter?: string
  columns: StarburstColumnRow[]
  truncated: boolean
}): string {
  const { catalog, schema, tableFilter, columns, truncated } = params
  const scope =
    tableFilter && tableFilter.length > 0
      ? `catalog=${catalog}\nschema=${schema}\ntable_filter=${tableFilter}\n\n`
      : `catalog=${catalog}\nschema=${schema}\n\n`
  const header = `${STAR_PREAMBLE}${scope}table\tcolumn\ttype\n`
  const lines = columns.map(
    (c) => `${c.tableName}\t${c.columnName}\t${c.dataType}`,
  )
  const tail = truncated
    ? `\n[truncated: more columns exist beyond this cap]\n`
    : `\n[end of metadata sample]\n`
  return header + lines.join('\n') + tail
}

export function formatS3DirectLlmContext(params: {
  bucket: string
  prefix: string
  objects: S3ListItem[]
  truncated: boolean
}): string {
  const { bucket, prefix, objects, truncated } = params
  const pre =
    prefix.trim().length > 0
      ? `${S3_PREAMBLE}bucket=${bucket}\nprefix=${prefix}\n\n`
      : `${S3_PREAMBLE}bucket=${bucket}\n\n`
  const tableHeader = 'key\tsize_bytes\tlast_modified\n'
  const lines = objects.map((o) => {
    const lm = o.lastModified ?? ''
    return `${o.key}\t${o.size}\t${lm}`
  })
  const tail = truncated
    ? `\n[truncated: more S3 objects exist; listing continues in further tool calls]\n`
    : `\n[end of listing sample]\n`
  return pre + tableHeader + lines.join('\n') + tail
}
