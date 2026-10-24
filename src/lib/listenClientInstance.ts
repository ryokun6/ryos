const STORAGE_KEY = "ryos:listen-client-instance";
const IOS_STORAGE_KEY = "ryos:listen-client-instance:ios";

function isIosShell(): boolean {
  if (typeof window === "undefined") return false;
  return window.ryosDesktop?.platform === "ios";
}

function randomId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Stable per-tab id for listen sessions (same user can join from multiple devices/tabs). */
export function getListenClientInstanceId(): string {
  if (typeof window === "undefined") {
    return `ssr-${randomId()}`;
  }
  try {
    const existing = sessionStorage.getItem(STORAGE_KEY);
    if (existing && /^[a-zA-Z0-9_-]+$/.test(existing) && existing.length <= 64) {
      return existing;
    }
    if (isIosShell()) {
      const persisted = localStorage.getItem(IOS_STORAGE_KEY);
      if (persisted && /^[a-zA-Z0-9_-]+$/.test(persisted) && persisted.length <= 64) {
        sessionStorage.setItem(STORAGE_KEY, persisted);
        return persisted;
      }
    }
    const id = randomId();
    sessionStorage.setItem(STORAGE_KEY, id);
    if (isIosShell()) localStorage.setItem(IOS_STORAGE_KEY, id);
    return id;
  } catch {
    return randomId();
  }
}

export function connectionLabel(username: string, clientInstanceId?: string): string {
  if (!clientInstanceId || clientInstanceId.startsWith("legacy:")) {
    return username;
  }
  const short = clientInstanceId.slice(0, 6);
  return `${username} (${short})`;
}

export function makeConnectionKey(username: string, clientInstanceId: string): string {
  return `${username}|${clientInstanceId}`;
}
