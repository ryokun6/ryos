import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createIndexedDBPersistStorage } from "@/utils/indexedDBPersistStorage";
import { STORAGE_KEYS } from "@/utils/storageKeys";
import { useCloudSyncStore } from "@/stores/useCloudSyncStore";
import {
  DEFAULT_CURRENCY,
  DEFAULT_TAG_COLORS,
  type StuffItem,
  type StuffItemDraft,
  type StuffPrices,
  type StuffShelfView,
  type StuffStatus,
  type StuffTag,
} from "@/apps/stuff/types";
import {
  dataUrlToBlob,
  deleteStuffCoverBlob,
  migrateImageDataUrlToCoverBlob,
  putStuffCoverBlob,
} from "@/apps/stuff/utils/stuffCoverBlobs";
import {
  buildStuffShelfExport,
  mergeStuffShelfImport,
  stringifyStuffShelfExport,
  type ImportStuffShelfCounts,
} from "@/apps/stuff/utils/stuffShelfImportExport";

const STUFF_STORE_VERSION = 5;

/** Canonical English names — UI labels come from `apps.stuff.defaultTags.*`. */
const DEFAULT_TAGS: Omit<StuffTag, "id" | "createdAt">[] = [
  { name: "Kitchen", color: DEFAULT_TAG_COLORS[0] },
  { name: "Electronics", color: DEFAULT_TAG_COLORS[1] },
  { name: "Clothing", color: DEFAULT_TAG_COLORS[2] },
  { name: "Books", color: DEFAULT_TAG_COLORS[3] },
  { name: "Furniture", color: DEFAULT_TAG_COLORS[5] },
  { name: "CD", color: DEFAULT_TAG_COLORS[6] },
  { name: "Other", color: DEFAULT_TAG_COLORS[4] },
];

/** Stable ids so empty devices that seed defaults don't fight Sync v2 peers. */
export function defaultStuffTagId(name: string): string {
  return `stuff-default:${name.trim().toLowerCase()}`;
}

function createDefaultTags(): StuffTag[] {
  const now = Date.now();
  return DEFAULT_TAGS.map((tag, index) => ({
    ...tag,
    id: defaultStuffTagId(tag.name),
    createdAt: now + index,
  }));
}

function tagMatchesDefault(tag: StuffTag, defaultName: string): boolean {
  const slug = defaultName.trim().toLowerCase();
  return (
    tag.id === defaultStuffTagId(defaultName) ||
    tag.name.trim().toLowerCase() === slug
  );
}

/** True when a tag is one of the seeded canonical defaults (by id or name). */
export function isDefaultStuffTag(tag: StuffTag): boolean {
  return DEFAULT_TAGS.some((def) => tagMatchesDefault(tag, def.name));
}

/**
 * Insert any missing seeded default tags (Furniture, CD, …) without wiping
 * custom tags. New defaults land before Other when present.
 */
export function ensureDefaultStuffTags(tags: StuffTag[]): StuffTag[] {
  let next = tags;
  const now = Date.now();
  for (const def of DEFAULT_TAGS) {
    if (next.some((tag) => tagMatchesDefault(tag, def.name))) continue;
    const insert: StuffTag = {
      ...def,
      id: defaultStuffTagId(def.name),
      createdAt: now,
    };
    const otherIndex = next.findIndex((tag) => tagMatchesDefault(tag, "Other"));
    next =
      otherIndex === -1
        ? [...next, insert]
        : [...next.slice(0, otherIndex), insert, ...next.slice(otherIndex)];
  }
  return next;
}

/** @deprecated Prefer {@link ensureDefaultStuffTags}. Kept for older tests/imports. */
export function ensureFurnitureTag(tags: StuffTag[]): StuffTag[] {
  return ensureDefaultStuffTags(tags);
}

function emptyPrices(): StuffPrices {
  return { currency: DEFAULT_CURRENCY };
}

