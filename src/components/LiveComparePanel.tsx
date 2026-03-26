import { useState } from 'react'
import { estimateCostUsd } from '../lib/countTokens'

const apiBase = import.meta.env.VITE_API_BASE ?? ''

type CompareResponseOk = {
  ok: true
  starburstContext: string
  s3StyleContext: string
  tokenCounts: { starburst: number; s3Style: number }
  charCounts: { starburst: number; s3Style: number }
  timingsMs: { starburst: number; s3: number; total: number }
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
      setData(j)
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

  const sbTok = data?.tokenCounts.starburst ?? 0
  const s3Tok = data?.tokenCounts.s3Style ?? 0
  const ratio = s3Tok > 0 ? sbTok / s3Tok : 0
  const pct =
    s3Tok > 0 ? ((s3Tok - sbTok) / s3Tok) * 100 : sbTok === 0 ? 0 : 100
  const sbCost = estimateCostUsd(sbTok, pricePerMillion)
  const s3Cost = estimateCostUsd(s3Tok, pricePerMillion)

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
        The backend runs read-only SQL against{' '}
        <strong className="text-slate-300">information_schema</strong> in
        Galaxy (optionally scoped with{' '}
        <code className="text-cyan-200/90">STARBURST_TABLE</code>, e.g.{' '}
        <code className="text-cyan-200/90">kaggle_tx_data</code>) and a capped{' '}
        <strong className="text-slate-300">S3 ListObjects</strong>{' '}
        inventory. It builds two representative “tool + context” strings and
        counts tokens with the same <code className="text-cyan-200/90">cl100k_base</code>{' '}
        encoder as the simulator above. Secrets stay on the server (
        <code className="rounded bg-black/40 px-1">server/.env</code>).
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
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-black/35 p-3 ring-1 ring-emerald-500/30">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300/90">
                SQL engine path (Starburst)
              </p>
              <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-white">
                {data.tokenCounts.starburst.toLocaleString()}
              </p>
              <p className="text-xs text-slate-500">input tokens (estimate)</p>
              {pricePerMillion > 0 ? (
                <p className="mt-1 text-sm text-emerald-200/90">
                  ~{fmtUsd(sbCost)} / prompt
                </p>
              ) : null}
            </div>
            <div className="rounded-xl bg-black/35 p-3 ring-1 ring-amber-500/25">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-200/80">
                Naive LLM + S3 listing path
              </p>
              <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-amber-100">
                {data.tokenCounts.s3Style.toLocaleString()}
              </p>
              <p className="text-xs text-slate-500">input tokens (estimate)</p>
              {pricePerMillion > 0 ? (
                <p className="mt-1 text-sm text-amber-200/80">
                  ~{fmtUsd(s3Cost)} / prompt
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {s3Tok > sbTok ? (
              <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-200 ring-1 ring-emerald-400/40">
                Starburst context ≈ {(ratio * 100).toFixed(1)}% of S3-listing
                context ({pct.toFixed(1)}% fewer tokens vs S3 path)
              </span>
            ) : (
              <span className="rounded-full bg-slate-600/40 px-3 py-1 text-xs text-slate-300">
                S3 sample not larger than SQL metadata — widen{' '}
                <code className="text-cyan-200">MAX_S3_OBJECTS</code> or narrow Starburst
                columns.
              </span>
            )}
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-slate-400">
              Starburst {data.timingsMs.starburst} ms · S3 {data.timingsMs.s3}{' '}
              ms · total {data.timingsMs.total} ms
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
