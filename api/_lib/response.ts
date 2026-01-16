/**
 * Standardized response helpers for API routes
 */

import { ApiError } from "./errors.js";
import type { ApiResponse, PaginatedResponse, RateLimitResult } from "./types.js";

// =============================================================================
// JSON Response Helpers
// =============================================================================

/**
 * Create a successful JSON response
 */
export function jsonSuccess<T>(
  data: T,
  status: number = 200,
  headers?: Record<string, string>
): Response {
  const response: ApiResponse<T> = {
    success: true,
    data,
  };

  return new Response(JSON.stringify(response), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  });
}

/**
 * Create a paginated JSON response
 */
export function jsonPaginated<T>(
  data: T[],
  pagination: { cursor?: string; hasMore: boolean; total?: number },
  headers?: Record<string, string>
): Response {
  const response: PaginatedResponse<T> = {
    success: true,
    data,
    pagination,
  };

  return new Response(JSON.stringify(response), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  });
}

/**
 * Create an error JSON response from an ApiError
 */
export function jsonError(error: ApiError, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(error.toJSON()), {
    status: error.statusCode,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  });
}

/**
 * Create a rate limit error response with proper headers
 */
export function jsonRateLimitError(
  result: RateLimitResult,
  message?: string,
  headers?: Record<string, string>
): Response {
  const body = {
    success: false,
    error: {
      code: "RATE_LIMIT_EXCEEDED",
      message: message || "Too many requests, please slow down",
      details: {
        limit: result.limit,
        remaining: result.remaining,
        resetSeconds: result.resetSeconds,
      },
    },
  };

  return new Response(JSON.stringify(body), {
    status: 429,
    headers: {
      "Content-Type": "application/json",
      "Retry-After": String(result.resetSeconds),
      "X-RateLimit-Limit": String(result.limit),
      "X-RateLimit-Remaining": String(result.remaining),
      "X-RateLimit-Reset": String(result.resetSeconds),
      ...headers,
    },
  });
}

// =============================================================================
// CORS Helpers
// =============================================================================

/**
 * Add CORS headers to a response
 */
export function withCors(response: Response, origin: string | null): Response {
  if (!origin) return response;

  const newHeaders = new Headers(response.headers);
  newHeaders.set("Access-Control-Allow-Origin", origin);
  newHeaders.set("Access-Control-Allow-Credentials", "true");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}

/**
 * Create a CORS preflight response
 */
export function corsPreflightResponse(
  origin: string,
  methods: string[],
  requestedHeaders?: string | null
): Response {
  const allowHeaders =
    requestedHeaders && requestedHeaders.trim().length > 0
      ? requestedHeaders
      : "Content-Type, Authorization, X-Username";

  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": methods.join(", "),
      "Access-Control-Allow-Headers": allowHeaders,
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Max-Age": "86400",
    },
  });
}

// =============================================================================
// Streaming Response Helpers
// =============================================================================

/**
 * Create a streaming response with CORS headers
 */
export function streamingResponse(
  body: ReadableStream,
  contentType: string,
  origin: string | null,
  headers?: Record<string, string>
): Response {
  const responseHeaders: Record<string, string> = {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
    ...headers,
  };

  if (origin) {
    responseHeaders["Access-Control-Allow-Origin"] = origin;
  }

  return new Response(body, {
    status: 200,
    headers: responseHeaders,
  });
}

// =============================================================================
// Quick Response Helpers
// =============================================================================

/**
 * Create a simple success response
 */
export function ok<T>(data: T, headers?: Record<string, string>): Response {
  return jsonSuccess(data, 200, headers);
}

/**
 * Create a created response (201)
 */
export function created<T>(data: T, headers?: Record<string, string>): Response {
  return jsonSuccess(data, 201, headers);
}

/**
 * Create a no content response (204)
 */
export function noContent(): Response {
  return new Response(null, { status: 204 });
}
