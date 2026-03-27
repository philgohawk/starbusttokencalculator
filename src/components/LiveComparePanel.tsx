import { useState } from 'react'
import { estimateCostUsd } from '../lib/countTokens'

const apiBase = import.meta.env.VITE_API_BASE ?? ''

type LlmMeasured = {
  source: 'openai'
  model: string
  starburst: {
    promptTokens: number
    completionTokens: number
    outputText: string
  }
  s3Style: {
    promptTokens: number
    completionTokens: number
    outputText: string
  }
}

type LlmNone = {
  source: 'none'
  reason: 'missing_api_key' | 'error'
  detail?: string
}

type CompareResponseOk = {
  ok: true
  starburstContext: string
  s3StyleContext: string
  contextTokensLocal: { starburst: number; s3Style: number }
  llm: LlmMeasured | LlmNone
  charCounts: { starburst: number; s3Style: number }
  timingsMs: { starburst: number; s3: number; total: number }
  timingsMsLlm?: { starburst: number; s3: number; total: number }
  warnings: string[]
}

type CompareResponseErr = {
  ok: false
  error: string
  hints?: string[]
}

type Props = {
  pricePerMillion: number
}

export function LiveComparePanel({ pricePerMillion }: Props) {
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [hints, setHints] = useState<string[]>([])
  const [data, setData] = useState<CompareResponseOk | null>(null)
  const [showContexts, setShowContexts] = useState(false)
  const [showLlmReplies, setShowLlmReplies] = useState(true)

  const run = async () => {
    setLoading(true)
    setErr(null)
    setHints([])
    setData(null)
    try {
      const r = await fetch(`${apiBase}/api/compare-context`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const j = (await r.json()) as CompareResponseOk | CompareResponseErr
      if (!r.ok || !j.ok) {
        const fail = j as CompareResponseErr
        setErr(fail.error ?? `HTTP ${r.status}`)
        setHints(fail.hints ?? [])
        return
      }
      setData(j as CompareResponseOk)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Request failed')
      setHints([
        'Start the API: npm run dev:server from the repo root (or npm run dev:all).',
        'Ensure Vite proxies /api to port 8787 when using npm run dev only.',
      ])
    } finally {
      setLoading(false)
    }
  }

  const ctxSb = data?.contextTokensLocal.starburst ?? 0
  const ctxS3 = data?.contextTokensLocal.s3Style ?? 0

  const api = data?.llm?.source === 'openai' ? data.llm : null
  const llmSkipped =
    data?.llm?.source === 'none' ? data.llm : null

  const sbPrompt = api?.starburst.promptTokens ?? 0
  const sbCompl = api?.starburst.completionTokens ?? 0
  const s3Prompt = api?.s3Style.promptTokens ?? 0
  const s3Compl = api?.s3Style.completionTokens ?? 0
  const sbApiTotal = api ? sbPrompt + sbCompl : 0
  const s3ApiTotal = api ? s3Prompt + s3Compl : 0

  const ratioCtx = ctxS3 > 0 ? ctxSb / ctxS3 : 0
  const pctCtx =
    ctxS3 > 0 ? ((ctxS3 - ctxSb) / ctxS3) * 100 : ctxSb === 0 ? 0 : 100

  const ratioApi =
    api && s3ApiTotal > 0 ? sbApiTotal / s3ApiTotal : 0
  const pctApi =
    api && s3ApiTotal > 0
      ? ((s3ApiTotal - sbApiTotal) / s3ApiTotal) * 100
      : 0

  const sbCostApi = api
    ? estimateCostUsd(sbApiTotal, pricePerMillion)
    : 0
  const s3CostApi = api
    ? estimateCostUsd(s3ApiTotal, pricePerMillion)
    : 0

  const fmtUsd = (n: number) =>
    n.toLocaleString(undefined, {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    })

  return (
    <section
      className="rounded-2xl border border-violet-500/30 bg-violet-950/20 p-4 text-left"
      aria-labelledby="live-compare-heading"
    >
      <h2
        id="live-compare-heading"
        className="text-base font-semibold text-white"
      >
        Live compare: Starburst Galaxy vs S3 listing
      </h2>
      <p className="mt-2 text-sm text-slate-400">
        Fetches bounded <strong className="text-slate-300">information_schema</strong>{' '}
        metadata and an S3 listing, then builds two context strings. With{' '}
        <code className="text-cyan-200/90">OPENAI_API_KEY</code> set on the API,
        each path runs one real{' '}
        <strong className="text-slate-300">Chat Completions</strong> call and
        records <code className="text-cyan-200/90">usage.prompt_tokens</code> and{' '}
        <code className="text-cyan-200/90">completion_tokens</code> from the
        provider (not local estimates). Local{' '}
        <code className="text-cyan-200/90">cl100k_base</code> counts on the raw
        context-only strings are shown for comparison.
      </p>

      <button
        type="button"
        onClick={run}
        disabled={loading}
        className="mt-4 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-violet-500/20 hover:opacity-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 disabled:opacity-50"
      >
        {loading ? 'Running…' : 'Run live comparison'}
      </button>

      {err ? (
        <div
          className="mt-4 rounded-xl border border-rose-500/40 bg-rose-950/30 p-3 text-sm text-rose-100"
          role="alert"
        >
          <p className="font-medium">{err}</p>
          {hints.length ? (
            <ul className="mt-2 list-inside list-disc text-rose-200/80">
              {hints.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {data ? (
        <div className="mt-4 space-y-4">
          {api ? (
            <p className="text-xs text-slate-400">
              LLM: <span className="text-slate-200">{api.model}</span> · API
              timings: Starburst {data.timingsMsLlm?.starburst ?? '—'} ms · S3{' '}
              {data.timingsMsLlm?.s3 ?? '—'} ms · {data.timingsMsLlm?.total ?? '—'}{' '}
              ms
            </p>
          ) : llmSkipped?.reason === 'error' ? (
            <p className="rounded-lg border border-amber-500/25 bg-amber-950/15 p-2 text-xs text-amber-100/90">
              LLM usage measurement failed (key may be set; check model and API
              response):{' '}
              <span className="font-mono text-amber-200/95">
                {llmSkipped.detail ?? 'unknown error'}
              </span>
            </p>
          ) : (
            <p className="rounded-lg border border-amber-500/25 bg-amber-950/15 p-2 text-xs text-amber-100/90">
              No API usage: set <code className="text-amber-200">OPENAI_API_KEY</code>{' '}
              in <code className="text-amber-200">server/.env</code> or{' '}
              <code className="text-amber-200">server/src/.env</code>, restart the
              API, then try again (optional{' '}
              <code className="text-amber-200">OPENAI_MODEL</code>,{' '}
              <code className="text-amber-200">OPENAI_BASE_URL</code>).
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-black/35 p-3 ring-1 ring-emerald-500/30">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300/90">
                SQL engine path (Starburst)
              </p>
              {api ? (
                <>
                  <p className="mt-1 font-mono text-xl font-bold tabular-nums text-white">
                    {sbPrompt.toLocaleString()}{' '}
                    <span className="text-sm font-normal text-slate-500">
                      in
                    </span>{' '}
                    · {sbCompl.toLocaleString()}{' '}
                    <span className="text-sm font-normal text-slate-500">
                      out
                    </span>
                  </p>
                  <p className="text-xs text-slate-500">
                    Σ {sbApiTotal.toLocaleString()} (provider billable)
                  </p>
                </>
              ) : (
                <p className="mt-1 text-sm text-slate-500">No LLM call</p>
              )}
              <p className="mt-2 border-t border-white/10 pt-2 font-mono text-sm tabular-nums text-slate-400">
                context-only (local cl100k): {ctxSb.toLocaleString()}
              </p>
              {api && pricePerMillion > 0 ? (
                <p className="mt-1 text-sm text-emerald-200/90">
                  ~{fmtUsd(sbCostApi)} round-trip @ $/1M (same rate in+out)
                </p>
              ) : null}
            </div>
            <div className="rounded-xl bg-black/35 p-3 ring-1 ring-amber-500/25">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-200/80">
                Naive LLM + S3 listing path
              </p>
              {api ? (
                <>
                  <p className="mt-1 font-mono text-xl font-bold tabular-nums text-amber-100">
                    {s3Prompt.toLocaleString()}{' '}
                    <span className="text-sm font-normal text-slate-500">
                      in
                    </span>{' '}
                    · {s3Compl.toLocaleString()}{' '}
                    <span className="text-sm font-normal text-slate-500">
                      out
                    </span>
                  </p>
                  <p className="text-xs text-slate-500">
                    Σ {s3ApiTotal.toLocaleString()} (provider billable)
                  </p>
                </>
              ) : (
                <p className="mt-1 text-sm text-slate-500">No LLM call</p>
              )}
              <p className="mt-2 border-t border-white/10 pt-2 font-mono text-sm tabular-nums text-slate-400">
                context-only (local cl100k): {ctxS3.toLocaleString()}
              </p>
              {api && pricePerMillion > 0 ? (
                <p className="mt-1 text-sm text-amber-200/80">
                  ~{fmtUsd(s3CostApi)} round-trip @ $/1M (same rate in+out)
                </p>
              ) : null}
            </div>
          </div>

          {api ? (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setShowLlmReplies((v) => !v)}
                className="text-sm font-medium text-violet-300 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
              >
                {showLlmReplies ? 'Hide' : 'Show'} LLM completions (verbatim)
              </button>
              {showLlmReplies ? (
                <div className="grid gap-3 lg:grid-cols-2">
                  <div>
                    <h3 className="mb-1 text-xs font-semibold text-emerald-300/80">
                      SQL engine path (Starburst) — model output
                    </h3>
                    <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-950/80 p-2 text-[11px] leading-relaxed text-slate-300 ring-1 ring-emerald-500/20">
                      {api.starburst.outputText ||
                        '(No assistant text in API response.)'}
                    </pre>
                  </div>
                  <div>
                    <h3 className="mb-1 text-xs font-semibold text-amber-200/80">
                      Naive LLM + S3 listing — model output
                    </h3>
                    <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-950/80 p-2 text-[11px] leading-relaxed text-slate-300 ring-1 ring-amber-500/20">
                      {api.s3Style.outputText ||
                        '(No assistant text in API response.)'}
                    </pre>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {ctxS3 > ctxSb ? (
              <span className="rounded-full bg-slate-600/30 px-3 py-1 text-xs text-slate-300">
                Context-only (cl100k): Starburst ≈ {(ratioCtx * 100).toFixed(1)}
                % of S3 ({pctCtx.toFixed(1)}% fewer)
              </span>
            ) : null}
            {api && s3ApiTotal > sbApiTotal ? (
              <>
                <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-200 ring-1 ring-emerald-400/40">
                  API round-trip: Starburst ≈ {(ratioApi * 100).toFixed(1)}% of
                  S3 ({pctApi.toFixed(1)}% fewer tokens)
                </span>
              </>
            ) : null}
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-slate-400">
              Data prep: Starburst {data.timingsMs.starburst} ms · S3{' '}
              {data.timingsMs.s3} ms · total {data.timingsMs.total} ms
            </span>
          </div>

          {data.warnings.length ? (
            <ul className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-3 text-xs text-amber-100/90">
              {data.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : null}

          <button
            type="button"
            onClick={() => setShowContexts((v) => !v)}
            className="text-sm font-medium text-violet-300 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
          >
            {showContexts ? 'Hide' : 'Show'} constructed context strings
          </button>
          {showContexts ? (
            <div className="grid gap-3 lg:grid-cols-2">
              <div>
                <h3 className="mb-1 text-xs font-semibold text-slate-500">
                  Starburst / SQL metadata context
                </h3>
                <pre className="max-h-56 overflow-auto rounded-lg bg-slate-950/80 p-2 text-[11px] text-slate-300">
                  {data.starburstContext}
                </pre>
              </div>
              <div>
                <h3 className="mb-1 text-xs font-semibold text-slate-500">
                  S3 agent-style context
                </h3>
                <pre className="max-h-56 overflow-auto rounded-lg bg-slate-950/80 p-2 text-[11px] text-slate-300">
                  {data.s3StyleContext}
                </pre>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
