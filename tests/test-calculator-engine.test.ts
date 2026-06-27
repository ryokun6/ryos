import { describe, expect, test } from "bun:test";
import {
  applyUnary,
  calculate,
  clearAll,
  createInitialCalcState,
  inputDigit,
  inputOperator,
  memoryAdd,
  memoryRecall,
  unaryFunctions,
} from "../src/apps/calculator/utils/calculatorEngine";
import { convertTemperature, convertValue } from "../src/apps/calculator/utils/conversionData";

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
