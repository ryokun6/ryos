const MANUAL_RESTORE_INTENT_KEY = "ryos:sync2:manual-restore-intent";
const MAX_INTENT_AGE_MS = 30 * 60 * 1000;

export interface ManualRestoreIntent {
  username: string;
  createdAt: string;
  backupTimestamp?: string;
}

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

export function createManualRestoreIntent(
  username: string,
  backupTimestamp?: string
): ManualRestoreIntent {
  return {
    username: normalizeUsername(username),
    createdAt: new Date().toISOString(),
    ...(backupTimestamp ? { backupTimestamp } : {}),
  };
}

export function setManualRestoreIntent(intent: ManualRestoreIntent): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(MANUAL_RESTORE_INTENT_KEY, JSON.stringify(intent));
}

export function getManualRestoreIntent(
  username: string
): ManualRestoreIntent | null {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(MANUAL_RESTORE_INTENT_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<ManualRestoreIntent>;
    if (normalizeUsername(parsed.username || "") !== normalizeUsername(username)) {
      return null;
    }
    const createdAt = typeof parsed.createdAt === "string" ? parsed.createdAt : "";
    const createdMs = Date.parse(createdAt);
    if (!Number.isFinite(createdMs) || Date.now() - createdMs > MAX_INTENT_AGE_MS) {
      localStorage.removeItem(MANUAL_RESTORE_INTENT_KEY);
      return null;
    }
    return {
      username: normalizeUsername(username),
      createdAt,
      ...(typeof parsed.backupTimestamp === "string"
        ? { backupTimestamp: parsed.backupTimestamp }
        : {}),
    };
  } catch {
    localStorage.removeItem(MANUAL_RESTORE_INTENT_KEY);
    return null;
  }
}

export function clearManualRestoreIntent(username?: string): void {
  if (typeof localStorage === "undefined") return;
  if (username && !getManualRestoreIntent(username)) return;
  localStorage.removeItem(MANUAL_RESTORE_INTENT_KEY);
}
