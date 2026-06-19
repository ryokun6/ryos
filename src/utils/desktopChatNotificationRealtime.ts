export type LocalRealtimeClientMessage =
  | { type: "subscribe"; channel: string }
  | { type: "unsubscribe"; channel: string }
  | { type: "ping" };

const DEFAULT_LOCAL_REALTIME_WS_PATH = "/ws";

function toComparableHttpOrigin(websocketUrl: URL): string | null {
  if (websocketUrl.protocol === "wss:") {
    const comparable = new URL(websocketUrl.toString());
    comparable.protocol = "https:";
    return comparable.origin;
  }

  if (websocketUrl.protocol === "ws:") {
    const comparable = new URL(websocketUrl.toString());
    comparable.protocol = "http:";
    return comparable.origin;
  }

  return null;
}

export function buildDesktopChatNotificationWebSocketUrl(
  appPublicOrigin: string,
  path = DEFAULT_LOCAL_REALTIME_WS_PATH
): string | null {
  try {
    const appOrigin = new URL(appPublicOrigin);
    if (appOrigin.protocol !== "http:" && appOrigin.protocol !== "https:") {
      return null;
    }

    const websocketUrl = new URL(path, appOrigin.origin);
    websocketUrl.protocol = appOrigin.protocol === "https:" ? "wss:" : "ws:";
    websocketUrl.hash = "";
    return websocketUrl.toString();
  } catch {
    return null;
  }
}

export function sanitizeDesktopChatNotificationWebSocketUrl(
  value: unknown,
  appPublicOrigin: string
): string | null {
  const fallbackUrl = buildDesktopChatNotificationWebSocketUrl(appPublicOrigin);
  const input = typeof value === "string" ? value.trim() : "";
  const rawUrl = input || fallbackUrl;
  if (!rawUrl) {
    return null;
  }

  try {
    const appOrigin = new URL(appPublicOrigin);
    if (appOrigin.protocol !== "http:" && appOrigin.protocol !== "https:") {
      return null;
    }

    const websocketUrl = new URL(rawUrl, appOrigin.origin);
    if (websocketUrl.username || websocketUrl.password) {
      return null;
    }
    if (websocketUrl.protocol !== "ws:" && websocketUrl.protocol !== "wss:") {
      return null;
    }
    if (appOrigin.protocol === "https:" && websocketUrl.protocol !== "wss:") {
      return null;
    }

    const comparableOrigin = toComparableHttpOrigin(websocketUrl);
    if (comparableOrigin !== appOrigin.origin) {
      return null;
    }

    websocketUrl.searchParams.delete("ticket");
    websocketUrl.hash = "";
    return websocketUrl.toString();
  } catch {
    return null;
  }
}

export function buildLocalRealtimeTicketWebSocketUrl(
  websocketUrl: string,
  ticket: string
): string {
  const url = new URL(websocketUrl);
  url.searchParams.set("ticket", ticket);
  url.hash = "";
  return url.toString();
}

export function buildLocalRealtimeClientMessage(
  message: LocalRealtimeClientMessage
): string {
  return JSON.stringify(message);
}
