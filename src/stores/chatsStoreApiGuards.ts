const warnedStoreIssues = new Set<string>();

export const warnChatsStoreOnce = (key: string, message: string): void => {
  if (warnedStoreIssues.has(key)) {
    return;
  }
  warnedStoreIssues.add(key);
  console.warn(message);
};

export const CHAT_API_UNAVAILABLE_COOLDOWN_MS = 10_000;
const apiUnavailableUntil: Record<string, number> = {};

export const isApiTemporarilyUnavailable = (key: string): boolean =>
  Date.now() < (apiUnavailableUntil[key] || 0);

export const markApiTemporarilyUnavailable = (key: string): void => {
  apiUnavailableUntil[key] = Date.now() + CHAT_API_UNAVAILABLE_COOLDOWN_MS;
};

export const clearApiUnavailable = (key: string): void => {
  delete apiUnavailableUntil[key];
};

export const readJsonBody = async <T>(
  response: Response,
  context: string
): Promise<{ ok: true; data: T } | { ok: false; error: string }> => {
  const contentType = response.headers.get("content-type")?.toLowerCase() || "";
  if (!contentType.includes("json")) {
    return {
      ok: false,
      error: `${context}: expected JSON but got ${contentType || "unknown content-type"}`,
    };
  }

  try {
    return { ok: true, data: (await response.json()) as T };
  } catch {
    return { ok: false, error: `${context}: invalid JSON response body` };
  }
};
