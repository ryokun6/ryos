#!/usr/bin/env bun

/**
 * Standalone API server for running `api/*` routes without Vercel CLI.
 *
 * Uses Bun's native HTTP server (`Bun.serve`) and adapts requests/responses
 * to the Vercel Node handler shape used in `api`.
 */

import { readFile } from "node:fs/promises";
import { EventEmitter } from "node:events";
import path from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath, pathToFileURL } from "node:url";
import { getRedisBackend } from "../api/_utils/redis.js";
import {
  buildClientRuntimeConfig,
  getConfiguredPublicOrigin,
  getRealtimeProvider,
  getRealtimeWebSocketPath,
  shouldEnableLocalRealtime,
} from "../api/_utils/runtime-config.js";
import { createOgShareResponse } from "../api/_utils/og-share.js";
import {
  ensureRealtimePubSubBridge,
  registerRealtimeSocket,
  subscribeRealtimeSocket,
  unregisterRealtimeSocket,
  unsubscribeRealtimeSocket,
} from "../api/_utils/realtime.js";
import { getIrcBridge, isIrcBridgeEnabled } from "../api/_utils/irc/_bridge.js";
import {
  discoverApiRouteManifest,
  type ApiRouteManifestEntry,
} from "./api-route-manifest";

type QueryValue = string | string[];
type QueryMap = Record<string, QueryValue>;
type HeaderValue = string | number | string[];
type HeaderMap = Record<string, string | string[] | undefined>;
type RouteHandler = (
  req: BunRequestShim,
  res: BunResponseShim
) => Promise<unknown> | unknown;

type RouteDefinition = ApiRouteManifestEntry;

interface ParsedBody {
  bodyValue: unknown;
  bodyError: SyntaxError | null;
  rawBody: Uint8Array | null;
}

class BunRequestShim extends Readable {
  method: string;
  url: string;
  headers: HeaderMap;
  query: QueryMap;

  private rawBody: Uint8Array | null;
  private hasPushedBody = false;

  constructor(options: {
    method: string;
    url: string;
    headers: HeaderMap;
    query: QueryMap;
    bodyValue: unknown;
    bodyError: SyntaxError | null;
    rawBody: Uint8Array | null;
  }) {
    super();
    this.method = options.method;
    this.url = options.url;
    this.headers = options.headers;
    this.query = options.query;
    this.rawBody = options.rawBody;

    let currentBodyValue = options.bodyValue;
    let currentBodyError = options.bodyError;

    Object.defineProperty(this, "body", {
      configurable: true,
      enumerable: true,
      get() {
        if (currentBodyError) throw currentBodyError;
        return currentBodyValue;
      },
      set(value: unknown) {
        currentBodyError = null;
        currentBodyValue = value;
      },
    });
  }

  _read(): void {
    if (this.hasPushedBody) {
      this.push(null);
      return;
    }

    this.hasPushedBody = true;
    if (this.rawBody && this.rawBody.length > 0) {
      this.push(Buffer.from(this.rawBody));
    }
    this.push(null);
  }
}

class BunResponseShim extends EventEmitter {
  statusCode = 200;
  statusMessage: string | undefined;
  headersSent = false;
  writableEnded = false;

  private readonly headerStore = new Map<string, string | string[]>();
  private readonly stream: ReadableStream<Uint8Array>;
  private streamController: ReadableStreamDefaultController<Uint8Array> | null =
    null;

  private _headersSentResolve: (() => void) | null = null;
  readonly headersSentPromise: Promise<void>;

