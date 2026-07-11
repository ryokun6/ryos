import { describe, expect, test } from "bun:test";
import { getModelReasoning } from "../../../api/_utils/_aiModels.js";

describe("model reasoning options", () => {
  test("uses top-level reasoning none for gpt-5.5", () => {
    expect(getModelReasoning("gpt-5.5")).toBe("none");
  });

  test("leaves non-OpenAI models on provider default", () => {
    expect(getModelReasoning("sonnet-4.6")).toBeUndefined();
    expect(getModelReasoning("gemini-3-flash")).toBeUndefined();
  });
});
