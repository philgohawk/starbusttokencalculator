/** Editable presets — verify current vendor pricing before relying on figures. */
export const MODEL_PRICE_PRESETS = [
  { label: 'Custom', pricePerMillion: 0 },
  { label: 'GPT-4.1 (example)', pricePerMillion: 2 },
  { label: 'GPT-4o (example)', pricePerMillion: 2.5 },
  { label: 'GPT-4o mini (example)', pricePerMillion: 0.15 },
] as const
