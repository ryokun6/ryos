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
import {
  createEmptyPersistedSyncState,
  loadPersistedSyncState,
  persistSyncStateNow,
  schedulePersistedSyncState,
  type PersistedSyncState,
  type ShadowEntry,
} from "@/sync/stateStorage";

export type { ShadowEntry } from "@/sync/stateStorage";

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

export class SyncClientState {
  private readonly username: string;
  private state: PersistedSyncState;

  private constructor(username: string, state: PersistedSyncState) {
    this.username = username;
    this.state = state;
  }

  static async open(username: string): Promise<SyncClientState> {
    return new SyncClientState(
      username,
      await loadPersistedSyncState(username)
    );
  }

  get accountUsername(): string {
    return this.username;
  }

  /** Coalesced persistence; shadow updates arrive in bursts. */
  private schedulePersist(): void {
    schedulePersistedSyncState(this.username, this.state);
  }

  persistNow(): Promise<void> {
    return persistSyncStateNow(this.username, this.state);
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

  get shadowKeys(): string[] {
    return Object.keys(this.state.shadow);
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
  async reset(): Promise<void> {
    this.state = {
      ...createEmptyPersistedSyncState(),
      lastHlc: this.state.lastHlc,
    };
    await this.persistNow();
  }
}

export async function markSyncLocalReconcileRequired(
  username: string
): Promise<void> {
  const state = await SyncClientState.open(username);
  state.setLocalReconcileRequired(true);
  await state.persistNow();
}

// Fast cyrb53 shadow hash; implementation lives in the pure content codec so
// the cloud sync worker can bundle it without this module's storage deps.
export { hashDoc, hashDocJson } from "@/sync/contentCodec";
