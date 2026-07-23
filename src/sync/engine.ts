/**
 * Cloud Sync v2 client engine.
 *
 * One singleton per session orchestrates:
 * - dirty-namespace tracking fed by codec store subscriptions and explicit
 *   change events (markDirty), flushed as batched ops with a short debounce
 * - pulls via cursor (`GET /changes?since=`), snapshot bootstrap, and inline
 *   realtime ops (zero HTTP requests for small remote changes)
 * - per-key last-writer-wins convergence against the local shadow map
 *
 * Pending uploads are derived as `diff(local state, shadow)`, so they
 * survive reloads without an outbox. Deletions are inferred from shadow
 * keys missing locally, corroborated by the explicit deletion markers in
 * useCloudSyncStore when a wipe looks suspiciously large.
 */

import { ensureIndexedDBInitialized } from "@/utils/indexedDB";
import { useCloudSyncStore } from "@/stores/useCloudSyncStore";
import {
  getSyncKeyNamespace,
  getSyncNamespaceCategory,
  isSyncBlobNamespace,
  SYNC_NAMESPACES,
  type SyncBlobNamespace,
  type SyncNamespace,
} from "@/shared/sync2/namespaces";
import {
  getSyncBlobRef,
  type SyncKvEntry,
  type SyncOp,
  type SyncOpsRealtimeEvent,
} from "@/shared/sync2/types";
import {
  getSyncClientId,
  hashDoc,
  SyncClientState,
} from "@/sync/state";
import {
  getSyncChanges,
  getSyncSnapshot,
  postSyncOps,
} from "@/sync/transport";
import {
  resolveBlobDownloadUrls,
  downloadBlobItem,
  sha256Json,
  uploadBlobItems,
  type BlobUploadItem,
} from "@/sync/blobs";
import {
  cloudSyncLog,
  summarizeDirtyScope,
  summarizeSyncOps,
} from "@/sync/logging";
import {
  clearDeletionMarkersForKeys,
  getDeletionMarkerForKey,
  isBlobCodec,
  NAMESPACE_APPLY_ORDER,
  pruneDeletionMarkersWithoutShadow,
  SYNC_CODECS,
  type AppliedSyncOp,
  type CodecContext,
} from "@/sync/codecs";
import { getPersistedSyncShadowKeys } from "@/sync/stateStorage";
import { useFilesStore } from "@/stores/useFilesStore";
import {
  readStoreItemsByKeys,
  type IndexedDBStoreItemWithKey as StoreItemWithKey,
} from "@/utils/indexedDBBackup";

const FLUSH_DEBOUNCE_MS = 1000;
const FLUSH_MAX_DEBOUNCE_MS = 3000;
const FLUSH_IDLE_TIMEOUT_MS = 2000;
const FLUSH_FAILURE_BACKOFF_BASE_MS = 2000;
const FLUSH_FAILURE_BACKOFF_MAX_MS = 60_000;
const BLOB_HASH_YIELD_INTERVAL = 4;
const OPS_BATCH_SIZE = 400;
const SYNC_FLUSH_LOCK = "ryos:cloud-sync-flush";

// Suppress inferred mass-deletions unless corroborated by explicit markers:
// more than this many uncorroborated deletes covering most of a namespace
// looks like local storage loss, not user intent.
const SUSPICIOUS_DELETE_COUNT = 10;
const SUSPICIOUS_DELETE_RATIO = 0.8;

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

