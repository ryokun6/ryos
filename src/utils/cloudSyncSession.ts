let syncSessionId: string | null = null;

/** Stable per-tab identifier used to skip self-originated realtime events. */
export function getSyncSessionId(): string {
  if (!syncSessionId) {
    syncSessionId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
  return syncSessionId;
}

