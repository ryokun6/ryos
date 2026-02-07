import {
  getOptionalTrimmedString,
  getRequestBodyObject,
  isValidPushToken,
  normalizePushPlatform,
  type PushPlatform,
} from "./_shared.js";

export interface ValidationResultSuccess<T> {
  ok: true;
  value: T;
}

export interface ValidationResultError {
  ok: false;
  error: string;
}

export type ValidationResult<T> = ValidationResultSuccess<T> | ValidationResultError;

export interface RegisterPushPayload {
  token: string;
  platform: PushPlatform;
}

export interface UnregisterPushPayload {
  token?: string;
}

export function normalizeRegisterPushPayload(
  rawBody: unknown
): ValidationResult<RegisterPushPayload> {
  const body = getRequestBodyObject(rawBody);
  if (!body) {
    return {
      ok: false,
      error: "Request body must be a JSON object",
    };
  }

  if (typeof body.token !== "undefined" && typeof body.token !== "string") {
    return {
      ok: false,
      error: "Invalid push token format",
    };
  }

  const hasTokenField = Object.prototype.hasOwnProperty.call(body, "token");
  const token = getOptionalTrimmedString(body.token);

  if (!token || (hasTokenField && typeof body.token === "string" && !token)) {
    return {
      ok: false,
      error: "Push token is required",
    };
  }

  if (!isValidPushToken(token)) {
    return {
      ok: false,
      error: "Invalid push token format",
    };
  }

  const platform =
    typeof body.platform === "undefined"
      ? "ios"
      : normalizePushPlatform(body.platform);

  if (!platform) {
    return {
      ok: false,
      error: "Unsupported push platform",
    };
  }

  return {
    ok: true,
    value: {
      token,
      platform,
    },
  };
}

export function normalizeUnregisterPushPayload(
  rawBody: unknown
): ValidationResult<UnregisterPushPayload> {
  const body = getRequestBodyObject(rawBody);
  if (!body) {
    return {
      ok: false,
      error: "Request body must be a JSON object",
    };
  }

  if (!Object.prototype.hasOwnProperty.call(body, "token")) {
    return {
      ok: true,
      value: {},
    };
  }

  if (typeof body.token !== "string") {
    return {
      ok: false,
      error: "Invalid push token format",
    };
  }

  const token = getOptionalTrimmedString(body.token);
  if (!token || !isValidPushToken(token)) {
    return {
      ok: false,
      error: "Invalid push token format",
    };
  }

  return {
    ok: true,
    value: { token },
  };
}
