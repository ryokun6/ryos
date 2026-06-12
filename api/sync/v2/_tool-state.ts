/**
 * Snapshot-style read/write adapters for server-side AI tools, backed by
 * the Cloud Sync v2 key-value state. Tools think in whole-feature snapshots
 * (calendar, stickies, files metadata); these helpers decompose writes into
 * per-key ops with replace semantics (absent items are tombstoned).
 */

import type { Redis } from "../../_utils/redis.js";
import { hlcFromTimestamp } from "../../../src/shared/sync2/hlc.js";
import type { SyncOp } from "../../../src/shared/sync2/types.js";
import {
  readSyncDocsByPrefix,
  SERVER_SYNC_CLIENT_ID,
  writeSyncOpsFromServer,
} from "./_core.js";

function collectPrefixed<T>(
  docs: Record<string, unknown>,
  prefix: string
): T[] {
  const items: T[] = [];
  for (const [key, doc] of Object.entries(docs)) {
    if (key.startsWith(prefix) && doc && typeof doc === "object") {
      items.push(doc as T);
    }
  }
  return items;
}

interface ReplaceCollectionSpec {
  prefix: string;
  items: Array<Record<string, unknown>>;
  idField?: string;
}

/**
 * Build ops that make the KV state under each prefix exactly match the
 * provided item collections. Returns the ops without applying them.
 */
function buildReplaceOps(
  existingDocs: Record<string, unknown>,
  collections: ReplaceCollectionSpec[],
  t: string
): SyncOp[] {
  const ops: SyncOp[] = [];

  for (const { prefix, items, idField = "id" } of collections) {
    const seen = new Set<string>();
    for (const item of items) {
      const id = item?.[idField];
      if (typeof id !== "string" || id.length === 0 || seen.has(id)) continue;
      seen.add(id);
      const key = `${prefix}${id}`;
      if (JSON.stringify(existingDocs[key]) === JSON.stringify(item)) continue;
      ops.push({ k: key, v: item, t });
    }

    for (const key of Object.keys(existingDocs)) {
      if (!key.startsWith(prefix)) continue;
      if (!seen.has(key.slice(prefix.length))) {
        ops.push({ k: key, del: true, t });
      }
    }
  }

  return ops;
}

// --- Calendar ---------------------------------------------------------------

export interface ToolCalendarSnapshot {
  events: Array<Record<string, unknown>>;
  calendars: Array<Record<string, unknown>>;
  todos: Array<Record<string, unknown>>;
}

export async function readCalendarToolState(
  redis: Redis,
  username: string
): Promise<ToolCalendarSnapshot | null> {
  const docs = await readSyncDocsByPrefix(redis, username, "calendar/");
  if (Object.keys(docs).length === 0) return null;
  return {
    events: collectPrefixed(docs, "calendar/event:"),
    calendars: collectPrefixed(docs, "calendar/cal:"),
    todos: collectPrefixed(docs, "calendar/todo:"),
  };
}

export async function writeCalendarToolState(
  redis: Redis,
  username: string,
  data: ToolCalendarSnapshot
): Promise<void> {
  const existingDocs = await readSyncDocsByPrefix(redis, username, "calendar/");
  const t = hlcFromTimestamp(Date.now(), SERVER_SYNC_CLIENT_ID);
  const ops = buildReplaceOps(
    existingDocs,
    [
      { prefix: "calendar/event:", items: data.events || [] },
      { prefix: "calendar/cal:", items: data.calendars || [] },
      { prefix: "calendar/todo:", items: data.todos || [] },
    ],
    t
  );
  if (ops.length > 0) {
    await writeSyncOpsFromServer(redis, username, ops);
  }
}

// --- Stickies ---------------------------------------------------------------

export interface ToolStickiesSnapshot {
  notes: Array<Record<string, unknown>>;
}

export async function readStickiesToolState(
  redis: Redis,
  username: string
): Promise<ToolStickiesSnapshot | null> {
  const docs = await readSyncDocsByPrefix(redis, username, "stickies/");
  if (Object.keys(docs).length === 0) return null;
  return { notes: collectPrefixed(docs, "stickies/note:") };
}

