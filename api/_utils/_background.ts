/**
 * Fire-and-forget background work.
 *
 * The standalone Bun server is a long-lived process, so a detached promise
 * simply keeps running after the HTTP response is sent. This helper exists to
 * make that intent explicit at call sites and to guarantee rejections are
 * logged instead of surfacing as unhandled rejections.
 */
export function waitUntil(promise: Promise<unknown>): void {
  void promise.catch((error) => {
    console.error("[background] Deferred task failed:", error);
  });
}
