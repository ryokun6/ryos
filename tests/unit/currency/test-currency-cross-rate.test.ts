import { describe, expect, test } from "bun:test";
import { crossRateFromUsdRates } from "../../../api/_utils/currency-cross-rate.js";

describe("crossRateFromUsdRates", () => {
  const rates = {
    EUR: 0.9,
    GBP: 0.8,
    JPY: 150,
    TWD: 32,
    SGD: 1.35,
    KRW: 1380,
  };

  test("USD to other", () => {
    expect(crossRateFromUsdRates(rates, "USD", "EUR")).toBe(0.9);
  });

  test("other to USD", () => {
    expect(crossRateFromUsdRates(rates, "EUR", "USD")).toBeCloseTo(1 / 0.9);
  });

  test("cross via USD", () => {
    expect(crossRateFromUsdRates(rates, "EUR", "GBP")).toBeCloseTo(0.8 / 0.9);
  });

  test("supports Taiwan, Singapore, and Korean cross rates", () => {
    expect(crossRateFromUsdRates(rates, "TWD", "SGD")).toBeCloseTo(1.35 / 32);
    expect(crossRateFromUsdRates(rates, "SGD", "KRW")).toBeCloseTo(
      1380 / 1.35
    );
  });

  test("identity", () => {
    expect(crossRateFromUsdRates(rates, "CHF", "CHF")).toBe(1);
  });
});
