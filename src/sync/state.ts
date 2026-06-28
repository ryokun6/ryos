/**
 * Cloud Sync v2 client-side persisted state: stable client id, per-user
 * cursor, HLC clock state, shadow map, and dirty namespaces.
 *
 * The shadow map records, per synced key, the HLC timestamp and content
 * hash of the last value exchanged with the server. Pending uploads are
 * always recomputable as `diff(local state, shadow)`, so no separate outbox
 * is needed and unsynced changes survive reloads for free.
 */

import { nextHlc } from "@/shared/sync2/hlc";
import type { SyncNamespace } from "@/shared/sync2/namespaces";
import { getSyncKeyNamespace } from "@/shared/sync2/namespaces";

const CLIENT_ID_KEY = "ryos:sync2:client-id";

let inMemoryClientId: string | null = null;

export function getSyncClientId(): string {
  if (inMemoryClientId) return inMemoryClientId;

  const create = (): string =>
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 16)
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

  if (typeof localStorage === "undefined") {
    inMemoryClientId = create();
    return inMemoryClientId;
  }

  const persisted = localStorage.getItem(CLIENT_ID_KEY);
  if (persisted) {
    inMemoryClientId = persisted;
    return persisted;
  }

  inMemoryClientId = create();
  localStorage.setItem(CLIENT_ID_KEY, inMemoryClientId);
  return inMemoryClientId;
}

export interface ShadowEntry {
  /** HLC of the last synced value. */
  t: string;
  /** Content hash of the last synced doc (cyrb53 or sha256 for blob docs). */
  h: string;
}

interface PersistedSyncState {
  cursor: number | null;
  lastHlc: string | null;
  shadow: Record<string, ShadowEntry>;
  dirty: SyncNamespace[];
  localReconcileRequired: boolean;
}

function storageKey(username: string): string {
  return `ryos:sync2:state:${username.toLowerCase()}`;
}

export function deleteSyncClientState(username: string): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(storageKey(username));
}

export class SyncClientState {
  private readonly username: string;
  private state: PersistedSyncState;
  private writeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(username: string) {
    this.username = username;
    this.state = this.read();
  }

  private read(): PersistedSyncState {
    const fallback: PersistedSyncState = {
      cursor: null,
      lastHlc: null,
      shadow: {},
      dirty: [],
      localReconcileRequired: false,
    };
    if (typeof localStorage === "undefined") return fallback;
    try {
      const raw = localStorage.getItem(storageKey(this.username));
      if (!raw) return fallback;
      const parsed = JSON.parse(raw) as Partial<PersistedSyncState>;
      return {
        cursor:
          typeof parsed.cursor === "number" && Number.isFinite(parsed.cursor)
            ? parsed.cursor
            : null,
        lastHlc: typeof parsed.lastHlc === "string" ? parsed.lastHlc : null,
        shadow:
          parsed.shadow && typeof parsed.shadow === "object"
            ? (parsed.shadow as Record<string, ShadowEntry>)
            : {},
        dirty: Array.isArray(parsed.dirty)
          ? (parsed.dirty as SyncNamespace[])
          : [],
        localReconcileRequired: parsed.localReconcileRequired === true,
      };
    } catch {
      return fallback;
    }
  }

  /** Coalesced persistence; shadow updates arrive in bursts. */
  private schedulePersist(): void {
    if (typeof localStorage === "undefined") return;
    if (this.writeTimer) return;
    this.writeTimer = setTimeout(() => {
      this.writeTimer = null;
      this.persistNow();
    }, 250);
  }

  persistNow(): void {
    if (typeof localStorage === "undefined") return;
    if (this.writeTimer) {
      clearTimeout(this.writeTimer);
      this.writeTimer = null;
    }
    try {
      localStorage.setItem(storageKey(this.username), JSON.stringify(this.state));
    } catch (error) {
      console.warn("[sync2] Failed to persist sync state:", error);
    }
  }

  get cursor(): number | null {
    return this.state.cursor;
  }

  setCursor(cursor: number): void {
    if (this.state.cursor === cursor) return;
    this.state.cursor = cursor;
    this.schedulePersist();
  }

  /** Generate the next HLC timestamp, monotonic across reloads. */
  nextTimestamp(): string {
    const t = nextHlc(this.state.lastHlc, getSyncClientId());
    this.state.lastHlc = t;
    this.schedulePersist();
    return t;
  }

  /** Track a remotely-observed HLC so future local stamps sort after it. */
  observeTimestamp(t: string): void {
    if (!this.state.lastHlc || t > this.state.lastHlc) {
      this.state.lastHlc = t;
      this.schedulePersist();
    }
  }

  getShadow(key: string): ShadowEntry | null {
    return this.state.shadow[key] || null;
  }

  setShadow(key: string, entry: ShadowEntry): void {
    this.state.shadow[key] = entry;
    this.schedulePersist();
  }

  deleteShadow(key: string): void {
    if (key in this.state.shadow) {
      delete this.state.shadow[key];
      this.schedulePersist();
    }
  }

  shadowKeysForNamespace(namespace: SyncNamespace): string[] {
    return Object.keys(this.state.shadow).filter(
      (key) => getSyncKeyNamespace(key) === namespace
    );
  }

  get dirtyNamespaces(): SyncNamespace[] {
    return [...this.state.dirty];
  }

  get localReconcileRequired(): boolean {
    return this.state.localReconcileRequired;
  }

  setLocalReconcileRequired(required: boolean): void {
    if (this.state.localReconcileRequired === required) return;
    this.state.localReconcileRequired = required;
    this.schedulePersist();
  }

  markDirty(namespace: SyncNamespace): void {
    if (!this.state.dirty.includes(namespace)) {
      this.state.dirty.push(namespace);
      this.schedulePersist();
    }
  }

  clearDirty(namespaces: SyncNamespace[]): void {
    const remove = new Set(namespaces);
    const next = this.state.dirty.filter((ns) => !remove.has(ns));
    if (next.length !== this.state.dirty.length) {
      this.state.dirty = next;
      this.schedulePersist();
    }
  }

  /** Wipe cursor + shadow (force re-bootstrap). Keeps the client id. */
  reset(): void {
    this.state = {
      cursor: null,
      lastHlc: this.state.lastHlc,
      shadow: {},
      dirty: [],
      localReconcileRequired: false,
    };
    this.persistNow();
  }
}

export function markSyncLocalReconcileRequired(username: string): void {
  const state = new SyncClientState(username);
  state.setLocalReconcileRequired(true);
  state.persistNow();
}

/** Fast 53-bit string hash (cyrb53) for shadow content hashes. */
export function hashDocJson(json: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < json.length; i += 1) {
    const ch = json.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

export function hashDoc(doc: unknown): string {
  return hashDocJson(JSON.stringify(doc));
}
