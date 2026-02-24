import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import type { LanguageModel } from "ai";

// ============================================================================
// AI Model Types and Constants (duplicated from src/types/aiModels.ts)
// This avoids cross-directory imports that slow down vite-plugin-vercel
// ============================================================================

// Single source of truth for AI models
export const AI_MODELS = {
  "claude-4.5": { name: "claude-4.5", provider: "Anthropic" },
  "gpt-5.2": { name: "gpt-5.2", provider: "OpenAI" },
  "gemini-3-flash": { name: "gemini-3-flash", provider: "Google" },
  "gemini-3": { name: "gemini-3", provider: "Google" },
} as const;

// Derived types
export type SupportedModel = keyof typeof AI_MODELS;

// Derived arrays - exported for validation
export const SUPPORTED_AI_MODELS = Object.keys(AI_MODELS) as SupportedModel[];

// Default model
export const DEFAULT_MODEL: SupportedModel = "gpt-5.2";

// Factory that returns a LanguageModel instance for the requested model
export const getModelInstance = (model: SupportedModel): LanguageModel => {
  const modelToUse: SupportedModel = model ?? DEFAULT_MODEL;

  switch (modelToUse) {
    case "claude-4.5":
      return anthropic("claude-sonnet-4-5");
    case "gpt-5.2":
      return openai("gpt-5.2");
    case "gemini-3-flash":
      return google("gemini-3-flash-preview");
    case "gemini-3":
      return google("gemini-3-pro-preview");
    default:
      return openai("gpt-5.2");
  }
};
