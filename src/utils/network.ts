/**
 * Network-awareness helpers for prefetching.
 *
 * Background prefetch should be polite on metered / slow connections. We use
 * the Network Information API (`navigator.connection`) when available; when it
 * is not (Safari/Firefox), we assume a good connection and allow prefetch.
 */

export interface ConnectionLike {
  saveData?: boolean;
  effectiveType?: string;
}

type NavigatorWithConnection = Navigator & {
  connection?: ConnectionLike;
  mozConnection?: ConnectionLike;
  webkitConnection?: ConnectionLike;
};

/**
 * Read the active connection info, if the browser exposes it.
 */
export function getConnection(): ConnectionLike | undefined {
  if (typeof navigator === "undefined") return undefined;
  const nav = navigator as NavigatorWithConnection;
  return nav.connection ?? nav.mozConnection ?? nav.webkitConnection;
}

/**
 * Decide whether background prefetch of non-critical assets should run on the
 * given connection. Pure for testability.
 *
 * Rules:
 *  - No connection info → allow (can't tell; don't punish good networks).
 *  - Data Saver enabled → skip.
 *  - effectiveType slow-2g / 2g / 3g → skip.
 */
export function shouldPrefetchOnConnection(
  connection: ConnectionLike | undefined
): boolean {
  if (!connection) return true;
  if (connection.saveData === true) return false;
  const type = connection.effectiveType;
  if (type && /(?:^|[^a-z])(?:slow-2g|2g|3g)$/i.test(type)) return false;
  return true;
}

/**
 * Convenience wrapper using the live connection.
 */
export function shouldPrefetchNow(): boolean {
  return shouldPrefetchOnConnection(getConnection());
}