  constructor() {
    super();
    this.headersSentPromise = new Promise<void>((resolve) => {
      this._headersSentResolve = resolve;
    });
    this.stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        this.streamController = controller;
      },
      cancel: () => {
        this.closeStream();
      },
    });
  }

  private markHeadersSent(): void {
    if (!this.headersSent) {
      this.headersSent = true;
      this._headersSentResolve?.();
      this._headersSentResolve = null;
    }
  }

  status(code: number): this {
    this.statusCode = code;
    return this;
  }

  setHeader(name: string, value: HeaderValue): this {
    const normalizedName = name.toLowerCase();
    if (Array.isArray(value)) {
      this.headerStore.set(
        normalizedName,
        value.map((entry) => String(entry))
      );
      return this;
    }
    this.headerStore.set(normalizedName, String(value));
    return this;
  }

  getHeader(name: string): string | string[] | undefined {
    return this.headerStore.get(name.toLowerCase());
  }

  removeHeader(name: string): this {
    this.headerStore.delete(name.toLowerCase());
    return this;
  }

  hasHeader(name: string): boolean {
    return this.headerStore.has(name.toLowerCase());
  }

  writeHead(
    statusCode: number,
    statusMessageOrHeaders?: string | Record<string, HeaderValue>,
    maybeHeaders?: Record<string, HeaderValue>
  ): this {
    this.statusCode = statusCode;

    if (typeof statusMessageOrHeaders === "string") {
      this.statusMessage = statusMessageOrHeaders;
      if (maybeHeaders) {
        for (const [key, value] of Object.entries(maybeHeaders)) {
          this.setHeader(key, value);
        }
      }
    } else if (statusMessageOrHeaders) {
      for (const [key, value] of Object.entries(statusMessageOrHeaders)) {
        this.setHeader(key, value);
      }
    }

    this.markHeadersSent();
    return this;
  }

  flushHeaders(): this {
    this.markHeadersSent();
    return this;
  }

  write(chunk: unknown): boolean {
    if (this.writableEnded) return false;
    this.markHeadersSent();

    const payload = toUint8Array(chunk);
    if (!payload) return true;

    try {
      this.streamController?.enqueue(payload);
      return true;
    } catch {
      return false;
    }
  }

  end(chunk?: unknown): this {
    if (chunk !== undefined) {
      this.write(chunk);
    }
    this.closeStream();
    return this;
  }

  json(payload: unknown): this {
    if (!this.hasHeader("content-type")) {
      this.setHeader("Content-Type", "application/json; charset=utf-8");
    }
    const body = JSON.stringify(payload ?? null);
    this.end(body);
    return this;
  }

  send(payload?: unknown): this {
    if (payload === undefined) {
      this.end();
      return this;
    }

    if (
      payload !== null &&
      typeof payload === "object" &&
      !ArrayBuffer.isView(payload) &&
      !(payload instanceof ArrayBuffer) &&
      !Buffer.isBuffer(payload)
    ) {
      if (!this.hasHeader("content-type")) {
        this.setHeader("Content-Type", "application/json; charset=utf-8");
      }
      this.end(JSON.stringify(payload));
      return this;
    }

    if (
      (typeof payload === "string" || payload instanceof String) &&
      !this.hasHeader("content-type")
    ) {
      this.setHeader("Content-Type", "text/plain; charset=utf-8");
    }

    this.end(payload);
    return this;
  }

  toResponse(): Response {
    const headers = new Headers();
    for (const [name, value] of this.headerStore.entries()) {
      if (Array.isArray(value)) {
        for (const item of value) headers.append(name, item);
      } else {
        headers.set(name, value);
      }
    }

    const body =
      this.statusCode === 204 || this.statusCode === 304 ? null : this.stream;
    return new Response(body, {
      status: this.statusCode,
      headers,
    });
  }

  private closeStream(): void {
    if (this.writableEnded) return;

    this.writableEnded = true;
    this.markHeadersSent();
    try {
      this.streamController?.close();
    } catch {
      // stream already closed
    }
    this.emit("finish");
    this.emit("close");
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_ROOT = path.resolve(__dirname, "..");
const API_ROOT = path.join(WORKSPACE_ROOT, "api");
const DIST_ROOT = path.join(WORKSPACE_ROOT, "dist");
const handlerCache = new Map<string, RouteHandler>();

interface LocalRealtimeSocketData {
  connectedAt: number;
}

function toUint8Array(chunk: unknown): Uint8Array | null {
  if (chunk === null || chunk === undefined) return null;
  if (chunk instanceof Uint8Array) return chunk;
  if (Buffer.isBuffer(chunk)) return chunk;
  if (chunk instanceof ArrayBuffer) return new Uint8Array(chunk);
  if (ArrayBuffer.isView(chunk)) {
    return new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
  }
  if (typeof chunk === "string") return new TextEncoder().encode(chunk);
  return new TextEncoder().encode(String(chunk));
}

function parseEnvLine(line: string): { key: string; value: string } | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;

  const match = trimmed.match(
    /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/
  );
  if (!match) return null;

  const key = match[1];
  let value = match[2].trim();

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  } else {
    const inlineCommentIndex = value.indexOf(" #");
    if (inlineCommentIndex >= 0) {
      value = value.slice(0, inlineCommentIndex).trim();
    }
  }

  return { key, value: value.replace(/\\n/g, "\n") };
}

