import { describe, expect, test } from "bun:test";
import {
  applyUnary,
  calculate,
  createInitialCalcState,
  inputDigit,
  inputOperator,
  openParenthesis,
  closeParenthesis,
  memoryAdd,
  memoryRecall,
  unaryFunctions,
} from "../../../src/apps/calculator/utils/calculatorEngine";
import {
  CONVERSION_CATEGORIES,
  convertTemperature,
  convertValue,
  DEFAULT_CONVERSION_CATEGORY,
  DEFAULT_CONVERSION_FROM_UNIT,
  DEFAULT_CONVERSION_TO_UNIT,
  formatSwappedConversionValue,
  resolveConversionAmount,
} from "../../../src/apps/calculator/utils/conversionData";
import {
  calculateFittedCalculatorFontSize,
  formatCalculatorConversionResult,
  formatCalculatorDisplay,
} from "../../../src/apps/calculator/utils/formatCalculatorDisplay";

describe("calculatorEngine", () => {
  test("basic addition chain", () => {
    let state = createInitialCalcState();
    state = inputDigit(state, "2");
    state = inputDigit(state, "5");
    state = inputOperator(state, "+");
    state = inputDigit(state, "3");
    state = calculate(state);
    expect(state.display).toBe("28");
  });

  test("scientific sin in degrees", () => {
    let state = { ...createInitialCalcState(), display: "90" };
    state = applyUnary(state, unaryFunctions.sin);
    expect(Number(state.display)).toBeCloseTo(1, 8);
  });

  test("memory recall", () => {
    let state = createInitialCalcState();
    state = inputDigit(state, "5");
    state = memoryAdd(state);
    state = inputDigit(state, "0");
    state = memoryRecall(state);
    expect(state.display).toBe("5");
  });

  test("power operator", () => {
    let state = createInitialCalcState();
    state = inputDigit(state, "2");
    state = inputOperator(state, "^");
    state = inputDigit(state, "8");
    state = calculate(state);
    expect(state.display).toBe("256");
  });

  test("nested operation with parentheses", () => {
    let state = createInitialCalcState();
    state = inputDigit(state, "2");
    state = inputOperator(state, "+");
    state = openParenthesis(state);
    state = inputDigit(state, "3");
    state = inputOperator(state, "*");
    state = inputDigit(state, "4");
    state = closeParenthesis(state);
    expect(state.display).toBe("14");
  });

  test("root operator", () => {
    let state = { ...createInitialCalcState(), display: "3" };
    state = inputOperator(state, "root");
    state = inputDigit(state, "2");
    state = inputDigit(state, "7");
    state = calculate(state);
    expect(Number(state.display)).toBeCloseTo(3, 8);
  });
});

describe("formatCalculatorDisplay", () => {
  test("groups large integers using the ryOS locale", () => {
    expect(formatCalculatorDisplay("88855514", "en")).toBe("88,855,514");
    expect(formatCalculatorDisplay("88855514", "de")).toBe("88.855.514");
  });

  test("preserves entered precision with the localized decimal separator", () => {
    expect(formatCalculatorDisplay("12345.00", "de")).toBe("12.345,00");
    expect(formatCalculatorDisplay("1234.", "de")).toBe("1.234,");
  });

  test("uses scientific notation when a grouped value would overflow", () => {
    expect(formatCalculatorDisplay("1234567890123456", "en")).toBe(
      "1.23456789e+15"
    );
    expect(formatCalculatorDisplay("8888888888888", "en")).toBe(
      "8.88888889e+12"
    );
  });

  test("limits conversion results to 12 significant digits", () => {
    const result = formatCalculatorConversionResult(
      2238385.82677165,
      "en",
      false
    );

    expect(result).toBe("2,238,385.82677");
    expect(result.replace(/\D/g, "")).toHaveLength(12);
  });

  test("shows at most two decimal places for currency results", () => {
    expect(formatCalculatorConversionResult(12, "en", true)).toBe("12");
    expect(formatCalculatorConversionResult(12.3, "en", true)).toBe("12.3");
    expect(formatCalculatorConversionResult(12.345, "en", true)).toBe("12.35");
    expect(
      formatCalculatorConversionResult(6709799999999999, "en", true)
    ).toBe("6.7098e+15");
  });

  test("scales display text to its measured width", () => {
    expect(
      calculateFittedCalculatorFontSize({
        baseFontSize: 22,
        availableWidth: 200,
        contentWidth: 220,
      })
    ).toBe(20);
    expect(
      calculateFittedCalculatorFontSize({
        baseFontSize: 22,
        availableWidth: 220,
        contentWidth: 200,
      })
    ).toBe(22);
    expect(
      calculateFittedCalculatorFontSize({
        baseFontSize: 22,
        availableWidth: 60,
        contentWidth: 220,
      })
    ).toBe(12);
  });
});

describe("conversionData", () => {
  test("currency is the default and first conversion category", () => {
    expect(DEFAULT_CONVERSION_CATEGORY).toBe("currency");
    expect(DEFAULT_CONVERSION_FROM_UNIT).toBe("USD");
    expect(DEFAULT_CONVERSION_TO_UNIT).toBe("EUR");
    expect(CONVERSION_CATEGORIES[0]?.id).toBe("currency");
  });

  test("includes Taiwan, Singapore, and Korean currencies", () => {
    const currency = CONVERSION_CATEGORIES.find(
      (category) => category.id === "currency"
    );
    const currencyIds = currency?.units.map((unit) => unit.id);

    expect(currencyIds).toContain("TWD");
    expect(currencyIds).toContain("SGD");
    expect(currencyIds).toContain("KRW");
  });

  test("preserves entered decimal places when swapping units", () => {
    expect(formatSwappedConversionValue(12.3, "1.00")).toBe("12.30");
    expect(formatSwappedConversionValue(12.3, "1.000")).toBe("12.300");
    expect(formatSwappedConversionValue(12.3, "1.00e+3")).toBe("12.30");
    expect(formatSwappedConversionValue(12.3, "1")).toBe("12.3");
    expect(formatSwappedConversionValue(12.3, "1.")).toBe("12.3");
  });

  test("uses the unrounded amount for conversion swap round trips", () => {
    const originalAmount = 1.23;
    const rate = 0.9134567;
    const exactSwappedAmount = convertValue(
      originalAmount,
      "currency",
      "USD",
      "EUR",
      rate
    );
    const displayedSwappedAmount = formatSwappedConversionValue(
      exactSwappedAmount,
      "1.00"
    );
    const resolvedAmount = resolveConversionAmount(
      displayedSwappedAmount,
      exactSwappedAmount
    );

    expect(displayedSwappedAmount).toBe("1.12");
    expect(
      convertValue(resolvedAmount, "currency", "EUR", "USD", 1 / rate)
    ).toBeCloseTo(originalAmount, 12);
    expect(resolveConversionAmount("1.12", null)).toBe(1.12);
  });

  test("length feet to meters", () => {
    const result = convertValue(3, "length", "ft", "m");
    expect(result).toBeCloseTo(0.9144, 4);
  });

  test("temperature fahrenheit to celsius", () => {
    expect(convertTemperature(32, "f", "c")).toBeCloseTo(0, 6);
    expect(convertTemperature(212, "f", "c")).toBeCloseTo(100, 6);
  });
});
