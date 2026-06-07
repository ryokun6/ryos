import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import type { LanguageModel } from "ai";
import {
  AI_MODELS,
  SUPPORTED_AI_MODELS,
  DEFAULT_AI_MODEL,
  type SupportedModel,
} from "../../src/shared/aiModels.js";

// ============================================================================
// AI Model registry comes from the runtime-neutral shared module
// (src/shared/aiModels.ts). This file owns the server-only provider wiring.
// ============================================================================

export { AI_MODELS, SUPPORTED_AI_MODELS };
export type { SupportedModel };

// Default model (alias of the shared default for server-side call sites)
export const DEFAULT_MODEL: SupportedModel = DEFAULT_AI_MODEL;
export const TELEGRAM_DEFAULT_MODEL: SupportedModel = DEFAULT_MODEL;

type OpenAIReasoningEffort = "none" | "medium";

const OPENAI_REASONING_EFFORT_BY_MODEL: Partial<
  Record<SupportedModel, OpenAIReasoningEffort>
> = {
  "gpt-5.5": "none",
};

// Factory that returns a LanguageModel instance for the requested model
export const getModelInstance = (model: SupportedModel): LanguageModel => {
  const modelToUse: SupportedModel = model ?? DEFAULT_MODEL;

  switch (modelToUse) {
    case "sonnet-4.6":
      return anthropic("claude-sonnet-4-6");
    case "gpt-5.5":
      return openai("gpt-5.5");
    case "gemini-3-flash":
      return google("gemini-3-flash-preview");
    case "gemini-3.1-pro-preview":
      return google("gemini-3.1-pro-preview");
    default:
      return openai("gpt-5.5");
  }
};

export function getOpenAIProviderOptions(
  model: SupportedModel
): { openai: { reasoningEffort?: OpenAIReasoningEffort } } | undefined {
  if (AI_MODELS[model].provider !== "OpenAI") {
    return undefined;
  }

  const openaiOptions: {
    reasoningEffort?: OpenAIReasoningEffort;
  } = {};

  const reasoningEffort = OPENAI_REASONING_EFFORT_BY_MODEL[model];
  if (reasoningEffort) {
    openaiOptions.reasoningEffort = reasoningEffort;
  }

  if (Object.keys(openaiOptions).length === 0) {
    return undefined;
  }

  return {
    openai: openaiOptions,
  };
}

export function getTelegramModel(
  log: (...args: unknown[]) => void,
  env: NodeJS.ProcessEnv = process.env
): SupportedModel {
  const raw = env.TELEGRAM_BOT_MODEL as SupportedModel | undefined;
  if (raw && SUPPORTED_AI_MODELS.includes(raw)) {
    return raw;
  }
  if (raw) {
    log(
      `Unsupported TELEGRAM_BOT_MODEL "${raw}", falling back to ${TELEGRAM_DEFAULT_MODEL}`
    );
  }
  return TELEGRAM_DEFAULT_MODEL;
}
