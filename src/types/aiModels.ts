// Shared AI model types and constants

// Single source of truth for AI models
export const AI_MODELS = {
  "gemini-2.5-pro": {
    name: "gemini-2.5-pro",
    provider: "Google",
  },
  "gemini-2.5-flash": {
    name: "gemini-2.5-flash",
    provider: "Google",
  },
  "gemini-3-pro-preview": {
    name: "gemini-3-pro-preview",
    provider: "Google",
  },
  "claude-4.5": {
    name: "claude-4.5",
    provider: "Anthropic",
  },
  "claude-4": {
    name: "claude-4",
    provider: "Anthropic",
  },
  "claude-3.7": {
    name: "claude-3.7",
    provider: "Anthropic",
  },
  "claude-3.5": {
    name: "claude-3.5",
    provider: "Anthropic",
  },
  "gpt-5": {
    name: "gpt-5",
    provider: "OpenAI",
  },
  "gpt-5.1": {
    name: "gpt-5.1",
    provider: "OpenAI",
  },
  "gpt-5-mini": {
    name: "gpt-5-mini",
    provider: "OpenAI",
  },
  "gpt-4o": {
    name: "gpt-4o",
    provider: "OpenAI",
  },
  "gpt-4.1": {
    name: "gpt-4.1",
    provider: "OpenAI",
  },
  "gpt-4.1-mini": {
    name: "gpt-4.1-mini",
    provider: "OpenAI",
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
export const DEFAULT_AI_MODEL: SupportedModel = "gpt-5.1";
