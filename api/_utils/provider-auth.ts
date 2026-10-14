import { APICallError } from "ai";

/** Shown in the chat UI when the provider rejects the API key. */
export const AI_PROVIDER_AUTH_FAILED_MESSAGE = "ai provider auth failed";

const SECRET_PATTERN = /\b(?:sk-[^\s]{4,}|Bearer\s+\S+|api[_-]?key\s*[:=]\s*\S+)/gi;

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
