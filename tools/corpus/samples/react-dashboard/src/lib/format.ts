export function formatCurrency(cents: number): string {
  return `${(cents / 100).toFixed(2)} €`;
}

export function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 100)} %`;
}