function normalizeEnvValue(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).replace(/\\n/g, "\n");
  }

  return value.replace(/\\n/g, "\n");
}

async function loadEnvFile(filePath: string): Promise<void> {
  let content = "";
  try {
    content = await readFile(filePath, "utf8");
  } catch {
    return;
  }

  for (const line of content.split(/\r?\n/g)) {
    const parsed = parseEnvLine(line);
    if (!parsed) continue;
    if (process.env[parsed.key] !== undefined) {
      process.env[parsed.key] = normalizeEnvValue(process.env[parsed.key]);
      continue;
    }
    process.env[parsed.key] = parsed.value;
  }
}

async function loadEnv(): Promise<void> {
  for (const [key, value] of Object.entries(process.env)) {
    process.env[key] = normalizeEnvValue(value);
  }
  await loadEnvFile(path.join(WORKSPACE_ROOT, ".env"));
  await loadEnvFile(path.join(WORKSPACE_ROOT, ".env.local"));
}

function appendQueryValue(query: QueryMap, key: string, value: string): void {
  const existing = query[key];
  if (existing === undefined) {
    query[key] = value;
    return;
  }
  if (Array.isArray(existing)) {
    existing.push(value);
    return;
  }
  query[key] = [existing, value];
}

function buildQueryMap(url: URL): QueryMap {
  const query: QueryMap = {};
  for (const [key, value] of url.searchParams.entries()) {
    appendQueryValue(query, key, value);
  }
  return query;
}

function buildHeaderMap(request: Request): HeaderMap {
  const headers: HeaderMap = {};

  for (const [name, value] of request.headers.entries()) {
    const normalizedName = name.toLowerCase();
    const current = headers[normalizedName];
    if (current === undefined) {
      headers[normalizedName] = value;
    } else if (Array.isArray(current)) {
      current.push(value);
    } else {
      headers[normalizedName] = [current, value];
    }
  }

  return headers;
}

async function parseBody(request: Request): Promise<ParsedBody> {
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return { bodyValue: undefined, bodyError: null, rawBody: null };
  }

  const contentType = request.headers.get("content-type")?.toLowerCase() || "";

  if (contentType.includes("multipart/form-data")) {
    const rawBody = new Uint8Array(await request.arrayBuffer());
    return { bodyValue: undefined, bodyError: null, rawBody };
  }

  if (
    contentType.includes("application/json") ||
    contentType.includes("+json")
  ) {
    const text = await request.text();
    if (text.length === 0) {
      return { bodyValue: undefined, bodyError: null, rawBody: null };
    }

    try {
      return { bodyValue: JSON.parse(text), bodyError: null, rawBody: null };
    } catch (error) {
      const bodyError =
        error instanceof SyntaxError
          ? error
          : new SyntaxError("Invalid JSON body");
      return { bodyValue: undefined, bodyError, rawBody: null };
    }
  }

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const text = await request.text();
    const params = new URLSearchParams(text);
    const body: QueryMap = {};
    for (const [key, value] of params.entries()) {
      appendQueryValue(body, key, value);
    }
    return { bodyValue: body, bodyError: null, rawBody: null };
  }

  return { bodyValue: undefined, bodyError: null, rawBody: null };
}

