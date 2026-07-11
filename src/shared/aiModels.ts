// Single source of truth for AI models, shared by the frontend (`@/shared/aiModels`)
// and the API (`../../src/shared/aiModels.js`).
//
// Keep this module runtime-neutral: NO React / DOM / Zustand / ai-sdk imports,
// so it can be imported by the Bun API server as well as the Vite frontend.
// Server-only provider wiring (e.g. ai-sdk `getModelInstance`) lives in
// `api/_utils/_aiModels.ts`.

export const AI_MODELS = {
  "sonnet-4.6": {
    name: "sonnet-4.6",
    provider: "Anthropic",
    /** Total model context window (input + output). */
    contextWindow: 1_000_000,
  },
  "gpt-5.5": {
    name: "gpt-5.5",
    provider: "OpenAI",
    contextWindow: 1_000_000,
  },
  "gemini-3-flash": {
    name: "gemini-3-flash",
    provider: "Google",
    contextWindow: 1_048_576,
  },
  "gemini-3.1-pro-preview": {
    name: "gemini-3.1-pro-preview",
    provider: "Google",
    contextWindow: 1_048_576,
  },
} as const;

// Derived types
export type AIModel = keyof typeof AI_MODELS | null;
export type SupportedModel = keyof typeof AI_MODELS;

// Derived arrays
export const SUPPORTED_AI_MODELS = Object.keys(AI_MODELS) as SupportedModel[];

// Model metadata for UI display
export interface AIModelInfo {
  id: SupportedModel;
  name: string;
  provider: string;
  contextWindow: number;
}

export const AI_MODEL_METADATA: AIModelInfo[] = Object.entries(AI_MODELS).map(
  ([id, info]) => ({
    id: id as SupportedModel,
    ...info,
  })
);

// Default model
export const DEFAULT_AI_MODEL: SupportedModel = "gpt-5.5";

/**
 * Reserved output tokens for the main chat agent loop. Keep in sync with
 * `RYO_AGENT_PRESETS.chat.maxOutputTokens` in `api/_utils/ryo-agent.ts`.
 */
export const AI_CHAT_RESERVED_OUTPUT_TOKENS = 48_000;

/** Extra headroom for tool schemas, framing, and estimation error. */
export const AI_CHAT_COMPACTION_SAFETY_TOKENS = 16_000;

/** Absolute message-count safety net (token budget is the primary limit). */
export const AI_CHAT_COMPACTION_MESSAGE_SAFETY_MAX = 2_000;

export function getAIModelContextWindow(
  modelId: SupportedModel | null | undefined
): number {
  if (modelId && modelId in AI_MODELS) {
    return AI_MODELS[modelId].contextWindow;
  }
  return AI_MODELS[DEFAULT_AI_MODEL].contextWindow;
}

/**
 * Tokens available for conversation history after reserving output, fixed
 * system overhead, and a safety margin.
 */
export function getModelConversationTokenBudget(
  modelId: SupportedModel | null | undefined,
  options?: {
    maxOutputTokens?: number;
    systemTokenEstimate?: number;
    safetyTokens?: number;
  }
): number {
  const contextWindow = getAIModelContextWindow(modelId);
  const maxOutput =
    options?.maxOutputTokens ?? AI_CHAT_RESERVED_OUTPUT_TOKENS;
  const systemTokens = Math.max(0, options?.systemTokenEstimate ?? 0);
  const safety = options?.safetyTokens ?? AI_CHAT_COMPACTION_SAFETY_TOKENS;
  return Math.max(1_024, contextWindow - maxOutput - systemTokens - safety);
}
