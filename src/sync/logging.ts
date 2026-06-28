import {
  getSyncKeyNamespace,
  type SyncNamespace,
} from "@/shared/sync2/namespaces";
import type { SyncOp } from "@/shared/sync2/types";
import { createClientLogger } from "@/utils/logger";

export const cloudSyncLog = createClientLogger("CloudSync");

export type DirtyScopeSummary =
  | { scope: "full" }
  | { scope: "keys"; keyCount: number };

export interface SyncOpsSummary {
  total: number;
  upserts: number;
  deletions: number;
  namespaces: Array<{
    namespace: SyncNamespace | "unknown";
    total: number;
    upserts: number;
    deletions: number;
  }>;
}

export function summarizeDirtyScope(
  scope: ReadonlySet<string> | null
): DirtyScopeSummary {
  return scope === null
    ? { scope: "full" }
    : { scope: "keys", keyCount: scope.size };
}

export function summarizeSyncOps(
  ops: Array<Pick<SyncOp, "k" | "del">>
): SyncOpsSummary {
  const byNamespace = new Map<
    SyncNamespace | "unknown",
    { total: number; upserts: number; deletions: number }
  >();
  let upserts = 0;
  let deletions = 0;

  for (const op of ops) {
    const namespace = getSyncKeyNamespace(op.k) ?? "unknown";
    const row =
      byNamespace.get(namespace) ??
      { total: 0, upserts: 0, deletions: 0 };
    row.total += 1;
    if (op.del) {
      deletions += 1;
      row.deletions += 1;
    } else {
      upserts += 1;
      row.upserts += 1;
    }
    byNamespace.set(namespace, row);
  }

  return {
    total: ops.length,
    upserts,
    deletions,
    namespaces: Array.from(byNamespace.entries())
      .map(([namespace, counts]) => ({ namespace, ...counts }))
      .sort((a, b) => String(a.namespace).localeCompare(String(b.namespace))),
  };
}
