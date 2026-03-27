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

/**
 * SQL-engine path: matched weight to {@link S3_PREAMBLE} so token deltas reflect data (metadata vs object rows),
 * not shortcut instructions on one side.
 */
const STAR_PREAMBLE = `You are an autonomous analytics agent with a live Starburst Galaxy / Trino SQL engine. The block below is bounded information_schema output (catalog, schema, table/column names, and data types only). Row counts, statistics, histograms, and partition layouts are NOT shown unless inferable from names—still assume tables may have millions to billions of rows, wide rows, and skewed keys until proven otherwise.

MANDATORY PRE-FLIGHT (do not skip; treat as part of the user-facing reasoning trace):
1) Bind mentally to the stated catalog and schema; treat the metadata sample as authoritative for identifiers in scope—do not invent tables/columns not listed unless the user explicitly overrides.
2) Classify columns into dimensions, metrics, time, and surrogate keys from names and types; flag likely partition columns (dates, region codes, bucket ids) when naming conventions suggest hive/Iceberg-style layouts.
3) Plan predicate pushdown and partition pruning; refuse full scans when the question implies a filterable time or ID range but omits it—say what must be added.
4) Resolve type semantics: VARCHAR vs CHAR, TIMESTAMP WITH TIME ZONE vs without, DECIMAL precision, DOUBLE vs REAL, JSON/ROW/MAP/ARRAY handling per Trino rules.
5) Handle NULLable joins and three-valued logic; specify COALESCE / IS DISTINCT FROM when equality on nullable fields would silently drop rows.
6) Check join fan-out, many-to-many explosions, and semi-join vs inner-join choice; prefer EXISTS / IN when the question is existential.
7) Choose aggregation grain explicitly; watch for double-counting when joining through bridge tables; use COUNT(DISTINCT) vs APPROX_SET only when justified.
8) Reason about session properties you cannot set here (spilling, broadcast joins, skew join hints)—still describe expected engine behavior on large shuffles.
9) If metadata is truncated, list what extra information_schema or SHOW queries would be needed next; never pretend unseen columns.
10) Cross-check window functions frame boundaries (ROWS vs RANGE) and ordering stability when ties matter.
11) Respect dialect: ANSI-ish SQL with Trino functions; avoid engine-specific syntax from other vendors unless mapped.
12) Govern security in answers: do not suggest exfiltration patterns; respect the idea of row/column masks and catalog ACLs even when not visible in the sample.
13) Emit execution-risk callouts: cross-catalog joins, correlated subqueries on huge tables, ORDER BY without LIMIT on exploratory questions.
14) Provide fallback SQL tiers: a fast approximate or scoped query vs a gold query when the user’s ask is ambiguous.
15) Document failure taxonomy you would surface from the engine: syntax errors, missing tables, type mismatch, memory limit, remote connector timeouts, and how to narrow the query.

OPERATING MODE: You are simulating the long system/developer prompt that precedes SQL in a governed warehouse. Treat the TSV block as ground truth for schema shape; narrate trade-offs the same way you would in a code review. When column comments or stats are absent (they are), say what a analyst would normally pull from extended metadata.

Below is the bounded metadata matrix (table, column, SQL data type). Real clusters often cap information_schema responses; large tables still appear as a single row per column here—that compactness is the engineering win, not an excuse to skip rigor.

`

/** Raw-S3 path: parallel structure to {@link STAR_PREAMBLE} for unbiased comparison. */
const S3_PREAMBLE = `You are an autonomous data agent. There is NO SQL engine: the lake is raw S3. Tables may hold millions to billions of rows; object counts can be huge and listings are paginated. Every answer must assume worst-case cost, ambiguity, and missing Glue/Data Catalog metadata.

MANDATORY PRE-FLIGHT (do not skip; treat as part of the user-facing reasoning trace):
1) Reconcile bucket, optional prefix, and account/region assumptions; verify KMS, Block Public Access, and endpoint style (path vs virtual-hosted).
2) Decide listing strategy: ListObjectsV2 vs inventory manifests vs CloudWatch metrics; reason about pagination, continuation tokens, and rate limits.
3) Infer dataset partitioning from key paths (hive key=val, date folders, UUID shards, hour rollovers, table=sales/year=…/month=…).
4) Classify object formats from suffixes, magic bytes (when tools allow), sidecar metadata, and heuristic content sniffing; handle mixed folders (Parquet + CSV + JSON lines + AVRO + ORC + ZSTD blobs).
5) Map composite types, nested structs, maps, arrays, and schema-on-read evolution (added/dropped columns, renamed fields, incompatible promotions).
6) Plan predicate pushdown vs full-object reads; prefer footers, row-group indexes, bloom filters, and column pruning when Parquet/ORC metadata is available via tools.
7) Estimate row counts and NDVs without a catalog: sampling plans, reservoir sketches, stratified samples over partitions, and bias checks when data is skewed.
8) Handle late-arriving data, duplicate event streams, idempotent loads, watermarking, and reconciliation keys (order_id, ingest_ts, lineage_run_id).
9) Reason about compaction state (many small files vs few large), target file sizes, and read amplification; warn when lists imply expensive scans.
10) If Iceberg/Delta/Hudi paths appear, outline snapshot IDs, manifest lists, time travel, partition specs, and orphan file cleanup — even when you cannot execute them.
11) Cross-check S3 inventory vs live listing when consistency matters; describe eventual consistency pitfalls.
12) Produce safe tool plans: never request whole-object GETs into context; bound HEAD/byte ranges; respect egress and requester-pays.
13) Address PII/PHI redaction, bucket policies, Lake Formation tags, and row/column masks when policies are unknown (assume strict until proven).
14) Emit fallback strategies: if listing is truncated, say what extra tool rounds are required and what uncertainty remains.
15) Document failure taxonomy: AccessDenied, SlowDown, InvalidAccessKeyId, NoSuchKey, SSE-KMS mismatches, and retry/backoff with jitter.

OPERATING MODE: You are simulating the long system/developer prompt and retrieved listings that an LLM+tools stack ships before writing anything resembling SQL. Treat every key as potentially correlated with neighbors; assume hive-style layout until disproven. When formats disagree across partitions, explain merge strategy (coerce, cast, union-by-name, reject).

Below is a capped object listing (keys, sizes, timestamps). The real catalog has far more objects and often >1M logical rows per table; this sample still reflects the token tax of inventory-first workflows.

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
