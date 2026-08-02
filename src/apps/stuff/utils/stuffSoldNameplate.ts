import type { StuffPrices } from "../types";
import { formatMoney } from "./colors";

export interface StuffSoldNameplatePrices {
  /** Display amount: sold → asking (discounted) → original */
  saleFormatted: string | null;
  /** Original amount when it should render struck through */
  originalStruckFormatted: string | null;
}

/**
 * Resolve sold-status nameplate amounts.
 * Sale prefers `sold`, then asking (`discounted`), then `original`.
 * Original is struck through when present and different from the sale amount
 * (or when sale falls back to original — strike only, no duplicate).
 */
export function resolveStuffSoldNameplatePrices(
  prices: StuffPrices
): StuffSoldNameplatePrices {
  const currency = prices.currency;
  const saleAmount = prices.sold ?? prices.discounted ?? prices.original;
  const saleFormatted = formatMoney(saleAmount, currency);
  const original = prices.original;

  if (
    original === undefined ||
    Number.isNaN(original) ||
    saleAmount === undefined ||
    Number.isNaN(saleAmount)
  ) {
    return { saleFormatted, originalStruckFormatted: null };
  }

  // Sale is the original fallback only — strike it, don't repeat the number.
  if (saleAmount === original && prices.sold == null && prices.discounted == null) {
    return {
      saleFormatted: null,
      originalStruckFormatted: formatMoney(original, currency),
    };
  }

  if (saleAmount === original) {
    return { saleFormatted, originalStruckFormatted: null };
  }

  return {
    saleFormatted,
    originalStruckFormatted: formatMoney(original, currency),
  };
}
