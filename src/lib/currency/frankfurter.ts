/** Prefer `/api/currency-rate` (server proxy + fallbacks); see `api/currency-rate.ts`. */

const FRANKFURTER_LATEST = "https://api.frankfurter.app/latest";

export interface FrankfurterLatestResponse {
  amount: number;
  base: string;
  date: string;
  rates: Record<string, number>;
}

interface CurrencyRateApiOk {
  rate: number;
  rateDate: string;
  source?: string;
}

function normalizePair(from: string, to: string) {
  return { from: from.trim().toUpperCase(), to: to.trim().toUpperCase() };
}

export function parseAmountInput(raw: string): number {
  const normalized = raw.replace(/,/g, ".").replace(/[^\d.+-]/g, "");
  const n = parseFloat(normalized);
  return Number.isFinite(n) ? n : 0;
}

/** Direct Frankfurter (ECB). Uses `redirect: "follow"` because api.frankfurter.app may 301. */
export async function fetchFrankfurterPairRateDirect(
  from: string,
  to: string,
  signal?: AbortSignal
): Promise<{ rate: number; rateDate: string }> {
  const { from: trimmedFrom, to: trimmedTo } = normalizePair(from, to);

  if (trimmedFrom === trimmedTo) {
    return { rate: 1, rateDate: new Date().toISOString().slice(0, 10) };
  }

  const url = `${FRANKFURTER_LATEST}?from=${encodeURIComponent(trimmedFrom)}&to=${encodeURIComponent(trimmedTo)}`;
  const res = await fetch(url, {
    signal,
    redirect: "follow",
    headers: { Accept: "application/json" },
  });
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

export async function fetchCurrencyRateForWidget(
  from: string,
  to: string,
  signal?: AbortSignal
): Promise<{ rate: number; rateDate: string }> {
  const { from: f, to: t } = normalizePair(from, to);
  if (f === t) {
    return { rate: 1, rateDate: new Date().toISOString().slice(0, 10) };
  }

  try {
    const url = `/api/currency-rate?from=${encodeURIComponent(f)}&to=${encodeURIComponent(t)}`;
    const res = await fetch(url, { signal, headers: { Accept: "application/json" } });
    if (res.ok) {
      const data = (await res.json()) as CurrencyRateApiOk;
      if (typeof data.rate === "number" && Number.isFinite(data.rate) && data.rateDate) {
        return { rate: data.rate, rateDate: data.rateDate };
      }
    }
  } catch {
    // Vite-only dev (no API) or network — fall through to direct Frankfurter
  }

  return fetchFrankfurterPairRateDirect(f, t, signal);
}
