/**
 * Per-tab / per-device client ids so one account can join a session multiple times.
 */

import type { ListenSession, ListenSessionUser } from "./_types.js";

const MAX_LEN = 64;

export function normalizeClientInstanceId(
  username: string,
  raw: unknown
): string {
  if (typeof raw === "string") {
    const t = raw.trim();
    if (t.length > 0 && t.length <= MAX_LEN && /^[a-zA-Z0-9_-]+$/.test(t)) {
      return t;
    }
  }
  return `legacy:${username.toLowerCase()}`;
}

export function userConnectionKey(user: ListenSessionUser): string {
  const u = user.username.toLowerCase();
  if (user.clientInstanceId && user.clientInstanceId.length > 0) {
    return `${u}|${user.clientInstanceId}`;
  }
  return `${u}|legacy:${u}`;
}

/** Backfill missing clientInstanceId / djClientInstanceId for older Redis payloads */
export function migrateSessionClientIds(session: ListenSession): void {
  for (const u of session.users) {
    if (!u.clientInstanceId) {
      u.clientInstanceId = `legacy:${u.username.toLowerCase()}`;
    }
  }
  const host = session.hostUsername.toLowerCase();
  if (!session.hostClientInstanceId) {
    const hostUser = session.users.find((x) => x.username === host);
    session.hostClientInstanceId =
      hostUser?.clientInstanceId ?? `legacy:${host}`;
  }

  const dj = session.djUsername.toLowerCase();
  if (!session.djClientInstanceId) {
    const djUser = session.users.find((x) => x.username === dj);
    session.djClientInstanceId =
      djUser?.clientInstanceId ?? `legacy:${dj}`;
  }
}
