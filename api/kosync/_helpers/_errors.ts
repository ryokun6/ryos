import type { ApiResponse } from "../../_utils/api-types.js";

/** Official koreader-sync-server error codes. */
export const KosyncErrorCode = {
  NO_REDIS: 1000,
  INTERNAL: 2000,
  UNAUTHORIZED: 2001,
  USER_EXISTS: 2002,
  INVALID_FIELDS: 2003,
  DOCUMENT_MISSING: 2004,
  REGISTRATION_DISABLED: 2005,
} as const;

export type KosyncErrorCode =
  (typeof KosyncErrorCode)[keyof typeof KosyncErrorCode];

const MESSAGES: Record<KosyncErrorCode, string> = {
  [KosyncErrorCode.NO_REDIS]: "Cannot connect to redis.",
  [KosyncErrorCode.INTERNAL]: "Internal server error.",
  [KosyncErrorCode.UNAUTHORIZED]: "Unauthorized",
  [KosyncErrorCode.USER_EXISTS]: "Username is already registered.",
  [KosyncErrorCode.INVALID_FIELDS]: "Invalid request fields.",
  [KosyncErrorCode.DOCUMENT_MISSING]: "Field 'document' not provided.",
  [KosyncErrorCode.REGISTRATION_DISABLED]: "User registration is disabled.",
};

/** HTTP status for each kosync error (matches the Lua server). */
const STATUS: Record<KosyncErrorCode, number> = {
  [KosyncErrorCode.NO_REDIS]: 503,
  [KosyncErrorCode.INTERNAL]: 500,
  [KosyncErrorCode.UNAUTHORIZED]: 401,
  // Official protocol uses 402 Payment Required for duplicate registration.
  [KosyncErrorCode.USER_EXISTS]: 402,
  [KosyncErrorCode.INVALID_FIELDS]: 403,
  [KosyncErrorCode.DOCUMENT_MISSING]: 403,
  [KosyncErrorCode.REGISTRATION_DISABLED]: 403,
};

export function sendKosyncError(
  res: ApiResponse,
  code: KosyncErrorCode
): void {
  res.status(STATUS[code]).json({
    code,
    message: MESSAGES[code],
  });
}
