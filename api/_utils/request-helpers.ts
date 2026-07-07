import type { ApiRequest } from "./api-types.js";

export function getHeader(req: ApiRequest, name: string): string | null {
  const value = req.headers[name.toLowerCase()];
  if (Array.isArray(value)) {
    return value[0] || null;
  }
  return typeof value === "string" ? value : null;
}
