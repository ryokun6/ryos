import { getApiUrl } from "@/utils/platform";

/**
 * First-party analytics SDK and centralized analytics event constants.
 *
 * Events are batched to /api/analytics/events and aggregated server-side in
 * Redis. The public `track(event, props)` API intentionally mirrors the old
 * Vercel Analytics helper so existing app code can stay simple.
 */

// Core application events
export const APP_ANALYTICS = {
  // App lifecycle
  APP_LAUNCH: "app:launch",
  APP_REOPEN: "app:reopen",
  APP_FOCUS: "app:focus",
  APP_CLOSE: "app:close",
  APP_MINIMIZE: "app:minimize",
  APP_RESTORE: "app:restore",
  APP_EXPOSE: "app:expose",
  AI_MODEL_CHANGE: "app:ai_model_change",
  APP_CRASH: "app:crash",
  DESKTOP_CRASH: "desktop:crash",
  
  // User lifecycle
  USER_CREATE: "user:create",
  USER_LOGIN_PASSWORD: "user:login_password",
  USER_LOGIN_TOKEN: "user:login_token",
  USER_LOGOUT: "user:logout",
} as const;

// Chat-specific events (existing)
export const CHAT_ANALYTICS = {
  TEXT_MESSAGE: "chats:text",
  VOICE_MESSAGE: "chats:voice",
  NUDGE: "chats:nudge",
  STOP_GENERATION: "chats:stop",
  ROOM_CREATE: "chats:room_create",
  ROOM_DELETE: "chats:room_delete",
  ROOM_SWITCH: "chats:room_switch",
} as const;

// Internet Explorer events (existing)
export const IE_ANALYTICS = {
  NAVIGATION_START: "internet-explorer:navigation_start",
  NAVIGATION_ERROR: "internet-explorer:navigation_error",
  NAVIGATION_SUCCESS: "internet-explorer:navigation_success",
  GENERATION_START: "internet-explorer:generation_start",
  GENERATION_SUCCESS: "internet-explorer:generation_success",
  GENERATION_ERROR: "internet-explorer:generation_error",
} as const;

// Terminal events (existing)
export const TERMINAL_ANALYTICS = {
  AI_COMMAND: "terminal:ai_command",
  CHAT_START: "terminal:chat_start",
  CHAT_EXIT: "terminal:chat_exit",
  CHAT_CLEAR: "terminal:chat_clear",
} as const;

// iPod events
export const IPOD_ANALYTICS = {
  SONG_PLAY: "ipod:song_play",
} as const;

// Applet Viewer events
export const APPLET_ANALYTICS = {
  INSTALL: "applet:install",
  UPDATE: "applet:update",
  VIEW: "applet:view",
} as const;

export const FINDER_ANALYTICS = {
  FILE_OPEN: "finder:file_open",
  FILE_SAVE: "finder:file_save",
  FILE_MOVE: "finder:file_move",
  FILE_RENAME: "finder:file_rename",
  FOLDER_CREATE: "finder:folder_create",
  MOVE_TO_TRASH: "finder:move_to_trash",
  RESTORE_FROM_TRASH: "finder:restore_from_trash",
  EMPTY_TRASH: "finder:empty_trash",
} as const;

export const TEXTEDIT_ANALYTICS = {
  NEW_DOCUMENT: "textedit:new_document",
  SAVE: "textedit:save",
  SAVE_AS: "textedit:save_as",
  IMPORT: "textedit:import",
  EXPORT: "textedit:export",
  TRANSCRIBE: "textedit:transcribe",
} as const;

export const PAINT_ANALYTICS = {
  NEW_IMAGE: "paint:new_image",
  SAVE: "paint:save",
  IMPORT: "paint:import",
  EXPORT: "paint:export",
  TOOL_SELECT: "paint:tool_select",
  FILTER_APPLY: "paint:filter_apply",
  CLEAR: "paint:clear",
} as const;

export const PHOTO_BOOTH_ANALYTICS = {
  CAPTURE: "photo-booth:capture",
  BURST_CAPTURE: "photo-booth:burst_capture",
  EXPORT: "photo-booth:export",
  CAMERA_CHANGE: "photo-booth:camera_change",
  EFFECT_CHANGE: "photo-booth:effect_change",
} as const;

export const MINESWEEPER_ANALYTICS = {
  NEW_GAME: "minesweeper:new_game",
  WIN: "minesweeper:win",
  LOSS: "minesweeper:loss",
  FLAG: "minesweeper:flag",
} as const;

