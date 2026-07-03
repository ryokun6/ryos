---
name: create-store
description: Create or modify ryOS Zustand stores following repo conventions — persist middleware, partialize, versioned migrations, the debounced write-behind storage adapter for large slices, and cloud-sync deletion tombstones. Use when adding state management, creating a use*Store, persisting app state, or wiring a store into cloud sync.
---

# Creating a ryOS Store

ryOS state lives in Zustand stores under `src/stores/`, named `use<Name>Store.ts`. Most persist to `localStorage` via the `persist` middleware. This skill covers the conventions: persistence, partialize, versioned migrations, the debounced storage adapter, and cloud-sync tombstones.

## Quick Start Checklist

```
- [ ] 1. Create src/stores/use<Name>Store.ts
- [ ] 2. Define State interface (data + actions together)
- [ ] 3. create<State>()(persist((set, get) => ({...}), { name: "ryos:<name>" }))
- [ ] 4. Add version + migrate if the shape may evolve
- [ ] 5. Use the debounced storage adapter for large/hot slices
- [ ] 6. partialize to persist only what's needed
- [ ] 7. If synced: mark deletions as tombstones via useCloudSyncStore
- [ ] 8. Read in non-React code with useXStore.getState()
```

## Basic Store

Keep data and actions in one interface. Actions use `set`/`get`. Generate IDs with `crypto.randomUUID()`.

```typescript
import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface Item {
  id: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}

interface MyState {
  items: Item[];
  addItem: (content: string) => string;
  updateItem: (id: string, updates: Partial<Omit<Item, "id" | "createdAt">>) => void;
  deleteItem: (id: string) => void;
  clearAll: () => void;
}

export const useMyStore = create<MyState>()(
  persist(
    (set, get) => ({
      items: [],
      addItem: (content) => {
        const id = crypto.randomUUID();
        const now = Date.now();
        set((s) => ({ items: [...s.items, { id, content, createdAt: now, updatedAt: now }] }));
        return id;
      },
      updateItem: (id, updates) =>
        set((s) => ({
          items: s.items.map((it) =>
            it.id === id ? { ...it, ...updates, updatedAt: Date.now() } : it
          ),
        })),
      deleteItem: (id) => set((s) => ({ items: s.items.filter((it) => it.id !== id) })),
      clearAll: () => set({ items: [] }),
    }),
    {
      name: "ryos:my-feature", // every app-owned storage key uses `ryos:`
    }
  )
);
```

### Accessing stores

- **In React:** `const items = useMyStore((s) => s.items);` (selector — avoid subscribing to the whole store).
- **Outside React** (tool handlers, utils, other stores): `useMyStore.getState()` / `useMyStore.getState().addItem(...)`.

## Persisted Config Options

Inside the second `persist` argument:

| Option | Use |
|--------|-----|
| `name` | Required. Namespaced storage key, `"ryos:<feature>"`. |
| `partialize` | Persist only the needed fields (omit transient UI/derived state). |
| `version` + `migrate` | Required when the persisted shape can change over time. |
| `storage` | Use the debounced adapter for large/hot slices (see below). |

### partialize

```typescript
partialize: (state) => ({
  items: state.items,
  // omit transient fields like isLoading, selectedId, etc.
}),
```

### Versioned migrations

Bump `version` whenever the persisted shape changes; handle older payloads in `migrate`. Reference: `useChatsStore.ts`.

```typescript
const STORE_VERSION = 2;

// ...inside persist config:
version: STORE_VERSION,
migrate: (persistedState, version) => {
  if (version < 2) {
    // transform old shape → new shape
  }
  return persistedState as MyState;
},
```

## Debounced Storage Adapter (large / hot slices)

`createJSONStorage(() => localStorage)` re-serializes the entire partialized slice synchronously on **every** mutation. For large or frequently-written slices (chat history, Files VFS, iPod library), use the write-behind adapter from `src/utils/debouncedPersistStorage.ts`:

```typescript
import { createDebouncedPersistStorage } from "@/utils/debouncedPersistStorage";

// ...inside persist config:
storage: createDebouncedPersistStorage(),
```

