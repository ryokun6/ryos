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
  },
  "gpt-5.5": {
    name: "gpt-5.5",
    provider: "OpenAI",
  },
  "gemini-3-flash": {
    name: "gemini-3-flash",
    provider: "Google",
  },
  "gemini-3.1-pro-preview": {
    name: "gemini-3.1-pro-preview",
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
export const DEFAULT_AI_MODEL: SupportedModel = "gpt-5.5";
