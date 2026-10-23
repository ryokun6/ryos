const STORAGE_KEY = "ryos:listen-session";

export interface RememberedListenSession {
  sessionId: string;
  username: string | null;
}

export function rememberListenSession(
  sessionId: string,
  username: string | null
): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ sessionId, username })
    );
  } catch {
    // Private mode can reject storage writes.
  }
}

export function readRememberedListenSession(): RememberedListenSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RememberedListenSession>;
    if (typeof parsed.sessionId !== "string" || !parsed.sessionId) return null;
    return {
      sessionId: parsed.sessionId,
      username: typeof parsed.username === "string" ? parsed.username : null,
    };
  } catch {
    return null;
  }
}

export function forgetListenSession(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage failures.
  }
}
