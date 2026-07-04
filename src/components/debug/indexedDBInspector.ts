import { ensureIndexedDBInitialized } from "@/utils/indexedDB";
import { formatBytes } from "./liveMetrics";

export const IDB_PREVIEW_MAX_CHARS = 4_000;
export const IDB_ENTRY_PAGE_SIZE = 50;

export interface IDBStoreSummary {
  name: string;
  count: number;
}

export interface IDBEntrySummary {
  /** Display form of the record key (keys can be strings, numbers, dates, arrays). */
  key: string;
  /** One-line value description, e.g. "object · 12 keys · 3.4 KB". */
  summary: string;
  /** Pretty-printed value preview, truncated to IDB_PREVIEW_MAX_CHARS. */
  preview: string;
  previewTruncated: boolean;
}

export interface IDBStoreEntriesPage {
  entries: IDBEntrySummary[];
  total: number;
}

export function formatIDBKey(key: IDBValidKey): string {
  if (typeof key === "string") return key;
  if (typeof key === "number") return String(key);
  if (key instanceof Date) return key.toISOString();
  if (Array.isArray(key)) {
    return `[${key.map((part) => formatIDBKey(part)).join(", ")}]`;
  }
  if (key instanceof ArrayBuffer) return `ArrayBuffer(${key.byteLength})`;
  if (ArrayBuffer.isView(key)) {
    return `${key.constructor.name}(${key.byteLength})`;
  }
  return String(key);
}

/**
 * Approximate stored size in bytes. Strings and structured values use their
 * JSON text length (close enough for a debug readout); binary values report
 * their real byte length. Returns null when no meaningful size exists.
 */
export function estimateIDBValueBytes(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value.length;
  if (typeof Blob !== "undefined" && value instanceof Blob) return value.size;
  if (value instanceof ArrayBuffer) return value.byteLength;
  if (ArrayBuffer.isView(value)) return value.byteLength;
  if (typeof value === "object") {
    try {
      const json = JSON.stringify(value, jsonSafeReplacer());
      return json ? json.length : null;
    } catch {
      return null;
    }
  }
  return null;
}

export function summarizeIDBValue(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null) return "null";

  const size = estimateIDBValueBytes(value);
  const sizeLabel = size !== null ? formatBytes(size) : null;

  if (typeof value === "string") return `string · ${sizeLabel}`;
  if (typeof value !== "object") return `${typeof value} · ${String(value)}`;

  if (typeof Blob !== "undefined" && value instanceof Blob) {
    return `Blob · ${value.type || "unknown"} · ${sizeLabel}`;
  }
  if (value instanceof ArrayBuffer) return `ArrayBuffer · ${sizeLabel}`;
  if (ArrayBuffer.isView(value)) {
    return `${value.constructor.name} · ${sizeLabel}`;
  }
  if (Array.isArray(value)) {
    const items = value.length === 1 ? "item" : "items";
    return sizeLabel
      ? `array · ${value.length} ${items} · ${sizeLabel}`
      : `array · ${value.length} ${items}`;
  }

  const keyCount = Object.keys(value as Record<string, unknown>).length;
  const keys = keyCount === 1 ? "key" : "keys";
  return sizeLabel
    ? `object · ${keyCount} ${keys} · ${sizeLabel}`
    : `object · ${keyCount} ${keys}`;
}

/**
 * JSON replacer that renders values JSON.stringify would otherwise drop or
 * choke on (blobs, buffers, circular references) as readable placeholders.
 */
