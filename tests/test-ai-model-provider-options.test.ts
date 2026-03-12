import { describe, expect, test } from "bun:test";
import { getOpenAIProviderOptions } from "../api/_utils/_aiModels.js";

describe("OpenAI provider options", () => {
  test("preserves explicit reasoning effort for gpt-5.4", () => {
    expect(getOpenAIProviderOptions("gpt-5.4")).toEqual({
      openai: {
        reasoningEffort: "none",
      },
    });
  });

  test("ignores OpenAI provider options for non-OpenAI models", () => {
    expect(getOpenAIProviderOptions("sonnet-4.6")).toBeUndefined();
  });
});