export const MEDIA_ANALYTICS = {
  SONG_PLAY: "media:song_play",
  VIDEO_PLAY: "media:video_play",
  VIDEO_ADD: "media:video_add",
  SHARE: "media:share",
  FULLSCREEN: "media:fullscreen",
  TV_CHANNEL_CREATE: "tv:channel_create",
  TV_CHANNEL_TUNE: "tv:channel_tune",
} as const;

export const WINAMP_ANALYTICS = {
  LOAD: "winamp:load",
  PLAY: "winamp:play",
  PAUSE: "winamp:pause",
  STOP: "winamp:stop",
  NEXT: "winamp:next",
  PREVIOUS: "winamp:previous",
  SKIN_CHANGE: "winamp:skin_change",
  SHUFFLE_TOGGLE: "winamp:shuffle_toggle",
  REPEAT_TOGGLE: "winamp:repeat_toggle",
} as const;

export const LISTEN_ANALYTICS = {
  SESSION_CREATE: "listen:session_create",
  SESSION_JOIN: "listen:session_join",
  SESSION_LEAVE: "listen:session_leave",
  REACTION: "listen:reaction",
  REMOTE_COMMAND: "listen:remote_command",
  TRANSFER_HOST: "listen:transfer_host",
  ASSIGN_DJ: "listen:assign_dj",
} as const;

export const SETTINGS_ANALYTICS = {
  THEME_CHANGE: "settings:theme_change",
  LANGUAGE_CHANGE: "settings:language_change",
  DISPLAY_MODE_CHANGE: "settings:display_mode_change",
  WALLPAPER_CHANGE: "settings:wallpaper_change",
  SHADER_TOGGLE: "settings:shader_toggle",
  SHADER_TYPE_CHANGE: "settings:shader_type_change",
  SCREENSAVER_CHANGE: "settings:screensaver_change",
  RESET: "settings:reset",
} as const;

export const CALENDAR_ANALYTICS = {
  EVENT_CREATE: "calendar:event_create",
  EVENT_UPDATE: "calendar:event_update",
  EVENT_DELETE: "calendar:event_delete",
  IMPORT: "calendar:import",
  EXPORT: "calendar:export",
  VIEW_CHANGE: "calendar:view_change",
} as const;

export const CONTACTS_ANALYTICS = {
  CONTACT_CREATE: "contacts:contact_create",
  CONTACT_UPDATE: "contacts:contact_update",
  CONTACT_DELETE: "contacts:contact_delete",
  IMPORT: "contacts:import",
  EXPORT: "contacts:export",
  MY_CARD_SET: "contacts:my_card_set",
} as const;

export const MAPS_ANALYTICS = {
  SEARCH: "maps:search",
  PLACE_SELECT: "maps:place_select",
  FAVORITE_TOGGLE: "maps:favorite_toggle",
  HOME_WORK_SET: "maps:home_work_set",
  DIRECTIONS: "maps:directions",
} as const;

export const AIRDROP_ANALYTICS = {
  START: "airdrop:start",
  STOP: "airdrop:stop",
  DISCOVER: "airdrop:discover",
  SEND: "airdrop:send",
  RESPOND: "airdrop:respond",
} as const;

export type AnalyticsPrimitive = string | number | boolean | null;

export type AnalyticsProperties = Record<
  string,
  AnalyticsPrimitive | undefined
>;

interface QueuedAnalyticsEvent {
  name: string;
  timestamp: number;
  sessionId: string;
  clientId: string;
  path: string;
  referrer?: string;
  appId?: string;
  category?: string;
  source: string;
  properties?: AnalyticsProperties;
}

const ANALYTICS_ENDPOINT = "/api/analytics/events";
const SESSION_KEY = "ryos:analytics:session-id";
const CLIENT_KEY = "ryos:analytics:client-id";
const MAX_QUEUE_SIZE = 200;
const MAX_BATCH_SIZE = 20;
const FLUSH_DELAY_MS = 1500;
const SENSITIVE_PROPERTY_RE =
  /(password|token|secret|authorization|cookie|message|prompt|content|html|base64|blob|dataurl|transcript|body|text)$/i;

let queue: QueuedAnalyticsEvent[] = [];
let flushTimer: number | null = null;
let initialized = false;

