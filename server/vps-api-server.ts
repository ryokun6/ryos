import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { VercelRequest, VercelResponse } from "@vercel/node";

type QueryValue = string | string[];
type Query = Record<string, QueryValue>;

type VercelHandler = (
  req: VercelRequest,
  res: VercelResponse
) => Promise<unknown> | unknown;

interface RouteDefinition {
  pattern: string;
  parseBody?: boolean;
  loadHandler: () => Promise<VercelHandler>;
}

const DEFAULT_BODY_LIMIT_BYTES = 15 * 1024 * 1024;
const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || process.env.API_PORT || 3001);

const createLoader = (
  importer: () => Promise<{ default: VercelHandler }>
): (() => Promise<VercelHandler>) => {
  let cached: VercelHandler | null = null;
  return async () => {
    if (!cached) {
      const mod = await importer();
      cached = mod.default;
    }
    return cached;
  };
};

const routes: RouteDefinition[] = [
  // Most specific routes first
  { pattern: "/api/rooms/:id/messages/:msgId", loadHandler: createLoader(() => import("../_api/rooms/[id]/messages/[msgId].ts")) },
  { pattern: "/api/rooms/:id/messages", loadHandler: createLoader(() => import("../_api/rooms/[id]/messages.ts")) },
  { pattern: "/api/rooms/:id/join", loadHandler: createLoader(() => import("../_api/rooms/[id]/join.ts")) },
  { pattern: "/api/rooms/:id/leave", loadHandler: createLoader(() => import("../_api/rooms/[id]/leave.ts")) },
  { pattern: "/api/rooms/:id/users", loadHandler: createLoader(() => import("../_api/rooms/[id]/users.ts")) },
  { pattern: "/api/rooms/:id", loadHandler: createLoader(() => import("../_api/rooms/[id].ts")) },
  { pattern: "/api/rooms/index", loadHandler: createLoader(() => import("../_api/rooms/index.ts")) },
  { pattern: "/api/rooms", loadHandler: createLoader(() => import("../_api/rooms/index.ts")) },

  { pattern: "/api/listen/sessions/:id/reaction", loadHandler: createLoader(() => import("../_api/listen/sessions/[id]/reaction.ts")) },
  { pattern: "/api/listen/sessions/:id/join", loadHandler: createLoader(() => import("../_api/listen/sessions/[id]/join.ts")) },
  { pattern: "/api/listen/sessions/:id/leave", loadHandler: createLoader(() => import("../_api/listen/sessions/[id]/leave.ts")) },
  { pattern: "/api/listen/sessions/:id/sync", loadHandler: createLoader(() => import("../_api/listen/sessions/[id]/sync.ts")) },
  { pattern: "/api/listen/sessions/:id", loadHandler: createLoader(() => import("../_api/listen/sessions/[id]/index.ts")) },
  { pattern: "/api/listen/sessions/index", loadHandler: createLoader(() => import("../_api/listen/sessions/index.ts")) },
  { pattern: "/api/listen/sessions", loadHandler: createLoader(() => import("../_api/listen/sessions/index.ts")) },

  { pattern: "/api/auth/password/check", loadHandler: createLoader(() => import("../_api/auth/password/check.ts")) },
  { pattern: "/api/auth/password/set", loadHandler: createLoader(() => import("../_api/auth/password/set.ts")) },
  { pattern: "/api/auth/token/verify", loadHandler: createLoader(() => import("../_api/auth/token/verify.ts")) },
  { pattern: "/api/auth/token/refresh", loadHandler: createLoader(() => import("../_api/auth/token/refresh.ts")) },
  { pattern: "/api/auth/register", loadHandler: createLoader(() => import("../_api/auth/register.ts")) },
  { pattern: "/api/auth/login", loadHandler: createLoader(() => import("../_api/auth/login.ts")) },
  { pattern: "/api/auth/logout-all", loadHandler: createLoader(() => import("../_api/auth/logout-all.ts")) },
  { pattern: "/api/auth/logout", loadHandler: createLoader(() => import("../_api/auth/logout.ts")) },
  { pattern: "/api/auth/tokens", loadHandler: createLoader(() => import("../_api/auth/tokens.ts")) },

  { pattern: "/api/sync/backup-token", loadHandler: createLoader(() => import("../_api/sync/backup-token.ts")) },
  { pattern: "/api/sync/backup", loadHandler: createLoader(() => import("../_api/sync/backup.ts")) },
  { pattern: "/api/sync/status", loadHandler: createLoader(() => import("../_api/sync/status.ts")) },

  { pattern: "/api/songs/index", loadHandler: createLoader(() => import("../_api/songs/index.ts")) },
  { pattern: "/api/songs/:id", loadHandler: createLoader(() => import("../_api/songs/[id].ts")) },
  { pattern: "/api/songs", loadHandler: createLoader(() => import("../_api/songs/index.ts")) },

  { pattern: "/api/users/index", loadHandler: createLoader(() => import("../_api/users/index.ts")) },
  { pattern: "/api/users", loadHandler: createLoader(() => import("../_api/users/index.ts")) },

  { pattern: "/api/ai/process-daily-notes", loadHandler: createLoader(() => import("../_api/ai/process-daily-notes.ts")) },
  { pattern: "/api/ai/extract-memories", loadHandler: createLoader(() => import("../_api/ai/extract-memories.ts")) },
  { pattern: "/api/ai/ryo-reply", loadHandler: createLoader(() => import("../_api/ai/ryo-reply.ts")) },

  { pattern: "/api/messages/bulk", loadHandler: createLoader(() => import("../_api/messages/bulk.ts")) },
  { pattern: "/api/presence/switch", loadHandler: createLoader(() => import("../_api/presence/switch.ts")) },
  { pattern: "/api/pusher/broadcast", loadHandler: createLoader(() => import("../_api/pusher/broadcast.ts")) },

  { pattern: "/api/audio-transcribe", parseBody: false, loadHandler: createLoader(() => import("../_api/audio-transcribe.ts")) },
  { pattern: "/api/youtube-search", loadHandler: createLoader(() => import("../_api/youtube-search.ts")) },
  { pattern: "/api/parse-title", loadHandler: createLoader(() => import("../_api/parse-title.ts")) },
  { pattern: "/api/speech", loadHandler: createLoader(() => import("../_api/speech.ts")) },
  { pattern: "/api/link-preview", loadHandler: createLoader(() => import("../_api/link-preview.ts")) },
  { pattern: "/api/iframe-check", loadHandler: createLoader(() => import("../_api/iframe-check.ts")) },
  { pattern: "/api/ie-generate", loadHandler: createLoader(() => import("../_api/ie-generate.ts")) },
  { pattern: "/api/applet-ai", loadHandler: createLoader(() => import("../_api/applet-ai.ts")) },
  { pattern: "/api/share-applet", loadHandler: createLoader(() => import("../_api/share-applet.ts")) },
  { pattern: "/api/admin", loadHandler: createLoader(() => import("../_api/admin.ts")) },
  { pattern: "/api/chat", loadHandler: createLoader(() => import("../_api/chat.ts")) },
];

