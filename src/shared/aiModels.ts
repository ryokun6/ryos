// Single source of truth for AI models, shared by the frontend (`@/shared/aiModels`)
// and the API (`../../src/shared/aiModels.js`).
//
// Keep this module runtime-neutral: NO React / DOM / Zustand / ai-sdk imports,
// so it can be imported by the Bun API server as well as the Vite frontend.
// Server-only provider wiring (e.g. ai-sdk `getModelInstance`) lives in
// `api/_utils/_aiModels.ts`.

export type AiModelAccess = "public" | "ryo-debug";

export const RYO_ADMIN_USERNAME = "ryo";

export const AI_MODELS = {
  "sonnet-4.6": {
    name: "sonnet-4.6",
    provider: "Anthropic",
    access: "public",
  },
  "opus-5.5": {
    name: "opus-5.5",
    provider: "Anthropic",
    access: "ryo-debug",
  },
  "gpt-6": {
    name: "gpt-6",
    provider: "OpenAI",
    access: "public",
  },
  "gpt-5.5": {
    name: "gpt-5.5",
    provider: "OpenAI",
    access: "public",
  },
  "gemini-3-flash": {
    name: "gemini-3-flash",
    provider: "Google",
    access: "public",
  },
  "gemini-3.1-pro-preview": {
    name: "gemini-3.1-pro-preview",
    provider: "Google",
    access: "public",
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
  access: AiModelAccess;
}

export const AI_MODEL_METADATA: AIModelInfo[] = Object.entries(AI_MODELS).map(
  ([id, info]) => ({
    id: id as SupportedModel,
    ...info,
  })
);

// Default model
export const DEFAULT_AI_MODEL: SupportedModel = "gpt-6";

/**
 * Product / API aliases → registry ids.
 * Friendly labels stay gpt-6 / opus-5.5; providers use gpt-6-astra /
 * claude-opus-5-5.
 */
export const AI_MODEL_ALIASES: Record<string, SupportedModel> = {
  "claude-sonnet": "sonnet-4.6",
  "claude-sonnet-4-6": "sonnet-4.6",
  "claude-opus-5-5": "opus-5.5",
  "gpt-6-astra": "gpt-6",
};

export function isRyoAdminUsername(
  username?: string | null
): boolean {
  return username?.toLowerCase() === RYO_ADMIN_USERNAME;
}

export function isSupportedAiModel(
  model: string | null | undefined
): model is SupportedModel {
  return !!model && SUPPORTED_AI_MODELS.includes(model as SupportedModel);
}

export function isRestrictedAiModel(
  model: string | null | undefined
): boolean {
  if (!isSupportedAiModel(model)) return false;
  return AI_MODELS[model].access === "ryo-debug";
}

export function canAccessAiModel(
  model: string | null | undefined,
  options: { username?: string | null; debugMode?: boolean } = {}
): boolean {
  if (!isSupportedAiModel(model)) return false;
  if (!isRestrictedAiModel(model)) return true;
  return isRyoAdminUsername(options.username) && options.debugMode === true;
}

export function getSelectableAiModels(options: {
  username?: string | null;
  debugMode?: boolean;
} = {}): AIModelInfo[] {
  return AI_MODEL_METADATA.filter((model) =>
    canAccessAiModel(model.id, options)
  );
}

export function normalizeAiModelId(model: string): string {
  return AI_MODEL_ALIASES[model] ?? model;
}

export function resolveClientAiModel(
  selected: string | null | undefined,
  options: { username?: string | null; debugMode?: boolean } = {}
): SupportedModel | null {
  if (!isSupportedAiModel(selected)) return null;
  return canAccessAiModel(selected, options) ? selected : null;
}

export type ResolveRequestedAiModelResult =
  | { ok: true; model: SupportedModel }
  | {
      ok: false;
      error: "unsupported" | "not_allowed";
      requested: string;
    };

export function resolveRequestedAiModel(
  rawModel: string | null | undefined,
  options: { username?: string | null; debugMode?: boolean } = {}
): ResolveRequestedAiModelResult {
  const requested = normalizeAiModelId(rawModel || DEFAULT_AI_MODEL);
  if (!SUPPORTED_AI_MODELS.includes(requested as SupportedModel)) {
    return { ok: false, error: "unsupported", requested };
  }
  const model = requested as SupportedModel;
  if (!canAccessAiModel(model, options)) {
    return { ok: false, error: "not_allowed", requested };
  }
  return { ok: true, model };
}
