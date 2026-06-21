/**
 * Admin action audit log.
 *
 * Records state-changing admin (`ryo`) operations to a single bounded global
 * Redis LIST (newest first). The `ryo` single-admin model is unchanged; this
 * only adds an append-only trail so admin actions are reviewable.
 *
 * Recording is best-effort and never throws — an audit failure must never
 * block the admin action it describes.
 */

import type { Redis } from "./redis.js";
import { redisKeys } from "../../src/shared/redisKeys.js";

export interface AdminAuditEntry {
  /** Unique id for the entry. */
  id: string;
  /** Epoch milliseconds when the action was recorded. */
  ts: number;
  /** Admin username that performed the action (e.g. `ryo`). */
  actor: string;
  /** Action name (matches the admin API `action`, e.g. `banUser`). */
  action: string;
  /** Primary subject of the action (username, redis key, run id, …). */
  target?: string;
  /** Small JSON-serializable summary of the action. */
  details?: Record<string, unknown>;
  /** Client IP of the admin request, when available. */
  ip?: string;
}

/** Maximum number of entries retained in the bounded list. */
export const MAX_AUDIT_ENTRIES = 1000;

/** Maximum serialized size of `details` before it is dropped/truncated. */
const MAX_DETAILS_CHARS = 2000;

function sanitizeDetails(
  details?: Record<string, unknown>
): Record<string, unknown> | undefined {
  if (!details) return undefined;
  try {
    const json = JSON.stringify(details);
    if (json.length > MAX_DETAILS_CHARS) {
      return { truncated: true };
    }
    return details;
  } catch {
    return undefined;
  }
}

export async function recordAdminAction(
  redis: Redis,
  entry: Omit<AdminAuditEntry, "id" | "ts"> & { ts?: number }
): Promise<void> {
  try {
    const details = sanitizeDetails(entry.details);
    const record: AdminAuditEntry = {
      id: crypto.randomUUID(),
      ts: entry.ts ?? Date.now(),
      actor: entry.actor,
      action: entry.action,
      ...(entry.target ? { target: entry.target } : {}),
      ...(details ? { details } : {}),
      ...(entry.ip ? { ip: entry.ip } : {}),
    };
    const key = redisKeys.system.adminAuditLog();
    await redis.lpush(key, JSON.stringify(record));
    await redis.ltrim(key, 0, MAX_AUDIT_ENTRIES - 1);
  } catch (error) {
    console.error("Failed to record admin audit entry", error);
  }
}

export async function getAdminAuditLog(
  redis: Redis,
  limit = 100
): Promise<AdminAuditEntry[]> {
  const clamped = Math.min(Math.max(Math.floor(limit) || 0, 1), MAX_AUDIT_ENTRIES);
  const raw = await redis.lrange<string | AdminAuditEntry>(
    redisKeys.system.adminAuditLog(),
    0,
    clamped - 1
  );
  const entries: AdminAuditEntry[] = [];
  for (const item of raw) {
    if (!item) continue;
    try {
      const parsed =
        typeof item === "string"
          ? (JSON.parse(item) as AdminAuditEntry)
          : item;
      if (parsed && typeof parsed.action === "string") {
        entries.push(parsed);
      }
    } catch {
      // skip malformed entries
    }
  }
  return entries;
}
