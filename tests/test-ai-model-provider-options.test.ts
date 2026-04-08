import { describe, expect, test } from "bun:test";
import type { LanguageModel } from "ai";
import {
  getOpenAIProviderOptions,
  getPromptOptimizedProviderOptions,
} from "../api/_utils/_aiModels.js";
import {
  addPromptCacheToLastMessage,
  createCachedSystemMessage,
  withPromptCacheForLongContent,
} from "../api/_utils/prompt-caching.js";

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

  test("merges prompt optimized provider options with OpenAI defaults", () => {
    expect(
      getPromptOptimizedProviderOptions("gpt-5.4", {
        gateway: { caching: "auto" },
      })
    ).toEqual({
      openai: {
        reasoningEffort: "none",
      },
      gateway: {
        caching: "auto",
      },
    });
  });
});

describe("prompt caching helpers", () => {
  test("adds Anthropic cache control to cached system messages", () => {
    expect(createCachedSystemMessage("stable instructions")).toEqual({
      role: "system",
      content: "stable instructions",
      providerOptions: {
        anthropic: {
          cacheControl: { type: "ephemeral" },
        },
      },
    });
  });

  test("only caches long dynamic content above the threshold", () => {
    const shortMessage = { role: "user" as const, content: "short" };
    const longMessage = { role: "user" as const, content: "a".repeat(3000) };

    expect(withPromptCacheForLongContent(shortMessage).providerOptions).toBeUndefined();
    expect(withPromptCacheForLongContent(longMessage).providerOptions).toEqual({
      anthropic: {
        cacheControl: { type: "ephemeral" },
      },
    });
  });

  test("adds per-step cache control only for Anthropic models", () => {
    const messages = [
      { role: "system" as const, content: "stable instructions" },
      { role: "user" as const, content: "hello" },
    ];
    const anthropicModel = {
      provider: "anthropic",
      modelId: "claude-sonnet-4-6",
    };
    const googleModel = {
      provider: "google",
      modelId: "gemini-3-flash-preview",
    };

    expect(
      addPromptCacheToLastMessage(messages, googleModel as unknown as LanguageModel)
    ).toEqual(messages);
    expect(
      addPromptCacheToLastMessage(messages, anthropicModel as unknown as LanguageModel)[1]
    ).toEqual({
      role: "user",
      content: "hello",
      providerOptions: {
        anthropic: {
          cacheControl: { type: "ephemeral" },
        },
      },
    });
  });
});
