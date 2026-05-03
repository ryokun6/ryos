import { describe, expect, test } from "bun:test";
import { parseAmountInput } from "@/lib/currency/frankfurter";

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
