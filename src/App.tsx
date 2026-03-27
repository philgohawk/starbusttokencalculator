import { useCallback, useState } from 'react'
import { PromptPreview } from './components/PromptPreview'
import { SchemaEditor } from './components/SchemaEditor'
import { DEMO_TABLES } from './data/demoTables'
import { LiveComparePanel } from './components/LiveComparePanel'
import { SpeedtestStyleResults } from './components/SpeedtestStyleResults'
import {
  buildStarbustPrompt,
  buildStandardParts,
  buildStandardPrompt,
  buildStarbustParts,
} from './lib/buildPrompts'
import { countPromptParts, estimateCostUsd } from './lib/countTokens'
import { MODEL_PRICE_PRESETS } from './lib/presets'
import type { BuildPromptOptions, TableDef } from './lib/types'

const defaultFewShot = `-- Q: revenue last month\nSELECT SUM(total_cents)/100.0 FROM orders WHERE created_at >= date_trunc('month', now()) - interval '1 month';
`

export default function App() {
  const [tables, setTables] = useState<TableDef[]>(DEMO_TABLES)
  const [fewShotText, setFewShotText] = useState(defaultFewShot)
  const [userQuestion, setUserQuestion] = useState(
    'Which countries had the most orders last week?',
  )
  const [starbustIncludeFewShots, setStarbustIncludeFewShots] = useState(false)
  const [starbustSchemaTokenMultiplier, setStarbustSchemaTokenMultiplier] =
    useState(1)
  const [pricePerMillion, setPricePerMillion] = useState(2)
  const [presetKey, setPresetKey] = useState<string>('GPT-4.1 (example)')
  const [whyOpen, setWhyOpen] = useState(false)

  const [measuring, setMeasuring] = useState(false)
  const [hasRun, setHasRun] = useState(false)
  const [standardTokens, setStandardTokens] = useState(0)
  const [starbustTokens, setStarbustTokens] = useState(0)
  const [standardLlm, setStandardLlm] = useState<{
    prompt: number
    completion: number
    outputText?: string
  } | null>(null)
  const [starbustLlm, setStarbustLlm] = useState<{
    prompt: number
    completion: number
    outputText?: string
  } | null>(null)
  const [llmMeasureNote, setLlmMeasureNote] = useState<string | null>(null)

  const buildOpts = useCallback((): BuildPromptOptions => {
    return {
      fewShotText,
      userQuestion,
      starbustIncludeFewShots,
      starbustSchemaTokenMultiplier,
    }
  }, [
    fewShotText,
    userQuestion,
    starbustIncludeFewShots,
    starbustSchemaTokenMultiplier,
  ])

  const runTest = async () => {
    const opts = buildOpts()
    setMeasuring(true)
    setHasRun(false)
    setStandardLlm(null)
    setStarbustLlm(null)
    setLlmMeasureNote(null)

    const stdParts = buildStandardParts(tables, opts)
    const sbParts = buildStarbustParts(tables, opts)
    const st = countPromptParts(stdParts, 1)
    const sb = countPromptParts(sbParts, starbustSchemaTokenMultiplier)
    setStandardTokens(st)
    setStarbustTokens(sb)

    const stdFull = buildStandardPrompt(tables, opts)
    const sbFull = buildStarbustPrompt(tables, opts)

    try {
      const r = await fetch(
        `${import.meta.env.VITE_API_BASE ?? ''}/api/measure-llm-tokens`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            standardPrompt: stdFull,
            starbustPrompt: sbFull,
          }),
        },
      )
      const j = (await r.json()) as {
        ok?: boolean
        error?: string
        standard?: {
          promptTokens: number
          completionTokens: number
          outputText?: string
        }
        starbust?: {
          promptTokens: number
          completionTokens: number
          outputText?: string
        }
      }
      if (j.ok && j.standard) {
        setStandardLlm({
          prompt: j.standard.promptTokens,
          completion: j.standard.completionTokens,
          outputText: j.standard.outputText,
        })
      }
      if (j.ok && j.starbust) {
        setStarbustLlm({
          prompt: j.starbust.promptTokens,
          completion: j.starbust.completionTokens,
          outputText: j.starbust.outputText,
        })
      }
      if (!j.ok) {
        setLlmMeasureNote(j.error ?? 'LLM token measurement failed')
      }
    } catch {
      setLlmMeasureNote(
        'Could not reach /api/measure-llm-tokens — run the API with OPENAI_API_KEY.',
      )
    } finally {
      setMeasuring(false)
      setHasRun(true)
    }
  }

  const opts = buildOpts()
  const standardPrompt = buildStandardPrompt(tables, opts)
  const starbustPrompt = buildStarbustPrompt(tables, opts)

  const stdCost = estimateCostUsd(standardTokens, pricePerMillion)
  const sbCost = estimateCostUsd(starbustTokens, pricePerMillion)
  const pctSaved =
    standardTokens > 0
      ? ((standardTokens - starbustTokens) / standardTokens) * 100
      : 0
  const tokensSaved = Math.max(0, standardTokens - starbustTokens)
  const costSaved = Math.max(0, stdCost - sbCost)
  const starbustRatio =
    standardTokens > 0 ? starbustTokens / standardTokens : 0

  return (
    <div className="min-h-svh bg-gradient-to-br from-slate-950 via-[#0a1628] to-slate-900 text-slate-200">
      <div className="mx-auto max-w-3xl px-4 py-8 pb-16">
        <header className="mb-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400/90">
            Developer utility
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Starbust Token Calculator
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm text-slate-400 sm:text-base">
            Estimate <strong className="text-slate-200">input</strong> tokens
            locally (<code className="text-cyan-200/90">cl100k_base</code>) and{' '}
            <strong className="text-slate-200">prompt + completion</strong> from
            the Chat Completions API when{' '}
            <code className="text-cyan-200/90">OPENAI_API_KEY</code> is set on
            the server. Compares <strong className="text-slate-200">Standard LLM-to-SQL</strong>{' '}
            vs a <strong className="text-cyan-200">Starbust-style</strong> compact
            prompt (typical OpenAI-class tokenization for the local part).
          </p>
        </header>

        <div className="mb-6 rounded-2xl border border-white/10 bg-black/20 p-4 text-left">
          <button
            type="button"
            onClick={() => setWhyOpen((v) => !v)}
            className="flex w-full items-center justify-between text-left text-sm font-medium text-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 rounded-lg"
            aria-expanded={whyOpen}
          >
            Why Starbust?
            <span className="text-cyan-400">{whyOpen ? '▾' : '▸'}</span>
          </button>
          {whyOpen ? (
            <p className="mt-3 text-sm leading-relaxed text-slate-400">
              Standard LLM querying often ships large schema DDL and few-shot
              SQL in every prompt. Starbust-style flows keep the same question
              accuracy with a smaller schema summary and usually no few-shots in
              context—cutting input tokens and cost.
            </p>
          ) : null}
        </div>

        <div className="mb-6">
          <LiveComparePanel pricePerMillion={pricePerMillion} />
        </div>

        <div className="space-y-5">
          <SchemaEditor tables={tables} onChange={setTables} />

          <section className="rounded-2xl border border-white/15 bg-white/5 p-4 text-left">
            <h2 className="text-base font-semibold text-white">
              Prompt inputs
            </h2>
            <label className="mt-3 block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                Few-shot examples (Standard always; Starbust optional)
              </span>
              <textarea
                value={fewShotText}
                onChange={(e) => setFewShotText(e.target.value)}
                rows={5}
                className="w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 font-mono text-sm text-white placeholder:text-slate-600 focus:border-cyan-400/60 focus:outline-none focus:ring-1 focus:ring-cyan-400"
                spellCheck={false}
              />
            </label>
            <label className="mt-3 block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                User question (natural language)
              </span>
              <textarea
                value={userQuestion}
                onChange={(e) => setUserQuestion(e.target.value)}
                rows={2}
                className="w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-cyan-400/60 focus:outline-none focus:ring-1 focus:ring-cyan-400"
              />
            </label>

            <fieldset className="mt-4 rounded-xl border border-white/10 bg-black/25 p-3">
              <legend className="px-1 text-xs font-semibold text-slate-400">
                Starbust options
              </legend>
              <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={starbustIncludeFewShots}
                  onChange={(e) =>
                    setStarbustIncludeFewShots(e.target.checked)
                  }
                  className="size-4 rounded border-white/30 bg-black/50 text-cyan-500 focus:ring-cyan-400"
                />
                Include few-shots on Starbust path
              </label>
              <div className="mt-3">
                <label
                  htmlFor="schema-mult"
                  className="flex justify-between text-xs text-slate-500"
                >
                  <span>Starbust schema token multiplier</span>
                  <span className="font-mono text-cyan-200/80">
                    ×{starbustSchemaTokenMultiplier.toFixed(2)}
                  </span>
                </label>
                <input
                  id="schema-mult"
                  type="range"
                  min={0.2}
                  max={1}
                  step={0.05}
                  value={starbustSchemaTokenMultiplier}
                  onChange={(e) =>
                    setStarbustSchemaTokenMultiplier(Number(e.target.value))
                  }
                  className="mt-1 w-full accent-cyan-500"
                />
                <p className="mt-1 text-[11px] text-slate-600">
                  Approx. scale on the compact schema section only (1 = as built;
                  lower = leaner representation).
                </p>
              </div>
            </fieldset>

            <div className="mt-4 flex flex-wrap items-end gap-3">
              <label className="min-w-[160px] flex-1">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                  Model preset (input $ / 1M tok)
                </span>
                <select
                  value={presetKey}
                  onChange={(e) => {
                    const key = e.target.value
                    setPresetKey(key)
                    const hit = MODEL_PRICE_PRESETS.find((p) => p.label === key)
                    if (hit && hit.pricePerMillion >= 0) {
                      setPricePerMillion(hit.pricePerMillion)
                    }
                  }}
                  className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white focus:border-cyan-400/60 focus:outline-none focus:ring-1 focus:ring-cyan-400"
                >
                  {MODEL_PRICE_PRESETS.map((p) => (
                    <option key={p.label} value={p.label}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="min-w-[140px]">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                  Price (USD / 1M in)
                </span>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={pricePerMillion || ''}
                  onChange={(e) => {
                    setPresetKey('Custom')
                    setPricePerMillion(Number(e.target.value) || 0)
                  }}
                  className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white focus:border-cyan-400/60 focus:outline-none focus:ring-1 focus:ring-cyan-400"
                />
              </label>
            </div>
          </section>

          <div className="flex flex-col items-center gap-4">
            <button
              type="button"
              onClick={runTest}
              disabled={measuring}
              className="h-16 w-16 rounded-full bg-gradient-to-br from-cyan-400 to-violet-500 text-lg font-black text-slate-950 shadow-lg shadow-cyan-500/25 transition hover:scale-105 hover:shadow-cyan-400/35 focus:outline-none focus-visible:ring-4 focus-visible:ring-cyan-300/50 disabled:opacity-60"
              aria-live="polite"
            >
              GO
            </button>
            <p className="text-xs text-slate-500">
              {measuring ? 'Measuring…' : 'Run comparison'}
            </p>

            <SpeedtestStyleResults
              starbustRatio={starbustRatio}
              standardTokens={standardTokens}
              starbustTokens={starbustTokens}
              standardLlm={standardLlm}
              starbustLlm={starbustLlm}
              llmMeasureNote={llmMeasureNote}
              standardCost={stdCost}
              starbustCost={sbCost}
              pctSaved={pctSaved}
              tokensSaved={tokensSaved}
              costSaved={costSaved}
              measuring={measuring}
              visible={hasRun}
              pricePerMillion={pricePerMillion}
            />
          </div>

          <PromptPreview
            standardPrompt={standardPrompt}
            starbustPrompt={starbustPrompt}
          />
        </div>
      </div>
    </div>
  )
}
