import type { VercelRequest } from "@vercel/node";

export function getHeader(req: VercelRequest, name: string): string | null {
  const value = req.headers[name.toLowerCase()];
  if (Array.isArray(value)) {
    return value[0] || null;
  }
  return typeof value === "string" ? value : null;
}
