import type { VercelResponse } from "@vercel/node";

export type ErrorResponseExtras = Record<string, unknown>;

export interface ApiResponseHelpers {
  json: <T>(statusCode: number, body: T) => VercelResponse;
  ok: <T>(body: T) => VercelResponse;
  created: <T>(body: T) => VercelResponse;
  accepted: <T>(body: T) => VercelResponse;
  noContent: () => VercelResponse;
  error: (statusCode: number, message: string, extras?: ErrorResponseExtras) => VercelResponse;
  badRequest: (message: string, extras?: ErrorResponseExtras) => VercelResponse;
  unauthorized: (message?: string, extras?: ErrorResponseExtras) => VercelResponse;
  forbidden: (message?: string, extras?: ErrorResponseExtras) => VercelResponse;
  notFound: (message?: string, extras?: ErrorResponseExtras) => VercelResponse;
  conflict: (message?: string, extras?: ErrorResponseExtras) => VercelResponse;
  tooManyRequests: (message?: string, extras?: ErrorResponseExtras) => VercelResponse;
  methodNotAllowed: (allowedMethods?: string[]) => VercelResponse;
  serverError: (message?: string, extras?: ErrorResponseExtras) => VercelResponse;
}

function ensureJsonContentType(res: VercelResponse): void {
  if (!res.hasHeader("Content-Type")) {
    res.setHeader("Content-Type", "application/json");
  }
}

function buildErrorBody(message: string, extras: ErrorResponseExtras = {}): ErrorResponseExtras {
  return {
    error: message,
    ...extras,
  };
}

export function createResponseHelpers(res: VercelResponse): ApiResponseHelpers {
  const json = <T>(statusCode: number, body: T): VercelResponse => {
    ensureJsonContentType(res);
    return res.status(statusCode).json(body);
  };

  const error = (
    statusCode: number,
    message: string,
    extras?: ErrorResponseExtras
  ): VercelResponse => json(statusCode, buildErrorBody(message, extras));

  return {
    json,
    ok: <T>(body: T) => json(200, body),
    created: <T>(body: T) => json(201, body),
    accepted: <T>(body: T) => json(202, body),
    noContent: () => {
      res.status(204).end();
      return res;
    },
    error,
    badRequest: (message, extras) => error(400, message, extras),
    unauthorized: (message = "Unauthorized", extras) => error(401, message, extras),
    forbidden: (message = "Forbidden", extras) => error(403, message, extras),
    notFound: (message = "Not found", extras) => error(404, message, extras),
    conflict: (message = "Conflict", extras) => error(409, message, extras),
    tooManyRequests: (message = "Too many requests", extras) => {
      const retryAfter = extras?.retryAfter;
      if (typeof retryAfter === "number") {
        res.setHeader("Retry-After", String(retryAfter));
      }
      return error(429, message, extras);
    },
    methodNotAllowed: (allowedMethods) => {
      if (allowedMethods?.length) {
        res.setHeader("Allow", allowedMethods.join(", "));
      }
      return error(405, "Method not allowed");
    },
    serverError: (message = "Internal server error", extras) => error(500, message, extras),
  };
}
