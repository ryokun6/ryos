import { useCallback, useEffect, useState } from "react";
import {
  clearCachedMusicKitUserToken,
  clearLocalMusicKitUserTokenCache,
  loadCachedMusicKitUserToken,
  persistMusicKitUserToken,
  type CachedMusicKitUserToken,
} from "@/utils/musicKitUserTokenCloudSync";

/**
 * Apple MusicKit JS v3 lazy loader / configurer.
 *
 * MusicKit JS exposes a singleton on `window.MusicKit`. We:
 *   1. Resolve a developer token from `/api/musickit-token` (cached server-side).
 *   2. Try to recover a previously-authorized Music User Token from
 *      IndexedDB / the user's ryOS cloud-sync account so embedded
 *      browsers that wipe MusicKit's own localStorage on every reload
 *      (most famously: Tesla's in-car browser) don't force the user to
 *      re-authorize on every visit.
 *   3. Inject the v3 script tag and wait for the `musickitloaded` document
 *      event (or for `window.MusicKit` to appear, since some builds attach
 *      synchronously after the script's `load` event fires).
 *   4. Call `MusicKit.configure({ developerToken, app, musicUserToken? })`
 *      exactly once.
 *
 * Repeated mounts reuse the same configured instance — that keeps user
 * authorization, queue state, and the audio element alive as the user
 * opens/closes the iPod window.
 */

const MUSICKIT_SCRIPT_SRC = "https://js-cdn.music.apple.com/musickit/v3/musickit.js";
const MUSICKIT_SCRIPT_ID = "ryos-musickit-js-v3";
const MUSICKIT_TOKEN_ENDPOINT = "/api/musickit-token";
const TOKEN_REFRESH_BUFFER_MS = 60 * 60 * 1000; // refresh if <1h left

export type MusicKitStatus =
  | "idle"
  | "missing-token"
  | "loading"
  | "ready"
  | "error";

interface CachedDeveloperToken {
  token: string;
  expiresAt: number; // epoch ms
}

let cachedDeveloperToken: CachedDeveloperToken | null = null;
let inFlightTokenFetch: Promise<string> | null = null;

let scriptPromise: Promise<void> | null = null;
let configurePromise: Promise<MusicKit.MusicKitInstance> | null = null;
let configuredInstance: MusicKit.MusicKitInstance | null = null;

/** Subscribers notified when the singleton instance becomes available. */
const readyListeners = new Set<(instance: MusicKit.MusicKitInstance) => void>();

function notifyReady(instance: MusicKit.MusicKitInstance) {
  configuredInstance = instance;
  for (const listener of readyListeners) {
    try {
      listener(instance);
    } catch (err) {
      console.error("[musickit] ready listener threw", err);
    }
  }
}

function getEnvFallbackToken(): string | undefined {
  const token = import.meta.env.VITE_MUSICKIT_DEVELOPER_TOKEN as
    | string
    | undefined;
  return token && token.trim().length > 0 ? token.trim() : undefined;
}

