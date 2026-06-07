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

export type AIModel = keyof typeof AI_MODELS | null;
export type SupportedModel = keyof typeof AI_MODELS;

export const SUPPORTED_AI_MODELS = Object.keys(AI_MODELS) as SupportedModel[];

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

export const DEFAULT_AI_MODEL: SupportedModel = "gpt-5.5";
