export type DebugLogPayload = {
  hypothesisId: string;
  location: string;
  message: string;
  data?: Record<string, unknown>;
  timestamp?: number;
};

export function debugLog(payload: DebugLogPayload): void {
  if (typeof window === "undefined") return;

  const body = JSON.stringify({
    ...payload,
    timestamp: payload.timestamp ?? Date.now(),
  });

  if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    navigator.sendBeacon("/api/debug-log", new Blob([body], { type: "application/json" }));
    return;
  }

  void fetch("/api/debug-log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => undefined);
}
