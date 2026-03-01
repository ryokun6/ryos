/**
 * Request auth helpers for Node.js API routes.
 *
 * Centralizes:
 * - Authorization + X-Username extraction
 * - session validation via validateAuth
 * - required vs optional auth semantics
 */

import type { VercelRequest } from "@vercel/node";
import type { Redis } from "@upstash/redis";
import { extractAuthNormalized, validateAuth } from "./auth/index.js";

export interface AuthenticatedRequestUser {
  username: string;
  token: string;
  expired: boolean;
}

export interface RequestAuthError {
  status: 400 | 401;
  error: string;
}

export interface RequestAuthResolution {
  user: AuthenticatedRequestUser | null;
  error: RequestAuthError | null;
}

export interface ResolveRequestAuthOptions {
  required?: boolean;
  allowExpired?: boolean;
}

function hasAnyAuthCredential(
  username: string | null,
  token: string | null
): boolean {
  return Boolean(username || token);
}

/**
 * Resolve request auth from headers and validate token when present.
 *
 * Behavior:
 * - required=true  -> missing/invalid auth returns { error: 401 }
 * - required=false -> anonymous allowed when no auth headers are provided
 * - partial auth   -> returns 400 (username/token must be provided together)
 */
export async function resolveRequestAuth(
  req: VercelRequest,
  redis: Redis,
  options: ResolveRequestAuthOptions = {}
): Promise<RequestAuthResolution> {
  const { required = false, allowExpired = false } = options;
  const { username, token } = extractAuthNormalized(req);
  const hasAnyCredential = hasAnyAuthCredential(username, token);

  if (!username || !token) {
    if (hasAnyCredential) {
      return {
        user: null,
        error: {
          status: 400,
          error: "Both Authorization and X-Username headers are required",
        },
      };
    }

    if (required) {
      return {
        user: null,
        error: { status: 401, error: "Unauthorized - missing credentials" },
      };
    }

    return { user: null, error: null };
  }

  const result = await validateAuth(redis, username, token, { allowExpired });
  if (!result.valid) {
    return {
      user: null,
      error: { status: 401, error: "Unauthorized - invalid token" },
    };
  }

  return {
    user: {
      username,
      token,
      expired: !!result.expired,
    },
    error: null,
  };
}

