import type { Query, RouteDefinition } from "./http-types.js";

export function normalizePathname(pathname: string): string {
  const trimmed = pathname.trim();
  if (!trimmed) return "/";
  const normalized = trimmed.replace(/\/{2,}/g, "/");
  if (normalized === "/") return normalized;
  return normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
}

function splitPath(pathname: string): string[] {
  return normalizePathname(pathname)
    .split("/")
    .filter((segment) => segment.length > 0);
}

export function matchRoute(
  pathname: string,
  routes: RouteDefinition[]
): { route: RouteDefinition; params: Record<string, string> } | null {
  const incomingSegments = splitPath(pathname);

  for (const route of routes) {
    const routeSegments = splitPath(route.pattern);
    if (routeSegments.length !== incomingSegments.length) {
      continue;
    }

    const params: Record<string, string> = {};
    let matched = true;

    for (let i = 0; i < routeSegments.length; i += 1) {
      const routeSegment = routeSegments[i];
      const incomingSegment = incomingSegments[i];

      if (routeSegment.startsWith(":")) {
        const paramName = routeSegment.slice(1);
        params[paramName] = decodeURIComponent(incomingSegment);
        continue;
      }

      if (routeSegment !== incomingSegment) {
        matched = false;
        break;
      }
    }

    if (matched) {
      return { route, params };
    }
  }

  return null;
}

function appendQueryValue(query: Query, key: string, value: string): void {
  const existing = query[key];
  if (typeof existing === "undefined") {
    query[key] = value;
    return;
  }
  if (Array.isArray(existing)) {
    existing.push(value);
    return;
  }
  query[key] = [existing, value];
}

export function buildQuery(
  searchParams: URLSearchParams,
  params: Record<string, string>
): Query {
  const query: Query = {};

  for (const [key, value] of searchParams.entries()) {
    appendQueryValue(query, key, value);
  }

  for (const [key, value] of Object.entries(params)) {
    appendQueryValue(query, key, value);
  }

  return query;
}

export function parseCookies(
  rawCookieHeader: string | string[] | undefined
): Record<string, string> {
  if (!rawCookieHeader) return {};
  const normalized = Array.isArray(rawCookieHeader)
    ? rawCookieHeader.join("; ")
    : rawCookieHeader;
  return normalized
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((acc, pair) => {
      const idx = pair.indexOf("=");
      if (idx <= 0) return acc;
      const key = pair.slice(0, idx).trim();
      const value = pair.slice(idx + 1).trim();
      if (!key) return acc;
      acc[key] = decodeURIComponent(value);
      return acc;
    }, {});
}