function canUseBrowserApis(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function randomId(prefix: string): string {
  const cryptoObj: Crypto | undefined =
    typeof crypto !== "undefined" ? crypto : undefined;

  // Prefer randomUUID() when available (modern browsers + secure contexts).
  if (cryptoObj && typeof cryptoObj.randomUUID === "function") {
    return `${prefix}_${cryptoObj.randomUUID()}`;
  }

  // Fall back to a cryptographically secure random byte sequence. We avoid
  // Math.random() here because the resulting id is persisted as a stable
  // visitor/session identifier and CodeQL flags Math.random() as insecure
  // randomness in this context.
  if (cryptoObj && typeof cryptoObj.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    cryptoObj.getRandomValues(bytes);
    let hex = "";
    for (let i = 0; i < bytes.length; i++) {
      hex += bytes[i].toString(16).padStart(2, "0");
    }
    return `${prefix}_${Date.now().toString(36)}-${hex}`;
  }

  // Last resort (extremely old environments): timestamp-only id. This is not
  // ideal but is never used in modern browsers since the checks above will
  // succeed. We intentionally do NOT use Math.random() here.
  const hiResNow =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : 0;
  return `${prefix}_${Date.now().toString(36)}-${Math.floor(hiResNow).toString(36)}`;
}

function readOrCreateStorageId(
  storage: Storage | undefined,
  key: string,
  prefix: string
): string {
  if (!storage) return randomId(prefix);
  try {
    const existing = storage.getItem(key);
    if (existing) return existing;
    const id = randomId(prefix);
    storage.setItem(key, id);
    return id;
  } catch {
    return randomId(prefix);
  }
}

function getSessionId(): string {
  return readOrCreateStorageId(
    canUseBrowserApis() ? window.sessionStorage : undefined,
    SESSION_KEY,
    "sess"
  );
}

function getClientId(): string {
  return readOrCreateStorageId(
    canUseBrowserApis() ? window.localStorage : undefined,
    CLIENT_KEY,
    "client"
  );
}

function inferCategory(name: string): string {
  if (name === "page:view") return "pageViews";
  if (name === "session:start") return "sessions";
  if (name.startsWith("app:") || name.startsWith("window:")) {
    return "appLifecycle";
  }
  if (name.startsWith("user:")) return "auth";
  if (name.includes(":crash") || name.includes(":error")) return "errors";
  return "events";
}

function sanitizeProperties(
  properties?: AnalyticsProperties
): AnalyticsProperties | undefined {
  if (!properties) return undefined;
  const safe: AnalyticsProperties = {};
  for (const [rawKey, rawValue] of Object.entries(properties)) {
    const key = rawKey.replace(/[^a-zA-Z0-9_:-]/g, "_").slice(0, 64);
    if (!key || SENSITIVE_PROPERTY_RE.test(key)) continue;
    if (
      rawValue === null ||
      typeof rawValue === "boolean" ||
      typeof rawValue === "number"
    ) {
      safe[key] = rawValue;
    } else if (typeof rawValue === "string") {
      safe[key] = rawValue.slice(0, 160);
    }
    if (Object.keys(safe).length >= 20) break;
  }
  return Object.keys(safe).length > 0 ? safe : undefined;
}

function getCurrentPath(): string {
  if (!canUseBrowserApis()) return "/";
  return window.location.pathname || "/";
}

function scheduleFlush(): void {
  if (!canUseBrowserApis() || flushTimer) return;
  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    void flushAnalytics();
  }, FLUSH_DELAY_MS);
}

function sendBatch(
  events: QueuedAnalyticsEvent[],
  preferBeacon = false
): Promise<void> | void {
  if (!canUseBrowserApis() || events.length === 0) return;
  const payload = JSON.stringify({ events });
  const endpoint = getApiUrl(ANALYTICS_ENDPOINT);

  if (preferBeacon && navigator.sendBeacon) {
    try {
      const blob = new Blob([payload], { type: "application/json" });
      if (navigator.sendBeacon(endpoint, blob)) {
        return;
      }
    } catch {
      // Fall through to fetch.
    }
  }

  return fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
    credentials: "include",
    keepalive: payload.length < 60_000,
  })
    .then(() => undefined)
    .catch(() => {
      // Analytics must never impact app behavior. Keep a small in-memory retry
      // buffer for transient failures while the page remains open.
      queue = [...events, ...queue].slice(0, MAX_QUEUE_SIZE);
    });
}

