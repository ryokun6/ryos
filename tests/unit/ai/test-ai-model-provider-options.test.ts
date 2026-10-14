import { describe, expect, test } from "bun:test";
import {
  getModelReasoning,
  modelSupportsTemperature,
} from "../../../api/_utils/_aiModels.js";

describe("model reasoning options", () => {
  test("uses top-level reasoning none for gpt-5.5", () => {
    expect(getModelReasoning("gpt-5.5")).toBe("none");
  });

  test("uses none for gpt-6 luna and low for gpt-6.1-sol", () => {
    expect(getModelReasoning("gpt-6")).toBe("none");
    expect(getModelReasoning("gpt-6.1-sol")).toBe("low");
  });

  test("omits temperature for gpt-6, gpt-6.1-sol, and opus-5.5", () => {
    expect(modelSupportsTemperature("gpt-6")).toBe(false);
    expect(modelSupportsTemperature("gpt-6.1-sol")).toBe(false);
    expect(modelSupportsTemperature("opus-5.5")).toBe(false);
    expect(modelSupportsTemperature("gpt-5.5")).toBe(true);
    expect(modelSupportsTemperature("sonnet-4.6")).toBe(true);
  });

  test("leaves non-OpenAI models on provider default", () => {
    expect(getModelReasoning("sonnet-4.6")).toBeUndefined();
    expect(getModelReasoning("gemini-3-flash")).toBeUndefined();
  });
});
