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
  "sonnet-5.5": {
    name: "sonnet-5.5",
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
  "gpt-6.1-sol": {
    name: "gpt-6.1-sol",
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
 * `gpt-6` is the default and uses the OpenAI id `gpt-6-luna`.
 * `gpt-6.1-sol` and `sonnet-5.5` are their own selectable models.
 * Older wire ids still resolve. `sonnet-5.5` uses Anthropic id `claude-sonnet-5-5`.
 */
export const AI_MODEL_ALIASES: Record<string, SupportedModel> = {
  "claude-sonnet": "sonnet-5.5",
  "claude-sonnet-4-6": "sonnet-5.5",
  "sonnet-4.6": "sonnet-5.5",
  "claude-sonnet-5": "sonnet-5.5",
  "claude-sonnet-5-5": "sonnet-5.5",
  "claude-opus-5-5": "opus-5.5",
  "gpt-6-astra": "gpt-6",
  "gpt-6-luna": "gpt-6",
  "gpt-6-sol": "gpt-6.1-sol",
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

/**
 * The default model is available to everyone. Any other model requires the
 * authenticated username `ryo`. `opus-5.5` also requires debug mode.
 */
export function canAccessAiModel(
  model: string | null | undefined,
  options: { username?: string | null; debugMode?: boolean } = {}
): boolean {
  if (!isSupportedAiModel(model)) return false;
  if (model === DEFAULT_AI_MODEL) return true;
  if (!isRyoAdminUsername(options.username)) return false;
  if (!isRestrictedAiModel(model)) return true;
  return options.debugMode === true;
}

export function getSelectableAiModels(options: {
  username?: string | null;
  debugMode?: boolean;
} = {}): AIModelInfo[] {
  if (!isRyoAdminUsername(options.username)) return [];
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
  // Anyone other than ryo always gets the default, including when the body
  // names another model, an unknown id, or a debug override.
  if (!isRyoAdminUsername(options.username)) {
    return { ok: true, model: DEFAULT_AI_MODEL };
  }
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
