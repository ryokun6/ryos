/**
 * Scheduling helpers for background polling that should pause while the
 * document is hidden (background tab / minimized window) and catch up when
 * the user comes back.
 */

export interface VisibilityGatedIntervalOptions {
  /**
   * Override visibility detection (mainly for tests). Defaults to
   * `document.visibilityState === "visible"`, or always-visible when no
   * `document` exists (SSR / test runtimes), which degrades to a plain
   * `setInterval`.
   */
  getIsVisible?: () => boolean;
  /**
   * Override the visibility-change event source (mainly for tests). Receives
   * a handler to invoke whenever visibility may have changed and returns an
   * unsubscribe function. Defaults to the document `visibilitychange` event.
   */
  subscribeVisibilityChange?: (handler: () => void) => () => void;
}

/**
 * Run `callback` every `intervalMs` while the document is visible.
 *
 * - While hidden, the interval is paused (no timer running at all).
 * - On becoming visible, the callback runs immediately if the last run is
 *   older than `intervalMs`, then the regular cadence resumes.
 * - SSR/test safe: when `document` is undefined this falls back to a plain
 *   `setInterval` with no visibility gating.
 *
 * Returns a dispose function that stops the interval and removes listeners.
 */
export function createVisibilityGatedInterval(
  callback: () => void,
  intervalMs: number,
  options: VisibilityGatedIntervalOptions = {}
): () => void {
  const hasDocument = typeof document !== "undefined";

  const getIsVisible =
    options.getIsVisible ??
    (hasDocument ? () => document.visibilityState === "visible" : () => true);

  const subscribeVisibilityChange =
    options.subscribeVisibilityChange ??
    (hasDocument
      ? (handler: () => void) => {
          document.addEventListener("visibilitychange", handler);
          return () =>
            document.removeEventListener("visibilitychange", handler);
        }
      : () => () => {});

  let timer: ReturnType<typeof setInterval> | null = null;
  // Treat creation time as the baseline so the first run happens one full
  // interval after creation (matching plain setInterval semantics).
  let lastRunAt = Date.now();
  let disposed = false;

  const run = () => {
    lastRunAt = Date.now();
    callback();
  };

  const start = () => {
    if (timer !== null || disposed) return;
    timer = setInterval(run, intervalMs);
  };

  const stop = () => {
    if (timer === null) return;
    clearInterval(timer);
    timer = null;
  };

  const handleVisibilityChange = () => {
    if (disposed) return;
    if (getIsVisible()) {
      if (timer === null && Date.now() - lastRunAt >= intervalMs) {
        run();
      }
      start();
    } else {
      stop();
    }
  };

  const unsubscribe = subscribeVisibilityChange(handleVisibilityChange);

  if (getIsVisible()) {
    start();
  }

  return () => {
    if (disposed) return;
    disposed = true;
    stop();
    unsubscribe();
  };
}