function normalizeItem(draft: StuffItemDraft, existing?: StuffItem): StuffItem {
  const now = Date.now();
  // Only fall back to Untitled when creating/committing an empty title.
  // Callers that edit text live should keep a local draft and commit on blur
  // (trimming then) so spaces are not stripped mid-keystroke.
  const nextTitle =
    draft.title !== undefined
      ? draft.title.trim()
      : (existing?.title ?? "").trim();

  const nextCoverBlobId =
    draft.coverBlobId !== undefined
      ? draft.coverBlobId || undefined
      : existing?.coverBlobId;

  // Prefer blob covers: when a coverBlobId is present, drop legacy data URLs.
  let nextImageDataUrl =
    draft.imageDataUrl !== undefined
      ? draft.imageDataUrl || undefined
      : existing?.imageDataUrl;
  if (nextCoverBlobId) {
    nextImageDataUrl = undefined;
  }

  return {
    id: existing?.id ?? crypto.randomUUID(),
    title: nextTitle || existing?.title || "Untitled",
    notes: draft.notes ?? existing?.notes ?? "",
    imageDataUrl: nextImageDataUrl,
    imageUrl:
      draft.imageUrl !== undefined
        ? draft.imageUrl || undefined
        : existing?.imageUrl,
    coverBlobId: nextCoverBlobId,
    barcode: draft.barcode !== undefined ? draft.barcode : existing?.barcode,
    barcodeFormat:
      draft.barcodeFormat !== undefined
        ? draft.barcodeFormat
        : existing?.barcodeFormat,
    brand: draft.brand !== undefined ? draft.brand : existing?.brand,
    productUrl:
      draft.productUrl !== undefined ? draft.productUrl : existing?.productUrl,
    tagIds: draft.tagIds ?? existing?.tagIds ?? [],
    status: draft.status ?? existing?.status ?? "stowed",
    prices: {
      ...emptyPrices(),
      ...existing?.prices,
      ...draft.prices,
    },
    quantity: Math.max(1, draft.quantity ?? existing?.quantity ?? 1),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

function clearCoverSideEffects(
  item: StuffItem | undefined,
  next: StuffItem
): void {
  const prevCoverId = item?.coverBlobId?.trim();
  const nextCoverId = next.coverBlobId?.trim();
  const coverRemoved = Boolean(prevCoverId) && !nextCoverId;
  const coverReplaced =
    Boolean(prevCoverId) && Boolean(nextCoverId) && prevCoverId !== nextCoverId;
  if ((coverRemoved || coverReplaced) && prevCoverId) {
    void deleteStuffCoverBlob(prevCoverId);
  }
}

async function ingestInlineCoverIfNeeded(
  itemId: string,
  draft: StuffItemDraft
): Promise<void> {
  const dataUrl = draft.imageDataUrl?.trim();
  if (!dataUrl || !dataUrl.startsWith("data:image/")) return;
  const blob = dataUrlToBlob(dataUrl);
  if (!blob) return;
  const coverBlobId = draft.coverBlobId?.trim() || itemId;
  await putStuffCoverBlob(coverBlobId, blob);
  useStuffStore.setState((state) => ({
    items: state.items.map((item) =>
      item.id === itemId
        ? {
            ...item,
            coverBlobId,
            imageDataUrl: undefined,
            updatedAt: Date.now(),
          }
        : item
    ),
  }));
}

interface StuffStoreState {
  items: StuffItem[];
  tags: StuffTag[];
  selectedItemId: string | null;
  selectedTagId: string | null;
  statusFilter: StuffStatus | "all";
  shelfView: StuffShelfView;
  isSidebarVisible: boolean;
  searchQuery: string;
  lastShareId: string | null;
  /** Bumped when remote cover blobs land so UI object URLs refresh. */
  coversRevision: number;
  setSelectedItemId: (id: string | null) => void;
  setSelectedTagId: (id: string | null) => void;
  setStatusFilter: (status: StuffStatus | "all") => void;
  setShelfView: (view: StuffShelfView) => void;
  setSidebarVisible: (visible: boolean) => void;
  toggleSidebarVisibility: () => void;
  setSearchQuery: (query: string) => void;
  addItem: (draft?: StuffItemDraft) => string;
  updateItem: (id: string, draft: StuffItemDraft) => void;
  deleteItem: (id: string) => void;
  addTag: (name: string, color?: string) => string;
  updateTag: (id: string, updates: Partial<Pick<StuffTag, "name" | "color">>) => void;
  deleteTag: (id: string) => void;
  setLastShareId: (id: string | null) => void;
  /**
   * Replace items/tags from Sync v2 without creating deletion markers.
   * Tag deletes also strip the id from every item (same as local deleteTag).
   */
  replaceFromSync: (snapshot: { items: StuffItem[]; tags: StuffTag[] }) => void;
  bumpCoversRevision: () => void;
  /** Portable JSON backup (covers inlined as data URLs). */
  exportShelf: () => Promise<string>;
  /**
   * Merge a shelf JSON backup into the local store (skip existing ids;
   * remap tags by name). Returns add/skip counts for toasts.
   */
  importShelf: (json: string) => ImportStuffShelfCounts;
}

export const useStuffStore = create<StuffStoreState>()(
  persist(
    (set, get) => ({
      items: [],
      // Empty until IndexedDB hydrates — seeding earlier races restored/synced tags.
      tags: [],
      selectedItemId: null,
      selectedTagId: null,
      statusFilter: "all",
      shelfView: "grid",
      isSidebarVisible: false,
      searchQuery: "",
      lastShareId: null,
      coversRevision: 0,

      setSelectedItemId: (id) => set({ selectedItemId: id }),
      setSelectedTagId: (id) => set({ selectedTagId: id }),
      setStatusFilter: (status) => set({ statusFilter: status }),
      setShelfView: (view) => set({ shelfView: view }),
      setSidebarVisible: (visible) => set({ isSidebarVisible: visible }),
      toggleSidebarVisibility: () =>
        set((state) => ({ isSidebarVisible: !state.isSidebarVisible })),
      setSearchQuery: (query) => set({ searchQuery: query }),
      setLastShareId: (id) => set({ lastShareId: id }),
      bumpCoversRevision: () =>
        set((state) => ({ coversRevision: state.coversRevision + 1 })),

      addItem: (draft = {}) => {
        const item = normalizeItem(draft);
        useCloudSyncStore.getState().clearDeletedKeys("stuffItemIds", [item.id]);
        if (item.coverBlobId) {
          useCloudSyncStore
            .getState()
            .clearDeletedKeys("stuffCoverKeys", [item.coverBlobId]);
        }
        set((state) => ({
          items: [item, ...state.items],
          selectedItemId: item.id,
        }));
        if (draft.imageDataUrl?.trim()) {
          void ingestInlineCoverIfNeeded(item.id, draft);
        }
        return item.id;
      },

      updateItem: (id, draft) => {
        let nextDraft: StuffItemDraft = { ...draft };

        // Remove cover when both display fields are cleared and no blob cover
        // is being set. Upload/paste passes coverBlobId + empty image fields —
        // must not wipe that coverBlobId (detail panel applyCoverFile).
        if (
          draft.imageDataUrl === "" &&
          draft.imageUrl === "" &&
          !draft.coverBlobId?.trim()
        ) {
          nextDraft = { ...nextDraft, coverBlobId: "" };
        }

        // Hotlink replaces local cover bytes.
        if (draft.imageUrl?.trim() && draft.imageDataUrl === "") {
          nextDraft = { ...nextDraft, coverBlobId: "" };
        }

        set((state) => {
          const items = state.items.map((item) => {
            if (item.id !== id) return item;
            const next = normalizeItem(nextDraft, item);
            clearCoverSideEffects(item, next);
            return next;
          });
          return { items };
        });

        // Legacy callers still pass imageDataUrl — migrate into the blob store.
        if (draft.imageDataUrl?.trim()) {
          void ingestInlineCoverIfNeeded(id, draft);
        }
      },

      deleteItem: (id) => {
        const existing = get().items.find((item) => item.id === id);
        useCloudSyncStore.getState().markDeletedKeys("stuffItemIds", [id]);
        if (existing?.coverBlobId) {
          void deleteStuffCoverBlob(existing.coverBlobId);
        }
        set((state) => ({
          items: state.items.filter((item) => item.id !== id),
          selectedItemId:
            state.selectedItemId === id ? null : state.selectedItemId,
        }));
      },

      addTag: (name, color) => {
        const trimmed = name.trim();
        if (!trimmed) return "";
        const existing = get().tags.find(
          (tag) => tag.name.toLowerCase() === trimmed.toLowerCase()
        );
        if (existing) return existing.id;
        const id = crypto.randomUUID();
        useCloudSyncStore.getState().clearDeletedKeys("stuffTagIds", [id]);
        const usedColors = new Set(get().tags.map((tag) => tag.color));
        const nextColor =
          color ??
          DEFAULT_TAG_COLORS.find((c) => !usedColors.has(c)) ??
          DEFAULT_TAG_COLORS[get().tags.length % DEFAULT_TAG_COLORS.length];
        set((state) => ({
          tags: [
            ...state.tags,
            { id, name: trimmed, color: nextColor, createdAt: Date.now() },
          ],
        }));
        return id;
      },

      updateTag: (id, updates) => {
        set((state) => ({
          tags: state.tags.map((tag) =>
            tag.id === id
              ? {
                  ...tag,
                  name: updates.name?.trim() || tag.name,
                  color: updates.color ?? tag.color,
                }
              : tag
          ),
        }));
      },

      deleteTag: (id) => {
        const existing = get().tags.find((tag) => tag.id === id);
        // Seeded defaults must stay available (same as ensure-on-load).
        if (existing && isDefaultStuffTag(existing)) return;
        useCloudSyncStore.getState().markDeletedKeys("stuffTagIds", [id]);
        set((state) => ({
          tags: state.tags.filter((tag) => tag.id !== id),
          selectedTagId:
            state.selectedTagId === id ? null : state.selectedTagId,
          items: state.items.map((item) => ({
            ...item,
            tagIds: item.tagIds.filter((tagId) => tagId !== id),
            updatedAt: Date.now(),
          })),
        }));
      },

      replaceFromSync: (snapshot) => {
        const prevItems = get().items;
        const nextCoverIds = new Set(
          snapshot.items
            .map((item) => item.coverBlobId?.trim())
            .filter((id): id is string => Boolean(id))
        );
        for (const item of prevItems) {
          const coverId = item.coverBlobId?.trim();
          if (!coverId || nextCoverIds.has(coverId)) continue;
          // Remote apply owns tombstones; only drop orphaned local bytes.
          void deleteStuffCoverBlob(coverId, { tombstone: false });
        }
        set({
          items: snapshot.items,
          tags: ensureDefaultStuffTags(snapshot.tags),
        });
      },

      exportShelf: async () => {
        const { tags, items } = get();
        const payload = await buildStuffShelfExport(tags, items);
        return stringifyStuffShelfExport(payload);
      },

      importShelf: (json) => {
        const result = mergeStuffShelfImport(json, {
          items: get().items,
          tags: get().tags,
        });

        const newTagIds = result.tags
          .map((tag) => tag.id)
          .filter((id) => !get().tags.some((tag) => tag.id === id));
        const newItemIds = result.items
          .map((item) => item.id)
          .filter((id) => !get().items.some((item) => item.id === id));

        if (newTagIds.length > 0) {
          useCloudSyncStore
            .getState()
            .clearDeletedKeys("stuffTagIds", newTagIds);
        }
        if (newItemIds.length > 0) {
          useCloudSyncStore
            .getState()
            .clearDeletedKeys("stuffItemIds", newItemIds);
        }
        for (const { itemId } of result.coverIngest) {
          useCloudSyncStore
            .getState()
            .clearDeletedKeys("stuffCoverKeys", [itemId]);
        }

        set({
          items: result.items,
          tags: ensureDefaultStuffTags(result.tags),
        });

        for (const { itemId, imageDataUrl } of result.coverIngest) {
          void ingestInlineCoverIfNeeded(itemId, { imageDataUrl });
        }

        return {
          addedItems: result.addedItems,
          addedTags: result.addedTags,
          skippedItems: result.skippedItems,
          skippedTags: result.skippedTags,
        };
      },
    }),
    {
      name: STORAGE_KEYS.stuff,
      version: STUFF_STORE_VERSION,
      storage: createIndexedDBPersistStorage(),
      partialize: (state) => ({
        items: state.items,
        tags: state.tags,
        selectedItemId: state.selectedItemId,
        selectedTagId: state.selectedTagId,
        statusFilter: state.statusFilter,
        shelfView: state.shelfView,
        isSidebarVisible: state.isSidebarVisible,
        lastShareId: state.lastShareId,
      }),
      migrate: (persistedState, version) => {
        const state = (persistedState ?? {}) as Partial<StuffStoreState>;
        let tags = Array.isArray(state.tags) ? state.tags : [];
        // v4 added Furniture/CD ensure for <4 only; already-v4 shelves that
        // never got CD (or deleted a default) need ensure again at v5.
        if (version < 5) {
          tags = ensureDefaultStuffTags(tags);
        }
        return {
          ...state,
          tags,
        };
      },
    }
  )
);

let didSeedDefaultTags = false;
let didMigrateCovers = false;

/**
 * After IndexedDB hydrate: insert any missing seeded defaults (Kitchen…CD…Other).
 * Must run even when tags is non-empty — migrate alone won't help already-v4
 * shelves that persisted without CD.
 */
function seedDefaultTagsIfNeeded(): void {
  if (didSeedDefaultTags) return;
  if (!useStuffStore.persist.hasHydrated()) return;
  didSeedDefaultTags = true;
  const { tags } = useStuffStore.getState();
  const next =
    tags.length === 0 ? createDefaultTags() : ensureDefaultStuffTags(tags);
  if (next === tags) return;
  const prevIds = new Set(tags.map((tag) => tag.id));
  const addedIds = next
    .filter((tag) => !prevIds.has(tag.id))
    .map((tag) => tag.id);
  if (addedIds.length > 0) {
    useCloudSyncStore.getState().clearDeletedKeys("stuffTagIds", addedIds);
  }
  useStuffStore.setState({ tags: next });
}

async function migrateLegacyCoversIfNeeded(): Promise<void> {
  if (didMigrateCovers) return;
  if (!useStuffStore.persist.hasHydrated()) return;
  didMigrateCovers = true;
  const { items } = useStuffStore.getState();
  const pending = items.filter((item) => item.imageDataUrl?.startsWith("data:image/"));
  if (pending.length === 0) return;

  const migrated = new Map<string, StuffItem>();
  for (const item of pending) {
    try {
      const result = await migrateImageDataUrlToCoverBlob(item);
      if (!result) continue;
      migrated.set(item.id, {
        ...item,
        coverBlobId: result.coverBlobId,
        imageDataUrl: undefined,
        updatedAt: Date.now(),
      });
    } catch (error) {
      console.error("[Stuff] Failed to migrate cover data URL:", error);
    }
  }
  if (migrated.size === 0) return;
  useStuffStore.setState((state) => ({
    items: state.items.map((item) => migrated.get(item.id) ?? item),
  }));
}

function runPostHydrationStuffTasks(): void {
  seedDefaultTagsIfNeeded();
  void migrateLegacyCoversIfNeeded();
}

if (typeof window !== "undefined") {
  if (useStuffStore.persist.hasHydrated()) {
    runPostHydrationStuffTasks();
  } else {
    useStuffStore.persist.onFinishHydration(() => {
      runPostHydrationStuffTasks();
    });
  }
}

export function getFilteredStuffItems(params: {
  items: StuffItem[];
  tags: StuffTag[];
  selectedTagId: string | null;
  statusFilter: StuffStatus | "all";
  searchQuery: string;
}): StuffItem[] {
  const query = params.searchQuery.trim().toLowerCase();
  return params.items.filter((item) => {
    if (params.selectedTagId && !item.tagIds.includes(params.selectedTagId)) {
      return false;
    }
    if (params.statusFilter !== "all" && item.status !== params.statusFilter) {
      return false;
    }
    if (!query) return true;
    const haystack = [
      item.title,
      item.notes,
      item.brand,
      item.barcode,
      ...item.tagIds.map(
        (tagId) => params.tags.find((tag) => tag.id === tagId)?.name ?? ""
      ),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });
}
