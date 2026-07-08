import { describe, expect, test } from "bun:test";
import {
  countDigitsBeforePos,
  formatCurrencyAmountDisplay,
  getCurrencyMaxFractionDigits,
  normalizeAmountInput,
  parseAmountInput,
  positionAfterNthDigit,
} from "@/lib/currency/frankfurter";

describe("parseAmountInput", () => {
  test("parses plain decimal", () => {
    expect(parseAmountInput("100")).toBe(100);
    expect(parseAmountInput("12.5")).toBe(12.5);
  });

  test("accepts comma as decimal separator", () => {
    expect(parseAmountInput("3,14")).toBeCloseTo(3.14);
  });

  test("strips currency symbols and spaces", () => {
    expect(parseAmountInput("$ 42.00")).toBe(42);
    expect(parseAmountInput("€42,50")).toBeCloseTo(42.5);
  });

  test("returns 0 for empty or invalid", () => {
    expect(parseAmountInput("")).toBe(0);
    expect(parseAmountInput("abc")).toBe(0);
  });
});

describe("getCurrencyMaxFractionDigits", () => {
  test("returns 0 for zero-decimal currencies", () => {
    expect(getCurrencyMaxFractionDigits("JPY")).toBe(0);
    expect(getCurrencyMaxFractionDigits("krw")).toBe(0);
    expect(getCurrencyMaxFractionDigits("HUF")).toBe(0);
  });

  test("returns 2 for typical currencies", () => {
    expect(getCurrencyMaxFractionDigits("USD")).toBe(2);
    expect(getCurrencyMaxFractionDigits("EUR")).toBe(2);
    expect(getCurrencyMaxFractionDigits("GBP")).toBe(2);
  });
});

describe("normalizeAmountInput", () => {
  test("keeps plain digits", () => {
    expect(normalizeAmountInput("100")).toBe("100");
  });

  test("strips currency symbols, group separators, and spaces (en-US)", () => {
    expect(normalizeAmountInput("$1,234.56", 2, "en-US")).toBe("1234.56");
    expect(normalizeAmountInput("¥1,000", 0, "en-US")).toBe("1000");
  });

  test("strips locale group separators and uses locale decimal separator (de-DE)", () => {
    expect(normalizeAmountInput("1.234,56", 2, "de-DE")).toBe("1234.56");
    expect(normalizeAmountInput("3,14", 2, "de-DE")).toBe("3.14");
    // Literal "." in a comma-decimal locale is treated as a group separator
    expect(normalizeAmountInput("1.000", 2, "de-DE")).toBe("1000");
  });

  test("does NOT treat group separator as decimal when typing past it", () => {
    // Regression: typing "0" after "$7,000" used to produce "7.00".
    expect(normalizeAmountInput("$7,0000", 2, "en-US")).toBe("70000");
    expect(normalizeAmountInput("$70,000", 2, "en-US")).toBe("70000");
    expect(normalizeAmountInput("$700", 2, "en-US")).toBe("700");
    expect(normalizeAmountInput("700", 2, "en-US")).toBe("700");
    // de-DE equivalent
    expect(normalizeAmountInput("7.0000", 2, "de-DE")).toBe("70000");
  });

  test("only the first decimal separator counts; later ones are dropped", () => {
    expect(normalizeAmountInput("1.2.3", 2, "en-US")).toBe("1.23");
  });

  test("trims fractional digits to maxFractionDigits", () => {
    expect(normalizeAmountInput("1.23456", 2, "en-US")).toBe("1.23");
    expect(normalizeAmountInput("1.99", 0, "en-US")).toBe("199");
  });

  test("preserves trailing dot to allow further typing", () => {
    expect(normalizeAmountInput("100.", 2, "en-US")).toBe("100.");
  });

  test("normalizes leading zeros", () => {
    expect(normalizeAmountInput("0010", 2, "en-US")).toBe("10");
    expect(normalizeAmountInput("0.5", 2, "en-US")).toBe("0.5");
    expect(normalizeAmountInput("0", 2, "en-US")).toBe("0");
  });

  test("returns empty for empty input", () => {
    expect(normalizeAmountInput("", 2, "en-US")).toBe("");
    expect(normalizeAmountInput("abc", 2, "en-US")).toBe("");
  });
});

describe("formatCurrencyAmountDisplay", () => {
  test("formats USD in en-US with grouping", () => {
    expect(formatCurrencyAmountDisplay("1234", "USD", "en-US")).toBe("$1,234");
    expect(formatCurrencyAmountDisplay("1234.5", "USD", "en-US")).toBe("$1,234.5");
    expect(formatCurrencyAmountDisplay("1234.56", "USD", "en-US")).toBe("$1,234.56");
  });

  test("preserves trailing decimal separator while typing", () => {
    expect(formatCurrencyAmountDisplay("1234.", "USD", "en-US")).toBe("$1,234.");
  });

  test("ignores decimals for zero-decimal currencies", () => {
    expect(formatCurrencyAmountDisplay("1000", "JPY", "en-US")).toMatch(/1,000/);
    expect(formatCurrencyAmountDisplay("1000.5", "JPY", "en-US")).toMatch(/1,000/);
  });

  test("returns empty string for empty input", () => {
    expect(formatCurrencyAmountDisplay("", "USD", "en-US")).toBe("");
  });
});

describe("caret position helpers", () => {
  test("countDigitsBeforePos counts only digits", () => {
    expect(countDigitsBeforePos("$1,234.56", 0)).toBe(0);
    expect(countDigitsBeforePos("$1,234.56", 1)).toBe(0);
    expect(countDigitsBeforePos("$1,234.56", 2)).toBe(1);
    expect(countDigitsBeforePos("$1,234.56", 6)).toBe(4);
    expect(countDigitsBeforePos("$1,234.56", 9)).toBe(6);
  });

  test("positionAfterNthDigit lands after the right digit", () => {
    expect(positionAfterNthDigit("$1,234.56", 0)).toBe(0);
    expect(positionAfterNthDigit("$1,234.56", 1)).toBe(2);
    expect(positionAfterNthDigit("$1,234.56", 4)).toBe(6);
    expect(positionAfterNthDigit("$1,234.56", 6)).toBe(9);
    expect(positionAfterNthDigit("$1,234.56", 99)).toBe(9);
  });
});
