import type { StuffPrices } from "../types";
import { formatMoney } from "./colors";

export interface StuffSoldNameplatePrices {
  /** Display amount: sold → asking (discounted) → original */
  saleFormatted: string | null;
  /** Original amount when it should render struck through */
  originalStruckFormatted: string | null;
}

/** Coerce persisted / sync values to a finite number. */
function asFiniteAmount(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

/**
 * Format a shelf nameplate price. Amount `0` becomes the localized Free label
 * (Permanent Marker title case — matches Sold / For Sale).
 */
export function formatStuffNameplatePrice(
  amount: unknown,
  currency: string,
  freeLabel: string
): string | null {
  const value = asFiniteAmount(amount);
  if (value === undefined) return null;
  if (value === 0) return freeLabel;
  return formatMoney(value, currency);
}

/**
 * Resolve sold-status nameplate amounts.
 * Sale prefers `sold`, then asking (`discounted`), then `original`.
 * Original is struck through when present and different from the sale amount
 * (or when sale falls back to original — strike only, no duplicate).
 */
export function resolveStuffSoldNameplatePrices(
  prices: StuffPrices,
  freeLabel = "Free"
): StuffSoldNameplatePrices {
  const currency = prices.currency;
  const sold = asFiniteAmount(prices.sold);
  const discounted = asFiniteAmount(prices.discounted);
  const original = asFiniteAmount(prices.original);
  const saleAmount = sold ?? discounted ?? original;
  const saleFormatted = formatStuffNameplatePrice(
    saleAmount,
    currency,
    freeLabel
  );

  if (original === undefined || saleAmount === undefined) {
    return { saleFormatted, originalStruckFormatted: null };
  }

  // Sale is the original fallback only — strike it, don't repeat the number.
  if (saleAmount === original && sold === undefined && discounted === undefined) {
    return {
      saleFormatted: null,
      originalStruckFormatted: formatStuffNameplatePrice(
        original,
        currency,
        freeLabel
      ),
    };
  }

  if (saleAmount === original) {
    return { saleFormatted, originalStruckFormatted: null };
  }

  return {
    saleFormatted,
    originalStruckFormatted: formatStuffNameplatePrice(
      original,
      currency,
      freeLabel
    ),
  };
}
