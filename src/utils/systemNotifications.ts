import { replaceControlCharacters } from "../shared/sanitizeControlCharacters";

export type SystemNotificationUrgency = "low" | "normal" | "critical";
export type SystemNotificationTimeoutType = "default" | "never";

export interface SystemNotificationPayload {
  title: string;
  body?: string;
  tag?: string;
  chatRoomId?: string | null;
  silent?: boolean;
  urgency?: SystemNotificationUrgency;
  timeoutType?: SystemNotificationTimeoutType;
}

export interface SystemNotificationStatus {
  supported: boolean;
  foreground: boolean;
  platform: NodeJS.Platform | string;
  reason?: "untrusted" | "unsupported";
}

const MAX_TITLE_LENGTH = 120;
const MAX_BODY_LENGTH = 240;
const MAX_TAG_LENGTH = 160;

const SENSITIVE_TEXT_PATTERNS = [
  /\bBearer\s+[A-Za-z0-9._~+/=-]+/i,
  /\b(?:access|refresh|id)?_?token\s*[:=]\s*\S+/i,
  /\b(?:api[_-]?key|secret|password|authorization)\s*[:=]\s*\S+/i,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/,
  /\b[A-Za-z0-9+/=_-]{48,}\b/,
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function hasSensitiveNotificationText(value: string): boolean {
  return SENSITIVE_TEXT_PATTERNS.some((pattern) => pattern.test(value));
}

export function toSafeSystemNotificationText(
  value: unknown,
  maxLength: number
): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = replaceControlCharacters(value)
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized || hasSensitiveNotificationText(normalized)) {
    return undefined;
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function sanitizeTag(value: unknown): string | undefined {
  const tag = toSafeSystemNotificationText(value, MAX_TAG_LENGTH);
  if (!tag) {
    return undefined;
  }
  return tag.replace(/[^\w:.-]/g, "-");
}

function sanitizeChatRoomId(value: unknown): string | null | undefined {
  if (value === null) {
    return null;
  }
  const roomId = toSafeSystemNotificationText(value, MAX_TAG_LENGTH);
  return roomId || undefined;
}

function sanitizeUrgency(value: unknown): SystemNotificationUrgency | undefined {
  return value === "low" || value === "normal" || value === "critical"
    ? value
    : undefined;
}

function sanitizeTimeoutType(
  value: unknown
): SystemNotificationTimeoutType | undefined {
  return value === "default" || value === "never" ? value : undefined;
}

export function sanitizeSystemNotificationPayload(
  value: unknown
): SystemNotificationPayload | null {
  if (!isRecord(value)) {
    return null;
  }

  const title = toSafeSystemNotificationText(value.title, MAX_TITLE_LENGTH);
  if (!title) {
    return null;
  }

  const payload: SystemNotificationPayload = { title };
  const body = toSafeSystemNotificationText(value.body, MAX_BODY_LENGTH);
  const tag = sanitizeTag(value.tag);
  const chatRoomId = sanitizeChatRoomId(value.chatRoomId);
  const urgency = sanitizeUrgency(value.urgency);
  const timeoutType = sanitizeTimeoutType(value.timeoutType);

  if (body) payload.body = body;
  if (tag) payload.tag = tag;
  if (chatRoomId !== undefined) payload.chatRoomId = chatRoomId;
  if (value.silent === true) payload.silent = true;
  if (urgency) payload.urgency = urgency;
  if (timeoutType) payload.timeoutType = timeoutType;

  return payload;
}

export function buildChatRoomNotificationTag(roomId: string): string {
  return `chat-room-${roomId.replace(/[^\w:.-]/g, "-")}`;
}

export function buildChatAiNotificationTag(): string {
  return "chat-ai";
}

export function sanitizeSystemNotificationStatus(
  value: unknown
): SystemNotificationStatus | null {
  if (!isRecord(value)) {
    return null;
  }

  if (typeof value.supported !== "boolean") {
    return null;
  }

  return {
    supported: value.supported,
    foreground: value.foreground === true,
    platform: typeof value.platform === "string" ? value.platform : "unknown",
    reason:
      value.reason === "untrusted" || value.reason === "unsupported"
        ? value.reason
        : undefined,
  };
}
