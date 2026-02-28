import type { IncomingMessage, ServerResponse } from "node:http";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { buildQuery, parseCookies } from "../http-helpers.js";

const DEFAULT_BODY_LIMIT_BYTES = 15 * 1024 * 1024;

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

export async function parseNodeBody(req: IncomingMessage): Promise<unknown> {
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

export function enhanceNodeResponse(res: ServerResponse): VercelResponse {
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

export function enhanceNodeRequest(
  req: IncomingMessage,
  url: URL,
  params: Record<string, string>,
  body: unknown
): VercelRequest {
  const vReq = req as VercelRequest;
  const mutable = vReq as VercelRequest & {
    query: Record<string, string | string[]>;
    body: unknown;
    cookies: Record<string, string>;
  };

  mutable.query = buildQuery(url.searchParams, params);
  mutable.body = body;
  mutable.cookies = parseCookies(req.headers.cookie);
  return vReq;
}
