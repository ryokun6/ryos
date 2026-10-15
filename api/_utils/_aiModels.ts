import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { type LanguageModel } from "ai";
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
  // GPT-6 Luna supports `none`. gpt-6.1-sol does not.
  "gpt-6": "none",
  "gpt-6.1-sol": "low",
};

function createModelInstance(model: SupportedModel): LanguageModel {
  switch (model) {
    case "sonnet-5.5":
      return anthropic("claude-sonnet-5-5");
    case "opus-5.5":
      return anthropic("claude-opus-5-5");
    case "gpt-6":
      return openai("gpt-6-luna");
    case "gpt-6.1-sol":
      return openai("gpt-6.1-sol");
    case "gpt-5.5":
      return openai("gpt-5.5");
    case "gemini-3-flash":
      return google("gemini-3-flash-preview");
    case "gemini-3.1-pro-preview":
      return google("gemini-3.1-pro-preview");
    default:
      return openai("gpt-6-luna");
  }
}

// Factory that returns a LanguageModel instance for the requested model.
// Provider failures are surfaced to the client. There is no cross-provider retry.
export const getModelInstance = (model: SupportedModel): LanguageModel => {
  return createModelInstance(model ?? DEFAULT_MODEL);
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

/**
 * gpt-6 (gpt-6-luna), gpt-6.1-sol, claude-opus-5-5, and claude-sonnet-5-5
 * reject custom temperature. The installed Anthropic provider treats any
 * `claude-sonnet-5*` id as `rejectsSamplingParameters`.
 */
export function modelSupportsTemperature(model: SupportedModel): boolean {
  return (
    model !== "gpt-6" &&
    model !== "gpt-6.1-sol" &&
    model !== "opus-5.5" &&
    model !== "sonnet-5.5"
  );
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