function jsonSafeReplacer(): (key: string, value: unknown) => unknown {
  const seen = new WeakSet<object>();
  return (_key, value) => {
    if (typeof value === "bigint") return `${value}n`;
    if (typeof value === "function") return "[Function]";
    if (typeof value !== "object" || value === null) return value;
    if (typeof Blob !== "undefined" && value instanceof Blob) {
      return `[Blob ${value.type || "unknown"} ${formatBytes(value.size)}]`;
    }
    if (value instanceof ArrayBuffer) {
      return `[ArrayBuffer ${formatBytes(value.byteLength)}]`;
    }
    if (ArrayBuffer.isView(value)) {
      return `[${value.constructor.name} ${formatBytes(value.byteLength)}]`;
    }
    if (seen.has(value)) return "[Circular]";
    seen.add(value);
    return value;
  };
}

export function buildIDBValuePreview(
  value: unknown,
  maxChars = IDB_PREVIEW_MAX_CHARS
): { text: string; truncated: boolean } {
  let text: string;
  if (value === undefined) {
    text = "undefined";
  } else if (typeof value === "string") {
    text = value;
  } else if (typeof Blob !== "undefined" && value instanceof Blob) {
    text = `[Blob ${value.type || "unknown"} ${formatBytes(value.size)}]`;
  } else if (value instanceof ArrayBuffer) {
    text = `[ArrayBuffer ${formatBytes(value.byteLength)}]`;
  } else if (ArrayBuffer.isView(value)) {
    text = `[${value.constructor.name} ${formatBytes(value.byteLength)}]`;
  } else {
    try {
      text = JSON.stringify(value, jsonSafeReplacer(), 2) ?? String(value);
    } catch {
      text = String(value);
    }
  }

  if (text.length > maxChars) {
    return { text: `${text.slice(0, maxChars)}…`, truncated: true };
  }
  return { text, truncated: false };
}

export function formatIDBEntriesForCopy(
  storeName: string,
  entries: readonly IDBEntrySummary[]
): string {
  const lines = [`IndexedDB store: ${storeName} (${entries.length} entries)`];
  for (const entry of entries) {
    lines.push("", `— ${entry.key} · ${entry.summary}`, entry.preview);
  }
  return lines.join("\n");
}

export function formatIDBStoresForCopy(
  dbName: string,
  stores: readonly IDBStoreSummary[]
): string {
  const lines = [`IndexedDB database: ${dbName}`];
  for (const store of stores) {
    const records = store.count === 1 ? "record" : "records";
    lines.push(`- ${store.name}: ${store.count} ${records}`);
  }
  return lines.join("\n");
}

export async function listIDBStores(): Promise<IDBStoreSummary[]> {
  const db = await ensureIndexedDBInitialized();
  try {
    const names = Array.from(db.objectStoreNames).sort();
    if (names.length === 0) return [];
    const transaction = db.transaction(names, "readonly");
    const counts = await Promise.all(
      names.map(
        (name) =>
          new Promise<number>((resolve, reject) => {
            const request = transaction.objectStore(name).count();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          })
      )
    );
    return names.map((name, index) => ({ name, count: counts[index] }));
  } finally {
    db.close();
  }
}

export async function readIDBStoreEntries(
  storeName: string,
  limit: number
): Promise<IDBStoreEntriesPage> {
  const db = await ensureIndexedDBInitialized();
  try {
    return await new Promise<IDBStoreEntriesPage>((resolve, reject) => {
      const transaction = db.transaction(storeName, "readonly");
      const store = transaction.objectStore(storeName);
      const countRequest = store.count();
      const entries: IDBEntrySummary[] = [];
      const cursorRequest = store.openCursor();

      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (cursor && entries.length < limit) {
          const preview = buildIDBValuePreview(cursor.value);
          entries.push({
            key: formatIDBKey(cursor.key),
            summary: summarizeIDBValue(cursor.value),
            preview: preview.text,
            previewTruncated: preview.truncated,
          });
          cursor.continue();
          return;
        }
        // countRequest resolves before the cursor finishes because both run in
        // the same transaction and were issued in order.
        resolve({ entries, total: countRequest.result });
      };
      cursorRequest.onerror = () => reject(cursorRequest.error);
    });
  } finally {
    db.close();
  }
}