export async function writeStickiesToolState(
  redis: Redis,
  username: string,
  data: ToolStickiesSnapshot
): Promise<void> {
  const existingDocs = await readSyncDocsByPrefix(redis, username, "stickies/");
  const t = hlcFromTimestamp(Date.now(), SERVER_SYNC_CLIENT_ID);
  const ops = buildReplaceOps(
    existingDocs,
    [{ prefix: "stickies/note:", items: data.notes || [] }],
    t
  );
  if (ops.length > 0) {
    await writeSyncOpsFromServer(redis, username, ops);
  }
}

// --- Files metadata (documents tool) ----------------------------------------

export interface ToolFilesMetadataSnapshot {
  items: Record<string, Record<string, unknown>>;
  libraryState: "uninitialized" | "loaded" | "cleared";
  documents?: Array<Record<string, unknown>>;
}

export async function readFilesMetadataToolState(
  redis: Redis,
  username: string
): Promise<ToolFilesMetadataSnapshot | null> {
  const docs = await readSyncDocsByPrefix(redis, username, "files/");
  if (Object.keys(docs).length === 0) return null;

  const items: Record<string, Record<string, unknown>> = {};
  const documents: Array<Record<string, unknown>> = [];
  for (const [key, doc] of Object.entries(docs)) {
    if (key.startsWith("files/item:") && doc && typeof doc === "object") {
      items[key.slice("files/item:".length)] = doc as Record<string, unknown>;
    } else if (key.startsWith("files/doc:") && doc && typeof doc === "object") {
      documents.push(doc as Record<string, unknown>);
    }
  }

  const lib = docs["files/lib"] as { libraryState?: unknown } | undefined;
  const libraryState =
    lib?.libraryState === "loaded" ||
    lib?.libraryState === "cleared" ||
    lib?.libraryState === "uninitialized"
      ? lib.libraryState
      : Object.keys(items).length > 0
        ? "loaded"
        : "uninitialized";

  return { items, libraryState, documents };
}

export async function writeFilesMetadataToolState(
  redis: Redis,
  username: string,
  data: ToolFilesMetadataSnapshot
): Promise<void> {
  const existingDocs = await readSyncDocsByPrefix(redis, username, "files/");
  const t = hlcFromTimestamp(Date.now(), SERVER_SYNC_CLIENT_ID);
  const ops: SyncOp[] = [];

  const seenItemKeys = new Set<string>();
  for (const [path, item] of Object.entries(data.items || {})) {
    if (!path) continue;
    seenItemKeys.add(path);
    const key = `files/item:${path}`;
    if (JSON.stringify(existingDocs[key]) === JSON.stringify(item)) continue;
    ops.push({ k: key, v: item, t });
  }
  for (const key of Object.keys(existingDocs)) {
    if (!key.startsWith("files/item:")) continue;
    if (!seenItemKeys.has(key.slice("files/item:".length))) {
      ops.push({ k: key, del: true, t });
    }
  }

  const seenDocKeys = new Set<string>();
  for (const doc of data.documents || []) {
    const docKey = doc?.key;
    if (typeof docKey !== "string" || docKey.length === 0) continue;
    seenDocKeys.add(docKey);
    const key = `files/doc:${docKey}`;
    if (JSON.stringify(existingDocs[key]) === JSON.stringify(doc)) continue;
    ops.push({ k: key, v: doc, t });
  }
  for (const key of Object.keys(existingDocs)) {
    if (!key.startsWith("files/doc:")) continue;
    if (!seenDocKeys.has(key.slice("files/doc:".length))) {
      ops.push({ k: key, del: true, t });
    }
  }

  const nextLib = { libraryState: data.libraryState };
  if (JSON.stringify(existingDocs["files/lib"]) !== JSON.stringify(nextLib)) {
    ops.push({ k: "files/lib", v: nextLib, t });
  }

  if (ops.length > 0) {
    await writeSyncOpsFromServer(redis, username, ops);
  }
}
