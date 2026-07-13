import type { ApiRequest, ApiResponse } from "../../_utils/api-types.js";
import type { Redis } from "../../_utils/redis.js";
import {
  isLoginLocked,
  recordLoginFailure,
  resetLoginFailures,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PER_USER_LOCKOUT_SECONDS,
} from "../../_utils/auth/index.js";
import {
  getUserPasswordHash,
  verifyPassword,
} from "../../_utils/auth/_password.js";
import {
  getStoredUserRecord,
  isUserBanned,
} from "../../_utils/auth/_user-record.js";
import {
  checkCounterLimit,
  getClientIp,
  makeKey,
} from "../../_utils/_rate-limit.js";
import { getHeader } from "../../_utils/request-helpers.js";
import { USERNAME_REGEX } from "../../../src/shared/validation.js";

const OPDS_AUTH_RATE_LIMIT = 120;
const OPDS_AUTH_RATE_WINDOW_SECONDS = 60;

export interface OpdsBasicCredentials {
  username: string;
  password: string;
}

export type OpdsAuthResult =
  | { kind: "authenticated"; username: string }
  | { kind: "unauthorized" }
  | { kind: "rate_limited"; retryAfter: number };

export function parseOpdsBasicCredentials(
  authorization: string | null,
): OpdsBasicCredentials | null {
  if (!authorization) return null;

  const match = /^Basic[ \t]+([A-Za-z0-9+/]+={0,2})$/i.exec(authorization);
  if (!match || match[1].length % 4 === 1) return null;

  let decoded: string;
  try {
    decoded = Buffer.from(match[1], "base64").toString("utf8");
  } catch {
    return null;
  }

  const separator = decoded.indexOf(":");
  if (separator <= 0) return null;

  const username = decoded.slice(0, separator).toLowerCase();
  const password = decoded.slice(separator + 1);
  if (
    !USERNAME_REGEX.test(username) ||
    password.length < PASSWORD_MIN_LENGTH ||
    password.length > PASSWORD_MAX_LENGTH ||
    password.includes("\0")
  ) {
    return null;
  }

  return { username, password };
}

export async function authorizeOpdsRequest(
  req: ApiRequest,
  redis: Redis,
): Promise<OpdsAuthResult> {
  const credentials = parseOpdsBasicCredentials(
    getHeader(req, "authorization"),
  );
  if (!credentials) {
    return { kind: "unauthorized" };
  }

  const rateLimit = await checkCounterLimit({
    redis,
    key: makeKey(["rl", "opds:auth", "ip", getClientIp(req)]),
    windowSeconds: OPDS_AUTH_RATE_WINDOW_SECONDS,
    limit: OPDS_AUTH_RATE_LIMIT,
  });
  if (!rateLimit.allowed) {
    return {
      kind: "rate_limited",
      retryAfter: rateLimit.resetSeconds,
    };
  }

  const [userRecord, passwordHash, locked] = await Promise.all([
    getStoredUserRecord(redis, credentials.username),
    getUserPasswordHash(redis, credentials.username),
    isLoginLocked(redis, credentials.username),
  ]);

  if (!userRecord || !passwordHash) {
    return { kind: "unauthorized" };
  }
  if (locked) {
    return {
      kind: "rate_limited",
      retryAfter: PER_USER_LOCKOUT_SECONDS,
    };
  }

  const passwordValid = await verifyPassword(
    credentials.password,
    passwordHash,
  );
  if (!passwordValid) {
    await recordLoginFailure(redis, credentials.username);
    return { kind: "unauthorized" };
  }
  if (isUserBanned(userRecord)) {
    return { kind: "unauthorized" };
  }

  await resetLoginFailures(redis, credentials.username);
  return { kind: "authenticated", username: credentials.username };
}

export function sendOpdsAuthFailure(
  res: ApiResponse,
  result: Exclude<OpdsAuthResult, { kind: "authenticated" }>,
): void {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Content-Type", "text/plain; charset=utf-8");

  if (result.kind === "rate_limited") {
    res.setHeader("Retry-After", String(result.retryAfter));
    res.status(429).send("Too many authentication attempts");
    return;
  }

  res.setHeader(
    "WWW-Authenticate",
    'Basic realm="ryOS Books", charset="UTF-8"',
  );
  res.status(401).send("Authentication required");
}
