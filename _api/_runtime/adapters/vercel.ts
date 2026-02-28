import type { VercelRequest } from "@vercel/node";
import { normalizePathname } from "../http-helpers.js";

/**
 * Shared helper for Vercel runtime wrappers.
 * Produces normalized route paths that can be compared with VPS adapter paths.
 */
export function getNormalizedRequestPath(req: VercelRequest): string {
  const raw = req.url || "/";
  try {
    const url = new URL(raw, "http://localhost");
    return normalizePathname(url.pathname);
  } catch {
    return normalizePathname(raw);
  }
}
