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

const MODEL_FACTORIES: Record<SupportedModel, () => LanguageModel> = {
  "gemini-2.5-pro": () => google("gemini-2.5-pro"),
  "gemini-2.5-flash": () => google("gemini-2.5-flash"),
  "gemini-3-pro-preview": () => google("gemini-3-pro-preview"),
  "claude-4.5": () => anthropic("claude-sonnet-4-5"),
  "claude-4": () => anthropic("claude-4-sonnet-20250514"),
  "claude-3.7": () => anthropic("claude-3-7-sonnet-20250219"),
  "claude-3.5": () => anthropic("claude-3-5-sonnet-20241022"),
  "gpt-5": () => openai("gpt-5"),
  "gpt-5.1": () => openai("gpt-5.1"),
  "gpt-5-mini": () => openai("gpt-5-mini"),
  "gpt-4o": () => openai("gpt-4o"),
  "gpt-4.1": () => openai("gpt-4.1"),
  "gpt-4.1-mini": () => openai("gpt-4.1-mini"),
};

// Factory that returns a LanguageModel instance for the requested model
export const getModelInstance = (model: SupportedModel): LanguageModel => {
  const modelToUse: SupportedModel = model ?? DEFAULT_MODEL;
  return (MODEL_FACTORIES[modelToUse] ?? MODEL_FACTORIES[DEFAULT_MODEL])();
};
