import { describe, expect, test } from "bun:test";
import { getOpenAIProviderOptions } from "../api/_utils/_aiModels.js";

describe("OpenAI provider options", () => {
  test("omits unsupported reasoning effort for gpt-5.3-chat-latest", () => {
    expect(getOpenAIProviderOptions("gpt-5.3-chat-latest")).toBeUndefined();
  });

  test("preserves explicit reasoning effort for gpt-5.4", () => {
    expect(getOpenAIProviderOptions("gpt-5.4")).toEqual({
      openai: {
        reasoningEffort: "none",
      },
    });
  });

  test("allows text verbosity overrides without forcing reasoning effort", () => {
    expect(
      getOpenAIProviderOptions("gpt-5.3-chat-latest", {
        textVerbosity: "low",
      })
    ).toEqual({
      openai: {
        textVerbosity: "low",
      },
    });
  });

  test("ignores OpenAI provider options for non-OpenAI models", () => {
    expect(
      getOpenAIProviderOptions("sonnet-4.6", {
        textVerbosity: "low",
      })
    ).toBeUndefined();
  });
});