export function track(
  name: string,
  properties?: AnalyticsProperties
): void {
  if (!canUseBrowserApis() || !name || typeof name !== "string") return;

  const referrerAnalytics = document.referrer
    ? normalizeUrlForAnalytics(document.referrer)
    : undefined;
  const referrerHost =
    typeof referrerAnalytics?.host === "string" ? referrerAnalytics.host : undefined;

  const event: QueuedAnalyticsEvent = {
    name: name.slice(0, 100),
    timestamp: Date.now(),
    sessionId: getSessionId(),
    clientId: getClientId(),
    path: getCurrentPath(),
    referrer: referrerHost,
    appId:
      typeof properties?.appId === "string" ? properties.appId : undefined,
    category:
      typeof properties?.category === "string"
        ? properties.category
        : inferCategory(name),
    source:
      typeof properties?.source === "string"
        ? properties.source
        : canUseBrowserApis() && "__TAURI__" in window
          ? "tauri"
          : "web",
    properties: sanitizeProperties(properties),
  };

  queue.push(event);
  if (queue.length > MAX_QUEUE_SIZE) {
    queue = queue.slice(queue.length - MAX_QUEUE_SIZE);
  }

  if (queue.length >= MAX_BATCH_SIZE) {
    void flushAnalytics();
  } else {
    scheduleFlush();
  }
}

export async function flushAnalytics(preferBeacon = false): Promise<void> {
  if (!canUseBrowserApis() || queue.length === 0) return;
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  const events = queue.splice(0, MAX_BATCH_SIZE);
  await sendBatch(events, preferBeacon);
  if (queue.length > 0 && !preferBeacon) scheduleFlush();
}

export function trackPageView(path?: string): void {
  track("page:view", {
    pagePath: path || getCurrentPath(),
    pageTitle: canUseBrowserApis() ? document.title.slice(0, 120) : undefined,
    category: "pageViews",
  });
}

export function initializeAnalytics(): void {
  if (!canUseBrowserApis() || initialized) return;
  initialized = true;

  track("session:start", { category: "sessions" });
  trackPageView();

  const flushOnHide = () => {
    if (document.visibilityState === "hidden") {
      void flushAnalytics(true);
    }
  };
  document.addEventListener("visibilitychange", flushOnHide);
  window.addEventListener("pagehide", () => {
    void flushAnalytics(true);
  });

  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      document.removeEventListener("visibilitychange", flushOnHide);
      void flushAnalytics(true);
      initialized = false;
    });
  }
}

export function getTextAnalytics(text: string): AnalyticsProperties {
  const length = text.length;
  const textLengthBucket =
    length === 0
      ? "empty"
      : length <= 20
        ? "1-20"
        : length <= 80
          ? "21-80"
          : length <= 240
            ? "81-240"
            : "241+";
  return {
    textLength: length,
    textLengthBucket,
    hasUrl: /https?:\/\/|www\./i.test(text),
    hasMention: /(^|\s)@[a-z0-9_-]+/i.test(text),
  };
}

export function normalizeUrlForAnalytics(input: string): AnalyticsProperties {
  try {
    const url = new URL(
      input.startsWith("http") ? input : `https://${input}`
    );
    const pathParts = url.pathname.split("/").filter(Boolean);
    return {
      protocol: url.protocol.replace(":", ""),
      host: url.hostname.slice(0, 120),
      pathDepth: pathParts.length,
      pathTop: pathParts[0]?.slice(0, 60) || "",
    };
  } catch {
    return {
      protocol: "unknown",
      host: "invalid",
      pathDepth: 0,
      pathTop: "",
    };
  }
}

// Type helpers for analytics event names
export type AppAnalyticsEvent = typeof APP_ANALYTICS[keyof typeof APP_ANALYTICS];
export type ChatAnalyticsEvent = typeof CHAT_ANALYTICS[keyof typeof CHAT_ANALYTICS];
export type IEAnalyticsEvent = typeof IE_ANALYTICS[keyof typeof IE_ANALYTICS];
export type TerminalAnalyticsEvent = typeof TERMINAL_ANALYTICS[keyof typeof TERMINAL_ANALYTICS];
export type IpodAnalyticsEvent = typeof IPOD_ANALYTICS[keyof typeof IPOD_ANALYTICS];
export type AppletAnalyticsEvent = typeof APPLET_ANALYTICS[keyof typeof APPLET_ANALYTICS];
