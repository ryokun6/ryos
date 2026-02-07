import {
  getOptionalTrimmedString,
  getRequestBodyObject,
  isPlainObject,
  isValidPushToken,
} from "./_shared.js";
import type { ValidationResult } from "./_validation.js";

export const DEFAULT_PUSH_TEST_TITLE = "ryOS test notification";
export const DEFAULT_PUSH_TEST_BODY = "Push notifications are working 🎉";

const MAX_PUSH_TITLE_LENGTH = 120;
const MAX_PUSH_BODY_LENGTH = 512;
const MAX_PUSH_SOUND_LENGTH = 64;
const MAX_PUSH_DATA_BYTES = 2048;

export interface NormalizedPushTestPayload {
  title: string;
  body: string;
  token?: string;
  data?: Record<string, unknown>;
  badge?: number;
  sound?: string;
}

export function normalizePushTestPayload(
  rawBody: unknown
): ValidationResult<NormalizedPushTestPayload> {
  const body = getRequestBodyObject(rawBody);
  if (!body) {
    return {
      ok: false,
      error: "Request body must be a JSON object",
    };
  }

  if (typeof body.title !== "undefined" && typeof body.title !== "string") {
    return {
      ok: false,
      error: "Title must be a string",
    };
  }

  if (typeof body.body !== "undefined" && typeof body.body !== "string") {
    return {
      ok: false,
      error: "Body must be a string",
    };
  }

  if (typeof body.token !== "undefined" && typeof body.token !== "string") {
    return {
      ok: false,
      error: "Invalid push token format",
    };
  }

  if (typeof body.sound !== "undefined" && typeof body.sound !== "string") {
    return {
      ok: false,
      error: "Sound must be a string",
    };
  }

  const title = getOptionalTrimmedString(body.title) ?? DEFAULT_PUSH_TEST_TITLE;
  const message = getOptionalTrimmedString(body.body) ?? DEFAULT_PUSH_TEST_BODY;
  const hasTokenField = Object.prototype.hasOwnProperty.call(body, "token");
  const token = getOptionalTrimmedString(body.token);
  const sound = getOptionalTrimmedString(body.sound);

  if (title.length > MAX_PUSH_TITLE_LENGTH) {
    return {
      ok: false,
      error: `Notification title is too long (max ${MAX_PUSH_TITLE_LENGTH} characters)`,
    };
  }

  if (message.length > MAX_PUSH_BODY_LENGTH) {
    return {
      ok: false,
      error: `Notification body is too long (max ${MAX_PUSH_BODY_LENGTH} characters)`,
    };
  }

  if (hasTokenField && typeof body.token === "string" && !token) {
    return {
      ok: false,
      error: "Invalid push token format",
    };
  }

  if (token && !isValidPushToken(token)) {
    return {
      ok: false,
      error: "Invalid push token format",
    };
  }

  let badge: number | undefined;
  if (typeof body.badge !== "undefined") {
    if (typeof body.badge !== "number" || !Number.isInteger(body.badge)) {
      return {
        ok: false,
        error: "Badge must be an integer",
      };
    }

    if (body.badge < 0 || body.badge > 9999) {
      return {
        ok: false,
        error: "Badge must be between 0 and 9999",
      };
    }

    badge = body.badge;
  }

  if (sound && sound.length > MAX_PUSH_SOUND_LENGTH) {
    return {
      ok: false,
      error: `Sound value is too long (max ${MAX_PUSH_SOUND_LENGTH} characters)`,
    };
  }

  let data: Record<string, unknown> | undefined;
  if (typeof body.data !== "undefined") {
    if (!isPlainObject(body.data)) {
      return {
        ok: false,
        error: "Data payload must be a JSON object",
      };
    }

    let serialized: string | undefined;
    try {
      serialized = JSON.stringify(body.data);
    } catch {
      serialized = undefined;
    }
    if (typeof serialized !== "string") {
      return {
        ok: false,
        error: "Data payload must be JSON serializable",
      };
    }

    if (Buffer.byteLength(serialized, "utf8") > MAX_PUSH_DATA_BYTES) {
      return {
        ok: false,
        error: `Data payload is too large (max ${MAX_PUSH_DATA_BYTES} bytes)`,
      };
    }

    data = body.data;
  }

  return {
    ok: true,
    value: {
      title,
      body: message,
      ...(token ? { token } : {}),
      ...(typeof badge === "number" ? { badge } : {}),
      ...(sound ? { sound } : {}),
      ...(data ? { data } : {}),
    },
  };
}
