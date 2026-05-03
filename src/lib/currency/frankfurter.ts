/** Frankfurter (ECB) public API — no API key, CORS-friendly for browser use. */

const FRANKFURTER_LATEST = "https://api.frankfurter.app/latest";

export interface FrankfurterLatestResponse {
  amount: number;
  base: string;
  date: string;
  rates: Record<string, number>;
}

export async function fetchFrankfurterPairRate(
  from: string,
  to: string,
  signal?: AbortSignal
): Promise<{ rate: number; rateDate: string }> {
  const trimmedFrom = from.trim().toUpperCase();
  const trimmedTo = to.trim().toUpperCase();

  if (trimmedFrom === trimmedTo) {
    return { rate: 1, rateDate: new Date().toISOString().slice(0, 10) };
  }

  const url = `${FRANKFURTER_LATEST}?from=${encodeURIComponent(trimmedFrom)}&to=${encodeURIComponent(trimmedTo)}`;
  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new Error(`Frankfurter HTTP ${res.status}`);
  }
  const data = (await res.json()) as FrankfurterLatestResponse;
  const rate = data.rates[trimmedTo];
  if (typeof rate !== "number" || !Number.isFinite(rate)) {
    throw new Error("Frankfurter: missing rate");
  }
  return { rate, rateDate: data.date };
}

export function parseAmountInput(raw: string): number {
  const normalized = raw.replace(/,/g, ".").replace(/[^\d.+-]/g, "");
  const n = parseFloat(normalized);
  return Number.isFinite(n) ? n : 0;
}
