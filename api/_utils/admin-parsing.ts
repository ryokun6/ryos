export type AdminStoredMessage = {
  id: string;
  username: string;
  content: string;
  timestamp: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseAdminStoredMessage(
  value: unknown
): AdminStoredMessage | null {
  let parsed: unknown = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return null;
    }
  }

  if (
    !isRecord(parsed) ||
    typeof parsed.id !== "string" ||
    typeof parsed.username !== "string" ||
    typeof parsed.content !== "string" ||
    typeof parsed.timestamp !== "number" ||
    !Number.isFinite(parsed.timestamp)
  ) {
    return null;
  }

  return {
    id: parsed.id,
    username: parsed.username,
    content: parsed.content,
    timestamp: parsed.timestamp,
  };
}

export function clampAdminInteger(
  value: unknown,
  fallback: number,
  min: number,
  max: number
): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^[-+]?\d+$/.test(value.trim())
        ? Number(value)
        : Number.NaN;
  if (!Number.isSafeInteger(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}
