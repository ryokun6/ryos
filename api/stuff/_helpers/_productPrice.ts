/** Shared money parsing for Stuff product lookup sources. */

export type ParsedMoney = {
  /** Numeric amount in major units (e.g. 248.00). */
  amount: number;
  /** ISO-ish currency code when known (USD, EUR, GBP, …). */
  currency: string;
};

const SYMBOL_TO_CURRENCY: Record<string, string> = {
  $: "USD",
  "€": "EUR",
  "£": "GBP",
  "¥": "JPY",
  "₹": "INR",
  "₩": "KRW",
  "₽": "RUB",
  A$: "AUD",
  C$: "CAD",
  NZ$: "NZD",
  HK$: "HKD",
};

/** Map a currency symbol or code to a short uppercase code. */
export function normalizeCurrencyCode(
  raw?: string,
  fallback = "USD"
): string {
  if (!raw?.trim()) return fallback;
  const trimmed = raw.trim();
  if (SYMBOL_TO_CURRENCY[trimmed]) return SYMBOL_TO_CURRENCY[trimmed];
  const upper = trimmed.toUpperCase();
  if (/^[A-Z]{3}$/.test(upper)) return upper;
  return fallback;
}

/**
 * Parse a display price like "$248.00", "USD 19.99", "€12,99", or a bare number.
 * Returns undefined for empty / non-positive / unparseable values.
 */
export function parseMoneyAmount(
  raw: string | number | null | undefined,
  fallbackCurrency = "USD"
): ParsedMoney | undefined {
  if (typeof raw === "number") {
    if (!Number.isFinite(raw) || raw <= 0) return undefined;
    return { amount: roundMoney(raw), currency: fallbackCurrency };
  }
  if (typeof raw !== "string" || !raw.trim()) return undefined;

  const text = raw.trim();
  const symbol =
    text.match(/^(A\$|C\$|NZ\$|HK\$|[$€£¥₹₩₽])/)?.[1] ||
    text.match(/\b(USD|EUR|GBP|AUD|CAD|JPY|INR)\b/i)?.[1];
  const currency = normalizeCurrencyCode(symbol, fallbackCurrency);

  // Prefer the first number-looking token; support 1,234.56 and 1.234,56.
  const match = text.match(/(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)/);
  if (!match) return undefined;

  let numeric = match[1];
  const hasComma = numeric.includes(",");
  const hasDot = numeric.includes(".");
  if (hasComma && hasDot) {
    // Last separator is the decimal.
    if (numeric.lastIndexOf(",") > numeric.lastIndexOf(".")) {
      numeric = numeric.replace(/\./g, "").replace(",", ".");
    } else {
      numeric = numeric.replace(/,/g, "");
    }
  } else if (hasComma && !hasDot) {
    // "12,99" → decimal; "1,234" → thousands (no cents) — treat 2-digit tail as decimal.
    numeric = /\d+,\d{1,2}$/.test(numeric)
      ? numeric.replace(",", ".")
      : numeric.replace(/,/g, "");
  }

  const amount = Number.parseFloat(numeric);
  if (!Number.isFinite(amount) || amount <= 0) return undefined;
  return { amount: roundMoney(amount), currency };
}

function roundMoney(amount: number): number {
  return Math.round(amount * 100) / 100;
}

/** Prefer offer price, then list price, from UPCitemdb-style offer rows. */
export function pickOfferMoney(
  offers?: Array<{
    price?: number | string;
    list_price?: number | string;
    currency?: string;
  }>
): ParsedMoney | undefined {
  if (!offers?.length) return undefined;
  for (const offer of offers) {
    const currency = normalizeCurrencyCode(offer.currency, "USD");
    const money =
      parseMoneyAmount(offer.price, currency) ??
      parseMoneyAmount(offer.list_price, currency);
    if (money) return money;
  }
  return undefined;
}

/**
 * Extract a price from an Amazon search-result card HTML fragment.
 * Prefers `a-offscreen` ("$248.00"), then whole+fraction spans.
 */
export function parseAmazonCardPrice(cardHtml: string): ParsedMoney | undefined {
  const offscreen = cardHtml.match(
    /class="[^"]*\ba-price[^"]*"[^>]*>[\s\S]{0,200}?class="[^"]*\ba-offscreen\b[^"]*"[^>]*>([^<]+)</i
  )?.[1]
    ?? cardHtml.match(/class="[^"]*\ba-offscreen\b[^"]*"[^>]*>(\$[^<]+)</i)?.[1];
  const fromOffscreen = parseMoneyAmount(offscreen);
  if (fromOffscreen) return fromOffscreen;

  const whole = cardHtml.match(/class="[^"]*\ba-price-whole\b[^"]*"[^>]*>([^<]+)/i)?.[1];
  const fraction = cardHtml.match(
    /class="[^"]*\ba-price-fraction\b[^"]*"[^>]*>([^<]+)/i
  )?.[1];
  if (whole) {
    const symbol =
      cardHtml.match(/class="[^"]*\ba-price-symbol\b[^"]*"[^>]*>([^<]+)/i)?.[1] ??
      "$";
    return parseMoneyAmount(
      `${symbol}${whole.replace(/[^\d]/g, "")}.${(fraction || "00").replace(/[^\d]/g, "")}`
    );
  }
  return undefined;
}
