/**
 * Lightweight debug logger that is silent in production by default.
 *
 * Many stores/hooks emit `console.log` traces on routine actions (login, room
 * fetch, sync, library migration). These are useful in development but spam
 * the console in production. Route those debug-level traces through `debug()`
 * so they only print when:
 *
 *  - running a dev build (`import.meta.env.DEV`), or
 *  - the user opts in at runtime via `localStorage.setItem("ryos:debug", "1")`.
 *
 * `console.warn` / `console.error` should keep using `console` directly — they
 * surface real problems and are always shown.
 */

export const DEBUG_FLAG_KEY = "ryos:debug";

let runtimeDebugEnabled: boolean | null = null;

function readStoredDebugOverride(): boolean | null {
  try {
    if (typeof localStorage === "undefined") return null;

    const storedValue = localStorage.getItem(DEBUG_FLAG_KEY);
    if (storedValue === "1") return true;
    if (storedValue === null) return null;

    // Older builds could leave false-like or malformed values behind. Absence
    // is the canonical disabled state, so clean up every non-affirmative value.
    localStorage.removeItem(DEBUG_FLAG_KEY);
    return false;
  } catch {
    // Storage can be unavailable in private modes.
  }
  return null;
}

export function resolveDebugEnabled({
  runtimeOverride,
  storedOverride,
  developmentDefault,
}: {
  runtimeOverride: boolean | null;
  storedOverride: boolean | null;
  developmentDefault: boolean;
}): boolean {
  return runtimeOverride ?? storedOverride ?? developmentDefault;
}

export function normalizeDebugMode(value: unknown): boolean {
  return value === true;
}

export function isDebugEnabled(): boolean {
  if (runtimeDebugEnabled !== null) return runtimeDebugEnabled;

  runtimeDebugEnabled = resolveDebugEnabled({
    runtimeOverride: null,
    storedOverride: readStoredDebugOverride(),
    developmentDefault: import.meta.env.DEV === true,
  });
  return runtimeDebugEnabled;
}

export function setRuntimeDebugEnabled(enabled: boolean): void {
  runtimeDebugEnabled = enabled;
  try {
    if (typeof localStorage !== "undefined") {
      if (enabled) {
        localStorage.setItem(DEBUG_FLAG_KEY, "1");
      } else {
        localStorage.removeItem(DEBUG_FLAG_KEY);
      }
    }
  } catch {
    // Storage can be unavailable in private modes; keep the in-memory flag.
  }
}

export function refreshRuntimeDebugFlag(): void {
  runtimeDebugEnabled = null;
}

/** Production-silent `console.log`. */
export function debug(...args: unknown[]): void {
  if (isDebugEnabled()) console.log(...args);
}

/**
 * Production-silent logger bound to a `[scope]` prefix.
 *
 * @example
 *   const log = createDebugLogger("ChatsStore");
 *   log("Fetching rooms…");
 */
export function createDebugLogger(
  scope: string
): (...args: unknown[]) => void {
  const prefix = `[${scope}]`;
  return (...args: unknown[]): void => {
    if (isDebugEnabled()) console.log(prefix, ...args);
  };
}
