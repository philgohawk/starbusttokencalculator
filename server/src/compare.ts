import { countTokens } from 'gpt-tokenizer/encoding/cl100k_base'

import {
  formatS3DirectLlmContext,
  formatStarburstSqlEngineContext,
} from './contextFormatters.js'
import {
  hasOpenAiConfigured,
  MEASURE_SYSTEM_PROMPT,
  measureChatCompletionUsage,
} from './llmUsage.js'
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

/** Billable tokens and completion text from the provider. */
export type PathLlmUsage = {
  promptTokens: number
  completionTokens: number
  outputText: string
}

export type CompareResponse = {
  ok: true
  starburstContext: string
  s3StyleContext: string
  /**
   * Local cl100k_base count of the raw context string only (no system prompt).
   * Useful when comparing to provider tokenization.
   */
  contextTokensLocal: { starburst: number; s3Style: number }
  /**
   * Measured via Chat Completions `usage` from the configured provider.
   * Each path is one full request (system + user context + instruction).
   */
  llm:
    | {
        source: 'openai'
        model: string
        starburst: PathLlmUsage
        s3Style: PathLlmUsage
      }
    | { source: 'none'; reason: 'missing_api_key' | 'error'; detail?: string }
  charCounts: { starburst: number; s3Style: number }
  timingsMs: { starburst: number; s3: number; total: number }
  /** Includes LLM measurement latency when applicable. */
  timingsMsLlm?: { starburst: number; s3: number; total: number }
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
      'Set AWS_REGION, S3_BUCKET (and optional S3_PREFIX). Authenticate with AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY or default credentials (~/.aws/credentials, IAM role).',
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
    const errHints: string[] = []
    if (/\b405\b/.test(msg)) {
      errHints.push(
        'HTTP 405 almost always means STARBURST_SERVER is your Galaxy account/UI host, not the cluster Trino host. In Galaxy open Partner connect → Trino JDBC, choose your cluster, and set STARBURST_SERVER to that host (https://…, port 443) — catalog/schema in .env can still match Explorer.',
      )
    }
    if (/\b404\b/.test(msg)) {
      errHints.push(
        'HTTP 404 means no Trino REST handler at this URL (POST /v1/statement) — usually STARBURST_SERVER is the Galaxy **web** or **account** hostname instead of the **cluster Trino** host from Partner connect → Trino JDBC. Password issues normally return 401, not 404.',
      )
    }
    if (/invalid url/i.test(msg)) {
      errHints.push(
        'Use the cluster host as an HTTPS URL (e.g. https://account-cluster.trino.galaxy.starburst.io) or paste the full jdbc:trino://… line from Partner connect. No quotes; keep STARBURST_CATALOG / STARBURST_SCHEMA separate in .env.',
      )
    }
    if (/\b401\b/.test(msg)) {
      errHints.push(
        'HTTP 401 means Galaxy rejected Basic auth — catalog/schema are usually fine. Match STARBURST_USER exactly to Partner connect (e.g. you@company.com/accountadmin). Set the JDBC password in Galaxy: banner → your role → Profile → Change password (SSO logins still need this password for CLI/JDBC). In .env avoid wrapping STARBURST_PASSWORD in quotes; watch for typos and trailing spaces.',
      )
    }
    if (!/\b401\b/.test(msg)) {
      errHints.push(
        'Confirm that URL is the Trino REST endpoint (POST /v1/statement), HTTPS, and Basic auth matches your Galaxy password.',
        'Verify STARBURST_CATALOG and STARBURST_SCHEMA match Explorer (e.g. discovered_schema).',
      )
    }
    return {
      ok: false,
      error: `Starburst (Trino) metadata failed: ${msg}`,
      hints: errHints,
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
    const errHints: string[] = []
    if (/could not load credentials/i.test(msg)) {
      errHints.push(
        'No AWS credentials visible to this API process: set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in server/.env (or repo root .env), or add keys under ~/.aws/credentials (e.g. run aws configure). On AWS (EC2/ECS/Lambda), use an IAM role instead.',
      )
    }
    if (/not authorized to perform:\s*s3:ListBucket/i.test(msg)) {
      errHints.push(
        'IAM is blocking ListBucket for the identity in the error (e.g. IAM user or role tied to these access keys). Attach an identity policy with s3:ListBucket on arn:aws:s3:::YOUR_BUCKET. Optional Condition keys (e.g. s3:prefix) must still allow your S3_PREFIX. Account/region in .env should match the bucket.',
      )
    }
    errHints.push(
      'Verify IAM allows s3:ListBucket on the bucket and prefix.',
      'Check AWS_REGION matches the bucket region.',
    )
    return {
      ok: false,
      error: `S3 listing failed: ${msg}`,
      hints: errHints,
    }
  }

  warnings.push(...sbMeta.warnings, ...s3Inv.warnings)

  const starburstContext = formatStarburstSqlEngineContext({
    catalog: sbEnv.catalog,
    schema: sbEnv.schema,
    tableFilter: sbMeta.contextTableFilter,
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

  const contextTokensLocal = {
    starburst: countTokens(starburstContext),
    s3Style: countTokens(s3StyleContext),
  }

  let llm: CompareResponse['llm'] = { source: 'none', reason: 'missing_api_key' }
  let timingsMsLlm: CompareResponse['timingsMsLlm'] = undefined

  if (hasOpenAiConfigured()) {
    const tLlm0 = Date.now()
    try {
      const sbUser =
        `${starburstContext}\n\n---\n\n` +
        `Using only this context, respond with Trino-compatible SQL for a typical analytics question over these relations, plus a short paragraph of explicit assumptions.`

      const s3User =
        `${s3StyleContext}\n\n---\n\n` +
        `Using only this context, respond with structured lake-inventory analysis and concrete next tool steps. Do not assume a SQL engine is available.`

      const tSb = Date.now()
      const sbUsage = await measureChatCompletionUsage({
        systemContent: MEASURE_SYSTEM_PROMPT,
        userContent: sbUser,
      })
      const sbLlmMs = Date.now() - tSb

      const tS3 = Date.now()
      const s3Usage = await measureChatCompletionUsage({
        systemContent: MEASURE_SYSTEM_PROMPT,
        userContent: s3User,
      })
      const s3LlmMs = Date.now() - tS3

      llm = {
        source: 'openai',
        model: sbUsage.model,
        starburst: {
          promptTokens: sbUsage.promptTokens,
          completionTokens: sbUsage.completionTokens,
          outputText: sbUsage.outputText,
        },
        s3Style: {
          promptTokens: s3Usage.promptTokens,
          completionTokens: s3Usage.completionTokens,
          outputText: s3Usage.outputText,
        },
      }
      timingsMsLlm = {
        starburst: sbLlmMs,
        s3: s3LlmMs,
        total: Date.now() - tLlm0,
      }
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e)
      warnings.push(`OpenAI (or compatible) usage measurement failed: ${detail}`)
      llm = { source: 'none', reason: 'error', detail }
    }
  } else {
    warnings.push(
      'Set OPENAI_API_KEY (optional OPENAI_MODEL, OPENAI_BASE_URL) for measured prompt and completion tokens via the Chat Completions API.',
    )
  }

  return {
    ok: true,
    starburstContext,
    s3StyleContext,
    contextTokensLocal,
    llm,
    charCounts: {
      starburst: starburstContext.length,
      s3Style: s3StyleContext.length,
    },
    timingsMs: {
      starburst: starburstMs,
      s3: s3Ms,
      total: Date.now() - t0,
    },
    timingsMsLlm,
    warnings,
  }
}
