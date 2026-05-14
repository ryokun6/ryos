import { useEffect, useReducer } from "react";

/**
 * Apple MapKit JS lazy loader.
 *
 * The script is loaded the first time a component requests it and then
 * cached for the rest of the page's lifetime. Repeated open/close cycles
 * of the Maps app will reuse the same `mapkit` global instead of pulling
 * the script again or calling `mapkit.init` twice.
 *
 * Token resolution order:
 *   1. Server-signed JWT from `/api/mapkit-token` (preferred for prod).
 *      The response is cached in memory and refreshed 60s before expiry.
 *   2. `import.meta.env.VITE_MAPKIT_TOKEN` as a fallback for local dev.
 *
 * If neither source produces a token the hook returns `status: "missing-token"`
 * so callers can render a friendly placeholder instead of crashing.
 */

const MAPKIT_SCRIPT_SRC = "https://cdn.apple-mapkit.com/mk/5.x.x/mapkit.js";
const MAPKIT_SCRIPT_ID = "ryos-mapkit-js";
const MAPKIT_TOKEN_ENDPOINT = "/api/mapkit-token";
const TOKEN_REFRESH_BUFFER_MS = 60_000;

export type MapKitStatus =
  | "idle"
  | "missing-token"
  | "loading"
  | "ready"
  | "error";

let scriptPromise: Promise<void> | null = null;
let initialized = false;

interface CachedServerToken {
  token: string;
  expiresAt: number; // epoch ms
}

let cachedServerToken: CachedServerToken | null = null;
let inFlightTokenFetch: Promise<string> | null = null;

interface AppleMapKitNamespace {
  init: (options: {
    authorizationCallback: (done: (token: string) => void) => void;
    language?: string;
  }) => void;
  // We intentionally keep the rest of the surface as `unknown` – consumers
  // cast to the richer `mapkit` global when they need it.
  [key: string]: unknown;
}

declare global {
  interface Window {
    mapkit?: AppleMapKitNamespace;
  }
}

function getEnvFallbackToken(): string | undefined {
  const token = import.meta.env.VITE_MAPKIT_TOKEN as string | undefined;
  return token && token.trim().length > 0 ? token.trim() : undefined;
}

async function fetchServerToken(): Promise<string> {
  const now = Date.now();
  if (
    cachedServerToken &&
    cachedServerToken.expiresAt - now > TOKEN_REFRESH_BUFFER_MS
  ) {
    return cachedServerToken.token;
  }

  if (inFlightTokenFetch) return inFlightTokenFetch;

  inFlightTokenFetch = (async () => {
    const res = await fetch(MAPKIT_TOKEN_ENDPOINT, {
      method: "GET",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      throw new Error(`MapKit token endpoint returned ${res.status}`);
    }
    const data = (await res.json()) as Partial<CachedServerToken> & {
      error?: string;
    };
    if (!data.token || typeof data.expiresAt !== "number") {
      throw new Error(data.error || "Invalid MapKit token response");
    }
    cachedServerToken = {
      token: data.token,
      expiresAt: data.expiresAt,
    };
    return data.token;
  })();

  try {
    return await inFlightTokenFetch;
  } finally {
    inFlightTokenFetch = null;
  }
}

/**
 * Resolve a MapKit token. Tries the server endpoint first; if that fails and a
 * `VITE_MAPKIT_TOKEN` env value is configured, falls back to it. Throws when
 * no source is available so callers can show the missing-token overlay.
 */
async function resolveToken(): Promise<string> {
  try {
    return await fetchServerToken();
  } catch (err) {
    const fallback = getEnvFallbackToken();
    if (fallback) {
      console.warn(
        "[mapkit] server token fetch failed, falling back to VITE_MAPKIT_TOKEN",
        err
      );
      return fallback;
    }
    throw err;
  }
}

function loadScript(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("MapKit JS requires a browser"));
  }

  if (window.mapkit) {
    return Promise.resolve();
  }

  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(
      MAPKIT_SCRIPT_ID
    ) as HTMLScriptElement | null;

    const handleLoad = () => {
      if (window.mapkit) {
        resolve();
      } else {
        reject(new Error("MapKit JS loaded but mapkit global is missing"));
      }
    };

    if (existing) {
      if (window.mapkit) {
        resolve();
        return;
      }
      existing.addEventListener("load", handleLoad, { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("Failed to load MapKit JS")),
        { once: true }
      );
      return;
    }

    const script = document.createElement("script");
    script.id = MAPKIT_SCRIPT_ID;
    script.src = MAPKIT_SCRIPT_SRC;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.addEventListener("load", handleLoad, { once: true });
    script.addEventListener(
      "error",
      () => {
        scriptPromise = null;
        reject(new Error("Failed to load MapKit JS"));
      },
      { once: true }
    );
    document.head.appendChild(script);
  });

  return scriptPromise;
}