function normalizePathname(pathname: string): string {
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

function matchRoute(
  pathname: string
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

function buildQuery(searchParams: URLSearchParams, params: Record<string, string>): Query {
  const query: Query = {};

  for (const [key, value] of searchParams.entries()) {
    appendQueryValue(query, key, value);
  }

  for (const [key, value] of Object.entries(params)) {
    appendQueryValue(query, key, value);
  }

  return query;
}

function parseCookies(
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

async function readRawBody(
  req: IncomingMessage,
  limitBytes: number = DEFAULT_BODY_LIMIT_BYTES
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of req) {
    const bufferChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += bufferChunk.length;

    if (totalBytes > limitBytes) {
      throw new Error(`Body exceeds limit of ${limitBytes} bytes`);
    }

    chunks.push(bufferChunk);
  }

  return Buffer.concat(chunks);
}

async function parseBody(req: IncomingMessage): Promise<unknown> {
  const method = (req.method || "GET").toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return undefined;
  }

  const contentLength = Number(req.headers["content-length"] || "0");
  if (!Number.isNaN(contentLength) && contentLength <= 0) {
    return undefined;
  }

  const raw = await readRawBody(req);
  if (raw.length === 0) {
    return undefined;
  }

  const contentType = (req.headers["content-type"] || "").toLowerCase();

  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(raw.toString("utf8"));
    } catch {
      return undefined;
    }
  }

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams(raw.toString("utf8"));
    const body: Record<string, string | string[]> = {};
    for (const [key, value] of params.entries()) {
      const existing = body[key];
      if (typeof existing === "undefined") {
        body[key] = value;
      } else if (Array.isArray(existing)) {
        existing.push(value);
      } else {
        body[key] = [existing, value];
      }
    }
    return body;
  }

  // Fallback to UTF-8 text payload for unknown content types.
  return raw.toString("utf8");
}

