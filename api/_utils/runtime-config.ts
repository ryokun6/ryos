export type RealtimeProvider = "pusher" | "local";

const DEFAULT_PUBLIC_ORIGIN = "https://os.ryo.lu";
const DEFAULT_REALTIME_PROVIDER: RealtimeProvider = "pusher";
const DEFAULT_WS_PATH = "/ws";
const DEFAULT_PUSHER_CLUSTER = "us3";
const DEFAULT_PUSHER_DEV_KEY = "[REDACTED]";
const DEFAULT_PUSHER_PROD_KEY = "b47fd563805c8c42da1a";

export interface ClientRuntimeConfig {
  appPublicOrigin: string;
  docsBaseUrl: string;
  realtimeProvider: RealtimeProvider;
  websocketPath: string;
  websocketUrl: string | null;
  pusher:
    | {
        key: string;
        cluster: string;
        forceTLS: boolean;
      }
    | null;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function normalizeOrigin(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  // If comma-separated (e.g. API_ALLOWED_ORIGINS), use first segment only
  const first = trimmed.split(",")[0]?.trim();
  if (!first) return null;
  try {
    const parsed = new URL(first.startsWith("http") ? first : `https://${first}`);
    const origin = trimTrailingSlash(parsed.origin);
    if (!origin || origin.includes(",")) return null;
    return origin;
  } catch {
    return null;
  }
}

function isTruthy(value: string | undefined): boolean {
  return value === "1" || value?.toLowerCase() === "true";
}

function isFalsy(value: string | undefined): boolean {
  return value === "0" || value?.toLowerCase() === "false";
}

export function isDevLikeRuntime(): boolean {
  return (
    process.env.NODE_ENV !== "production" ||
    process.env.VERCEL_ENV === "development" ||
    process.env.VERCEL_ENV === "preview"
  );
}

export function getConfiguredPublicOrigin(): string | null {
  return normalizeOrigin(
    process.env.APP_PUBLIC_ORIGIN || process.env.PUBLIC_APP_ORIGIN
  );
}

export function getAppPublicOrigin(fallbackOrigin?: string | null): string {
  return (
    getConfiguredPublicOrigin() ||
    normalizeOrigin(fallbackOrigin) ||
    DEFAULT_PUBLIC_ORIGIN
  );
}

export function getDocsBaseUrl(fallbackOrigin?: string | null): string {
  return `${getAppPublicOrigin(fallbackOrigin)}/docs`;
}

export function getRealtimeProvider(): RealtimeProvider {
  const raw = process.env.REALTIME_PROVIDER?.trim().toLowerCase();
  if (raw === "local" || raw === "ws" || raw === "websocket") {
    return "local";
  }
  return DEFAULT_REALTIME_PROVIDER;
}

export function getRealtimeWebSocketPath(): string {
  const raw = process.env.REALTIME_WS_PATH?.trim();
  if (!raw) return DEFAULT_WS_PATH;
  return raw.startsWith("/") ? raw : `/${raw}`;
}

export function buildWebSocketUrl(origin: string, path: string): string {
  const url = new URL(path, origin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

export function getPusherClientConfig(): NonNullable<ClientRuntimeConfig["pusher"]> {
  const forceTLSRaw = process.env.PUSHER_FORCE_TLS?.trim();
  const forceTLS = forceTLSRaw ? !isFalsy(forceTLSRaw) : true;
  const configuredKey =
    process.env.PUSHER_PUBLIC_KEY?.trim() || process.env.PUSHER_KEY?.trim();
  const key =
    configuredKey ||
    (isDevLikeRuntime() ? DEFAULT_PUSHER_DEV_KEY : DEFAULT_PUSHER_PROD_KEY);

  return {
    key,
    cluster: process.env.PUSHER_CLUSTER?.trim() || DEFAULT_PUSHER_CLUSTER,
    forceTLS,
  };
}

export function buildClientRuntimeConfig(
  fallbackOrigin?: string | null
): ClientRuntimeConfig {
  const appPublicOrigin = getAppPublicOrigin(fallbackOrigin);
  const realtimeProvider = getRealtimeProvider();
  const websocketPath = getRealtimeWebSocketPath();

  return {
    appPublicOrigin,
    docsBaseUrl: getDocsBaseUrl(fallbackOrigin),
    realtimeProvider,
    websocketPath,
    websocketUrl:
      realtimeProvider === "local"
        ? buildWebSocketUrl(appPublicOrigin, websocketPath)
        : null,
    pusher: realtimeProvider === "pusher" ? getPusherClientConfig() : null,
  };
}

export function serializeClientRuntimeConfig(
  fallbackOrigin?: string | null
): string {
  return JSON.stringify(buildClientRuntimeConfig(fallbackOrigin));
}

export function getAllowedAppHosts(): string[] {
  const configured = getConfiguredPublicOrigin();
  const configuredHost = configured ? new URL(configured).host.toLowerCase() : null;
  const rawExtra = process.env.APP_ALLOWED_HOSTS || process.env.API_ALLOWED_HOSTS;
  const extra = rawExtra
    ? rawExtra
        .split(",")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean)
    : [];

  return [
    "os.ryo.lu",
    "localhost",
    "127.0.0.1",
    "[::1]",
    ...(configuredHost ? [configuredHost] : []),
    ...extra,
  ];
}

export function isAllowedAppHost(hostHeader: string | null | undefined): boolean {
  if (!hostHeader) return false;
  const normalized = hostHeader.toLowerCase().trim();
  const allowedHosts = new Set(getAllowedAppHosts());

  if (allowedHosts.has(normalized)) return true;
  if (/^localhost:\d+$/.test(normalized)) return true;
  if (/^127\.0\.0\.1:\d+$/.test(normalized)) return true;
  if (/^\[::1\](?::\d+)?$/.test(normalized)) return true;
  return false;
}

export function shouldEnableLocalRealtime(): boolean {
  return getRealtimeProvider() === "local";
}

export function shouldEnableRealtimeDebugLogs(): boolean {
  return isTruthy(process.env.REALTIME_DEBUG);
}
