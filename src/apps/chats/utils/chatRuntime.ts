import type { UIMessage } from "@ai-sdk/react";
import type { AIChatMessage } from "@/types/chat";

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

export const DEFAULT_RATE_LIMIT_ERROR_STATE: RateLimitErrorState = {
  isAuthenticated: false,
  count: 0,
  limit: 0,
  message: "Rate limit exceeded",
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
  for (let start = 0; start < message.length; start++) {
    if (message[start] !== "{") {
      continue;
    }

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let end = start; end < message.length; end++) {
      const char = message[end];

      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === "\\") {
        escaped = true;
        continue;
      }

      if (char === "\"") {
        inString = !inString;
        continue;
      }

      if (inString) {
        continue;
      }

      if (char === "{") {
        depth += 1;
      } else if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          const snippet = message.slice(start, end + 1);
          try {
            const parsed = JSON.parse(snippet);
            if (parsed && typeof parsed === "object") {
              return parsed as Record<string, unknown>;
            }
          } catch {
            break;
          }
        }
      }
    }
  }

  return null;
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

export type ChatErrorClassification =
  | { kind: "ignore_type_validation" }
  | { kind: "rate_limit"; payload: RateLimitErrorState; parsed: boolean }
  | { kind: "auth"; message?: string }
  | { kind: "other" };

export const classifyChatError = (
  message: string,
): ChatErrorClassification => {
  const parsedError = tryParseJsonFromErrorMessage(message);

  if (isKnownAiSdkTypeValidationError(message)) {
    return { kind: "ignore_type_validation" };
  }

  if (parsedError) {
    if (isRateLimitErrorCode(parsedError.error)) {
      return {
        kind: "rate_limit",
        parsed: true,
        payload: isRateLimitErrorState(parsedError)
          ? parsedError
          : DEFAULT_RATE_LIMIT_ERROR_STATE,
      };
    }

    if (isAuthenticationErrorCode(parsedError.error)) {
      return {
        kind: "auth",
        message: "Your session has expired. Please login again.",
      };
    }
  }

  if (isRateLimitErrorMessage(message)) {
    return {
      kind: "rate_limit",
      parsed: false,
      payload: DEFAULT_RATE_LIMIT_ERROR_STATE,
    };
  }

  if (isAuthenticationErrorMessage(message)) {
    return { kind: "auth" };
  }

  return { kind: "other" };
};

export const mergeMessagesWithTimestamps = (
  sdkMessages: UIMessage[],
  storedMessages: AIChatMessage[],
): AIChatMessage[] => {
  const normalizeDate = (value: unknown): Date | null => {
    if (value instanceof Date && Number.isFinite(value.getTime())) {
      return value;
    }

    if (typeof value === "string" || typeof value === "number") {
      const parsed = new Date(value);
      if (Number.isFinite(parsed.getTime())) {
        return parsed;
      }
    }

    return null;
  };

  const createdAtById = new Map<string, Date>();
  storedMessages.forEach((storedMessage) => {
    const createdAt = normalizeDate(storedMessage.metadata?.createdAt);
    if (createdAt) {
      createdAtById.set(storedMessage.id, createdAt);
    }
  });

  return sdkMessages.map((message) => {
    const typedMessage = message as AIChatMessage;
    const fallbackCreatedAt = createdAtById.get(message.id);
    const uiMessageCreatedAt = normalizeDate(
      (message as UIMessage & { createdAt?: Date | string | number }).createdAt,
    );

    return {
      ...message,
      metadata: {
        createdAt:
          normalizeDate(typedMessage.metadata?.createdAt) ||
          uiMessageCreatedAt ||
          fallbackCreatedAt ||
          new Date(),
      },
    } as AIChatMessage;
  });
};

export type CompletedLineSegment = {
  start: number;
  end: number;
  nextStart: number;
};

export const collectCompletedLineSegments = (
  content: string,
  startPosition: number,
): CompletedLineSegment[] => {
  const segments: CompletedLineSegment[] = [];
  let scanPos = startPosition;

  while (scanPos < content.length) {
    const nextNlIdx = content.indexOf("\n", scanPos);
    if (nextNlIdx === -1) {
      break;
    }

    let nextStart = nextNlIdx + 1;
    if (content[nextStart] === "\r") {
      nextStart += 1;
    }

    segments.push({
      start: scanPos,
      end: nextNlIdx,
      nextStart,
    });
    scanPos = nextStart;
  }

  return segments;
};
