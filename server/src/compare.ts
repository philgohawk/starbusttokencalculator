import { countTokens } from 'gpt-tokenizer/encoding/cl100k_base'

import {
  formatS3DirectLlmContext,
  formatStarburstSqlEngineContext,
} from './contextFormatters.js'
import { fetchS3ObjectInventory, loadS3Env } from './s3inventory.js'
import {
  fetchStarburstColumnMetadata,
  loadStarburstEnv,
} from './starburst.js'

export type CompareRequestBody = {
  maxMetadataRows?: number
  maxS3Objects?: number
  s3Prefix?: string
  /** Override STARBURST_TABLE for this request (e.g. kaggle_tx_data). */
  starburstTable?: string
}

export type CompareResponse = {
  ok: true
  starburstContext: string
  s3StyleContext: string
  tokenCounts: { starburst: number; s3Style: number }
  charCounts: { starburst: number; s3Style: number }
  timingsMs: { starburst: number; s3: number; total: number }
  warnings: string[]
}

export type CompareErrorResponse = {
  ok: false
  error: string
  hints?: string[]
}

export async function runCompare(
  body: CompareRequestBody | undefined,
): Promise<CompareResponse | CompareErrorResponse> {
  const hints: string[] = []
  const sbEnvBase = loadStarburstEnv()
  const s3EnvBase = loadS3Env()

  if (!sbEnvBase) {
    hints.push(
      'Set STARBURST_SERVER, STARBURST_USER, STARBURST_PASSWORD, STARBURST_CATALOG, STARBURST_SCHEMA (see server/.env.example).',
    )
  }
  if (!s3EnvBase) {
    hints.push(
      'Set AWS_REGION, S3_BUCKET (and optional S3_PREFIX); use standard AWS credentials.',
    )
  }

  if (!sbEnvBase || !s3EnvBase) {
    return { ok: false, error: 'Server environment not fully configured.', hints }
  }

  const tableOverride =
    body != null &&
    typeof body.starburstTable === 'string' &&
    body.starburstTable.trim().length > 0
      ? body.starburstTable.trim()
      : undefined

  const sbEnv = {
    ...sbEnvBase,
    table: tableOverride ?? sbEnvBase.table,
    maxMetadataRows: Math.min(
      20_000,
      Math.max(
        50,
        body?.maxMetadataRows ?? sbEnvBase.maxMetadataRows,
      ),
    ),
  }
  const s3Env = {
    ...s3EnvBase,
    maxObjects: Math.min(
      20_000,
      Math.max(10, body?.maxS3Objects ?? s3EnvBase.maxObjects),
    ),
  }

  const warnings: string[] = []
  const t0 = Date.now()
  let starburstMs = 0
  let s3Ms = 0

  let sbMeta: Awaited<ReturnType<typeof fetchStarburstColumnMetadata>>
  try {
    const ts = Date.now()
    sbMeta = await fetchStarburstColumnMetadata(sbEnv)
    starburstMs = Date.now() - ts
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return {
      ok: false,
      error: `Starburst (Trino) metadata failed: ${msg}`,
      hints: [
        'Confirm Galaxy endpoint uses HTTPS and Basic auth works for SQL.',
        'Verify catalog/schema names match Starburst Explorer.',
      ],
    }
  }

  let s3Inv: Awaited<ReturnType<typeof fetchS3ObjectInventory>>
  try {
    const ts = Date.now()
    const s3Overrides =
      body != null && Object.hasOwn(body, 's3Prefix')
        ? { prefix: body.s3Prefix ?? '', maxObjects: s3Env.maxObjects }
        : { maxObjects: s3Env.maxObjects }
    s3Inv = await fetchS3ObjectInventory(s3Env, s3Overrides)
    s3Ms = Date.now() - ts
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return {
      ok: false,
      error: `S3 listing failed: ${msg}`,
      hints: [
        'Verify IAM allows s3:ListBucket on the bucket and prefix.',
        'Check AWS_REGION matches the bucket region.',
      ],
    }
  }

  warnings.push(...sbMeta.warnings, ...s3Inv.warnings)

  const starburstContext = formatStarburstSqlEngineContext({
    catalog: sbEnv.catalog,
    schema: sbEnv.schema,
    tableFilter: sbEnv.table,
    columns: sbMeta.columns,
    truncated: sbMeta.truncated,
  })

  const s3PrefixLabel =
    body != null && Object.hasOwn(body, 's3Prefix')
      ? (body.s3Prefix ?? '')
      : s3Env.prefix
  const s3StyleContext = formatS3DirectLlmContext({
    bucket: s3Env.bucket,
    prefix: s3PrefixLabel,
    objects: s3Inv.objects,
    truncated: s3Inv.truncated,
  })

  const starburst = countTokens(starburstContext)
  const s3Style = countTokens(s3StyleContext)

  return {
    ok: true,
    starburstContext,
    s3StyleContext,
    tokenCounts: { starburst, s3Style },
    charCounts: {
      starburst: starburstContext.length,
      s3Style: s3StyleContext.length,
    },
    timingsMs: {
      starburst: starburstMs,
      s3: s3Ms,
      total: Date.now() - t0,
    },
    warnings,
  }
}
