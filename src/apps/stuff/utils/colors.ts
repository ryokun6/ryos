/** Deterministic cover colors for items without photos (Books-style). */
export function colorFromString(input: string): { bg: string; fg: string } {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  const hue = Math.abs(hash) % 360;
  return {
    bg: `hsl(${hue}, 42%, 36%)`,
    fg: "#f5f1e6",
  };
}

export function formatMoney(
  amount: number | undefined,
  currency = "USD",
  locale = "en-US"
): string | null {
  if (amount === undefined || Number.isNaN(amount)) return null;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

export function parseOptionalNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}
