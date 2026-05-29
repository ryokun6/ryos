import path from "node:path";

/**
 * Whether a non-API GET path should fall back to the SPA shell (index.html).
 * Used by the standalone Bun production server (non-Vercel deploys).
 */
export function shouldServeSpaFallback(pathname: string): boolean {
  if (pathname === "/" || pathname === "") return true;
  if (pathname.startsWith("/api/")) return false;
  if (pathname === "/api") return false;
  return !path.posix.basename(pathname).includes(".");
}
