const CODE_BLOCK_PATTERN = /```[\s\S]*?```/g;
const HTML_TAG_PATTERN = /<[^>]*>/g;
const URGENT_PREFIX_PATTERN = /^!+\s*/;
const LEADING_SPEECH_PUNCTUATION_PATTERN = /^[\s.!?。，！？；：]+/;

const RATE_LIMIT_ERROR_CODE = "rate_limit_exceeded";
const AUTH_ERROR_CODES = [
  "authentication_failed",
  "unauthorized",
  "username mismatch",
] as const;
const AUTH_ERROR_MESSAGE_TOKENS = [
  "401",
  "unauthorized",
  "authentication_failed",
  "authentication failed",
  "username mismatch",
] as const;

export type RateLimitErrorState = {
  isAuthenticated: boolean;
  count: number;
  limit: number;
  message: string;
};

export const isKnownAiSdkTypeValidationError = (message: string): boolean =>
  message.includes("AI_TypeValidationError") ||
  message.includes("Type validation failed");

export const cleanTextForSpeech = (text: string): string =>
  text
    .replace(CODE_BLOCK_PATTERN, "")
    .replace(HTML_TAG_PATTERN, "")
    .replace(URGENT_PREFIX_PATTERN, "")
    .replace(LEADING_SPEECH_PUNCTUATION_PATTERN, "")
    .trim();

export const tryParseJsonFromErrorMessage = (
  message: string,
): Record<string, unknown> | null => {
  const jsonMatch = message.match(/\{.*\}/);
  if (!jsonMatch) {
    return null;
  }

  try {
    return JSON.parse(jsonMatch[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
};

export const isRateLimitErrorCode = (errorCode: unknown): boolean =>
  errorCode === RATE_LIMIT_ERROR_CODE;

export const isAuthenticationErrorCode = (errorCode: unknown): boolean =>
  typeof errorCode === "string" &&
  AUTH_ERROR_CODES.some((value) => value === errorCode.toLowerCase());

export const isRateLimitErrorMessage = (message: string): boolean =>
  message.includes("429") || message.includes(RATE_LIMIT_ERROR_CODE);

export const isAuthenticationErrorMessage = (message: string): boolean => {
  const normalized = message.toLowerCase();
  return AUTH_ERROR_MESSAGE_TOKENS.some((token) => normalized.includes(token));
};

export const areMessageIdListsEqual = (
  leftMessages: Array<{ id: string }>,
  rightMessages: Array<{ id: string }>,
): boolean => {
  if (leftMessages.length !== rightMessages.length) {
    return false;
  }

  for (let i = 0; i < leftMessages.length; i++) {
    if (leftMessages[i]?.id !== rightMessages[i]?.id) {
      return false;
    }
  }

  return true;
};

export const isRateLimitErrorState = (
  value: Record<string, unknown>,
): value is RateLimitErrorState =>
  typeof value.isAuthenticated === "boolean" &&
  typeof value.count === "number" &&
  typeof value.limit === "number" &&
  typeof value.message === "string";
