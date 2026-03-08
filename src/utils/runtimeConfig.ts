export type RealtimeProvider = "pusher" | "local";

export interface ClientRuntimeConfig {
  appPublicOrigin?: string;
  docsBaseUrl?: string;
  realtimeProvider?: RealtimeProvider;
  websocketPath?: string;
  websocketUrl?: string | null;
  pusher?: {
    key: string;
    cluster: string;
    forceTLS?: boolean;
  } | null;
}

declare global {
  interface Window {
    __RYOS_RUNTIME_CONFIG__?: ClientRuntimeConfig;
  }
}

const DEFAULT_PUBLIC_ORIGIN = "https://os.ryo.lu";
const DEFAULT_REALTIME_PROVIDER: RealtimeProvider = "pusher";
const DEFAULT_WS_PATH = "/ws";
const DEFAULT_PUSHER_DEV_KEY = "[REDACTED]";
const DEFAULT_PUSHER_PROD_KEY = "b47fd563805c8c42da1a";
const DEFAULT_PUSHER_CLUSTER = "us3";

function normalizeOrigin(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

function readWindowRuntimeConfig(): ClientRuntimeConfig {
  if (typeof window === "undefined") {
    return {};
  }
  return window.__RYOS_RUNTIME_CONFIG__ || {};
}

function getBuildTimeRealtimeProvider(): RealtimeProvider {
  const raw = import.meta.env.VITE_REALTIME_PROVIDER?.trim().toLowerCase();
  if (raw === "local" || raw === "ws" || raw === "websocket") {
    return "local";
  }
  return DEFAULT_REALTIME_PROVIDER;
}

function isDevLikeEnvironment(): boolean {
  return (
    import.meta.env.DEV ||
    import.meta.env.VITE_VERCEL_ENV === "development" ||
    import.meta.env.VITE_VERCEL_ENV === "preview"
  );
}

export function getClientRuntimeConfig(): ClientRuntimeConfig {
  return readWindowRuntimeConfig();
}

export function getAppPublicOrigin(): string {
  const runtimeOrigin = normalizeOrigin(getClientRuntimeConfig().appPublicOrigin);
  if (runtimeOrigin) return runtimeOrigin;

  const buildOrigin = normalizeOrigin(import.meta.env.VITE_APP_PUBLIC_ORIGIN);
  if (buildOrigin) return buildOrigin;

  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  return DEFAULT_PUBLIC_ORIGIN;
}

export function getDocsBaseUrl(): string {
  const runtimeDocsBase = normalizeOrigin(getClientRuntimeConfig().docsBaseUrl);
  if (runtimeDocsBase) return runtimeDocsBase;
  return `${getAppPublicOrigin()}/docs`;
}

export function getRealtimeProvider(): RealtimeProvider {
  return getClientRuntimeConfig().realtimeProvider || getBuildTimeRealtimeProvider();
}

export function getRealtimeWebSocketPath(): string {
  const runtimePath = getClientRuntimeConfig().websocketPath?.trim();
  if (runtimePath) {
    return runtimePath.startsWith("/") ? runtimePath : `/${runtimePath}`;
  }
  const buildPath = import.meta.env.VITE_REALTIME_WS_PATH?.trim();
  if (buildPath) {
    return buildPath.startsWith("/") ? buildPath : `/${buildPath}`;
  }
  return DEFAULT_WS_PATH;
}

export function buildWebSocketUrl(origin: string, path: string): string {
  const url = new URL(path, origin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

export function getRealtimeWebSocketUrl(): string {
  const configured = getClientRuntimeConfig().websocketUrl;
  if (configured) return configured;
  return buildWebSocketUrl(getAppPublicOrigin(), getRealtimeWebSocketPath());
}

export function getPusherRuntimeConfig(): {
  key: string;
  cluster: string;
  forceTLS: boolean;
} {
  const runtimePusher = getClientRuntimeConfig().pusher;
  if (runtimePusher?.key) {
    return {
      key: runtimePusher.key,
      cluster: runtimePusher.cluster || DEFAULT_PUSHER_CLUSTER,
      forceTLS: runtimePusher.forceTLS ?? true,
    };
  }

  return {
    key:
      import.meta.env.VITE_PUSHER_KEY ||
      (isDevLikeEnvironment() ? DEFAULT_PUSHER_DEV_KEY : DEFAULT_PUSHER_PROD_KEY),
    cluster: import.meta.env.VITE_PUSHER_CLUSTER || DEFAULT_PUSHER_CLUSTER,
    forceTLS: import.meta.env.VITE_PUSHER_FORCE_TLS
      ? import.meta.env.VITE_PUSHER_FORCE_TLS !== "false"
      : true,
  };
}
