#!/usr/bin/env bun

/**
 * Standalone API server for running `_api/*` routes without Vercel CLI.
 *
 * Uses Bun's native HTTP server (`Bun.serve`) and adapts requests/responses
 * to the Vercel Node handler shape used in `_api`.
 */

import { readdir, readFile } from "node:fs/promises";
import { EventEmitter } from "node:events";
import path from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath, pathToFileURL } from "node:url";

type QueryValue = string | string[];
type QueryMap = Record<string, QueryValue>;
type HeaderValue = string | number | string[];
type HeaderMap = Record<string, string | string[] | undefined>;
type RouteHandler = (
  req: BunRequestShim,
  res: BunResponseShim
) => Promise<unknown> | unknown;

interface RouteDefinition {
  filePath: string;
  relativePath: string;
  routePath: string;
  segmentCount: number;
  staticSegmentCount: number;
  dynamicSegmentCount: number;
  matcher: RegExp;
  paramNames: string[];
}

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

  constructor() {
    super();
    this.stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        this.streamController = controller;
      },
      cancel: () => {
        this.closeStream();
      },
    });
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

    this.headersSent = true;
    return this;
  }

  flushHeaders(): this {
    this.headersSent = true;
    return this;
  }

  write(chunk: unknown): boolean {
    if (this.writableEnded) return false;
    this.headersSent = true;

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
    this.headersSent = true;
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
const API_ROOT = path.join(WORKSPACE_ROOT, "_api");
const handlerCache = new Map<string, RouteHandler>();

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
    if (process.env[parsed.key] !== undefined) continue;
    process.env[parsed.key] = parsed.value;
  }
}

async function loadEnv(): Promise<void> {
  await loadEnvFile(path.join(WORKSPACE_ROOT, ".env"));
  await loadEnvFile(path.join(WORKSPACE_ROOT, ".env.local"));
}

async function walkDirectory(dirPath: string): Promise<string[]> {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const discoveredFiles: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      discoveredFiles.push(...(await walkDirectory(fullPath)));
      continue;
    }
    if (entry.isFile()) {
      discoveredFiles.push(fullPath);
    }
  }

  return discoveredFiles;
}

function isRouteFile(filePath: string): boolean {
  const relativePath = path.relative(API_ROOT, filePath);
  const segments = relativePath.split(path.sep);
  const fileName = segments[segments.length - 1];

  if (!fileName.endsWith(".ts")) return false;
  if (fileName.startsWith("_")) return false;

  if (segments.slice(0, -1).some((segment) => segment.startsWith("_"))) {
    return false;
  }

  return true;
}

async function hasDefaultExport(filePath: string): Promise<boolean> {
  const content = await readFile(filePath, "utf8");
  return /\bexport\s+default\b/.test(content);
}

function toRoutePath(relativePath: string): string {
  const noExtension = relativePath.replace(/\.ts$/, "");
  const rawSegments = noExtension.split(path.sep).filter(Boolean);
  const routeSegments: string[] = [];

  for (const segment of rawSegments) {
    if (segment === "index") continue;
    const dynamicMatch = segment.match(/^\[(.+)\]$/);
    if (dynamicMatch) {
      routeSegments.push(`:${dynamicMatch[1]}`);
      continue;
    }
    routeSegments.push(segment);
  }

  return routeSegments.length > 0 ? `/api/${routeSegments.join("/")}` : "/api";
}

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function createRouteMatcher(routePath: string): {
  matcher: RegExp;
  paramNames: string[];
} {
  const segments = routePath.split("/").filter(Boolean);
  const regexSegments: string[] = [];
  const paramNames: string[] = [];

  for (const segment of segments) {
    if (segment.startsWith(":")) {
      paramNames.push(segment.slice(1));
      regexSegments.push("([^/]+)");
      continue;
    }
    regexSegments.push(escapeRegex(segment));
  }

  const matcher =
    regexSegments.length === 0
      ? /^\/?$/
      : new RegExp(`^/${regexSegments.join("/")}/?$`);

  return { matcher, paramNames };
}

function compareRoutes(a: RouteDefinition, b: RouteDefinition): number {
  if (a.staticSegmentCount !== b.staticSegmentCount) {
    return b.staticSegmentCount - a.staticSegmentCount;
  }

  if (a.dynamicSegmentCount !== b.dynamicSegmentCount) {
    return a.dynamicSegmentCount - b.dynamicSegmentCount;
  }

  if (a.segmentCount !== b.segmentCount) {
    return b.segmentCount - a.segmentCount;
  }

  return a.routePath.localeCompare(b.routePath);
}

async function discoverRoutes(): Promise<RouteDefinition[]> {
  const allFiles = await walkDirectory(API_ROOT);
  const routeFiles = allFiles.filter(isRouteFile);
  const routeDefinitions: RouteDefinition[] = [];

  for (const filePath of routeFiles) {
    if (!(await hasDefaultExport(filePath))) continue;

    const relativePath = path.relative(API_ROOT, filePath);
    const routePath = toRoutePath(relativePath);
    const routeSegments = routePath.split("/").filter(Boolean).slice(1);
    const dynamicSegmentCount = routeSegments.filter((part) =>
      part.startsWith(":")
    ).length;
    const staticSegmentCount = routeSegments.length - dynamicSegmentCount;
    const { matcher, paramNames } = createRouteMatcher(routePath);

    routeDefinitions.push({
      filePath,
      relativePath,
      routePath,
      segmentCount: routeSegments.length,
      staticSegmentCount,
      dynamicSegmentCount,
      matcher,
      paramNames,
    });
  }

  return routeDefinitions.sort(compareRoutes);
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

async function bootstrap(): Promise<void> {
  await loadEnv();

  const API_PORT = Number(process.env.API_PORT || process.env.PORT || "3000");
  const API_HOST = process.env.API_HOST || "0.0.0.0";
  const routes = await discoverRoutes();

  Bun.serve({
    port: API_PORT,
    hostname: API_HOST,
    fetch: async (request) => {
      const url = new URL(request.url);
      const pathname = url.pathname;

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
        return jsonResponse({ error: "Not found" }, 404);
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
        await Promise.resolve(handler(reqShim, resShim));
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
  });

  console.log(
    `[api-standalone] Listening on http://${API_HOST}:${API_PORT} (${routes.length} routes)`
  );
  for (const route of routes) {
    console.log(`  ${route.routePath}  ->  _api/${route.relativePath}`);
  }
}

try {
  await bootstrap();
} catch (error) {
  console.error("[api-standalone] Failed to start server", error);
  process.exit(1);
}
