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
} from "../src/apps/calculator/utils/calculatorEngine";
import { convertTemperature, convertValue } from "../src/apps/calculator/utils/conversionData";
import { formatCalculatorDisplay } from "../src/apps/calculator/utils/formatCalculatorDisplay";

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

  test("groups integers beyond Number safe precision", () => {
    expect(formatCalculatorDisplay("1234567890123456", "en")).toBe(
      "1,234,567,890,123,456"
    );
  });
});

describe("conversionData", () => {
  test("length feet to meters", () => {
    const result = convertValue(3, "length", "ft", "m");
    expect(result).toBeCloseTo(0.9144, 4);
  });

  test("temperature fahrenheit to celsius", () => {
    expect(convertTemperature(32, "f", "c")).toBeCloseTo(0, 6);
    expect(convertTemperature(212, "f", "c")).toBeCloseTo(100, 6);
  });
});
