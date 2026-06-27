type AgentDebugPayload = {
  hypothesisId: string;
  location: string;
  message: string;
  data: Record<string, unknown>;
  timestamp?: number;
};

export function writeAgentDebugLog(payload: AgentDebugPayload): void {
  if (!import.meta.env.DEV || typeof window === "undefined") return;
  const entry = {
    ...payload,
    timestamp: payload.timestamp ?? Date.now(),
  };
  const body = JSON.stringify(entry);
  try {
    if (typeof navigator.sendBeacon === "function") {
      const blob = new Blob([body], { type: "application/json" });
      if (navigator.sendBeacon("/api/debug/agent-log", blob)) return;
    }
  } catch {
    // Fall through to fetch below.
  }
  void fetch("/api/debug/agent-log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {});
}
