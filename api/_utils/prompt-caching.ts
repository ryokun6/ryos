import type {
  LanguageModel,
  ModelMessage,
  ProviderOptions,
  SystemModelMessage,
} from "ai";

export const ANTHROPIC_PROMPT_CACHE_PROVIDER_OPTIONS = {
  anthropic: {
    cacheControl: { type: "ephemeral" },
  },
} as const satisfies ProviderOptions;

export function mergeProviderOptions(
  ...options: Array<ProviderOptions | undefined>
): ProviderOptions | undefined {
  const merged: ProviderOptions = {};

  for (const option of options) {
    if (!option) continue;

    for (const [provider, providerOptions] of Object.entries(option)) {
      merged[provider] = {
        ...((merged[provider] as Record<string, unknown> | undefined) ?? {}),
        ...providerOptions,
      };
    }
  }

  return Object.keys(merged).length > 0 ? merged : undefined;
}

const textChars = (content: ModelMessage["content"]): number => {
  if (typeof content === "string") {
    return content.length;
  }

  return content.reduce((total, part) => {
    if ("text" in part && typeof part.text === "string") {
      return total + part.text.length;
    }

    return total;
  }, 0);
};

export function withPromptCacheForLongContent<
  T extends { content: ModelMessage["content"]; providerOptions?: ProviderOptions },
>(value: T, minChars = 3000): T & { providerOptions?: ProviderOptions } {
  return textChars(value.content) >= minChars ? withPromptCache(value) : value;
}

export function withPromptCache<T extends { providerOptions?: ProviderOptions }>(
  value: T
): T & { providerOptions: ProviderOptions } {
  return {
    ...value,
    providerOptions: mergeProviderOptions(
      value.providerOptions,
      ANTHROPIC_PROMPT_CACHE_PROVIDER_OPTIONS
    ),
  } as T & { providerOptions: ProviderOptions };
}

export function createCachedSystemMessage(
  content: string
): SystemModelMessage {
  return withPromptCache({
    role: "system",
    content,
  });
}

export function isAnthropicModel(model: LanguageModel): boolean {
  if (typeof model === "string") {
    return /anthropic|claude/i.test(model);
  }

  const modelDetails = model as { provider?: string; modelId?: string };
  return [modelDetails.provider, modelDetails.modelId].some(
    (value) => typeof value === "string" && /anthropic|claude/i.test(value)
  );
}

export function addPromptCacheToLastMessage(
  messages: ModelMessage[],
  model: LanguageModel
): ModelMessage[] {
  if (messages.length === 0 || !isAnthropicModel(model)) {
    return messages;
  }

  return messages.map((message, index) =>
    index === messages.length - 1 ? withPromptCache(message) : message
  );
}

export function preparePromptCachingStep({
  messages,
  model,
}: {
  messages: ModelMessage[];
  model: LanguageModel;
}): { messages: ModelMessage[] } {
  return {
    messages: addPromptCacheToLastMessage(messages, model),
  };
}
