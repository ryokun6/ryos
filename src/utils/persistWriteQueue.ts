/**
 * Shared write-behind queue for zustand persist storage adapters.
 *
 * Both the localStorage adapter (`createDebouncedPersistStorage`) and the
 * IndexedDB adapter (`createIndexedDBPersistStorage`) defer their writes to a
 * debounce window instead of serializing on every mutation. They register a
 * flush callback here keyed by the persist `name`, so a single global flush
 * (on `pagehide` / tab-hidden, or before backup/restore/reset) drains every
 * adapter instance regardless of backing store.
 *
 * - `flushAllPersistWrites()` is synchronous: it kicks off every pending write.
 *   For localStorage that completes immediately; for IndexedDB it only *starts*
 *   the async transaction.
 * - `settleAllPersistWrites()` additionally awaits async (IndexedDB) writes, so
 *   flows that read the raw IndexedDB records (manual backup) see the latest
 *   state.
 * - `haltPersistWrites()` cancels pending writes and blocks future ones until
 *   the page reloads — used by restore/reset which rewrite storage directly and
 *   then reload.
 */

type PendingFlush = () => void;
type PendingSettle = () => Promise<void>;

const pendingFlushes = new Map<string, PendingFlush>();
const pendingSettlers = new Set<PendingSettle>();
const adapterResetters = new Set<() => void>();
let lifecycleFlushRegistered = false;
let halted = false;

/** Whether all persist writes are currently halted (until reload). */
export function isPersistWritesHalted(): boolean {
  return halted;
}

/** Record (or replace) the latest pending flush for a persist `name`. */
export function registerPendingFlush(name: string, flush: PendingFlush): void {
  pendingFlushes.set(name, flush);
}

/** Drop a pending flush once its write has been kicked off. */
export function clearPendingFlush(name: string): void {
  pendingFlushes.delete(name);
}

/**
 * Register an adapter-level settler that resolves once that adapter's in-flight
 * (async) write has committed. localStorage adapters don't need one.
 */
export function registerSettler(settle: PendingSettle): void {
  pendingSettlers.add(settle);
}

/** Register a test-only resetter that clears an adapter's in-memory state. */
export function registerAdapterResetter(reset: () => void): void {
  adapterResetters.add(reset);
}

/** Synchronously kick off every pending persist write. */
export function flushAllPersistWrites(): void {
  for (const flush of Array.from(pendingFlushes.values())) {
    flush();
  }
}

/**
 * Flush every pending write and await async (IndexedDB) writes to commit.
 * Use before reading raw IndexedDB records (manual backup).
 */
export async function settleAllPersistWrites(): Promise<void> {
  flushAllPersistWrites();
  await Promise.all(Array.from(pendingSettlers).map((settle) => settle()));
}

/**
 * Stop all further persist writes until the page reloads. Restore/reset flows
 * rewrite storage directly and then reload; without this an in-memory store
 * mutation queued during the restore window would be flushed by the lifecycle
 * handler mid-reload and clobber freshly restored data.
 */
export function haltPersistWrites(): void {
  halted = true;
  pendingFlushes.clear();
}

/** Resume persistence after a destructive flow aborts before page reload. */
export function resumePersistWrites(): void {
  halted = false;
}

/** @internal Test-only reset for Bun's shared-process test runner. */
export function resetPersistWritesForTests(): void {
  resumePersistWrites();
  for (const reset of Array.from(adapterResetters)) {
    reset();
  }
  pendingFlushes.clear();
}

/** Register the one-time lifecycle flush handlers (idempotent). */
export function ensureLifecycleFlush(): void {
  if (lifecycleFlushRegistered || typeof window === "undefined") return;
  lifecycleFlushRegistered = true;
  window.addEventListener("pagehide", flushAllPersistWrites);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      flushAllPersistWrites();
    }
  });
}
