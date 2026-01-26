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
  "gemini-2.5-pro": { name: "gemini-2.5-pro", provider: "Google" },
  "gemini-2.5-flash": { name: "gemini-2.5-flash", provider: "Google" },
  "gemini-3-pro-preview": { name: "gemini-3-pro-preview", provider: "Google" },
  "claude-4.5": { name: "claude-4.5", provider: "Anthropic" },
  "claude-4": { name: "claude-4", provider: "Anthropic" },
  "claude-3.7": { name: "claude-3.7", provider: "Anthropic" },
  "claude-3.5": { name: "claude-3.5", provider: "Anthropic" },
  "gpt-5": { name: "gpt-5", provider: "OpenAI" },
  "gpt-5.1": { name: "gpt-5.1", provider: "OpenAI" },
  "gpt-5-mini": { name: "gpt-5-mini", provider: "OpenAI" },
  "gpt-4o": { name: "gpt-4o", provider: "OpenAI" },
  "gpt-4.1": { name: "gpt-4.1", provider: "OpenAI" },
  "gpt-4.1-mini": { name: "gpt-4.1-mini", provider: "OpenAI" },
} as const;

// Derived types
export type SupportedModel = keyof typeof AI_MODELS;

// Derived arrays - exported for validation
export const SUPPORTED_AI_MODELS = Object.keys(AI_MODELS) as SupportedModel[];

// Default model
export const DEFAULT_MODEL: SupportedModel = "gpt-5.1";

// Factory that returns a LanguageModel instance for the requested model
export const getModelInstance = (model: SupportedModel): LanguageModel => {
  const modelToUse: SupportedModel = model ?? DEFAULT_MODEL;

  switch (modelToUse) {
    case "gemini-2.5-pro":
      return google("gemini-2.5-pro");
    case "gemini-2.5-flash":
      return google("gemini-2.5-flash");
    case "gemini-3-pro-preview":
      return google("gemini-3-pro-preview");
    case "claude-4.5":
      return anthropic("claude-sonnet-4-5");
    case "claude-4":
      return anthropic("claude-4-sonnet-20250514");
    case "claude-3.7":
      return anthropic("claude-3-7-sonnet-20250219");
    case "claude-3.5":
      return anthropic("claude-3-5-sonnet-20241022");
    case "gpt-5":
      return openai("gpt-5");
    case "gpt-5.1":
      return openai("gpt-5.1");
    case "gpt-5-mini":
      return openai("gpt-5-mini");
    case "gpt-4o":
      return openai("gpt-4o");
    case "gpt-4.1":
      return openai("gpt-4.1");
    case "gpt-4.1-mini":
      return openai("gpt-4.1-mini");
    default:
      // Fallback – should never happen due to exhaustive switch
      return openai("gpt-5.1");
  }
};
