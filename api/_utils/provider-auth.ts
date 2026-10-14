import {
  APICallError,
  wrapLanguageModel,
  type LanguageModel,
  type LanguageModelV4,
  type LanguageModelV4CallOptions,
} from "ai";
import { AI_MODELS, type SupportedModel } from "../../src/shared/aiModels.js";

/** Shown in the chat UI when the provider rejects the API key. */
export const AI_PROVIDER_AUTH_FAILED_MESSAGE = "ai provider auth failed";

const SECRET_PATTERN = /\b(?:sk-[^\s]{4,}|Bearer\s+\S+|api[_-]?key\s*[:=]\s*\S+)/gi;

/**
 * Public models on a different provider than the default (OpenAI).
 * opus-5.5 stays out of this list: it is Ryo-debug only.
 * gpt-5.5 stays out: it uses the same OpenAI key.
 */
const AUTH_FALLBACK_MODELS = ["sonnet-4.6", "gemini-3-flash"] as const satisfies readonly SupportedModel[];

export function isProviderAuthError(error: unknown): boolean {
  if (APICallError.isInstance(error)) {
    if (error.statusCode === 401 || error.statusCode === 403) return true;
    return /invalid_api_key|incorrect api key/i.test(
      `${error.message}\n${error.responseBody ?? ""}`
    );
  }
  if (error instanceof Error && error.cause != null) {
    return isProviderAuthError(error.cause);
  }
  return false;
}

export function redactProviderError(error: unknown): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  return raw.replace(SECRET_PATTERN, "[redacted]").replace(/\s+/g, " ").trim();
}

/**
 * Text placed on the UI message stream `error` chunk.
 * Auth failures become a stable message. Other errors keep a redacted
 * provider message instead of the SDK's "An error occurred."
 */
export function uiStreamErrorText(error: unknown): string {
  if (isProviderAuthError(error)) return AI_PROVIDER_AUTH_FAILED_MESSAGE;
  const cleaned = redactProviderError(error);
  if (!cleaned) return "An error occurred.";
  if (/invalid_api_key|incorrect api key/i.test(cleaned)) {
    return AI_PROVIDER_AUTH_FAILED_MESSAGE;
  }
  return cleaned.length > 300 ? `${cleaned.slice(0, 299)}…` : cleaned;
}

function providerKeyConfigured(
  model: SupportedModel,
  env: NodeJS.ProcessEnv
): boolean {
  const provider = AI_MODELS[model].provider;
  if (provider === "Anthropic") return Boolean(env.ANTHROPIC_API_KEY?.trim());
  if (provider === "Google") return Boolean(env.GOOGLE_GENERATIVE_AI_API_KEY?.trim());
  return false;
}

/** Next configured model when the default OpenAI key is rejected. */
export function pickAuthFallbackModel(
  env: NodeJS.ProcessEnv = process.env
): SupportedModel | null {
  for (const model of AUTH_FALLBACK_MODELS) {
    if (providerKeyConfigured(model, env)) return model;
  }
  return null;
}

export async function runWithProviderAuthFallback<T>(
  primary: () => Promise<T>,
  fallback: (() => Promise<T>) | null,
  onFallback?: (error: unknown) => void
): Promise<T> {
  try {
    return await primary();
  } catch (error) {
    if (!fallback || !isProviderAuthError(error)) throw error;
    onFallback?.(error);
    return fallback();
  }
}

/**
 * Retry `model` once on `fallback` when the provider returns 401/403.
 * The fallback call drops OpenAI-only tools and reasoning settings.
 */
export function wrapWithProviderAuthFallback(
  model: LanguageModelV4,
  fallback: LanguageModelV4,
  onFallback?: (error: unknown) => void
): LanguageModel {
  const adjusted = (params: LanguageModelV4CallOptions) =>
    paramsForAuthFallback(params, fallback.provider);
  return wrapLanguageModel({
    model,
    middleware: {
      wrapGenerate: ({ doGenerate, params }) =>
        runWithProviderAuthFallback(
          () => doGenerate(),
          () => fallback.doGenerate(adjusted(params)),
          onFallback
        ),
      wrapStream: ({ doStream, params }) =>
        runWithProviderAuthFallback(
          () => doStream(),
          () => fallback.doStream(adjusted(params)),
          onFallback
        ),
    },
  });
}

/**
 * Drop provider tools and OpenAI-only request fields before a fallback call.
 * gpt-6 sends reasoning "low" and an OpenAI web_search tool; those must not
 * ride along to Anthropic or Google.
 */
export function paramsForAuthFallback(
  params: LanguageModelV4CallOptions,
  fallbackProvider: string
): LanguageModelV4CallOptions {
  const providerPrefix = fallbackProvider.split(".")[0];
  const tools = params.tools?.filter((tool) => {
    if (tool.type !== "provider") return true;
    return tool.id.startsWith(`${providerPrefix}.`);
  });
  const { providerOptions: _providerOptions, headers: _headers, reasoning: _reasoning, ...rest } =
    params;
  return {
    ...rest,
    ...(params.tools ? { tools } : {}),
  };
}
