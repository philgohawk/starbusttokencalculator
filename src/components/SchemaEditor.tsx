import type { ColumnDef, TableDef } from '../lib/types'

type Props = {
  tables: TableDef[]
  onChange: (tables: TableDef[]) => void
}

const emptyColumn = (): ColumnDef => ({
  name: '',
  type: 'TEXT',
  comment: '',
})

const emptyTable = (): TableDef => ({
  name: '',
  columns: [emptyColumn()],
})

export function SchemaEditor({ tables, onChange }: Props) {
  const updateTable = (i: number, patch: Partial<TableDef>) => {
    const next = tables.map((t, idx) => (idx === i ? { ...t, ...patch } : t))
    onChange(next)
  }

  const updateColumn = (
    tableIndex: number,
    colIndex: number,
    patch: Partial<ColumnDef>,
  ) => {
    const next = tables.map((t, ti) => {
      if (ti !== tableIndex) return t
      const columns = t.columns.map((c, ci) =>
        ci === colIndex ? { ...c, ...patch } : c,
      )
      return { ...t, columns }
    })
    onChange(next)
  }

  const addTable = () => onChange([...tables, emptyTable()])
  const removeTable = (i: number) =>
    onChange(tables.filter((_, idx) => idx !== i))

  const addColumn = (ti: number) => {
    const t = tables[ti]
    if (!t) return
    updateTable(ti, { columns: [...t.columns, emptyColumn()] })
  }

  const removeColumn = (ti: number, ci: number) => {
    const t = tables[ti]
    if (!t || t.columns.length <= 1) return
    updateTable(ti, {
      columns: t.columns.filter((_, idx) => idx !== ci),
    })
  }

  return (
    <section
      className="rounded-2xl border border-white/15 bg-white/5 p-4 text-left"
      aria-labelledby="schema-heading"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="schema-heading" className="text-base font-semibold text-white">
          Schema
        </h2>
        <button
          type="button"
          onClick={addTable}
          className="rounded-full bg-white/15 px-3 py-1.5 text-sm font-medium text-white ring-1 ring-white/20 hover:bg-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
        >
          Add table
        </button>
      </div>
      <p className="mb-4 text-sm text-slate-400">
        Standard path uses full DDL; Starbust uses a compact{' '}
        <code className="rounded bg-black/30 px-1 text-cyan-200">table(col:type)</code>{' '}
        summary.
      </p>
      <ul className="space-y-4">
        {tables.map((table, ti) => (
          <li
            key={ti}
            className="rounded-xl border border-white/10 bg-black/20 p-3"
          >
            <div className="mb-2 flex flex-wrap items-end gap-2">
              <label className="min-w-[120px] flex-1">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                  Table name
                </span>
                <input
                  value={table.name}
                  onChange={(e) => updateTable(ti, { name: e.target.value })}
                  placeholder="orders"
                  className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-white placeholder:text-slate-500 focus:border-cyan-400/60 focus:outline-none focus:ring-1 focus:ring-cyan-400"
                />
              </label>
              <button
                type="button"
                onClick={() => removeTable(ti)}
                className="rounded-lg px-2 py-2 text-sm text-rose-300 hover:bg-rose-500/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                aria-label={`Remove table ${table.name || ti + 1}`}
              >
                Remove
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500">
                    <th className="pb-2 pr-2 font-medium">Column</th>
                    <th className="pb-2 pr-2 font-medium">Type</th>
                    <th className="pb-2 pr-2 font-medium">Comment</th>
                    <th className="pb-2" />
                  </tr>
                </thead>
                <tbody>
                  {table.columns.map((col, ci) => (
                    <tr key={ci}>
                      <td className="py-1 pr-2">
                        <input
                          value={col.name}
                          onChange={(e) =>
                            updateColumn(ti, ci, { name: e.target.value })
                          }
                          placeholder="id"
                          className="w-full rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-white focus:border-cyan-400/60 focus:outline-none focus:ring-1 focus:ring-cyan-400"
                        />
                      </td>
                      <td className="py-1 pr-2">
                        <input
                          value={col.type}
                          onChange={(e) =>
                            updateColumn(ti, ci, { type: e.target.value })
                          }
                          placeholder="INTEGER"
                          className="w-full rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-white focus:border-cyan-400/60 focus:outline-none focus:ring-1 focus:ring-cyan-400"
                        />
                      </td>
                      <td className="py-1 pr-2">
                        <input
                          value={col.comment ?? ''}
                          onChange={(e) =>
                            updateColumn(ti, ci, {
                              comment: e.target.value,
                            })
                          }
                          placeholder="optional"
                          className="w-full rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-white focus:border-cyan-400/60 focus:outline-none focus:ring-1 focus:ring-cyan-400"
                        />
                      </td>
                      <td className="py-1 text-right">
                        <button
                          type="button"
                          onClick={() => removeColumn(ti, ci)}
                          disabled={table.columns.length <= 1}
                          className="text-xs text-slate-400 hover:text-rose-300 disabled:opacity-30"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              type="button"
              onClick={() => addColumn(ti)}
              className="mt-2 text-xs font-medium text-cyan-300 hover:underline"
            >
              + Add column
            </button>
          </li>
        ))}
      </ul>
      {tables.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">No tables yet.</p>
      ) : null}
    </section>
  )
}