It keeps localStorage authoritative but batches writes per quiet window and flushes on `pagehide`/tab-hidden. Flows that read raw localStorage keys directly (system reset, manual backup) must call `flushDebouncedPersistWrites()` first. Small slices (settings, a handful of notes) don't need this — plain `name` is fine.

## IndexedDB Storage Adapter (slices that overflow the localStorage quota)

localStorage has a hard ~5–10MB per-origin quota; a slice that inlines large
binary-ish data (e.g. Soundboard recordings store base64 audio in `boards`)
will silently throw `QuotaExceededError` and lose writes (historically crashing
on mobile Safari). For those, persist to IndexedDB via
`src/utils/indexedDBPersistStorage.ts`:

```typescript
import { createIndexedDBPersistStorage } from "@/utils/indexedDBPersistStorage";

// ...inside persist config:
storage: createIndexedDBPersistStorage(),
```

It mirrors the debounced localStorage adapter (write-behind, read-your-writes,
shared `flushDebouncedPersistWrites()`/`haltDebouncedPersistWrites()` hooks) but
hydrates **asynchronously**. Two consequences:

- Records live in the `persisted_state` IndexedDB object store, keyed by the
  persist `name`. On first read it transparently migrates the slice's legacy
  localStorage value, then drops the localStorage key.
- Because hydration is async, gate any "seed defaults if empty" logic on
  `useXStore.persist.hasHydrated()` / `onFinishHydration` so you don't clobber
  restored data. Avoid for boot-critical stores read synchronously via
  `getState()` before hydration completes.

Manual backup must `await settlePersistWrites()` (not just the sync flush)
before reading the raw `persisted_state` records, and the store name must be
listed in the backup's IndexedDB store set.

### Normalized IndexedDB persistence

If a slice contains a large entity collection or binary payloads, use
`createSplitIndexedDBPersistStorage` from
`src/utils/splitIndexedDBPersistStorage.ts`. It keeps scalar metadata in
`persisted_state`, migrates old monolithic snapshots on hydration, and writes
changed entities to dedicated object stores. Add each object store to
`STORES`, bump `DB_VERSION`, include it in
`MANUAL_BACKUP_INDEXEDDB_STORES`, and cover migration + row deletion in tests.
Soundboard, Chats, TextEdit, and Files are the reference implementations.

## Cloud Sync: Deletion Tombstones

If the store's data participates in cloud sync, a plain local delete isn't enough — the deletion must be recorded as a tombstone so other devices remove it too. Call `useCloudSyncStore.getState().markDeletedKeys(bucket, ids)` when deleting (pattern from `useStickiesStore.ts`):

```typescript
import { useCloudSyncStore } from "@/stores/useCloudSyncStore";

deleteItem: (id) => {
  set((s) => ({ items: s.items.filter((it) => it.id !== id) }));
  useCloudSyncStore.getState().markDeletedKeys("stickyNoteIds", [id]);
},

clearAll: () => {
  const ids = get().items.map((it) => it.id);
  useCloudSyncStore.getState().markDeletedKeys("stickyNoteIds", ids);
  set({ items: [] });
},
```

Use an existing `CloudSyncDeletionBucket` value (see `useCloudSyncStore.ts`); only introduce a new bucket when adding a genuinely new synced collection, and wire it through the sync engine. Stores that don't sync skip this entirely.

## Conventions Summary

- One interface holding both state and actions; export `use<Name>Store`.
- `name: "ryos:<feature>"`; `partialize` to the minimum needed.
- Add `version` + `migrate` for any shape that can evolve.
- Debounced storage for large/hot slices; plain otherwise.
- Synced collections must tombstone deletions via `useCloudSyncStore`.
- `crypto.randomUUID()` for ids; track `createdAt`/`updatedAt` where useful.
- Read outside React with `getState()`.

## Testing

Store logic (reducers, migrations, tombstone calls) is unit-testable without a server — see the `write-tests` skill and examples like `tests/test-stickies-tool-reducer.test.ts` and `tests/test-debounced-persist-storage.test.ts`. Register new unit suites in the `test:unit` script.
