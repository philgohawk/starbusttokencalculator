import { useState } from 'react'
import { estimateCostUsd } from '../lib/countTokens'

type LlmPair = {
  prompt: number
  completion: number
  outputText?: string
} | null

type Props = {
  /** 0–1 Starbust tokens relative to Standard (for needle). */
  starbustRatio: number
  standardTokens: number
  starbustTokens: number
  standardLlm: LlmPair
  starbustLlm: LlmPair
  llmMeasureNote: string | null
  standardCost: number
  starbustCost: number
  pctSaved: number
  tokensSaved: number
  costSaved: number
  measuring: boolean
  visible: boolean
  pricePerMillion: number
}

function polarToCartesian(
  cx: number,
  cy: number,
  r: number,
  angleDeg: number,
) {
  const rad = ((angleDeg - 180) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function describeArc(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number,
) {
  const start = polarToCartesian(cx, cy, r, endAngle)
  const end = polarToCartesian(cx, cy, r, startAngle)
  const largeArc = endAngle - startAngle <= 180 ? '0' : '1'
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`
}

export function SpeedtestStyleResults({
  starbustRatio,
  standardTokens,
  starbustTokens,
  standardLlm,
  starbustLlm,
  llmMeasureNote,
  standardCost,
  starbustCost,
  pctSaved,
  tokensSaved,
  costSaved,
  measuring,
  visible,
  pricePerMillion,
}: Props) {
  const [showLlmReplies, setShowLlmReplies] = useState(true)
  const cx = 110
  const cy = 110
  const r = 88
  const trackD = describeArc(cx, cy, r, 0, 180)
  const needleAngle = 180 - Math.min(1, Math.max(0, starbustRatio)) * 180
  const needle = polarToCartesian(cx, cy, r - 12, needleAngle)

  const fmtUsd = (n: number) =>
    n < 0.0001 && n > 0
      ? '< $0.0001'
      : n.toLocaleString(undefined, {
          style: 'currency',
          currency: 'USD',
          minimumFractionDigits: 2,
          maximumFractionDigits: 4,
        })

  const fmtInt = (n: number) =>
    n.toLocaleString(undefined, { maximumFractionDigits: 0 })

  const stdApiTotal = standardLlm
    ? standardLlm.prompt + standardLlm.completion
    : 0
  const sbApiTotal = starbustLlm
    ? starbustLlm.prompt + starbustLlm.completion
    : 0

  const stdApiUsd =
    standardLlm && pricePerMillion > 0
      ? estimateCostUsd(stdApiTotal, pricePerMillion)
      : 0
  const sbApiUsd =
    starbustLlm && pricePerMillion > 0
      ? estimateCostUsd(sbApiTotal, pricePerMillion)
      : 0

  return (
    <div
      className={`relative rounded-3xl border border-white/15 bg-gradient-to-b from-white/10 to-black/20 px-4 pb-6 pt-2 shadow-xl shadow-black/40 backdrop-blur-md transition-opacity ${visible ? 'opacity-100' : 'pointer-events-none opacity-40'}`}
      aria-live="polite"
    >
      <p className="sr-only">
        {visible
          ? `Standard local input ${fmtInt(standardTokens)} tokens. Starbust local input ${fmtInt(starbustTokens)}. API standard round-trip ${standardLlm ? fmtInt(stdApiTotal) : 'n/a'}; starbust ${starbustLlm ? fmtInt(sbApiTotal) : 'n/a'}. Input savings about ${pctSaved.toFixed(1)} percent.`
          : 'Run the test to see token estimates.'}
      </p>

      <div
        className={`relative mx-auto max-w-[220px] ${measuring ? 'gauge-measuring' : ''}`}
        aria-hidden
      >
        <svg
          viewBox="0 0 220 124"
          className="w-full"
          role="img"
          aria-label="Context load gauge"
        >
          <defs>
            <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#22d3ee" />
              <stop offset="100%" stopColor="#a78bfa" />
            </linearGradient>
          </defs>
          <path
            d={trackD}
            fill="none"
            stroke="rgba(255,255,255,0.12)"
            strokeWidth="14"
            strokeLinecap="round"
          />
          <path
            d={trackD}
            fill="none"
            stroke="url(#gaugeGrad)"
            strokeWidth="14"
            strokeLinecap="round"
            strokeDasharray={`${Math.PI * r} ${Math.PI * r}`}
            strokeDashoffset={
              Math.PI * r * (1 - Math.min(1, Math.max(0, starbustRatio)))
            }
            className="transition-[stroke-dashoffset] duration-700 ease-out"
          />
          <line
            x1={cx}
            y1={cy}
            x2={needle.x}
            y2={needle.y}
            stroke="white"
            strokeWidth="3"
            strokeLinecap="round"
            className="transition-all duration-500 ease-out"
          />
          <circle cx={cx} cy={cy} r="10" fill="#0f172a" stroke="white" strokeWidth="2" />
        </svg>
        <p className="-mt-2 text-center text-[11px] font-medium uppercase tracking-widest text-slate-500">
          Input context load
        </p>
        <p className="mt-1 text-center text-[10px] text-slate-600">
          API: Chat Completions usage (below)
        </p>
      </div>

      {visible && llmMeasureNote ? (
        <p className="mt-2 rounded-lg border border-amber-500/25 bg-amber-950/20 px-2 py-1.5 text-center text-[11px] text-amber-100/90">
          {llmMeasureNote}
        </p>
      ) : null}

      <div className="mt-2 grid grid-cols-2 gap-3 text-center">
        <div className="rounded-2xl bg-black/35 px-3 py-3 ring-1 ring-white/10">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Standard
          </p>
          <p className="mt-1 font-mono text-3xl font-bold tabular-nums text-white">
            {visible ? fmtInt(standardTokens) : '—'}
          </p>
          <p className="text-xs text-slate-500">local input (cl100k)</p>
          <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">
            API
          </p>
          {visible && standardLlm ? (
            <>
              <p className="mt-0.5 font-mono text-sm tabular-nums text-slate-300">
                {fmtInt(standardLlm.prompt)} in ·{' '}
                {fmtInt(standardLlm.completion)} out
              </p>
              <p className="text-[11px] text-slate-500">Σ {fmtInt(stdApiTotal)}</p>
              {pricePerMillion > 0 ? (
                <p className="mt-1 text-xs font-medium text-rose-200/80">
                  ~{fmtUsd(stdApiUsd)} round-trip @ $/1M
                </p>
              ) : null}
            </>
          ) : (
            <p className="mt-0.5 text-[11px] text-slate-600">—</p>
          )}
          {pricePerMillion > 0 ? (
            <p className="mt-2 border-t border-white/10 pt-2 text-xs font-medium text-rose-200/60">
              {visible ? (
                <>
                  {fmtUsd(standardCost)}{' '}
                  <span className="text-slate-500">local input only</span>
                </>
              ) : (
                '—'
              )}
            </p>
          ) : (
            <p className="mt-2 text-xs text-slate-600">Add price for USD</p>
          )}
        </div>
        <div className="rounded-2xl bg-black/35 px-3 py-3 ring-1 ring-cyan-500/30">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-cyan-400/80">
            Starbust
          </p>
          <p className="mt-1 font-mono text-3xl font-bold tabular-nums text-cyan-200">
            {visible ? fmtInt(starbustTokens) : '—'}
          </p>
          <p className="text-xs text-slate-500">local input (cl100k)</p>
          <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">
            API
          </p>
          {visible && starbustLlm ? (
            <>
              <p className="mt-0.5 font-mono text-sm tabular-nums text-cyan-100/90">
                {fmtInt(starbustLlm.prompt)} in ·{' '}
                {fmtInt(starbustLlm.completion)} out
              </p>
              <p className="text-[11px] text-slate-500">Σ {fmtInt(sbApiTotal)}</p>
              {pricePerMillion > 0 ? (
                <p className="mt-1 text-xs font-medium text-emerald-200/90">
                  ~{fmtUsd(sbApiUsd)} round-trip @ $/1M
                </p>
              ) : null}
            </>
          ) : (
            <p className="mt-0.5 text-[11px] text-slate-600">—</p>
          )}
          {pricePerMillion > 0 ? (
            <p className="mt-2 border-t border-white/10 pt-2 text-xs font-medium text-emerald-200/70">
              {visible ? (
                <>
                  {fmtUsd(starbustCost)}{' '}
                  <span className="text-slate-500">local input only</span>
                </>
              ) : (
                '—'
              )}
            </p>
          ) : (
            <p className="mt-2 text-xs text-slate-600">Add price for USD</p>
          )}
        </div>
      </div>

      {visible && (standardLlm || starbustLlm) ? (
        <div className="mt-4 space-y-2 text-left">
          <button
            type="button"
            onClick={() => setShowLlmReplies((v) => !v)}
            className="w-full text-center text-[11px] font-medium text-cyan-300/90 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50"
          >
            {showLlmReplies ? 'Hide' : 'Show'} LLM completions (verbatim)
          </button>
          {showLlmReplies ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Standard path
                </p>
                <pre className="max-h-52 overflow-auto whitespace-pre-wrap rounded-xl bg-black/40 p-2 text-[10px] leading-relaxed text-slate-300 ring-1 ring-white/10">
                  {standardLlm?.outputText?.trim()
                    ? standardLlm.outputText
                    : '—'}
                </pre>
              </div>
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-cyan-500/70">
                  Starbust path
                </p>
                <pre className="max-h-52 overflow-auto whitespace-pre-wrap rounded-xl bg-black/40 p-2 text-[10px] leading-relaxed text-cyan-100/90 ring-1 ring-cyan-500/25">
                  {starbustLlm?.outputText?.trim()
                    ? starbustLlm.outputText
                    : '—'}
                </pre>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {visible ? (
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-200 ring-1 ring-emerald-400/40">
            {pctSaved.toFixed(1)}% fewer local input tokens
          </span>
          <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-slate-200 ring-1 ring-white/15">
            −{fmtInt(tokensSaved)} tokens
          </span>
          {pricePerMillion > 0 && costSaved > 0 ? (
            <span className="rounded-full bg-amber-500/15 px-3 py-1 text-xs font-medium text-amber-100 ring-1 ring-amber-400/35">
              Save ~{fmtUsd(costSaved)} / prompt (local input)
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