function initMapKitWithCallback(language?: string) {
  if (initialized || !window.mapkit) return;
  window.mapkit.init({
    authorizationCallback: (done) => {
      resolveToken()
        .then((token) => done(token))
        .catch((err) => {
          // MapKit doesn't expose a way to signal failure from the callback;
          // logging here keeps the failure visible while the caller's status
          // state already reflects the "error"/"missing-token" condition.
          console.error("[mapkit] failed to resolve token", err);
        });
    },
    language,
  });
  initialized = true;
}

export interface UseMapKitOptions {
  /** Skip loading until set to true. Defaults to true. */
  enabled?: boolean;
  /** Optional BCP-47 language tag forwarded to mapkit.init */
  language?: string;
}

export interface UseMapKitResult {
  status: MapKitStatus;
  error: string | null;
  hasToken: boolean;
}

/**
 * Hook that lazily loads Apple MapKit JS and initializes it. The token is
 * fetched from `/api/mapkit-token` on demand, with `VITE_MAPKIT_TOKEN` as a
 * dev fallback. When neither source produces a token the hook returns
 * `status: "missing-token"` so callers can render a friendly placeholder.
 */
export function useMapKit(options: UseMapKitOptions = {}): UseMapKitResult {
  const { enabled = true, language } = options;

  type MapKitHookState = {
    status: MapKitStatus;
    error: string | null;
    hasToken: boolean;
  };
  type MapKitHookAction =
    | { type: "set"; payload: Partial<MapKitHookState> }
    | { type: "readyInitialized" }
    | { type: "missingToken" };
  const initialState: MapKitHookState = {
    status: initialized ? "ready" : "idle",
    error: null,
    hasToken: Boolean(cachedServerToken || getEnvFallbackToken()),
  };
  const reducer = (
    state: MapKitHookState,
    action: MapKitHookAction
  ): MapKitHookState => {
    switch (action.type) {
      case "set":
        return { ...state, ...action.payload };
      case "readyInitialized":
        return { ...state, status: "ready", hasToken: true, error: null };
      case "missingToken":
        return { ...state, status: "missing-token", hasToken: false, error: null };
      default:
        return state;
    }
  };
  const [state, dispatch] = useReducer(reducer, initialState);
  const { status, error, hasToken } = state;

  useEffect(() => {
    if (!enabled) return;

    if (initialized) {
      dispatch({ type: "readyInitialized" });
      return;
    }

    let cancelled = false;
    dispatch({ type: "set", payload: { status: "loading", error: null } });

    (async () => {
      try {
        // Probe for a token first so we can show "missing-token" without
        // bothering to load the MapKit script when nothing is configured.
        await resolveToken();
        if (cancelled) return;
        dispatch({ type: "set", payload: { hasToken: true } });

        await loadScript();
        if (cancelled) return;

        try {
          initMapKitWithCallback(language);
          dispatch({ type: "set", payload: { status: "ready", error: null } });
        } catch (err) {
          dispatch({
            type: "set",
            payload: {
              error: err instanceof Error ? err.message : String(err),
              status: "error",
            },
          });
        }
      } catch (err) {
        if (cancelled) return;
        const fallback = getEnvFallbackToken();
        if (!fallback) {
          dispatch({ type: "missingToken" });
          return;
        }
        dispatch({
          type: "set",
          payload: {
            error: err instanceof Error ? err.message : String(err),
            status: "error",
          },
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, language]);

  return { status, error, hasToken };
}
