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

export function getCurrencyMaxFractionDigits(currency: string): number {
  const upper = currency.trim().toUpperCase();
  // Currencies that conventionally have no minor unit
  if (
    upper === "JPY" ||
    upper === "KRW" ||
    upper === "VND" ||
    upper === "CLP" ||
    upper === "ISK" ||
    upper === "HUF"
  ) {
    return 0;
  }
  return 2;
}

/**
 * Normalize a user-typed amount string into a canonical numeric form
 * (digits and at most one ".") suitable for storage and parsing.
 * Accepts "," as decimal separator while typing and strips all other chars
 * (currency symbols, group separators, whitespace, letters).
 */
export function normalizeAmountInput(raw: string, maxFractionDigits = 2): string {
  if (!raw) return "";

  let s = raw;

  // If both "." and "," are present, treat the rightmost separator as decimal
  // and the others as group separators.
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  if (lastDot !== -1 && lastComma !== -1) {
    if (lastDot > lastComma) {
      s = s.replace(/,/g, "");
    } else {
      s = s.replace(/\./g, "").replace(",", ".");
    }
  } else if (lastComma !== -1) {
    // Only commas — treat the last one as decimal separator
    const before = s.slice(0, lastComma).replace(/,/g, "");
    const after = s.slice(lastComma + 1);
    s = `${before}.${after}`;
  }

  // Keep only digits and a single dot
  s = s.replace(/[^\d.]/g, "");
  const firstDot = s.indexOf(".");
  if (firstDot !== -1) {
    s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, "");
  }

  if (maxFractionDigits <= 0) {
    s = s.replace(/\./g, "");
  } else if (s.includes(".")) {
    const [intPart, decPart = ""] = s.split(".");
    s = intPart + "." + decPart.slice(0, maxFractionDigits);
  }

  // Strip leading zeros from the integer part (keep "0" and "0.xxx")
  if (s.includes(".")) {
    const [intPart, decPart] = s.split(".");
    const trimmedInt = intPart.replace(/^0+/, "");
    s = (trimmedInt === "" ? "0" : trimmedInt) + "." + decPart;
  } else if (s.length > 1) {
    const trimmed = s.replace(/^0+/, "");
    s = trimmed === "" ? "0" : trimmed;
  }

  return s;
}

/** Locale-specific decimal/group separators for plain number formatting. */
function getNumberSeparators(locale: string): { decimal: string; group: string } {
  try {
    const parts = new Intl.NumberFormat(locale, {
      minimumFractionDigits: 1,
      useGrouping: true,
    }).formatToParts(1234.5);
    return {
      decimal: parts.find((p) => p.type === "decimal")?.value ?? ".",
      group: parts.find((p) => p.type === "group")?.value ?? ",",
    };
  } catch {
    return { decimal: ".", group: "," };
  }
}

/**
 * Format a canonical numeric string (e.g. "1234.5") as a localized currency
 * display string (e.g. "$1,234.5"). Preserves a trailing "." and trailing
 * fractional zeros so the user can keep typing.
 */
export function formatCurrencyAmountDisplay(
  normalized: string,
  currency: string,
  locale: string
): string {
  const maxFrac = getCurrencyMaxFractionDigits(currency);
  const sep = getNumberSeparators(locale);

  if (normalized === "" || normalized === "." || normalized === "0.") {
    // Show empty when nothing typed; show "0" + decimal sep when partially typed
    if (normalized === "") return "";
    if (normalized === ".") return `0${sep.decimal}`;
    return `0${sep.decimal}`;
  }

  const hasDecimal = normalized.includes(".");
  const [intPartRaw, decPartRaw = ""] = normalized.split(".");
  const intPart = intPartRaw === "" ? "0" : intPartRaw;
  const intNum = Number.parseInt(intPart, 10);
  if (!Number.isFinite(intNum)) return "";

  // Format the integer part with the currency symbol/placement and grouping.
  const intFormatted = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(intNum);

  if (!hasDecimal || maxFrac === 0) {
    return intFormatted;
  }

  // Append the decimal separator + raw decimal digits (preserving trailing zeros)
  const dec = decPartRaw.slice(0, maxFrac);
  return `${intFormatted}${sep.decimal}${dec}`;
}

/** Count digit characters in a string up to (but not including) `pos`. */
export function countDigitsBeforePos(s: string, pos: number): number {
  let count = 0;
  const limit = Math.min(pos, s.length);
  for (let i = 0; i < limit; i++) {
    if (s.charCodeAt(i) >= 48 && s.charCodeAt(i) <= 57) count++;
  }
  return count;
}

/** Find the string index that comes right after the Nth digit. */
export function positionAfterNthDigit(s: string, n: number): number {
  if (n <= 0) return 0;
  let count = 0;
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) >= 48 && s.charCodeAt(i) <= 57) {
      count++;
      if (count === n) return i + 1;
    }
  }
  return s.length;
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