async function fetchDeveloperToken(): Promise<string> {
  const now = Date.now();
  if (
    cachedDeveloperToken &&
    cachedDeveloperToken.expiresAt - now > TOKEN_REFRESH_BUFFER_MS
  ) {
    return cachedDeveloperToken.token;
  }

  if (inFlightTokenFetch) return inFlightTokenFetch;

  inFlightTokenFetch = (async () => {
    const res = await fetch(MUSICKIT_TOKEN_ENDPOINT, {
      method: "GET",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      throw new Error(`MusicKit token endpoint returned ${res.status}`);
    }
    const data = (await res.json()) as Partial<CachedDeveloperToken> & {
      error?: string;
    };
    if (!data.token || typeof data.expiresAt !== "number") {
      throw new Error(data.error || "Invalid MusicKit token response");
    }
    cachedDeveloperToken = {
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

async function resolveDeveloperToken(): Promise<string> {
  try {
    return await fetchDeveloperToken();
  } catch (err) {
    const fallback = getEnvFallbackToken();
    if (fallback) {
      console.warn(
        "[musickit] server token fetch failed, using VITE_MUSICKIT_DEVELOPER_TOKEN",
        err
      );
      return fallback;
    }
    throw err;
  }
}

function loadScript(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("MusicKit JS requires a browser"));
  }
  if (window.MusicKit) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    let settled = false;
    const settle = (err?: Error) => {
      if (settled) return;
      settled = true;
      if (err) {
        scriptPromise = null;
        reject(err);
      } else {
        resolve();
      }
    };

    // MusicKit JS dispatches a `musickitloaded` event on the document once
    // the global is wired up. Some builds also expose the global synchronously
    // by the time the script's `load` event fires, so we listen for both.
    const handleMusicKitLoaded = () => {
      document.removeEventListener("musickitloaded", handleMusicKitLoaded);
      if (window.MusicKit) {
        settle();
      } else {
        settle(new Error("musickitloaded fired but MusicKit global missing"));
      }
    };
    document.addEventListener("musickitloaded", handleMusicKitLoaded, {
      once: true,
    });

    const handleScriptLoad = () => {
      // Give a microtask in case `musickitloaded` is dispatched right after
      // the script runs synchronously.
      queueMicrotask(() => {
        if (settled) return;
        if (window.MusicKit) {
          settle();
        }
        // else: wait for `musickitloaded` (or the timeout below).
      });
    };

    const handleScriptError = () => {
      document.removeEventListener("musickitloaded", handleMusicKitLoaded);
      settle(new Error("Failed to load MusicKit JS"));
    };

    const existing = document.getElementById(
      MUSICKIT_SCRIPT_ID
    ) as HTMLScriptElement | null;

    if (existing) {
      if (window.MusicKit) {
        settle();
        return;
      }
      existing.addEventListener("load", handleScriptLoad, { once: true });
      existing.addEventListener("error", handleScriptError, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = MUSICKIT_SCRIPT_ID;
    script.src = MUSICKIT_SCRIPT_SRC;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.addEventListener("load", handleScriptLoad, { once: true });
    script.addEventListener("error", handleScriptError, { once: true });
    document.head.appendChild(script);
  });

  return scriptPromise;
}

async function configureMusicKit(
  developerToken: string,
  app: MusicKit.AppMetadata,
  musicUserToken?: string | null
): Promise<MusicKit.MusicKitInstance> {
  if (configuredInstance) return configuredInstance;
  if (configurePromise) return configurePromise;
  if (!window.MusicKit?.configure) {
    throw new Error("MusicKit.configure is not available");
  }

  configurePromise = (async () => {
    // `configure()` returns a Promise in MusicKit JS v3. Awaiting also
    // forces script-side init to complete before we hand the instance back.
    //
    // Passing `musicUserToken` here lets us restore an authorized session
    // even when MusicKit's own localStorage cache is unavailable (Tesla
    // in-car browser, private modes that don't survive reloads, etc).
    // MusicKit treats this as the source of truth and immediately marks
    // the instance as authorized — if Apple later rejects it as expired
    // the SDK will fire `authorizationStatusDidChange` and the user can
    // re-authorize through the normal Sign in button.
    const configureOptions: MusicKit.ConfigureOptions = {
      developerToken,
      app,
    };
    if (musicUserToken) {
      configureOptions.musicUserToken = musicUserToken;
    }
    const result = await Promise.resolve(
      window.MusicKit!.configure(configureOptions)
    );
    const instance = result ?? window.MusicKit!.getInstance?.();
    if (!instance) {
      throw new Error("MusicKit.configure returned no instance");
    }
    notifyReady(instance);
    return instance;
  })();

  try {
    return await configurePromise;
  } catch (err) {
    configurePromise = null;
    throw err;
  }
}

/**
 * Persist the current Music User Token snapshot from the MusicKit
 * instance into IndexedDB + the user's ryOS cloud-sync account. Safe
 * to call from any event handler — silently no-ops when there is no
 * authorized user or no readable token.
 */
function persistCurrentUserTokenSnapshot(
  instance: MusicKit.MusicKitInstance | null
): void {
  if (!instance) return;
  if (!instance.isAuthorized) return;
  const token = instance.musicUserToken;
  if (!token) return;
  const snapshot: CachedMusicKitUserToken = {
    musicUserToken: token,
    // Apple does not expose an `exp` for Music User Tokens via the
    // MusicKit instance, so we don't try to invent one — `null`
    // signals "unknown, just try it" to consumers. The server-side
    // store has its own TTL as a backstop.
    expiresAt: null,
    storedAt: Date.now(),
  };
  void persistMusicKitUserToken(snapshot);
}

/** Return the singleton MusicKit instance if it has already been configured. */
export function getMusicKitInstance(): MusicKit.MusicKitInstance | null {
  return configuredInstance;
}

/** Subscribe to instance-ready notifications. Returns unsubscribe fn. */
export function onMusicKitReady(
  cb: (instance: MusicKit.MusicKitInstance) => void
): () => void {
  if (configuredInstance) {
    queueMicrotask(() => cb(configuredInstance!));
  }
  readyListeners.add(cb);
  return () => readyListeners.delete(cb);
}

/**
 * Force the configured developer token to be refreshed on the next request
 * (e.g. after a long-lived tab where the cache has gone stale and the JWT
 * has hit its `exp`). Mostly here for diagnostics — the regular cache check
 * inside `fetchDeveloperToken` handles routine refreshes automatically.
 */
export function clearMusicKitTokenCache(): void {
  cachedDeveloperToken = null;
  inFlightTokenFetch = null;
}

/**
 * Drop the **local** Music User Token cache. Used by the ryOS
 * sign-out path so the next ryOS user on this device starts fresh,
 * without revoking the cloud copy — the token is bound to the ryOS
 * account, so signing back in restores Apple Music auth
 * automatically.
 *
 * Use {@link clearCachedMusicKitUserToken} (re-exported below) when
 * the user has explicitly revoked Apple Music access and the cloud
 * copy should be wiped too.
 */
export async function clearMusicKitUserTokenLocalCache(): Promise<void> {
  await clearLocalMusicKitUserTokenCache();
}

export interface UseMusicKitOptions {
  /** Skip loading until set to true. Defaults to true. */
  enabled?: boolean;
  /** App metadata reported to MusicKit; shows up in the auth dialog. */
  app?: MusicKit.AppMetadata;
}

export interface UseMusicKitResult {
  status: MusicKitStatus;
  error: string | null;
  hasToken: boolean;
  instance: MusicKit.MusicKitInstance | null;
  /** True when a user has authorized the app for personal Apple Music access. */
  isAuthorized: boolean;
  /** Trigger Apple's auth popup. Resolves with a Music User Token. */
  authorize: () => Promise<string | null>;
  /** Revoke the current Music User Token. */
  unauthorize: () => Promise<void>;
}

const DEFAULT_APP_METADATA: MusicKit.AppMetadata = {
  name: "ryOS iPod",
  build: "1.0.0",
};

/**
 * Hook that lazily loads MusicKit JS, fetches a developer token from
 * `/api/musickit-token`, and configures the singleton instance. Returns the
 * configured instance plus convenience `authorize` / `unauthorize` helpers.
 */
export function useMusicKit(
  options: UseMusicKitOptions = {}
): UseMusicKitResult {
  const { enabled = true, app = DEFAULT_APP_METADATA } = options;

  const [status, setStatus] = useState<MusicKitStatus>(() =>
    configuredInstance ? "ready" : "idle"
  );
  const [error, setError] = useState<string | null>(null);
  const [hasToken, setHasToken] = useState<boolean>(() =>
    Boolean(cachedDeveloperToken || getEnvFallbackToken())
  );
  const [instance, setInstance] = useState<MusicKit.MusicKitInstance | null>(
    () => configuredInstance
  );
  const [isAuthorized, setIsAuthorized] = useState<boolean>(
    () => configuredInstance?.isAuthorized ?? false
  );

  // Track auth state changes via authorizationStatusDidChange events. The
  // event payload isn't strongly typed by MusicKit, so we re-read the
  // instance's `isAuthorized` getter to stay in sync regardless of payload
  // shape across versions.
  //
  // We also mirror the Music User Token into IndexedDB + the user's ryOS
  // cloud-sync account whenever it changes, so the next reload (even on
  // browsers that nuke localStorage between sessions, like Tesla's
  // in-car browser) can restore the authorized session through
  // `configure({ musicUserToken })`.
  useEffect(() => {
    if (!instance) return;
    const refresh = () => {
      const nowAuthorized = Boolean(instance.isAuthorized);
      setIsAuthorized(nowAuthorized);
      if (nowAuthorized) {
        persistCurrentUserTokenSnapshot(instance);
      }
    };
    instance.addEventListener("authorizationStatusDidChange", refresh);
    instance.addEventListener("userTokenDidChange", refresh);
    refresh();
    return () => {
      instance.removeEventListener("authorizationStatusDidChange", refresh);
      instance.removeEventListener("userTokenDidChange", refresh);
    };
  }, [instance]);

  useEffect(() => {
    if (!enabled) return;
    if (configuredInstance) {
      setStatus("ready");
      setHasToken(true);
      setInstance(configuredInstance);
      setIsAuthorized(Boolean(configuredInstance.isAuthorized));
      return;
    }

    let cancelled = false;
    setStatus("loading");
    setError(null);

    (async () => {
      try {
        const token = await resolveDeveloperToken();
        if (cancelled) return;
        setHasToken(true);

        // Kick off recovery of any previously-saved Music User Token in
        // parallel with the MusicKit script load. Best-effort: when the
        // user isn't signed in to ryOS, when neither IndexedDB nor the
        // cloud has a saved copy, or when the network blip prevents the
        // cloud fetch, we fall back to MusicKit JS's own persistence
        // (which is the historical behavior). The recovered token only
        // matters for the very first `configure()` call — once a
        // singleton instance exists, re-mounts short-circuit before
        // reaching here.
        const cachedUserTokenPromise: Promise<CachedMusicKitUserToken | null> =
          loadCachedMusicKitUserToken().catch(() => null);

        await loadScript();
        if (cancelled) return;

        const cachedUserToken = await cachedUserTokenPromise;
        if (cancelled) return;

        try {
          const inst = await configureMusicKit(
            token,
            app,
            cachedUserToken?.musicUserToken ?? null
          );
          if (cancelled) return;
          setInstance(inst);
          setIsAuthorized(Boolean(inst.isAuthorized));
          setStatus("ready");
          if (inst.isAuthorized) {
            // Either MusicKit restored its own auth from localStorage,
            // or our cached user token unlocked the session. In both
            // cases, write the current snapshot back so the cloud copy
            // stays in lockstep with whatever MusicKit ended up using.
            persistCurrentUserTokenSnapshot(inst);
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
          setStatus("error");
        }
      } catch (err) {
        if (cancelled) return;
        const fallback = getEnvFallbackToken();
        if (!fallback) {
          setHasToken(false);
          setStatus("missing-token");
          return;
        }
        setError(err instanceof Error ? err.message : String(err));
        setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, app]);

  // Memoize authorize/unauthorize so consumers can include them in
  // useCallback / useMemo dependency arrays without triggering cascading
  // re-renders. Closing over `instance` here is enough — when the
  // configured instance changes, both callbacks get a fresh identity.
  const authorize = useCallback(async (): Promise<string | null> => {
    const inst = instance ?? configuredInstance;
    if (!inst) return null;
    try {
      const token = await inst.authorize();
      setIsAuthorized(Boolean(inst.isAuthorized));
      // Belt-and-suspenders: the `userTokenDidChange` event handler
      // above also persists, but some MusicKit JS builds don't fan that
      // event out reliably after the initial authorize flow. Persisting
      // here guarantees the very first authorize on a Tesla / private
      // window survives the next reload.
      persistCurrentUserTokenSnapshot(inst);
      return token ?? null;
    } catch (err) {
      console.error("[musickit] authorize failed", err);
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    }
  }, [instance]);

  const unauthorize = useCallback(async (): Promise<void> => {
    const inst = instance ?? configuredInstance;
    if (!inst) return;
    try {
      await inst.unauthorize();
      setIsAuthorized(false);
      // Wipe the cached token from both IndexedDB and the user's ryOS
      // cloud-sync account so a future configure() doesn't try to
      // restore a token the user just explicitly revoked.
      void clearCachedMusicKitUserToken();
    } catch (err) {
      console.error("[musickit] unauthorize failed", err);
    }
  }, [instance]);

  return {
    status,
    error,
    hasToken,
    instance,
    isAuthorized,
    authorize,
    unauthorize,
  };
}
