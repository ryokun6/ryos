import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  getEffectiveOrigin,
  isAllowedOrigin,
  setCorsHeaders,
} from "../_utils/_cors.js";

interface PushRequestLoggerLike {
  request: (method: string, url: string) => void;
  response: (statusCode: number, duration?: number) => void;
}

const CORS_HEADER_NAME_REGEX = /^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/;

function getRequestedCorsHeaders(req: VercelRequest): string[] | undefined {
  const requestedHeaders = req.headers["access-control-request-headers"];
  const requestedHeaderValues = Array.isArray(requestedHeaders)
    ? requestedHeaders.filter(
        (value): value is string =>
          typeof value === "string" && value.trim().length > 0
      )
    : typeof requestedHeaders === "string" && requestedHeaders.trim().length > 0
      ? [requestedHeaders]
      : [];

  if (requestedHeaderValues.length === 0) {
    return undefined;
  }

  const normalizedHeaders = requestedHeaderValues
    .join(",")
    .split(",")
    .map((header) => header.trim())
    .filter((header) => header.length > 0)
    .filter((header) => CORS_HEADER_NAME_REGEX.test(header));

  if (normalizedHeaders.length === 0) {
    return undefined;
  }

  const seen = new Set<string>();
  const dedupedHeaders: string[] = [];
  for (const header of normalizedHeaders) {
    const normalizedHeaderKey = header.toLowerCase();
    if (seen.has(normalizedHeaderKey)) continue;
    seen.add(normalizedHeaderKey);
    dedupedHeaders.push(header);
  }

  return dedupedHeaders.length > 0 ? dedupedHeaders : undefined;
}

export function handlePushPostRequestGuards(
  req: VercelRequest,
  res: VercelResponse,
  logger: PushRequestLoggerLike,
  startTime: number,
  endpointPath: string
): boolean {
  const origin = getEffectiveOrigin(req);
  const normalizedMethod =
    typeof req.method === "string" ? req.method.trim() : "";
  const method = normalizedMethod.length > 0 ? normalizedMethod.toUpperCase() : "POST";
  logger.request(method, req.url || endpointPath);

  if (method === "OPTIONS") {
    res.setHeader("Vary", "Origin, Access-Control-Request-Headers");
    if (!isAllowedOrigin(origin)) {
      logger.response(403, Date.now() - startTime);
      res.status(403).json({ error: "Unauthorized" });
      return true;
    }

    const requestedCorsHeaders = getRequestedCorsHeaders(req);
    setCorsHeaders(res, origin, {
      methods: ["POST", "OPTIONS"],
      ...(requestedCorsHeaders ? { headers: requestedCorsHeaders } : {}),
    });
    logger.response(204, Date.now() - startTime);
    res.status(204).end();
    return true;
  }

  res.setHeader("Vary", "Origin");
  if (!isAllowedOrigin(origin)) {
    logger.response(403, Date.now() - startTime);
    res.status(403).json({ error: "Unauthorized" });
    return true;
  }

  setCorsHeaders(res, origin, { methods: ["POST", "OPTIONS"] });

  if (method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    logger.response(405, Date.now() - startTime);
    res.status(405).json({ error: "Method not allowed" });
    return true;
  }

  return false;
}
