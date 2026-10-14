import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { type LanguageModel, type LanguageModelV4 } from "ai";
import {
  pickAuthFallbackModel,
  redactProviderError,
  wrapWithProviderAuthFallback,
} from "./provider-auth.js";
import {
  AI_MODELS,
  SUPPORTED_AI_MODELS,
  DEFAULT_AI_MODEL,
  canAccessAiModel,
  isRestrictedAiModel,
  normalizeAiModelId,
  resolveRequestedAiModel,
  type SupportedModel,
} from "../../src/shared/aiModels.js";

// ============================================================================
// AI Model registry comes from the runtime-neutral shared module
// (src/shared/aiModels.ts). This file owns the server-only provider wiring.
// ============================================================================

export {
  AI_MODELS,
  SUPPORTED_AI_MODELS,
  canAccessAiModel,
  isRestrictedAiModel,
  normalizeAiModelId,
  resolveRequestedAiModel,
};
export type { SupportedModel };

// Default model (alias of the shared default for server-side call sites)
export const DEFAULT_MODEL: SupportedModel = DEFAULT_AI_MODEL;
export const TELEGRAM_DEFAULT_MODEL: SupportedModel = DEFAULT_MODEL;

/**
 * AI SDK 7 top-level `reasoning` levels.
 * Prefer this over provider-specific `providerOptions.openai.reasoningEffort`
 * — if both are set, provider options win and the top-level value is ignored.
 */
export type ModelReasoningLevel =
  | "provider-default"
  | "none"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh";

const MODEL_REASONING_BY_MODEL: Partial<
  Record<SupportedModel, ModelReasoningLevel>
> = {
  // gpt-5.5 defaults to extended reasoning; disable for chat latency/cost.
  "gpt-5.5": "none",
  // gpt-6.1-sol does not support `none`; use the lowest documented effort.
  "gpt-6": "low",
};

function createModelInstance(model: SupportedModel): LanguageModel {
  switch (model) {
    case "sonnet-4.6":
      return anthropic("claude-sonnet-4-6");
    case "opus-5.5":
      return anthropic("claude-opus-5-5");
    case "gpt-6":
      return openai("gpt-6.1-sol");
    case "gpt-5.5":
      return openai("gpt-5.5");
    case "gemini-3-flash":
      return google("gemini-3-flash-preview");
    case "gemini-3.1-pro-preview":
      return google("gemini-3.1-pro-preview");
    default:
      return openai("gpt-6.1-sol");
  }
}

function isLanguageModelV4(model: LanguageModel): model is LanguageModelV4 {
  return model.specificationVersion === "v4";
}

/**
 * gpt-6 is the default. When OpenAI rejects the key (401/403), retry once
 * on another provider whose API key is configured. The fallback runs inside
 * doStream/doGenerate, before any UI chunk is sent.
 */
function withDefaultProviderAuthFallback(model: LanguageModel): LanguageModel {
  const fallbackId = pickAuthFallbackModel();
  if (!fallbackId) return model;
  const fallback = createModelInstance(fallbackId);
  if (!isLanguageModelV4(model) || !isLanguageModelV4(fallback)) return model;
  return wrapWithProviderAuthFallback(model, fallback, (error) => {
    console.warn(
      `[ai] gpt-6 provider auth failed; retrying with ${fallbackId} (${fallback.modelId}): ${redactProviderError(error) || "auth rejected"}`
    );
  });
}

// Factory that returns a LanguageModel instance for the requested model
export const getModelInstance = (model: SupportedModel): LanguageModel => {
  const modelToUse: SupportedModel = model ?? DEFAULT_MODEL;
  const instance = createModelInstance(modelToUse);
  if (modelToUse !== "gpt-6") return instance;
  return withDefaultProviderAuthFallback(instance);
};

/**
 * Top-level AI SDK 7 `reasoning` setting for a model, when we override the
 * provider default. Returns undefined to leave the provider default alone.
 */
export function getModelReasoning(
  model: SupportedModel
): ModelReasoningLevel | undefined {
  return MODEL_REASONING_BY_MODEL[model];
}

/** gpt-6 (gpt-6.1-sol) and claude-opus-5-5 reject custom temperature. */
export function modelSupportsTemperature(model: SupportedModel): boolean {
  return model !== "gpt-6" && model !== "opus-5.5";
}

export function getTelegramModel(
  log: (...args: unknown[]) => void,
  env: NodeJS.ProcessEnv = process.env
): SupportedModel {
  const raw = env.TELEGRAM_BOT_MODEL;
  if (!raw) return TELEGRAM_DEFAULT_MODEL;

  const normalized = normalizeAiModelId(raw);
  if (!SUPPORTED_AI_MODELS.includes(normalized as SupportedModel)) {
    log(
      `Unsupported TELEGRAM_BOT_MODEL "${raw}", falling back to ${TELEGRAM_DEFAULT_MODEL}`
    );
    return TELEGRAM_DEFAULT_MODEL;
  }
  const model = normalized as SupportedModel;
  if (isRestrictedAiModel(model)) {
    log(
      `Restricted TELEGRAM_BOT_MODEL "${raw}" is not allowed outside Ryo debug, falling back to ${TELEGRAM_DEFAULT_MODEL}`
    );
    return TELEGRAM_DEFAULT_MODEL;
  }
  return model;
}

function isTruthyDebugFlag(value: unknown): boolean {
  return value === true || value === "1" || value === "true";
}

/**
 * Debug opt-in for restricted models. Matches the IE debug `dbg=1` pattern
 * plus an explicit JSON `debugMode` flag from Control Panels.
 */
export function parseRequestDebugMode(
  req: { url?: string; query?: Record<string, unknown> },
  body?: { debugMode?: unknown } | null
): boolean {
  try {
    const url = new URL(req.url || "/", "http://localhost");
    if (
      isTruthyDebugFlag(url.searchParams.get("dbg")) ||
      isTruthyDebugFlag(url.searchParams.get("debugMode"))
    ) {
      return true;
    }
  } catch {
    // Relative or malformed URLs fall through to query/body.
  }
  const query = req.query;
  if (
    query &&
    (isTruthyDebugFlag(query.dbg) || isTruthyDebugFlag(query.debugMode))
  ) {
    return true;
  }
  return isTruthyDebugFlag(body?.debugMode);
}
