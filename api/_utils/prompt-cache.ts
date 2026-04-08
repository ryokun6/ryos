import type { ModelMessage } from "ai";

export const STATIC_SYSTEM_PROMPT_CACHE_CONTROL = {
  providerOptions: {
    anthropic: { cacheControl: { type: "ephemeral" } },
  },
} as const;

export function createStaticSystemMessage(content: string): ModelMessage {
  return {
    role: "system",
    content,
    ...STATIC_SYSTEM_PROMPT_CACHE_CONTROL,
  } as ModelMessage;
}

export function createDynamicSystemMessage(content: string): ModelMessage {
  return {
    role: "system",
    content,
  };
}

export function createSystemMessages({
  staticPrompt,
  dynamicPrompt,
}: {
  staticPrompt: string;
  dynamicPrompt?: string | null;
}): ModelMessage[] {
  return [
    createStaticSystemMessage(staticPrompt),
    ...(dynamicPrompt && dynamicPrompt.trim().length > 0
      ? [createDynamicSystemMessage(dynamicPrompt)]
      : []),
  ];
}
