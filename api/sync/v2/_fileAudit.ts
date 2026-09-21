import { getSyncBlobRef, type SyncKvEntry } from "../../../src/shared/sync2/types.js";

export interface FileSyncIssue {
  path: string;
  uuid: string;
  contentKey: string;
  reason: "missing-content" | "deleted-content" | "invalid-content-reference";
}

/** Read-only consistency inventory. These users' objects must be retained for recovery. */
export function auditFileSync(entries: Record<string, SyncKvEntry>): FileSyncIssue[] {
  const issues: FileSyncIssue[] = [];
  for (const [key, entry] of Object.entries(entries)) {
    if (!key.startsWith("files/item:") || entry.del) continue;
    const file = entry.v as { uuid?: string; isDirectory?: boolean; status?: string } | undefined;
    if (!file || file.isDirectory || file.status !== "active" || !file.uuid) continue;
    const path = key.slice("files/item:".length);
    const namespace = path.startsWith("/Books/") ? "books" : path.startsWith("/Images/") ? "images" : null;
    if (!namespace) continue;
    const contentKey = `${namespace}/item:${file.uuid}`;
    const content = entries[contentKey];
    const reason = !content ? "missing-content" : content.del ? "deleted-content" :
      !getSyncBlobRef(content.v) ? "invalid-content-reference" : null;
    if (reason) issues.push({ path, uuid: file.uuid, contentKey, reason });
  }
  return issues;
}