function matchRoute(
  pathname: string,
  routes: RouteDefinition[]
): { route: RouteDefinition; params: Record<string, string> } | null {
  for (const route of routes) {
    const match = route.matcher.exec(pathname);
    if (!match) continue;

    const params: Record<string, string> = {};
    for (let index = 0; index < route.paramNames.length; index++) {
      const paramName = route.paramNames[index];
      const paramValue = match[index + 1] || "";
      params[paramName] = decodeURIComponent(paramValue);
    }

    return { route, params };
  }

  return null;
}

async function getHandler(route: RouteDefinition): Promise<RouteHandler> {
  const cached = handlerCache.get(route.filePath);
  if (cached) return cached;

  const routeModule = await import(pathToFileURL(route.filePath).href);
  if (typeof routeModule.default !== "function") {
    throw new Error(
      `Route "${route.relativePath}" does not export a default handler`
    );
  }

  const handler = routeModule.default as RouteHandler;
  handlerCache.set(route.filePath, handler);
  return handler;
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
}

function jsResponse(source: string, status = 200): Response {
  return new Response(source, {
    status,
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function isPathInsideRoot(rootPath: string, candidatePath: string): boolean {
  const relative = path.relative(rootPath, candidatePath);
  return relative !== ".." && !relative.startsWith(`..${path.sep}`);
}

async function getStaticFileResponse(
  absolutePath: string,
  options?: { headers?: Record<string, string> }
): Promise<Response | null> {
  if (!isPathInsideRoot(DIST_ROOT, absolutePath)) {
    return null;
  }

  const file = Bun.file(absolutePath);
  if (!(await file.exists())) {
    return null;
  }

  const headers = new Headers(options?.headers);
  if (!headers.has("content-type") && file.type) {
    headers.set("content-type", file.type);
  }

  return new Response(file, { headers });
}

async function serveDistPath(
  relativePath: string,
  options?: { headers?: Record<string, string> }
): Promise<Response | null> {
  const sanitized = relativePath.replace(/^\/+/, "");
  let decodedPath = sanitized;
  try {
    decodedPath = decodeURIComponent(sanitized);
  } catch {
    return null;
  }
  const absolutePath = path.resolve(DIST_ROOT, decodedPath);
  return await getStaticFileResponse(absolutePath, options);
}

async function serveSpaIndex(): Promise<Response> {
  const response = await serveDistPath("index.html");
  if (response) {
    return response;
  }

  return jsonResponse(
    {
      error: "Frontend build output not found",
      hint: "Run `bun run build` before starting the standalone production server.",
    },
    503
  );
}

function shouldServeSpaFallback(pathname: string): boolean {
  if (pathname === "/" || pathname === "") return true;
  if (pathname.startsWith("/api/")) return false;
  if (pathname === "/api") return false;
  return !path.posix.basename(pathname).includes(".");
}

function buildAppConfigScript(origin: string): string {
  return `window.__RYOS_RUNTIME_CONFIG__ = ${JSON.stringify(
    buildClientRuntimeConfig(origin)
  )};`;
}

async function handleStaticRequest(pathname: string): Promise<Response | null> {
  if (pathname === "/docs" || pathname === "/docs/") {
    return new Response(null, {
      status: 302,
      headers: { location: "/docs/overview" },
    });
  }

  if (pathname === "/embed/infinite-mac") {
    return await serveDistPath("embed/infinite-mac.html", {
      headers: {
        "Cross-Origin-Embedder-Policy": "credentialless",
        "Cross-Origin-Opener-Policy": "same-origin",
      },
    });
  }

  if (pathname === "/embed/pc" || pathname === "/embed/infinite-pc") {
    return await serveDistPath("embed/pc.html", {
      headers: {
        "Cross-Origin-Embedder-Policy": "credentialless",
        "Cross-Origin-Opener-Policy": "same-origin",
      },
    });
  }

  if (pathname.startsWith("/docs/") && !pathname.endsWith(".html")) {
    const cleanPath = pathname.replace(/^\/+/, "");
    const docsResponse = await serveDistPath(`${cleanPath}.html`);
    if (docsResponse) {
      return docsResponse;
    }
  }

  if (pathname !== "/") {
    const directStatic = await serveDistPath(pathname);
    if (directStatic) {
      return directStatic;
    }
  }

  if (shouldServeSpaFallback(pathname)) {
    return await serveSpaIndex();
  }

  return null;
}

function validateEnv(): void {
  const redisBackend = getRedisBackend();
  const realtimeProvider = getRealtimeProvider();

  const required: { name: string; description: string }[] =
    redisBackend === "redis-url"
      ? [{ name: "REDIS_URL", description: "Standard Redis connection URL" }]
      : [
          {
            name: "REDIS_KV_REST_API_URL",
            description: "Upstash Redis REST API URL",
          },
          {
            name: "REDIS_KV_REST_API_TOKEN",
            description: "Upstash Redis REST API token",
          },
        ];

  const optional: { name: string; description: string }[] = [
    { name: "OPENAI_API_KEY", description: "OpenAI API key (AI + transcription)" },
    { name: "ELEVENLABS_API_KEY", description: "ElevenLabs API key (TTS)" },
    { name: "YOUTUBE_API_KEY", description: "YouTube Data API key" },
  ];

  if (realtimeProvider === "pusher") {
    optional.unshift(
      { name: "PUSHER_CLUSTER", description: "Pusher cluster" },
      { name: "PUSHER_SECRET", description: "Pusher secret" },
      { name: "PUSHER_KEY", description: "Pusher key" },
      { name: "PUSHER_APP_ID", description: "Pusher app ID (real-time features)" }
    );
  } else if (redisBackend !== "redis-url") {
    console.warn(
      "[api-standalone] REALTIME_PROVIDER=local works best with REDIS_URL so websocket broadcasts can fan out across multiple instances. Falling back to in-process delivery only."
    );
  }

  const missing = required.filter((v) => !process.env[v.name]);
  const missingOptional = optional.filter((v) => !process.env[v.name]);

  if (missingOptional.length > 0) {
    console.warn(
      `[api-standalone] Optional env vars not set (some features will be unavailable):\n` +
        missingOptional.map((v) => `  - ${v.name}: ${v.description}`).join("\n")
    );
  }

  if (missing.length > 0) {
    console.error(
      `[api-standalone] Required env vars missing:\n` +
        missing.map((v) => `  - ${v.name}: ${v.description}`).join("\n")
    );
    process.exit(1);
  }
}

async function bootstrap(): Promise<void> {
  await loadEnv();
  validateEnv();

  const API_PORT = Number(process.env.API_PORT || process.env.PORT || "3000");
  const API_HOST = process.env.API_HOST || "0.0.0.0";
  const realtimeWebSocketPath = getRealtimeWebSocketPath();
  const routes = await discoverApiRouteManifest({
    workspaceRoot: WORKSPACE_ROOT,
    apiRoot: API_ROOT,
  });

  if (shouldEnableLocalRealtime()) {
    await ensureRealtimePubSubBridge();
  }

  // Initialize the IRC bridge: connects to any IRC servers referenced by
  // existing `type: "irc"` rooms and keeps the connections open so inbound
  // IRC messages are persisted + broadcast to subscribed clients.
  if (isIrcBridgeEnabled()) {
    try {
      await getIrcBridge().initialize();
    } catch (err) {
      console.warn("[api-standalone] IRC bridge init failed:", err);
    }
  }

  Bun.serve<LocalRealtimeSocketData>({
    port: API_PORT,
    hostname: API_HOST,
    idleTimeout: 30,
    fetch: async (request, server) => {
      const url = new URL(request.url);
      const pathname = url.pathname;

      if (pathname === "/health") {
        return jsonResponse(
          {
            ok: true,
            runtime: "standalone-bun-serve",
            routeCount: routes.length,
            realtimeProvider: getRealtimeProvider(),
            redisBackend: getRedisBackend(),
          },
          200
        );
      }

      if (pathname === "/app-config.js") {
        const origin =
          getConfiguredPublicOrigin() ||
          (url.origin && !url.origin.includes(",") ? url.origin : null) ||
          "https://os.ryo.lu";
        return jsResponse(buildAppConfigScript(origin), 200);
      }

      if (shouldEnableLocalRealtime() && pathname === realtimeWebSocketPath) {
        const upgraded = server.upgrade(request, {
          data: {
            connectedAt: Date.now(),
          },
        });

        if (upgraded) {
          return undefined as unknown as Response;
        }

        return jsonResponse({ error: "WebSocket upgrade failed" }, 400);
      }

      if (pathname === "/api/health") {
        return jsonResponse(
          {
            ok: true,
            runtime: "standalone-bun-serve",
            routeCount: routes.length,
          },
          200
        );
      }

      if (!pathname.startsWith("/api")) {
        const ogShareResponse = await createOgShareResponse(request);
        if (ogShareResponse) {
          return ogShareResponse;
        }

        return (
          (await handleStaticRequest(pathname)) ||
          jsonResponse({ error: "Not found" }, 404)
        );
      }

      const matched = matchRoute(pathname, routes);
      if (!matched) {
        return jsonResponse({ error: "Not found" }, 404);
      }

      const headers = buildHeaderMap(request);
      const query = buildQueryMap(url);
      for (const [key, value] of Object.entries(matched.params)) {
        if (query[key] === undefined) {
          query[key] = value;
        }
      }

      const { bodyValue, bodyError, rawBody } = await parseBody(request);
      const reqShim = new BunRequestShim({
        method: request.method.toUpperCase(),
        url: `${url.pathname}${url.search}`,
        headers,
        query,
        bodyValue,
        bodyError,
        rawBody,
      });
      const resShim = new BunResponseShim();

      try {
        const handler = await getHandler(matched.route);
        const handlerPromise = Promise.resolve(handler(reqShim, resShim));

        // Race between handler completion and first write.
        // For SSE/streaming handlers, headersSentPromise resolves on the first
        // res.write(), allowing us to return the Response immediately so Bun
        // can start streaming data to the client while the handler continues.
        await Promise.race([handlerPromise, resShim.headersSentPromise]);

        if (!resShim.writableEnded) {
          // Handler is still running (SSE streaming) — handle errors in background
          handlerPromise.catch((error) => {
            console.error(
              `[api-standalone] Handler error in ${matched.route.routePath} (${matched.route.relativePath})`,
              error
            );
            if (!resShim.writableEnded) {
              resShim.end();
            }
          });
        }
      } catch (error) {
        console.error(
          `[api-standalone] Handler error in ${matched.route.routePath} (${matched.route.relativePath})`,
          error
        );
        if (!resShim.headersSent) {
          return jsonResponse({ error: "Internal server error" }, 500);
        }
        if (!resShim.writableEnded) {
          resShim.end();
        }
      }

      if (!resShim.headersSent && !resShim.writableEnded) {
        resShim.status(204).end();
      }

      return resShim.toResponse();
    },
    error: (error) => {
      console.error("[api-standalone] Unhandled server error", error);
      return jsonResponse({ error: "Internal server error" }, 500);
    },
    websocket: {
      open: (socket) => {
        registerRealtimeSocket(socket);
      },
      message: (socket, message) => {
        try {
          const payload = JSON.parse(String(message)) as {
            type?: string;
            channel?: string;
          };

          if (payload.type === "ping") {
            socket.send(JSON.stringify({ type: "pong" }));
            return;
          }

          if (payload.type === "subscribe" && payload.channel) {
            subscribeRealtimeSocket(socket, payload.channel);
            return;
          }

          if (payload.type === "unsubscribe" && payload.channel) {
            unsubscribeRealtimeSocket(socket, payload.channel);
          }
        } catch (error) {
          console.warn("[api-standalone] Invalid websocket payload", error);
        }
      },
      close: (socket) => {
        unregisterRealtimeSocket(socket);
      },
    },
  });

  console.log(
    `[api-standalone] Listening on http://${API_HOST}:${API_PORT} (${routes.length} routes)`
  );
  for (const route of routes) {
    console.log(`  ${route.routePath}  ->  api/${route.relativePath}`);
  }
}

try {
  await bootstrap();
} catch (error) {
  console.error("[api-standalone] Failed to start server", error);
  process.exit(1);
}