async function yieldToMainThread(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

interface EngineStatusCallbacks {
  onError?: (error: string | null) => void;
}

export interface RestoreLocalStateToCloudOptions {
  /** Test seam / targeted repair path; production restore uses every namespace. */
  namespaces?: readonly SyncNamespace[];
}

export interface RestoreLocalStateToCloudResult {
  seq: number;
  uploaded: number;
  deleted: number;
}

const CODEC_READY_POLL_MS = 10;

export class CloudSyncEngine {
  private readonly state: SyncClientState;
  private readonly callbacks: EngineStatusCallbacks;
  private readonly abortController = new AbortController();
  private readonly applyingNamespaces = new Set<SyncNamespace>();
  private readonly fullDirtyNamespaces = new Set<SyncNamespace>();
  private readonly dirtyKeysByNamespace = new Map<
    SyncNamespace,
    Set<string>
  >();
  private unsubscribers: Array<() => void> = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private flushIdleCallbackId: number | null = null;
  private firstDirtyAt = 0;
  private flushInFlight = false;
  private flushQueued = false;
  private consecutiveFlushFailures = 0;
  private nextFlushAllowedAt = 0;
  private pullInFlight: Promise<void> | null = null;
  private stopped = false;
  private started = false;

  private constructor(
    state: SyncClientState,
    callbacks: EngineStatusCallbacks = {}
  ) {
    this.state = state;
    this.callbacks = callbacks;
  }

  static async create(
    username: string,
    callbacks: EngineStatusCallbacks = {}
  ): Promise<CloudSyncEngine> {
    return new CloudSyncEngine(
      await SyncClientState.open(username),
      callbacks
    );
  }

  get cursor(): number | null {
    return this.state.cursor;
  }

  isApplyingNamespace(namespace: SyncNamespace): boolean {
    return this.applyingNamespaces.has(namespace);
  }

  private async waitForNamespacesReady(
    namespaces: readonly SyncNamespace[]
  ): Promise<void> {
    let pending = namespaces.filter((namespace) => {
      const codec = SYNC_CODECS[namespace];
      return codec.isReady && !codec.isReady();
    });
    if (pending.length === 0) return;

    cloudSyncLog.debug("Waiting for local store hydration", {
      namespaces: pending,
    });
    while (pending.length > 0) {
      if (this.stopped || this.abortController.signal.aborted) {
        throw new DOMException("Cloud sync stopped", "AbortError");
      }
      await new Promise<void>((resolve) => {
        setTimeout(resolve, CODEC_READY_POLL_MS);
      });
      pending = pending.filter((namespace) => {
        const codec = SYNC_CODECS[namespace];
        return codec.isReady && !codec.isReady();
      });
    }
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    const hadCursor = this.state.cursor !== null;
    const hadPersistedDirty = this.state.dirtyNamespaces.length > 0;
    const needsLocalReconcile = this.state.localReconcileRequired;
    cloudSyncLog.debug("Engine start requested", {
      hasCursor: hadCursor,
      cursor: this.state.cursor,
      namespaceCount: SYNC_NAMESPACES.length,
      dirtyNamespaceCount: this.state.dirtyNamespaces.length,
      needsLocalReconcile,
    });

    for (const namespace of SYNC_NAMESPACES) {
      const codec = SYNC_CODECS[namespace];
      const unsubscribe = codec.subscribe((keys) => {
        if (this.applyingNamespaces.has(namespace)) return;
        this.markDirty(namespace, keys);
      });
      this.unsubscribers.push(unsubscribe);
    }

    let initialSyncSucceeded = false;
    try {
      await this.waitForNamespacesReady(
        SYNC_NAMESPACES.filter((namespace) =>
          this.isNamespaceEnabled(namespace)
        )
      );
      if (this.state.cursor === null) {
        await this.bootstrap();
      } else {
        await this.pull({ throwOnError: true });
      }
      initialSyncSucceeded = true;
    } catch (error) {
      if (!this.stopped && !isAbortError(error)) {
        this.reportError(error, "initial sync");
      }
    }

    if (!initialSyncSucceeded || this.stopped) return;
    await this.pruneObsoleteDeletionMarkers();

    // Fresh bootstraps and recorded inactive periods need a one-time local
    // reconciliation. Warm starts rely on persisted dirty namespaces instead.
    if (!hadCursor || needsLocalReconcile) {
      const namespaceCount = this.markAllEnabledNamespacesDirty();
      cloudSyncLog.debug("Initial sync succeeded; queued local reconcile", {
        reason: !hadCursor ? "bootstrap" : "marked",
        namespaceCount,
      });
      this.scheduleFlush();
      return;
    }

    if (hadPersistedDirty || this.state.dirtyNamespaces.length > 0) {
      cloudSyncLog.debug("Initial sync succeeded; queued persisted local work", {
        namespaceCount: this.state.dirtyNamespaces.length,
      });
      this.schedulePendingFlush();
      return;
    }

    cloudSyncLog.debug("Initial sync succeeded; local scan skipped", {
      cursor: this.state.cursor,
    });
  }

  private clearLocalReconcileIfSettled(): void {
    if (!this.state.localReconcileRequired) return;
    if (
      this.state.dirtyNamespaces.length > 0 ||
      this.fullDirtyNamespaces.size > 0 ||
      this.dirtyKeysByNamespace.size > 0
    ) {
      return;
    }
    this.state.setLocalReconcileRequired(false);
    cloudSyncLog.debug("Local reconcile marker cleared");
  }

  private async pruneObsoleteDeletionMarkers(): Promise<void> {
    try {
      const shadowKeys = await getPersistedSyncShadowKeys({
        excludeUsername: this.state.accountUsername,
      });
      for (const key of this.state.shadowKeys) shadowKeys.add(key);
      const prunedCount = pruneDeletionMarkersWithoutShadow(shadowKeys);
      if (prunedCount > 0) {
        cloudSyncLog.debug("Obsolete deletion markers pruned", {
          prunedCount,
        });
      }
    } catch (error) {
      cloudSyncLog.warn("Deletion marker pruning skipped", { error });
    }
  }

  private markAllEnabledNamespacesDirty(): number {
    let namespaceCount = 0;
    for (const namespace of SYNC_NAMESPACES) {
      if (!this.isNamespaceEnabled(namespace)) continue;
      this.state.markDirty(namespace);
      this.fullDirtyNamespaces.add(namespace);
      namespaceCount += 1;
    }
    return namespaceCount;
  }

  async stop(options: { markLocalReconcileRequired?: boolean } = {}): Promise<void> {
    cloudSyncLog.debug("Engine stop requested", {
      dirtyNamespaceCount: this.state.dirtyNamespaces.length,
      flushInFlight: this.flushInFlight,
      pullInFlight: Boolean(this.pullInFlight),
      markLocalReconcileRequired:
        options.markLocalReconcileRequired === true,
    });
    if (options.markLocalReconcileRequired) {
      this.state.setLocalReconcileRequired(true);
    }
    this.stopped = true;
    this.abortController.abort();
    for (const unsubscribe of this.unsubscribers) {
      unsubscribe();
    }
    this.unsubscribers = [];
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (
      this.flushIdleCallbackId !== null &&
      typeof window !== "undefined" &&
      typeof window.cancelIdleCallback === "function"
    ) {
      window.cancelIdleCallback(this.flushIdleCallbackId);
      this.flushIdleCallbackId = null;
    }
    await this.state.persistNow();
  }

  /** Wipe cursor + shadow so the next start performs a fresh bootstrap. */
  async reset(): Promise<void> {
    await this.state.reset();
  }

  // -------------------------------------------------------------------------
  // Dirty tracking + flush
  // -------------------------------------------------------------------------

  markDirty(namespace: SyncNamespace, keys?: Iterable<string>): void {
    if (this.stopped) return;
    this.state.markDirty(namespace);
    const keyList = keys ? [...keys].filter(Boolean) : [];
    cloudSyncLog.debug("Namespace marked dirty", {
      namespace,
      scope: keyList.length === 0 ? "full" : "keys",
      keyCount: keyList.length,
    });
    if (keyList.length === 0) {
      this.fullDirtyNamespaces.add(namespace);
      this.dirtyKeysByNamespace.delete(namespace);
    } else if (!this.fullDirtyNamespaces.has(namespace)) {
      const pending = this.dirtyKeysByNamespace.get(namespace) ?? new Set();
      for (const key of keyList) pending.add(key);
      this.dirtyKeysByNamespace.set(namespace, pending);
    }
    this.scheduleFlush();
  }

  private takeDirtyScope(namespace: SyncNamespace): ReadonlySet<string> | null {
    if (this.fullDirtyNamespaces.delete(namespace)) {
      this.dirtyKeysByNamespace.delete(namespace);
      return null;
    }
    const keys = this.dirtyKeysByNamespace.get(namespace);
    this.dirtyKeysByNamespace.delete(namespace);
    // Persisted dirty namespaces have no in-memory key hints, so they require
    // a full collect after reload.
    return keys ? new Set(keys) : null;
  }

  private restoreDirtyScope(
    namespace: SyncNamespace,
    scope: ReadonlySet<string> | null
  ): void {
    this.state.markDirty(namespace);
    if (scope === null) {
      this.fullDirtyNamespaces.add(namespace);
      this.dirtyKeysByNamespace.delete(namespace);
      return;
    }
    if (this.fullDirtyNamespaces.has(namespace)) return;
    const pending = this.dirtyKeysByNamespace.get(namespace) ?? new Set();
    for (const key of scope) pending.add(key);
    this.dirtyKeysByNamespace.set(namespace, pending);
  }

  private hasPendingDirtyScope(namespace: SyncNamespace): boolean {
    return (
      this.fullDirtyNamespaces.has(namespace) ||
      this.dirtyKeysByNamespace.has(namespace)
    );
  }

  /** Queue pending local work for an idle period instead of blocking input. */
  schedulePendingFlush(): void {
    if (this.state.dirtyNamespaces.length === 0) return;
    this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (this.stopped) return;
    if (this.flushIdleCallbackId !== null) return;
    const now = Date.now();
    if (!this.firstDirtyAt) {
      this.firstDirtyAt = now;
    }
    if (this.flushTimer) {
      // Respect the max debounce so a steady edit stream still flushes.
      if (now - this.firstDirtyAt >= FLUSH_MAX_DEBOUNCE_MS) return;
      clearTimeout(this.flushTimer);
    }
    const backoffDelay = Math.max(0, this.nextFlushAllowedAt - now);
    this.flushTimer = setTimeout(
      () => {
        this.flushTimer = null;
        const run = () => {
          this.flushIdleCallbackId = null;
          this.firstDirtyAt = 0;
          if (!this.stopped) void this.flush();
        };
        if (
          typeof window !== "undefined" &&
          typeof window.requestIdleCallback === "function"
        ) {
          this.flushIdleCallbackId = window.requestIdleCallback(run, {
            timeout: FLUSH_IDLE_TIMEOUT_MS,
          });
        } else {
          run();
        }
      },
      Math.max(FLUSH_DEBOUNCE_MS, backoffDelay)
    );
  }

  private isNamespaceEnabled(namespace: SyncNamespace): boolean {
    const syncStore = useCloudSyncStore.getState();
    return (
      syncStore.autoSyncEnabled &&
      syncStore.isCategoryEnabled(getSyncNamespaceCategory(namespace))
    );
  }

  private async acquireCrossTabFlushLease(): Promise<() => void> {
    if (
      typeof navigator === "undefined" ||
      typeof navigator.locks?.request !== "function"
    ) {
      return () => {};
    }

    let releaseLease = () => {};
    let resolveAcquired: (() => void) | null = null;
    let rejectAcquired: ((error: unknown) => void) | null = null;
    const acquired = new Promise<void>((resolve, reject) => {
      resolveAcquired = resolve;
      rejectAcquired = reject;
    });
    const request = navigator.locks.request(
      SYNC_FLUSH_LOCK,
      { mode: "exclusive", signal: this.abortController.signal },
      async () => {
        const held = new Promise<void>((resolve) => {
          releaseLease = resolve;
        });
        resolveAcquired?.();
        await held;
      }
    );
    void request.catch((error) => rejectAcquired?.(error));

    await acquired;
    return () => {
      releaseLease();
      void request.catch(() => {});
    };
  }

  async flush(
    options: { force?: boolean; throwOnError?: boolean } = {}
  ): Promise<void> {
    if (this.stopped) return;
    if (this.flushInFlight) {
      cloudSyncLog.debug("Flush already in flight; queued follow-up");
      this.flushQueued = true;
      return;
    }
    this.flushInFlight = true;
    let releaseCrossTabLease: (() => void) | null = null;

    try {
      releaseCrossTabLease = await this.acquireCrossTabFlushLease();
      if (this.stopped) return;
      const namespaces = (
        options.force ? [...SYNC_NAMESPACES] : this.state.dirtyNamespaces
      ).filter((namespace) => this.isNamespaceEnabled(namespace));
      if (namespaces.length === 0) {
        cloudSyncLog.debug("Flush skipped; no enabled dirty namespaces", {
          force: Boolean(options.force),
          dirtyNamespaceCount: this.state.dirtyNamespaces.length,
        });
        await this.pruneObsoleteDeletionMarkers();
        return;
      }

      const syncStore = useCloudSyncStore.getState();
      const needsDb = namespaces.some((ns) => SYNC_CODECS[ns].usesIndexedDb);
      cloudSyncLog.debug("Flush started", {
        force: Boolean(options.force),
        namespaces,
        needsIndexedDB: needsDb,
      });
      const db = needsDb ? await ensureIndexedDBInitialized() : undefined;
      const ctx: CodecContext = { db };

      try {
        const ops: SyncOp[] = [];
        const shadowUpdates = new Map<string, { t: string; h: string }>();
        const flushedNamespaces: SyncNamespace[] = [];
        const flushedScopes = new Map<
          SyncNamespace,
          ReadonlySet<string> | null
        >();

        for (const namespace of namespaces) {
          const codec = SYNC_CODECS[namespace];
          if (codec.isReady && !codec.isReady()) {
            cloudSyncLog.debug("Namespace not ready; leaving dirty", {
              namespace,
            });
            continue; // stays dirty; retried on next flush
          }

          const dirtyScope = this.takeDirtyScope(namespace);
          let collected: Map<string, unknown>;
          let upsertCount = 0;
          let deletionCount = 0;
          let suppressedDeletionCount = 0;
          try {
            collected = await codec.collect(ctx, dirtyScope ?? undefined);
          } catch (error) {
            this.restoreDirtyScope(namespace, dirtyScope);
            cloudSyncLog.error("Collect failed", { namespace, error });
            continue;
          }
          flushedNamespaces.push(namespace);
          flushedScopes.set(namespace, dirtyScope);
          clearDeletionMarkersForKeys(collected.keys());

          // Upserts: keys whose content hash differs from the shadow.
          if (isSyncBlobNamespace(namespace)) {
            const pendingUploads: BlobUploadItem[] = [];
            const pendingTimestamps = new Map<string, string>();
            let itemIndex = 0;
            for (const [key, item] of collected) {
              if (itemIndex > 0 && itemIndex % BLOB_HASH_YIELD_INTERVAL === 0) {
                await yieldToMainThread();
                if (this.stopped) return;
              }
              itemIndex += 1;
              const sha256 = await sha256Json(item);
              const shadow = this.state.getShadow(key);
              if (!options.force && shadow?.h === sha256) continue;
              pendingUploads.push({ key, sha256, item });
              pendingTimestamps.set(key, this.state.nextTimestamp());
            }
            upsertCount += pendingUploads.length;
            if (pendingUploads.length > 0) {
              const category = getSyncNamespaceCategory(namespace);
              syncStore.markCategorySyncing(category, "upload", true);
              syncStore.markCategoryUploadProgress(category, 0);
              let refs: Awaited<ReturnType<typeof uploadBlobItems>>;
              try {
                refs = await uploadBlobItems(pendingUploads, {
                  signal: this.abortController.signal,
                  onProgress: (progress) => {
                    syncStore.markCategoryUploadProgress(
                      category,
                      progress.percentage
                    );
                  },
                });
              } catch (error) {
                syncStore.markCategorySyncing(category, "upload", false);
                throw error;
              }
              for (const upload of pendingUploads) {
                const ref = refs.get(upload.key);
                if (!ref) continue;
                const t = pendingTimestamps.get(upload.key)!;
                ops.push({ k: upload.key, v: { blob: ref }, t });
                shadowUpdates.set(upload.key, { t, h: upload.sha256 });
              }
            }
          } else {
            for (const [key, doc] of collected) {
              const h = hashDoc(doc);
              const shadow = this.state.getShadow(key);
              if (!options.force && shadow?.h === h) continue;
              const t = this.state.nextTimestamp();
              ops.push({ k: key, v: doc, t });
              shadowUpdates.set(key, { t, h });
              upsertCount += 1;
            }
          }

          // Deletions: shadow keys that vanished locally.
          const collectedKeys = new Set(collected.keys());
          const shadowKeys =
            dirtyScope === null
              ? this.state.shadowKeysForNamespace(namespace)
              : [...dirtyScope].filter(
                  (key) => this.state.getShadow(key) !== null
                );
          const missing = shadowKeys.filter((key) => !collectedKeys.has(key));
          if (missing.length > 0) {
            const corroborated = missing.filter((key) =>
              Boolean(getDeletionMarkerForKey(key))
            );
            const suspicious =
              missing.length > SUSPICIOUS_DELETE_COUNT &&
              missing.length >= shadowKeys.length * SUSPICIOUS_DELETE_RATIO &&
              corroborated.length < missing.length;
            const deletions = suspicious ? corroborated : missing;
            deletionCount = deletions.length;
            suppressedDeletionCount = missing.length - deletions.length;
            if (suspicious && corroborated.length < missing.length) {
              cloudSyncLog.warn("Suppressed uncorroborated deletions", {
                namespace,
                suppressedDeletionCount,
                missingCount: missing.length,
                shadowKeyCount: shadowKeys.length,
              });
            }
            for (const key of deletions) {
              const t = this.state.nextTimestamp();
              ops.push({ k: key, del: true, t });
              shadowUpdates.set(key, { t, h: "__del__" });
            }
          }
          cloudSyncLog.debug("Namespace collected", {
            namespace,
            category: getSyncNamespaceCategory(namespace),
            dirtyScope: summarizeDirtyScope(dirtyScope),
            collectedCount: collected.size,
            upsertCount,
            deletionCount,
            suppressedDeletionCount,
          });
        }

        // Clear dirty before the network call; failures re-mark below.
        this.state.clearDirty(flushedNamespaces);
        for (const namespace of flushedNamespaces) {
          if (this.hasPendingDirtyScope(namespace)) {
            this.state.markDirty(namespace);
          }
        }

        if (ops.length === 0) {
          cloudSyncLog.debug("Flush produced no upload ops", {
            namespaces: flushedNamespaces,
          });
          this.resetFlushBackoff();
          this.clearLocalReconcileIfSettled();
          await this.pruneObsoleteDeletionMarkers();
          return;
        }

        const categories = new Set(
          flushedNamespaces.map(getSyncNamespaceCategory)
        );
        for (const category of categories) {
          syncStore.markCategorySyncing(category, "upload", true);
        }
        cloudSyncLog.debug("Uploading ops", {
          categories: Array.from(categories),
          ops: summarizeSyncOps(ops),
        });

        try {
          await this.sendOps(ops, shadowUpdates);
          const uploadedAt = new Date().toISOString();
          for (const category of categories) {
            syncStore.markCategoryUploaded(category, uploadedAt);
          }
          cloudSyncLog.debug("Upload complete", {
            categories: Array.from(categories),
            ops: summarizeSyncOps(ops),
          });
          this.resetFlushBackoff();
          this.clearLocalReconcileIfSettled();
          await this.pruneObsoleteDeletionMarkers();
          this.reportError(null);
        } catch (error) {
          for (const namespace of flushedNamespaces) {
            this.restoreDirtyScope(
              namespace,
              flushedScopes.get(namespace) ?? null
            );
          }
          throw error;
        } finally {
          for (const category of categories) {
            syncStore.markCategorySyncing(category, "upload", false);
          }
        }
      } finally {
        db?.close();
      }
    } catch (error) {
      if (!this.stopped && !isAbortError(error)) {
        this.recordFlushFailure();
        this.reportError(error, "upload");
        if (options.throwOnError) throw error;
      }
    } finally {
      releaseCrossTabLease?.();
      this.flushInFlight = false;
      if (this.flushQueued) {
        this.flushQueued = false;
        this.scheduleFlush();
      }
    }
  }

  private recordFlushFailure(): void {
    this.consecutiveFlushFailures += 1;
    const delay = Math.min(
      FLUSH_FAILURE_BACKOFF_MAX_MS,
      FLUSH_FAILURE_BACKOFF_BASE_MS *
        2 ** Math.max(0, this.consecutiveFlushFailures - 1)
    );
    this.nextFlushAllowedAt = Date.now() + delay;
  }

  private resetFlushBackoff(): void {
    this.consecutiveFlushFailures = 0;
    this.nextFlushAllowedAt = 0;
  }

  private async sendOps(
    ops: SyncOp[],
    shadowUpdates: Map<string, { t: string; h: string }>
  ): Promise<void> {
    const clientId = getSyncClientId();

    for (let offset = 0; offset < ops.length; offset += OPS_BATCH_SIZE) {
      const batch = ops.slice(offset, offset + OPS_BATCH_SIZE);
      const cursorBefore = this.state.cursor ?? 0;
      cloudSyncLog.debug("Posting ops batch", {
        batchIndex: Math.floor(offset / OPS_BATCH_SIZE) + 1,
        batchCount: Math.ceil(ops.length / OPS_BATCH_SIZE),
        cursorBefore,
        ops: summarizeSyncOps(batch),
      });
      const response = await postSyncOps(
        clientId,
        batch,
        this.abortController.signal
      );
      if (this.stopped) {
        throw new DOMException("Cloud sync stopped", "AbortError");
      }

      let acceptedCount = 0;
      const superseded: AppliedSyncOp[] = [];

      for (const result of response.results) {
        if (result.accepted) {
          acceptedCount += 1;
          const update = shadowUpdates.get(result.k);
          if (update) {
            if (update.h === "__del__") {
              this.state.deleteShadow(result.k);
            } else {
              this.state.setShadow(result.k, update);
            }
          }
        } else if (result.winner) {
          // Another writer won this key; converge to the winning entry.
          superseded.push({
            k: result.k,
            v: result.winner.v,
            del: result.winner.del,
            t: result.winner.t,
          });
          this.state.observeTimestamp(result.winner.t);
        }
      }

      if (superseded.length > 0) {
        await this.applyRemoteOps(superseded);
      }
      cloudSyncLog.debug("Ops batch response received", {
        seq: response.seq,
        acceptedCount,
        supersededCount: superseded.length,
        cursorBefore,
        cursorGap: response.seq - cursorBefore !== acceptedCount,
      });

      // Advance the cursor only when our accepted ops are provably the only
      // writes since our last known seq; otherwise pull the gap.
      if (response.seq - cursorBefore === acceptedCount) {
        this.state.setCursor(response.seq);
      } else {
        void this.pull();
      }
    }
  }

  // -------------------------------------------------------------------------
  // Pull / bootstrap / realtime
  // -------------------------------------------------------------------------

  async pull(options: { throwOnError?: boolean } = {}): Promise<void> {
    if (this.stopped) return;
    if (this.pullInFlight) {
      cloudSyncLog.debug("Pull already in flight; reusing request");
      return this.pullInFlight;
    }

    const run = (async () => {
      const syncStore = useCloudSyncStore.getState();
      syncStore.setCheckingRemote(true);
      try {
        const since = this.state.cursor ?? 0;
        cloudSyncLog.debug("Pull started", { since });
        const response = await getSyncChanges(
          since,
          this.abortController.signal
        );
        if (this.stopped) return;
        if (response.snapshotRequired) {
          cloudSyncLog.debug("Pull requires snapshot", {
            since,
            seq: response.seq,
          });
          await this.applySnapshot(false);
          return;
        }
        if (response.ops && response.ops.length > 0) {
          cloudSyncLog.debug("Pull received ops", {
            seq: response.seq,
            ops: summarizeSyncOps(response.ops),
          });
          await this.applyRemoteOps(response.ops);
        } else {
          cloudSyncLog.debug("Pull found no remote ops", { seq: response.seq });
        }
        this.state.setCursor(response.seq);
        cloudSyncLog.debug("Pull complete", { seq: response.seq });
        this.reportError(null);
      } catch (error) {
        if (this.stopped || isAbortError(error)) return;
        if (options.throwOnError) throw error;
        this.reportError(error, "download");
      } finally {
        syncStore.setCheckingRemote(false);
        this.pullInFlight = null;
      }
    })();

    this.pullInFlight = run;
    return run;
  }

  private async bootstrap(): Promise<void> {
    await this.applySnapshot(false);
  }

  /**
   * Fetch the full snapshot and apply entries. With `force`, every entry is
   * applied regardless of the shadow (cloud wins); otherwise entries whose
   * timestamp matches the shadow are skipped.
   */
  async applySnapshot(force: boolean): Promise<void> {
    const snapshot = await getSyncSnapshot({
      signal: this.abortController.signal,
    });
    if (this.stopped) return;
    const ops: SyncOp[] = [];

    for (const [key, entry] of Object.entries(snapshot.entries)) {
      if (!getSyncKeyNamespace(key)) continue;
      const shadow = this.state.getShadow(key);
      if (!force && shadow && shadow.t === entry.t) continue;
      ops.push(this.entryToOp(key, entry));
    }

    if (ops.length > 0) {
      cloudSyncLog.debug("Applying snapshot", {
        force,
        seq: snapshot.seq,
        entryCount: Object.keys(snapshot.entries).length,
        ops: summarizeSyncOps(ops),
      });
      await this.applyRemoteOps(ops, { force });
    } else {
      cloudSyncLog.debug("Snapshot already current", {
        force,
        seq: snapshot.seq,
        entryCount: Object.keys(snapshot.entries).length,
      });
    }
    this.state.setCursor(snapshot.seq);
  }

  /**
   * Ensure a single blob-namespace item is present in IndexedDB, re-fetching
   * from cloud when the VFS metadata/shadow says it should exist but the
   * local bytes are gone (Safari IDB loss, quota eviction, partial restore).
   */
  async ensureBlobItemLocal(
    namespace: SyncBlobNamespace,
    storeKey: string
  ): Promise<boolean> {
    if (!storeKey || this.stopped) return false;
    if (!this.isNamespaceEnabled(namespace)) {
      cloudSyncLog.debug("ensureBlobItemLocal skipped; category disabled", {
        namespace,
        storeKey,
      });
      return false;
    }
    const codec = SYNC_CODECS[namespace];
    if (!isBlobCodec(codec)) return false;

    const syncKey = `${namespace}/item:${storeKey}`;
    const db = await ensureIndexedDBInitialized();
    try {
      const existing = await readStoreItemsByKeys(db, codec.storeName, [
        storeKey,
      ]);
      if (existing.length > 0) return true;

      cloudSyncLog.debug("Local blob missing; fetching from cloud", {
        namespace,
        storeKey,
      });
      const snapshot = await getSyncSnapshot({
        signal: this.abortController.signal,
        prefix: syncKey,
      });
      if (this.stopped) return false;

      const entry = snapshot.entries[syncKey];
      if (!entry || entry.del) {
        cloudSyncLog.warn("Cloud blob entry missing for local file", {
          namespace,
          storeKey,
        });
        return false;
      }

      await this.applyRemoteOps([this.entryToOp(syncKey, entry)], {
        force: true,
      });

      const restored = await readStoreItemsByKeys(db, codec.storeName, [
        storeKey,
      ]);
      return restored.length > 0;
    } catch (error) {
      if (this.stopped || isAbortError(error)) return false;
      cloudSyncLog.error("ensureBlobItemLocal failed", {
        namespace,
        storeKey,
        error,
      });
      return false;
    } finally {
      db.close();
    }
  }

  private entryToOp(key: string, entry: SyncKvEntry): SyncOp {
    return {
      k: key,
      ...(entry.del ? { del: true } : { v: entry.v }),
      t: entry.t,
      seq: entry.seq,
    };
  }

  handleRealtimeEvent(event: SyncOpsRealtimeEvent): void {
    if (this.stopped) return;
    const cursor = this.state.cursor ?? 0;
    if (event.seq <= cursor) {
      cloudSyncLog.debug("Realtime event ignored; already current", {
        eventSeq: event.seq,
        cursor,
      });
      return;
    }

    if (event.c === getSyncClientId()) {
      // Our own write echoed back. The shadow already reflects it, but only
      // fast-forward when nothing happened in between.
      if (event.ops && cursor + event.ops.length === event.seq) {
        cloudSyncLog.debug("Realtime echo fast-forwarded cursor", {
          eventSeq: event.seq,
          cursor,
          opCount: event.ops.length,
        });
        this.state.setCursor(event.seq);
      } else {
        cloudSyncLog.debug("Realtime echo has cursor gap; pulling", {
          eventSeq: event.seq,
          cursor,
        });
        void this.pull();
      }
      return;
    }

    if (event.ops && cursor + event.ops.length === event.seq) {
      cloudSyncLog.debug("Realtime event applying inline", {
        eventSeq: event.seq,
        cursor,
        ops: summarizeSyncOps(event.ops),
      });
      void (async () => {
        try {
          await this.applyRemoteOps(event.ops!);
          this.state.setCursor(event.seq);
        } catch (error) {
          this.reportError(error, "realtime apply");
          void this.pull();
        }
      })();
    } else {
      cloudSyncLog.debug("Realtime event has cursor gap; pulling", {
        eventSeq: event.seq,
        cursor,
        hasInlineOps: Boolean(event.ops),
      });
      void this.pull();
    }
  }

  // -------------------------------------------------------------------------
  // Remote op application
  // -------------------------------------------------------------------------

  async applyRemoteOps(
    ops: SyncOp[],
    options: { force?: boolean } = {}
  ): Promise<void> {
    const clientId = getSyncClientId();
    const byNamespace = new Map<SyncNamespace, AppliedSyncOp[]>();
    let skippedOwnCount = 0;
    let skippedAlreadyAppliedCount = 0;

    for (const op of ops) {
      this.state.observeTimestamp(op.t);
      const namespace = getSyncKeyNamespace(op.k);
      if (!namespace) continue;

      if (op.c === clientId) {
        skippedOwnCount += 1;
        continue; // own op; shadow already updated on POST
      }

      const shadow = this.state.getShadow(op.k);
      // Force downloads must re-enter appliers even when the shadow timestamp
      // already matches — blob namespaces verify IndexedDB presence and may
      // need to re-hydrate missing local bytes.
      if (!options.force && shadow && shadow.t === op.t) {
        skippedAlreadyAppliedCount += 1;
        continue; // already applied
      }

      if (!byNamespace.has(namespace)) {
        byNamespace.set(namespace, []);
      }
      byNamespace.get(namespace)!.push({
        k: op.k,
        v: op.v,
        del: op.del,
        t: op.t,
      });
    }

    if (byNamespace.size === 0) {
      cloudSyncLog.debug("Remote ops skipped", {
        ops: summarizeSyncOps(ops),
        skippedOwnCount,
        skippedAlreadyAppliedCount,
      });
      return;
    }
    cloudSyncLog.debug("Applying remote ops", {
      ops: summarizeSyncOps(ops),
      namespaceCount: byNamespace.size,
      skippedOwnCount,
      skippedAlreadyAppliedCount,
    });

    const orderedNamespaces = NAMESPACE_APPLY_ORDER.filter((ns) =>
      byNamespace.has(ns)
    );
    await this.waitForNamespacesReady(
      orderedNamespaces.filter((namespace) =>
        this.isNamespaceEnabled(namespace)
      )
    );
    const needsDb = orderedNamespaces.some(
      (ns) => SYNC_CODECS[ns].usesIndexedDb
    );
    const db = needsDb ? await ensureIndexedDBInitialized() : undefined;
    const ctx: CodecContext = { db };
    const syncStore = useCloudSyncStore.getState();

    try {
      for (const namespace of orderedNamespaces) {
        if (!this.isNamespaceEnabled(namespace)) {
          cloudSyncLog.debug("Remote namespace skipped; category disabled", {
            namespace,
            category: getSyncNamespaceCategory(namespace),
          });
          continue;
        }
        const namespaceOps = byNamespace.get(namespace)!;
        const category = getSyncNamespaceCategory(namespace);
        cloudSyncLog.debug("Applying remote namespace", {
          namespace,
          category,
          ops: summarizeSyncOps(namespaceOps),
        });
        syncStore.markCategorySyncing(category, "download", true);
        this.applyingNamespaces.add(namespace);
        try {
          if (isSyncBlobNamespace(namespace)) {
            await this.applyBlobOps(namespace, namespaceOps, ctx);
          } else {
            const result = await SYNC_CODECS[namespace].apply(
              namespaceOps,
              ctx
            );
            for (const op of namespaceOps) {
              if (op.del) {
                this.state.deleteShadow(op.k);
              } else {
                this.state.setShadow(op.k, { t: op.t, h: hashDoc(op.v) });
              }
            }
            // A codec can reject an op when a newer local value won an
            // app-level merge (e.g. bookshelf progress updatedAt LWW). The
            // shadow above still records the rejected remote value, so it now
            // differs from local — re-mark the namespace dirty so the next
            // flush re-uploads the local winner and re-converges peers.
            if (result?.rejectedKeys && result.rejectedKeys.length > 0) {
              cloudSyncLog.debug("Remote namespace had locally rejected keys", {
                namespace,
                rejectedCount: result.rejectedKeys.length,
              });
              this.markDirty(namespace);
            }
          }
          clearDeletionMarkersForKeys(
            namespaceOps.filter((op) => !op.del).map((op) => op.k)
          );
          syncStore.markCategoryApplied(category, new Date().toISOString());
        } catch (error) {
          if (this.stopped || isAbortError(error)) throw error;
          cloudSyncLog.error("Failed to apply remote namespace", {
            namespace,
            error,
          });
        } finally {
          this.applyingNamespaces.delete(namespace);
          syncStore.markCategorySyncing(category, "download", false);
        }
      }
    } finally {
      db?.close();
    }
    await this.pruneObsoleteDeletionMarkers();
  }

  private async applyBlobOps(
    namespace: SyncNamespace,
    ops: AppliedSyncOp[],
    ctx: CodecContext
  ): Promise<void> {
    const codec = SYNC_CODECS[namespace];
    if (!isBlobCodec(codec)) return;
    const syncStore = useCloudSyncStore.getState();

    const prefix = `${namespace}/item:`;
    const deletes: string[] = [];
    const downloads: Array<{
      op: AppliedSyncOp;
      contentHash: string;
      url: string;
      size: number;
    }> = [];
    const maybeLocal: Array<{
      op: AppliedSyncOp;
      contentHash: string;
      url: string;
      size: number;
      storeKey: string;
    }> = [];

    for (const op of ops) {
      if (!op.k.startsWith(prefix)) continue;
      if (op.del) {
        deletes.push(op.k.slice(prefix.length));
        this.state.deleteShadow(op.k);
        continue;
      }
      const ref = getSyncBlobRef(op.v);
      if (!ref) continue;
      const contentHash = ref.sha256 || ref.sig || "";
      const shadow = this.state.getShadow(op.k);
      if (contentHash && shadow?.h === contentHash) {
        // Shadow says we already have these bytes — but IndexedDB can lose
        // them (Safari, quota, partial wipe) while the shadow survives.
        // Verify presence before skipping the download.
        maybeLocal.push({
          op,
          contentHash,
          url: ref.url,
          size: ref.size,
          storeKey: op.k.slice(prefix.length),
        });
        continue;
      }
      downloads.push({ op, contentHash, url: ref.url, size: ref.size });
    }

    if (maybeLocal.length > 0) {
      const db = ctx.db;
      if (!db) {
        downloads.push(...maybeLocal);
      } else {
        const present = await readStoreItemsByKeys(
          db,
          codec.storeName,
          maybeLocal.map((item) => item.storeKey)
        );
        const presentKeys = new Set(present.map((item) => item.key));
        for (const item of maybeLocal) {
          if (presentKeys.has(item.storeKey)) {
            this.state.setShadow(item.op.k, {
              t: item.op.t,
              h: item.contentHash,
            });
          } else {
            cloudSyncLog.warn(
              "Blob shadow matched but local content missing; re-downloading",
              { namespace, key: item.op.k }
            );
            downloads.push(item);
          }
        }
      }
    }

    if (deletes.length > 0) {
      cloudSyncLog.debug("Applying blob deletions", {
        namespace,
        deleteCount: deletes.length,
      });
      await codec.deleteItems(deletes, ctx);
    }

    if (downloads.length > 0) {
      cloudSyncLog.debug("Downloading blob items", {
        namespace,
        downloadCount: downloads.length,
        totalBytes: downloads.reduce(
          (sum, download) => sum + Math.max(0, download.size || 0),
          0
        ),
      });
      const urls = await resolveBlobDownloadUrls(
        downloads.map((d) => ({ url: d.url, size: d.size })),
        this.abortController.signal
      );
      const items: StoreItemWithKey[] = [];
      const totalDownloadBytes = downloads.reduce(
        (sum, download) => sum + Math.max(0, download.size || 0),
        0
      );
      let completedDownloadBytes = 0;
      const category = getSyncNamespaceCategory(namespace);
      const emitProgress = (loadedBytes: number) => {
        syncStore.markCategoryDownloadProgress(
          category,
          totalDownloadBytes > 0 ? (loadedBytes / totalDownloadBytes) * 100 : 0
        );
      };
      emitProgress(0);

      // Blob store keys are content UUIDs; resolve display filenames from the
      // files-store metadata (may be empty on a fresh device — falls back to
      // the category label in the UI).
      const namesByUuid = new Map<string, string>();
      for (const item of Object.values(useFilesStore.getState().items)) {
        if (item.uuid && item.name) namesByUuid.set(item.uuid, item.name);
      }

      for (let index = 0; index < downloads.length; index += 1) {
        const { op, contentHash, size } = downloads[index];
        const storeKey = op.k.slice(prefix.length);
        syncStore.markCategoryDownloadItem(
          category,
          namesByUuid.get(storeKey) ?? null
        );
        const downloadUrl = urls[index];
        if (!downloadUrl) {
          cloudSyncLog.warn("Blob download URL missing", { namespace });
          completedDownloadBytes += Math.max(0, size || 0);
          emitProgress(completedDownloadBytes);
          continue;
        }
        try {
          const item = (await downloadBlobItem(downloadUrl, {
            expectedBytes: size,
            signal: this.abortController.signal,
            onProgress: (progress) => {
              emitProgress(completedDownloadBytes + progress.loadedBytes);
            },
          })) as StoreItemWithKey;
          if (
            item &&
            typeof item === "object" &&
            typeof item.key === "string"
          ) {
            items.push(item);
            this.state.setShadow(op.k, {
              t: op.t,
              h: contentHash || (await sha256Json(item)),
            });
          }
        } catch (error) {
          if (this.stopped || isAbortError(error)) throw error;
          cloudSyncLog.error("Blob download failed", { namespace, error });
        } finally {
          completedDownloadBytes += Math.max(0, size || 0);
          emitProgress(completedDownloadBytes);
        }
      }
      if (items.length > 0) {
        cloudSyncLog.debug("Writing downloaded blob items", {
          namespace,
          itemCount: items.length,
        });
        await codec.putItems(items, ctx);
      }
    }

    if ((deletes.length > 0 || downloads.length > 0) && codec.afterApply) {
      await codec.afterApply(ctx);
    }
  }

  // -------------------------------------------------------------------------
  // Force sync (Control Panels)
  // -------------------------------------------------------------------------

  async forceUpload(): Promise<void> {
    cloudSyncLog.debug("Force upload requested");
    await this.waitForNamespacesReady(
      SYNC_NAMESPACES.filter((namespace) => this.isNamespaceEnabled(namespace))
    );
    await this.flush({ force: true, throwOnError: true });
  }

  async forceDownload(): Promise<void> {
    const syncStore = useCloudSyncStore.getState();
    cloudSyncLog.debug("Force download requested");
    syncStore.setCheckingRemote(true);
    try {
      await this.applySnapshot(true);
      this.reportError(null);
    } finally {
      syncStore.setCheckingRemote(false);
    }
  }

  /**
   * Manual backup restore is a local-state restore first. Promote the restored
   * local snapshot to Sync v2 before normal bootstrap can pull the server over it.
   */
  async restoreLocalStateToCloud(
    options: RestoreLocalStateToCloudOptions = {}
  ): Promise<RestoreLocalStateToCloudResult> {
    if (this.stopped) {
      throw new DOMException("Cloud sync stopped", "AbortError");
    }

    const requested = options.namespaces
      ? new Set(options.namespaces)
      : new Set<SyncNamespace>(SYNC_NAMESPACES);
    const namespaces = NAMESPACE_APPLY_ORDER.filter((namespace) =>
      requested.has(namespace)
    );
    if (namespaces.length === 0) {
      return { seq: this.state.cursor ?? 0, uploaded: 0, deleted: 0 };
    }

    await this.waitForNamespacesReady(namespaces);

    const syncStore = useCloudSyncStore.getState();
    const categories = new Set(namespaces.map(getSyncNamespaceCategory));
    for (const category of categories) {
      syncStore.markCategorySyncing(category, "upload", true);
    }

    const needsDb = namespaces.some((ns) => SYNC_CODECS[ns].usesIndexedDb);
    const db = needsDb ? await ensureIndexedDBInitialized() : undefined;
    const ctx: CodecContext = { db };
    let uploaded = 0;
    let deleted = 0;

    try {
      cloudSyncLog.debug("Manual restore promotion started", { namespaces });
      const snapshot = await getSyncSnapshot({
        signal: this.abortController.signal,
      });
      if (this.stopped) {
        throw new DOMException("Cloud sync stopped", "AbortError");
      }

      // Drop stale cursor/shadow restored from a backup. The server snapshot is
      // only used as the deletion baseline; it must not be applied locally.
      await this.state.reset();
      for (const entry of Object.values(snapshot.entries)) {
        this.state.observeTimestamp(entry.t);
      }
      this.state.setCursor(snapshot.seq);

      const ops: SyncOp[] = [];
      const shadowUpdates = new Map<string, { t: string; h: string }>();
      const localKeys = new Set<string>();

      for (const namespace of namespaces) {
        const codec = SYNC_CODECS[namespace];
        const collected = await codec.collect(ctx);
        clearDeletionMarkersForKeys(collected.keys());
        for (const key of collected.keys()) {
          localKeys.add(key);
        }

        if (isSyncBlobNamespace(namespace)) {
          const pendingUploads: BlobUploadItem[] = [];
          const pendingTimestamps = new Map<string, string>();
          let itemIndex = 0;
          for (const [key, item] of collected) {
            if (itemIndex > 0 && itemIndex % BLOB_HASH_YIELD_INTERVAL === 0) {
              await yieldToMainThread();
              if (this.stopped) {
                throw new DOMException("Cloud sync stopped", "AbortError");
              }
            }
            itemIndex += 1;
            const sha256 = await sha256Json(item);
            pendingUploads.push({ key, sha256, item });
            pendingTimestamps.set(key, this.state.nextTimestamp());
          }

          if (pendingUploads.length > 0) {
            const category = getSyncNamespaceCategory(namespace);
            syncStore.markCategoryUploadProgress(category, 0);
            const refs = await uploadBlobItems(pendingUploads, {
              signal: this.abortController.signal,
              onProgress: (progress) => {
                syncStore.markCategoryUploadProgress(
                  category,
                  progress.percentage
                );
              },
            });
            for (const upload of pendingUploads) {
              const ref = refs.get(upload.key);
              if (!ref) continue;
              const t = pendingTimestamps.get(upload.key)!;
              ops.push({ k: upload.key, v: { blob: ref }, t });
              shadowUpdates.set(upload.key, { t, h: upload.sha256 });
              uploaded += 1;
            }
          }
        } else {
          for (const [key, doc] of collected) {
            const h = hashDoc(doc);
            const t = this.state.nextTimestamp();
            ops.push({ k: key, v: doc, t });
            shadowUpdates.set(key, { t, h });
            uploaded += 1;
          }
        }
      }

      for (const [key, entry] of Object.entries(snapshot.entries)) {
        const namespace = getSyncKeyNamespace(key);
        if (!namespace || !requested.has(namespace)) continue;
        if (localKeys.has(key) || entry.del) continue;
        const t = this.state.nextTimestamp();
        ops.push({ k: key, del: true, t });
        shadowUpdates.set(key, { t, h: "__del__" });
        deleted += 1;
      }

      if (ops.length > 0) {
        cloudSyncLog.debug("Manual restore promotion uploading ops", {
          uploaded,
          deleted,
          ops: summarizeSyncOps(ops),
        });
        await this.sendOps(ops, shadowUpdates);
      }
      await this.pruneObsoleteDeletionMarkers();

      const completedAt = new Date().toISOString();
      for (const category of categories) {
        syncStore.markCategoryUploaded(category, completedAt);
      }
      this.reportError(null);
      cloudSyncLog.debug("Manual restore promotion complete", {
        seq: this.state.cursor,
        uploaded,
        deleted,
      });
      return { seq: this.state.cursor ?? snapshot.seq, uploaded, deleted };
    } finally {
      db?.close();
      for (const category of categories) {
        syncStore.markCategorySyncing(category, "upload", false);
        syncStore.markCategoryUploadProgress(category, null);
      }
    }
  }

  // -------------------------------------------------------------------------

  private reportError(error: unknown, context?: string): void {
    if (error === null) {
      this.callbacks.onError?.(null);
      return;
    }
    const message =
      error instanceof Error ? error.message : `Sync ${context || "operation"} failed`;
    cloudSyncLog.error("Sync operation failed", {
      context: context || "sync",
      error,
    });
    this.callbacks.onError?.(message);
  }
}

// ---------------------------------------------------------------------------
// Singleton accessor
// ---------------------------------------------------------------------------

let activeEngine: CloudSyncEngine | null = null;
let engineOperation: Promise<void> = Promise.resolve();

function enqueueEngineOperation<T>(
  operation: () => Promise<T>
): Promise<T> {
  const result = engineOperation.then(operation, operation);
  engineOperation = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

export function getActiveCloudSyncEngine(): CloudSyncEngine | null {
  return activeEngine;
}

export function createCloudSyncEngine(
  username: string,
  callbacks?: EngineStatusCallbacks
): Promise<CloudSyncEngine> {
  return enqueueEngineOperation(async () => {
    const previousEngine = activeEngine;
    activeEngine = null;
    if (previousEngine) await previousEngine.stop();
    const nextEngine = await CloudSyncEngine.create(username, callbacks);
    activeEngine = nextEngine;
    return nextEngine;
  });
}

export function destroyCloudSyncEngine(
  options: { markLocalReconcileRequired?: boolean } = {}
): Promise<void> {
  return enqueueEngineOperation(async () => {
    const engine = activeEngine;
    activeEngine = null;
    if (engine) await engine.stop(options);
  });
}
