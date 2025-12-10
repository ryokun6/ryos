import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { LanguageModelV2 } from "@ai-sdk/provider";
import {
  SupportedModel as ImportedSupportedModel,
  DEFAULT_AI_MODEL,
} from "../../src/types/aiModels.js";

// Re-export the type
export type SupportedModel = ImportedSupportedModel;

// Legacy models that may still be stored in user preferences
type LegacyModel =
  | "gemini-2.5-pro"
  | "claude-4"
  | "claude-3.7"
  | "claude-3.5"
  | "gpt-5"
  | "gpt-5-mini"
  | "gpt-4o"
  | "gpt-4.1"
  | "gpt-4.1-mini";

export const DEFAULT_MODEL = DEFAULT_AI_MODEL;

// Factory that returns a LanguageModelV2 instance for the requested model
export const getModelInstance = (
  model: SupportedModel | LegacyModel
): LanguageModelV2 => {
  const modelToUse = model ?? DEFAULT_MODEL;

  switch (modelToUse) {
    // Current supported models
    case "gemini-2.5-flash":
      return google("gemini-2.5-flash");
    case "gemini-3-pro-preview":
      return google("gemini-3-pro-preview");
    case "claude-4.5":
      return anthropic("claude-sonnet-4-5");
    case "gpt-5.1":
      return openai("gpt-5.1");

    // Legacy models - map to modern equivalents
    case "gemini-2.5-pro":
      return google("gemini-3-pro-preview");
    case "claude-4":
    case "claude-3.7":
    case "claude-3.5":
      return anthropic("claude-sonnet-4-5");
    case "gpt-5":
    case "gpt-5-mini":
    case "gpt-4o":
    case "gpt-4.1":
    case "gpt-4.1-mini":
      return openai("gpt-5.1");

    default:
      // Fallback – should never happen due to exhaustive switch
      return openai("gpt-5.1");
  }
};
