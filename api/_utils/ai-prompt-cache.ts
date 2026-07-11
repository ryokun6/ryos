import type { LanguageModel, ModelMessage, ProviderOptions } from "ai";

const DEFAULT_ANTHROPIC_CACHE_OPTIONS = {
  anthropic: { cacheControl: { type: "ephemeral" as const } },
} satisfies ProviderOptions;

function isAnthropicModel(model: LanguageModel): boolean {
  if (typeof model === "string") {
    return model.includes("anthropic") || model.includes("claude");
  }
  return (
    model.provider === "anthropic" ||
    model.provider.includes("anthropic") ||
    model.modelId.includes("anthropic") ||
    model.modelId.includes("claude")
  );
}

/**
 * Mark the last message with Anthropic ephemeral cache control so each
 * agent step can incrementally reuse the conversation prefix.
 *
 * See https://ai-sdk.dev/v7/cookbook/node/dynamic-prompt-caching
 */
export function addCacheControlToMessages({
  messages,
  model,
  providerOptions = DEFAULT_ANTHROPIC_CACHE_OPTIONS,
}: {
  messages: ModelMessage[];
  model: LanguageModel;
  providerOptions?: ProviderOptions;
}): ModelMessage[] {
  if (messages.length === 0) return messages;
  if (!isAnthropicModel(model)) return messages;

  return messages.map((message, index) => {
    if (index !== messages.length - 1) return message;
    return {
      ...message,
      providerOptions: {
        ...message.providerOptions,
        ...providerOptions,
      },
    };
  });
}
