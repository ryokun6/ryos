// Shared AI model types and constants

// Single source of truth for AI models
export const AI_MODELS = {
  "claude-4.5": {
    name: "claude-4.5",
    provider: "Anthropic",
  },
  "gpt-5.2": {
    name: "gpt-5.2",
    provider: "OpenAI",
  },
  "gemini-3-flash": {
    name: "gemini-3-flash",
    provider: "Google",
  },
  "gemini-3": {
    name: "gemini-3",
    provider: "Google",
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
}

export const AI_MODEL_METADATA: AIModelInfo[] = Object.entries(AI_MODELS).map(
  ([id, info]) => ({
    id: id as SupportedModel,
    ...info,
  })
);

// Default model
export const DEFAULT_AI_MODEL: SupportedModel = "gpt-5.2";
