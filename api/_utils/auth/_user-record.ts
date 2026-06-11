/**
 * Helpers for reading the stored user record (`chat:users:{username}`).
 *
 * The record is persisted as a JSON string (or, on some Redis backends, an
 * already-parsed object), so callers must tolerate both shapes.
 */

export interface StoredUserRecord {
  username?: string;
  createdAt?: number;
  lastActive?: number;
  banned?: boolean;
  banReason?: string;
  bannedAt?: number;
}

/**
 * Parse a raw `chat:users:{username}` value into a user record.
 * Returns null when the value is missing or malformed.
 */
export function parseStoredUser(userData: unknown): StoredUserRecord | null {
  if (!userData) return null;
  try {
    return typeof userData === "string"
      ? (JSON.parse(userData) as StoredUserRecord)
      : (userData as StoredUserRecord);
  } catch {
    return null;
  }
}

/**
 * Whether a stored user record represents a banned account.
 */
export function isUserBanned(userData: unknown): boolean {
  return parseStoredUser(userData)?.banned === true;
}
