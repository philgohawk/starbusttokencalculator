import { useId, useState } from 'react'

type Props = {
  standardPrompt: string
  starbustPrompt: string
}

export function PromptPreview({ standardPrompt, starbustPrompt }: Props) {
  const [open, setOpen] = useState(false)
  const id = useId()

  return (
    <div className="mt-6 rounded-2xl border border-white/10 bg-black/30 text-left">
      <button
        type="button"
        id={`${id}-trigger`}
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-2xl px-4 py-3 text-left text-sm font-medium text-slate-200 hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
      >
        View constructed prompts
        <span className="text-cyan-300" aria-hidden>
          {open ? '▾' : '▸'}
        </span>
      </button>
      {open ? (
        <div
          id={`${id}-panel`}
          role="region"
          aria-labelledby={`${id}-trigger`}
          className="border-t border-white/10 px-4 pb-4"
        >
          <div className="mt-3 grid gap-4 lg:grid-cols-2">
            <div>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Standard path
              </h3>
              <pre className="max-h-48 overflow-auto rounded-lg bg-slate-950/80 p-3 text-xs text-slate-300">
                {standardPrompt}
              </pre>
            </div>
            <div>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Starbust path
              </h3>
              <pre className="max-h-48 overflow-auto rounded-lg bg-slate-950/80 p-3 text-xs text-slate-300">
                {starbustPrompt}
              </pre>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
