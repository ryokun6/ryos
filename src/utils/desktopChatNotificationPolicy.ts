import type { RoomType } from "../shared/contracts/chat";
import type { RealtimeProvider } from "./runtimeConfig";
import { shouldNotifyForRoomMessage } from "./chatNotifications";
import { sanitizeDesktopChatNotificationWebSocketUrl } from "./desktopChatNotificationRealtime";

export interface DesktopChatNotificationRoom {
  id: string;
  type?: RoomType | null;
}

export interface DesktopChatNotificationConfig {
  appPublicOrigin: string;
  realtimeProvider: RealtimeProvider;
  websocketUrl: string | null;
  pusher: {
    key: string;
    cluster: string;
    forceTLS: boolean;
  } | null;
}

export interface DesktopChatNotificationState {
  username: string | null;
  isAuthenticated: boolean;
  chatsOpen: boolean;
  currentRoomId: string | null;
  rooms: DesktopChatNotificationRoom[];
}

export type DesktopChatNotificationManageFailureReason =
  | "invalid-config"
  | "local-provider-unsupported"
  | "missing-auth"
  | "missing-pusher-config"
  | "service-start-failed"
  | "channel-auth-failed";

export type DesktopChatNotificationManageResult =
  | { managed: true; ready: boolean }
  | {
      managed: false;
      reason: DesktopChatNotificationManageFailureReason;
    };

export type DesktopChatNotificationRendererMode =
  | "unknown"
  | "managed"
  | "renderer";

const VALID_ROOM_TYPES = new Set<RoomType>(["public", "private", "irc"]);
const MANAGE_FAILURE_REASONS =
  new Set<DesktopChatNotificationManageFailureReason>([
    "invalid-config",
    "local-provider-unsupported",
    "missing-auth",
    "missing-pusher-config",
    "service-start-failed",
    "channel-auth-failed",
  ]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeOrigin(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.origin.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized || null;
}

export function sanitizeDesktopChatNotificationConfig(
  value: unknown
): DesktopChatNotificationConfig | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Partial<DesktopChatNotificationConfig>;
  const appPublicOrigin = normalizeOrigin(input.appPublicOrigin);
  if (!appPublicOrigin) return null;

  const realtimeProvider =
    input.realtimeProvider === "local" ? "local" : input.realtimeProvider === "pusher" ? "pusher" : null;
  if (!realtimeProvider) return null;

  if (realtimeProvider === "local") {
    const websocketUrl = sanitizeDesktopChatNotificationWebSocketUrl(
      input.websocketUrl,
      appPublicOrigin
    );
    if (!websocketUrl) return null;

    return {
      appPublicOrigin,
      realtimeProvider,
      websocketUrl,
      pusher: null,
    };
  }

  const pusher = input.pusher;
  const key = normalizeText(pusher?.key);
  const cluster = normalizeText(pusher?.cluster);
  if (!key || !cluster) return null;

  return {
    appPublicOrigin,
    realtimeProvider,
    websocketUrl: null,
    pusher: {
      key,
      cluster,
      forceTLS: pusher?.forceTLS !== false,
    },
  };
}

export function sanitizeDesktopChatNotificationState(
  value: unknown
): DesktopChatNotificationState {
  const input =
    value && typeof value === "object"
      ? (value as Partial<DesktopChatNotificationState>)
      : {};
  const username = normalizeText(input.username)?.toLowerCase() ?? null;
  const currentRoomId = normalizeText(input.currentRoomId);
  const rooms = Array.isArray(input.rooms)
    ? input.rooms
        .map((room): DesktopChatNotificationRoom | null => {
          if (!room || typeof room !== "object") return null;
          const id = normalizeText((room as DesktopChatNotificationRoom).id);
          if (!id) return null;
          const rawType = (room as DesktopChatNotificationRoom).type;
          return {
            id,
            type: rawType && VALID_ROOM_TYPES.has(rawType) ? rawType : undefined,
          };
        })
        .filter((room): room is DesktopChatNotificationRoom => room !== null)
    : [];

  return {
    username,
    isAuthenticated: input.isAuthenticated === true,
    chatsOpen: input.chatsOpen === true,
    currentRoomId,
    rooms,
  };
}

export function shouldUseMainChatNotificationService(
  config: DesktopChatNotificationConfig | null,
  state: DesktopChatNotificationState
): DesktopChatNotificationManageResult {
  if (!config) {
    return { managed: false, reason: "invalid-config" };
  }
  if (config.realtimeProvider === "local") {
    if (!config.websocketUrl) {
      return { managed: false, reason: "invalid-config" };
    }
    if (!state.username || !state.isAuthenticated) {
      return { managed: false, reason: "missing-auth" };
    }
    return { managed: true, ready: false };
  }
  if (!config.pusher?.key || !config.pusher.cluster) {
    return { managed: false, reason: "missing-pusher-config" };
  }
  if (!state.username || !state.isAuthenticated) {
    return { managed: false, reason: "missing-auth" };
  }
  return { managed: true, ready: false };
}

export function sanitizeDesktopChatNotificationManageResult(
  value: unknown
): DesktopChatNotificationManageResult | null {
  if (!isRecord(value)) {
    return null;
  }
  if (value.managed === true) {
    return { managed: true, ready: value.ready === true };
  }
  if (
    value.managed === false &&
    typeof value.reason === "string" &&
    MANAGE_FAILURE_REASONS.has(
      value.reason as DesktopChatNotificationManageFailureReason
    )
  ) {
    return {
      managed: false,
      reason: value.reason as DesktopChatNotificationManageFailureReason,
    };
  }
  return null;
}

export function getDesktopChatNotificationRendererMode(
  value: unknown
): "managed" | "renderer" | null {
  const result = sanitizeDesktopChatNotificationManageResult(value);
  if (!result) {
    return null;
  }
  return result.managed && result.ready ? "managed" : "renderer";
}

export function shouldUseRendererChatNotificationFallback(params: {
  isBackgroundMode: boolean;
  desktopNotificationMode: DesktopChatNotificationRendererMode;
}): boolean {
  return params.isBackgroundMode && params.desktopNotificationMode !== "managed";
}

export function shouldSubscribeRoomInMain(
  room: DesktopChatNotificationRoom,
  _state: Pick<DesktopChatNotificationState, "chatsOpen">
): boolean {
  return room.type !== "irc";
}

export function getMainChatNotificationDecision(params: {
  chatsOpen: boolean;
  currentRoomId: string | null | undefined;
  messageRoomId: string | null | undefined;
  mainWindowForeground: boolean;
}): {
  incrementUnread: boolean;
  showInMain: boolean;
  showInRenderer: boolean;
} {
  const hasMessageRoom = Boolean(params.messageRoomId?.trim());
  const shouldNotifyInRyOs = shouldNotifyForRoomMessage({
    chatsOpen: params.chatsOpen,
    currentRoomId: params.currentRoomId,
    messageRoomId: params.messageRoomId,
  });
  const shouldNotifyInMain =
    hasMessageRoom && !params.chatsOpen && !params.mainWindowForeground;
  const incrementUnread = shouldNotifyInRyOs || shouldNotifyInMain;

  if (!incrementUnread) {
    return {
      incrementUnread: false,
      showInMain: false,
      showInRenderer: false,
    };
  }

  return {
    incrementUnread: true,
    showInMain: shouldNotifyInMain,
    showInRenderer: shouldNotifyInRyOs && params.mainWindowForeground,
  };
}
