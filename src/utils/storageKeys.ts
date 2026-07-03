export const STORAGE_KEYS = {
  dock: "ryos:dock",
  applet: "ryos:applet",
  dashboard: "ryos:dashboard",
  stickies: "ryos:stickies",
  calendar: "ryos:calendar",
  contacts: "ryos:contacts",
  usernameRecovery: "ryos:auth:username-recovery",
  calculator: "ryos:calculator",
  staleReload: "ryos:stale-reload",
  theme: "ryos:theme",
} as const;

export const LEGACY_STORAGE_KEYS = {
  dock: "dock-storage",
  applet: "applet-storage",
  dashboard: "dashboard-storage",
  stickies: "stickies-storage",
  calendar: "calendar-storage",
  contacts: "contacts-storage",
  usernameRecovery: "_usr_recovery_key_",
  calculator: "calculator-app-state-v1",
  staleReload: "ryos-stale-reload",
  theme: "os_theme",
} as const;

const STALE_LOCAL_STORAGE_KEYS = [
  "ryos:pending-file-open",
  "ryos:app:settings:wallpaper",
] as const;

interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * Move a Web Storage value without overwriting a value already written under
 * the canonical key. Safe to run repeatedly and during module initialization.
 */
export function migrateWebStorageKey(
  storage: KeyValueStorage | undefined,
  legacyKey: string,
  canonicalKey: string
): void {
  if (!storage || legacyKey === canonicalKey) return;
  try {
    const current = storage.getItem(canonicalKey);
    const legacy = storage.getItem(legacyKey);
    if (current === null && legacy !== null) {
      storage.setItem(canonicalKey, legacy);
      storage.removeItem(legacyKey);
      return;
    }
    // A still-open older tab may have written a newer legacy value. Only
    // remove it when both copies agree; otherwise preserve the conflict rather
    // than silently discarding data we cannot order.
    if (legacy !== null && legacy === current) storage.removeItem(legacyKey);
  } catch {
    // Storage can be blocked in private/sandboxed contexts.
  }
}

export function migrateLocalStorageKey(
  legacyKey: string,
  canonicalKey: string
): void {
  migrateWebStorageKey(
    typeof localStorage === "undefined" ? undefined : localStorage,
    legacyKey,
    canonicalKey
  );
}

export function migrateSessionStorageKey(
  legacyKey: string,
  canonicalKey: string
): void {
  migrateWebStorageKey(
    typeof sessionStorage === "undefined" ? undefined : sessionStorage,
    legacyKey,
    canonicalKey
  );
}

/** Remove storage paths that no current code reads. */
export function removeStaleStorageKeys(): void {
  if (typeof localStorage === "undefined") return;
  for (const key of STALE_LOCAL_STORAGE_KEYS) {
    try {
      localStorage.removeItem(key);
    } catch {
      // Best-effort cleanup.
    }
  }
}
