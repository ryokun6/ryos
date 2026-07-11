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

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Mark the last message with Anthropic ephemeral cache control so each
 * agent step can incrementally reuse the conversation prefix.
 *
 * Merges into existing `providerOptions.anthropic` instead of replacing the
 * whole provider bag (preserves other Anthropic options on that message).
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

    const existing = asRecord(message.providerOptions);
    const incoming = asRecord(providerOptions);

    return {
      ...message,
      providerOptions: {
        ...existing,
        ...incoming,
        anthropic: {
          ...asRecord(existing.anthropic),
          ...asRecord(incoming.anthropic),
        },
      } as ProviderOptions,
    };
  });
}
