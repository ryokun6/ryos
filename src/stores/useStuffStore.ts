import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createIndexedDBPersistStorage } from "@/utils/indexedDBPersistStorage";
import { STORAGE_KEYS } from "@/utils/storageKeys";
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

const STUFF_STORE_VERSION = 2;

const DEFAULT_TAGS: Omit<StuffTag, "id" | "createdAt">[] = [
  { name: "Kitchen", color: DEFAULT_TAG_COLORS[0] },
  { name: "Electronics", color: DEFAULT_TAG_COLORS[1] },
  { name: "Clothing", color: DEFAULT_TAG_COLORS[2] },
  { name: "Books", color: DEFAULT_TAG_COLORS[3] },
  { name: "Furniture", color: DEFAULT_TAG_COLORS[5] },
  { name: "Other", color: DEFAULT_TAG_COLORS[4] },
];

function createDefaultTags(): StuffTag[] {
  const now = Date.now();
  return DEFAULT_TAGS.map((tag, index) => ({
    ...tag,
    id: crypto.randomUUID(),
    createdAt: now + index,
  }));
}

/** Insert Furniture into persisted tags when missing (v1 → v2). */
export function ensureFurnitureTag(tags: StuffTag[]): StuffTag[] {
  if (tags.some((tag) => tag.name.toLowerCase() === "furniture")) {
    return tags;
  }
  const furnitureDefault = DEFAULT_TAGS.find((tag) => tag.name === "Furniture");
  if (!furnitureDefault) return tags;
  const furniture: StuffTag = {
    ...furnitureDefault,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
  };
  const otherIndex = tags.findIndex(
    (tag) => tag.name.toLowerCase() === "other"
  );
  if (otherIndex === -1) {
    return [...tags, furniture];
  }
  return [
    ...tags.slice(0, otherIndex),
    furniture,
    ...tags.slice(otherIndex),
  ];
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
  return {
    id: existing?.id ?? crypto.randomUUID(),
    title: nextTitle || existing?.title || "Untitled",
    notes: draft.notes ?? existing?.notes ?? "",
    imageDataUrl:
      draft.imageDataUrl !== undefined
        ? draft.imageDataUrl || undefined
        : existing?.imageDataUrl,
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

interface StuffStoreState {
  items: StuffItem[];
  tags: StuffTag[];
  selectedItemId: string | null;
  selectedTagId: string | null;
  statusFilter: StuffStatus | "all";
  shelfView: StuffShelfView;
  searchQuery: string;
  lastShareId: string | null;
  setSelectedItemId: (id: string | null) => void;
  setSelectedTagId: (id: string | null) => void;
  setStatusFilter: (status: StuffStatus | "all") => void;
  setShelfView: (view: StuffShelfView) => void;
  setSearchQuery: (query: string) => void;
  addItem: (draft?: StuffItemDraft) => string;
  updateItem: (id: string, draft: StuffItemDraft) => void;
  deleteItem: (id: string) => void;
  addTag: (name: string, color?: string) => string;
  updateTag: (id: string, updates: Partial<Pick<StuffTag, "name" | "color">>) => void;
  deleteTag: (id: string) => void;
  setLastShareId: (id: string | null) => void;
}

export const useStuffStore = create<StuffStoreState>()(
  persist(
    (set, get) => ({
      items: [],
      tags: createDefaultTags(),
      selectedItemId: null,
      selectedTagId: null,
      statusFilter: "all",
      shelfView: "grid",
      searchQuery: "",
      lastShareId: null,

      setSelectedItemId: (id) => set({ selectedItemId: id }),
      setSelectedTagId: (id) => set({ selectedTagId: id }),
      setStatusFilter: (status) => set({ statusFilter: status }),
      setShelfView: (view) => set({ shelfView: view }),
      setSearchQuery: (query) => set({ searchQuery: query }),
      setLastShareId: (id) => set({ lastShareId: id }),

      addItem: (draft = {}) => {
        const item = normalizeItem(draft);
        set((state) => ({
          items: [item, ...state.items],
          selectedItemId: item.id,
        }));
        return item.id;
      },

      updateItem: (id, draft) => {
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id ? normalizeItem(draft, item) : item
          ),
        }));
      },

      deleteItem: (id) => {
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
        lastShareId: state.lastShareId,
      }),
      migrate: (persistedState, version) => {
        const state = (persistedState ?? {}) as Partial<StuffStoreState>;
        if (version < 2) {
          return {
            ...state,
            tags: ensureFurnitureTag(
              Array.isArray(state.tags) ? state.tags : []
            ),
          };
        }
        return state;
      },
    }
  )
);

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
