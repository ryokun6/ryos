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
const CORS_METHOD_NAME_REGEX = /^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/;
export const PUSH_CORS_MAX_REQUESTED_HEADER_NAME_LENGTH = 128;
export const PUSH_CORS_MAX_REQUESTED_HEADER_COUNT = 50;
export const PUSH_CORS_MAX_REQUESTED_HEADER_CANDIDATES = 200;
export const PUSH_CORS_MAX_REQUESTED_HEADER_VALUES = 50;
export const PUSH_CORS_MAX_REQUESTED_METHOD_LENGTH = 32;
export const PUSH_CORS_MAX_REQUESTED_METHOD_VALUES = 20;
export const PUSH_OPTIONS_VARY_HEADER =
  "Origin, Access-Control-Request-Method, Access-Control-Request-Headers";
export const PUSH_ALLOWED_METHODS = ["POST", "OPTIONS"] as const;
export const PUSH_ALLOW_HEADER_VALUE = PUSH_ALLOWED_METHODS.join(", ");
export const PUSH_ALLOWED_HEADERS = [
  "Content-Type",
  "Authorization",
  "X-Username",
] as const;
export const PUSH_ALLOW_HEADERS_VALUE = PUSH_ALLOWED_HEADERS.join(", ");
const INVALID_REQUESTED_METHOD = "__INVALID__";

function forEachCommaSeparatedCandidate(
  value: string,
  visit: (candidate: string) => boolean
): boolean {
  let start = 0;

  for (let index = 0; index <= value.length; index += 1) {
    const isComma = index < value.length && value.charCodeAt(index) === 44;
    const isEnd = index === value.length;
    if (!isComma && !isEnd) {
      continue;
    }

    const candidate = value.slice(start, index);
    start = index + 1;
    if (!visit(candidate)) {
      return false;
    }
  }

  return true;
}

function getNonEmptyHeaderValues(
  requestedHeaders: string | string[] | undefined,
  maxValues: number
): string[] {
  if (Array.isArray(requestedHeaders)) {
    const values: string[] = [];
    for (let index = 0; index < requestedHeaders.length; index += 1) {
      if (index >= maxValues) {
        break;
      }
      const requestedHeaderValue = requestedHeaders[index];
      if (
        typeof requestedHeaderValue !== "string" ||
        requestedHeaderValue.trim().length === 0
      ) {
        continue;
      }
      values.push(requestedHeaderValue);
    }
    return values;
  }

  if (
    typeof requestedHeaders === "string" &&
    requestedHeaders.trim().length > 0
  ) {
    return [requestedHeaders];
  }

  return [];
}

function getRequestedCorsHeaders(req: VercelRequest): string[] | undefined {
  const requestedHeaderValues = getNonEmptyHeaderValues(
    req.headers["access-control-request-headers"],
    PUSH_CORS_MAX_REQUESTED_HEADER_VALUES
  );
  if (requestedHeaderValues.length === 0) {
    return undefined;
  }

  const seen = new Set<string>();
  const dedupedHeaders: string[] = [];
  let processedHeaderCandidateCount = 0;

  for (const requestedHeaderValue of requestedHeaderValues) {
    const shouldContinueScanning = forEachCommaSeparatedCandidate(
      requestedHeaderValue,
      (headerCandidate) => {
        if (
          processedHeaderCandidateCount >=
          PUSH_CORS_MAX_REQUESTED_HEADER_CANDIDATES
        ) {
          return false;
        }
        if (dedupedHeaders.length >= PUSH_CORS_MAX_REQUESTED_HEADER_COUNT) {
          return false;
        }
        processedHeaderCandidateCount += 1;

        const header = headerCandidate.trim();
        if (header.length === 0) return true;
        if (header.length > PUSH_CORS_MAX_REQUESTED_HEADER_NAME_LENGTH) return true;
        if (!CORS_HEADER_NAME_REGEX.test(header)) return true;

        const normalizedHeaderKey = header.toLowerCase();
        if (seen.has(normalizedHeaderKey)) return true;
        seen.add(normalizedHeaderKey);
        dedupedHeaders.push(header);

        return dedupedHeaders.length < PUSH_CORS_MAX_REQUESTED_HEADER_COUNT;
      }
    );

    if (
      !shouldContinueScanning ||
      dedupedHeaders.length >= PUSH_CORS_MAX_REQUESTED_HEADER_COUNT ||
      processedHeaderCandidateCount >= PUSH_CORS_MAX_REQUESTED_HEADER_CANDIDATES
    ) {
      break;
    }
  }

  return dedupedHeaders.length > 0 ? dedupedHeaders : undefined;
}

function getRequestedCorsMethod(req: VercelRequest): string | undefined {
  const requestedMethodValue = getNonEmptyHeaderValues(
    req.headers["access-control-request-method"],
    PUSH_CORS_MAX_REQUESTED_METHOD_VALUES
  )[0];

  if (typeof requestedMethodValue !== "string") {
    return undefined;
  }

  const normalizedRequestedMethod = requestedMethodValue.trim().toUpperCase();
  if (normalizedRequestedMethod.length === 0) {
    return undefined;
  }
  if (normalizedRequestedMethod.length > PUSH_CORS_MAX_REQUESTED_METHOD_LENGTH) {
    return INVALID_REQUESTED_METHOD;
  }
  if (!CORS_METHOD_NAME_REGEX.test(normalizedRequestedMethod)) {
    return INVALID_REQUESTED_METHOD;
  }
  return normalizedRequestedMethod;
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
    res.setHeader("Vary", PUSH_OPTIONS_VARY_HEADER);
    if (!isAllowedOrigin(origin)) {
      logger.response(403, Date.now() - startTime);
      res.status(403).json({ error: "Unauthorized" });
      return true;
    }

    const requestedMethod = getRequestedCorsMethod(req);
    if (requestedMethod && requestedMethod !== PUSH_ALLOWED_METHODS[0]) {
      setCorsHeaders(res, origin, {
        methods: [...PUSH_ALLOWED_METHODS],
        headers: [...PUSH_ALLOWED_HEADERS],
      });
      res.setHeader("Allow", PUSH_ALLOW_HEADER_VALUE);
      logger.response(405, Date.now() - startTime);
      res.status(405).json({ error: "Method not allowed" });
      return true;
    }

    const requestedCorsHeaders = getRequestedCorsHeaders(req);
    setCorsHeaders(res, origin, {
      methods: [...PUSH_ALLOWED_METHODS],
      headers: requestedCorsHeaders ?? [...PUSH_ALLOWED_HEADERS],
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

  setCorsHeaders(res, origin, {
    methods: [...PUSH_ALLOWED_METHODS],
    headers: [...PUSH_ALLOWED_HEADERS],
  });

  if (method !== PUSH_ALLOWED_METHODS[0]) {
    res.setHeader("Allow", PUSH_ALLOW_HEADER_VALUE);
    logger.response(405, Date.now() - startTime);
    res.status(405).json({ error: "Method not allowed" });
    return true;
  }

  return false;
}
