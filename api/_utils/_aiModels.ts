import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import type { LanguageModel, ProviderOptions } from "ai";
import { mergeProviderOptions } from "./prompt-caching.js";

// ============================================================================
// AI Model Types and Constants (duplicated from src/types/aiModels.ts)
// This avoids cross-directory imports that slow down vite-plugin-vercel
// ============================================================================

// Single source of truth for AI models
export const AI_MODELS = {
  "sonnet-4.6": { name: "sonnet-4.6", provider: "Anthropic" },
  "gpt-5.4": { name: "gpt-5.4", provider: "OpenAI" },
  "gemini-3-flash": { name: "gemini-3-flash", provider: "Google" },
  "gemini-3.1-pro-preview": { name: "gemini-3.1-pro-preview", provider: "Google" },
} as const;

// Derived types
export type SupportedModel = keyof typeof AI_MODELS;

// Derived arrays - exported for validation
export const SUPPORTED_AI_MODELS = Object.keys(AI_MODELS) as SupportedModel[];

// Default model
export const DEFAULT_MODEL: SupportedModel = "gpt-5.4";
export const TELEGRAM_DEFAULT_MODEL: SupportedModel = DEFAULT_MODEL;

type OpenAIReasoningEffort = "none" | "medium";

const OPENAI_REASONING_EFFORT_BY_MODEL: Partial<
  Record<SupportedModel, OpenAIReasoningEffort>
> = {
  "gpt-5.4": "none",
};

// Factory that returns a LanguageModel instance for the requested model
export const getModelInstance = (model: SupportedModel): LanguageModel => {
  const modelToUse: SupportedModel = model ?? DEFAULT_MODEL;

  switch (modelToUse) {
    case "sonnet-4.6":
      return anthropic("claude-sonnet-4-6");
    case "gpt-5.4":
      return openai("gpt-5.4");
    case "gemini-3-flash":
      return google("gemini-3-flash-preview");
    case "gemini-3.1-pro-preview":
      return google("gemini-3.1-pro-preview");
    default:
      return openai("gpt-5.4");
  }
};

export function getOpenAIProviderOptions(
  model: SupportedModel
): ProviderOptions | undefined {
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

export function getPromptOptimizedProviderOptions(
  model: SupportedModel,
  ...options: Array<ProviderOptions | undefined>
): ProviderOptions | undefined {
  const openAIOptions = getOpenAIProviderOptions(model);

  return mergeProviderOptions(openAIOptions, ...options);
}
