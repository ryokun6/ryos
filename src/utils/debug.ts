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

const DEBUG_FLAG_KEY = "ryos:debug";

let runtimeDebugEnabled: boolean | null = null;

function isDebugEnabled(): boolean {
  // Dev builds always log.
  if (import.meta.env.DEV) return true;

  if (runtimeDebugEnabled !== null) return runtimeDebugEnabled;
  try {
    runtimeDebugEnabled =
      typeof localStorage !== "undefined" &&
      localStorage.getItem(DEBUG_FLAG_KEY) === "1";
  } catch {
    runtimeDebugEnabled = false;
  }
  return runtimeDebugEnabled;
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
