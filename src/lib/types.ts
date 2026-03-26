export type ColumnDef = {
  name: string
  type: string
  comment?: string
}

export type TableDef = {
  name: string
  columns: ColumnDef[]
}

export type BuildPromptOptions = {
  fewShotText: string
  userQuestion: string
  /** Include few-shot block on the Starbust path (default false). */
  starbustIncludeFewShots: boolean
  /**
   * Approximate scale applied to Starbust schema token count only (0.2–1.0).
   * 1 = use abbreviated schema as-is; lower = assume even leaner representation.
   */
  starbustSchemaTokenMultiplier: number
}

export type PromptParts = {
  preamble: string
  schema: string
  fewShotSection: string
  questionSection: string
}
