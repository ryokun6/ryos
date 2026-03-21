const STORAGE_KEY = "ryos:listen-client-instance";

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
    const id = randomId();
    sessionStorage.setItem(STORAGE_KEY, id);
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

export function parseConnectionKey(key: string): { username: string; clientInstanceId: string } {
  const pipe = key.indexOf("|");
  if (pipe === -1) {
    return { username: key, clientInstanceId: `legacy:${key.toLowerCase()}` };
  }
  return {
    username: key.slice(0, pipe),
    clientInstanceId: key.slice(pipe + 1),
  };
}

export function makeConnectionKey(username: string, clientInstanceId: string): string {
  return `${username}|${clientInstanceId}`;
}
