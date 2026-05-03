import { describe, expect, test } from "bun:test";
import { crossRateFromUsdRates } from "../api/_utils/currency-cross-rate.js";

describe("crossRateFromUsdRates", () => {
  const rates = { EUR: 0.9, GBP: 0.8, JPY: 150 };

  test("USD to other", () => {
    expect(crossRateFromUsdRates(rates, "USD", "EUR")).toBe(0.9);
  });

  test("other to USD", () => {
    expect(crossRateFromUsdRates(rates, "EUR", "USD")).toBeCloseTo(1 / 0.9);
  });

  test("cross via USD", () => {
    expect(crossRateFromUsdRates(rates, "EUR", "GBP")).toBeCloseTo(0.8 / 0.9);
  });

  test("identity", () => {
    expect(crossRateFromUsdRates(rates, "CHF", "CHF")).toBe(1);
  });
});