function enhanceResponse(res: ServerResponse): VercelResponse {
  const vRes = res as VercelResponse;
  const mutable = vRes as VercelResponse & {
    status: (statusCode: number) => VercelResponse;
    json: (body: unknown) => VercelResponse;
    send: (body: unknown) => VercelResponse;
  };

  mutable.status = (statusCode: number) => {
    vRes.statusCode = statusCode;
    return vRes;
  };

  mutable.json = (body: unknown) => {
    if (!vRes.headersSent && !vRes.hasHeader("Content-Type")) {
      vRes.setHeader("Content-Type", "application/json; charset=utf-8");
    }
    vRes.end(JSON.stringify(body));
    return vRes;
  };

  mutable.send = (body: unknown) => {
    if (typeof body === "undefined" || body === null) {
      vRes.end();
      return vRes;
    }

    if (Buffer.isBuffer(body) || body instanceof Uint8Array) {
      vRes.end(body);
      return vRes;
    }

    if (typeof body === "object") {
      return mutable.json(body);
    }

    if (!vRes.headersSent && !vRes.hasHeader("Content-Type")) {
      vRes.setHeader("Content-Type", "text/plain; charset=utf-8");
    }
    vRes.end(String(body));
    return vRes;
  };

  return vRes;
}

function enhanceRequest(
  req: IncomingMessage,
  url: URL,
  params: Record<string, string>,
  body: unknown
): VercelRequest {
  const vReq = req as VercelRequest;
  const mutable = vReq as VercelRequest & {
    query: Query;
    body: unknown;
    cookies: Record<string, string>;
  };

  mutable.query = buildQuery(url.searchParams, params);
  mutable.body = body;
  mutable.cookies = parseCookies(req.headers.cookie);
  return vReq;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const pathname = normalizePathname(url.pathname);

  if (pathname === "/api/health") {
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(
      JSON.stringify({
        ok: true,
        service: "ryos-api-vps",
        timestamp: new Date().toISOString(),
      })
    );
    return;
  }

  const matched = matchRoute(pathname);
  if (!matched) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "Not found" }));
    return;
  }

  const vRes = enhanceResponse(res);

  try {
    const body = matched.route.parseBody === false ? undefined : await parseBody(req);
    const vReq = enhanceRequest(req, url, matched.params, body);
    const handler = await matched.route.loadHandler();

    await Promise.resolve(handler(vReq, vRes));

    if (!res.writableEnded) {
      res.end();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unhandled API error";
    console.error(`[vps-api] ${req.method || "GET"} ${pathname} failed:`, error);

    if (res.headersSent || res.writableEnded) {
      return;
    }

    res.statusCode = message.includes("Body exceeds limit") ? 413 : 500;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: message }));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[vps-api] Listening on http://${HOST}:${PORT}`);
  console.log(`[vps-api] Health check: http://${HOST}:${PORT}/api/health`);
});
