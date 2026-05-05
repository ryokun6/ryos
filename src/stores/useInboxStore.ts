import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  InboxCategory,
  InboxDedupeKey,
  InboxItem,
  InboxActionPayload,
  InboxSourceMeta,
} from "@/lib/inbox/inboxTypes";

interface UpsertInboxInput {
  dedupeKey?: InboxDedupeKey;
  category: InboxCategory;
  title: string;
  preview: string;
  body?: string;
  action?: InboxActionPayload;
  source?: InboxSourceMeta;
}

interface InboxState {
  items: InboxItem[];
  upsertItem: (input: UpsertInboxInput) => string;
  markRead: (id: string) => void;
  markReadMany: (ids: string[]) => void;
  markUnread: (id: string) => void;
  toggleRead: (id: string) => void;
  removeItem: (id: string) => void;
  clearRead: () => void;
}

export function createWelcomeInboxItem(now = Date.now()): InboxItem {
  return {
    id: "welcome-inbox-overview",
    createdAt: now,
    updatedAt: now,
    readAt: null,
    category: "system",
    dedupeKey: "welcome:v1",
    title: "Welcome to Inbox",
    preview:
      "System updates, applet edits, Cursor agent completions, and shared links land here.",
    body:
      "Inbox is ryOS’s durable notification center—not email. Items persist locally in your browser and stay unread until you open them or mark them read.\n\nTry triggering a Cursor Cloud agent from Chats or edit an applet from Ryo; matching entries appear automatically.",
    source: { producer: "inbox", extras: { seed: "welcome" } },
  };
}

export const useInboxStore = create<InboxState>()(
  persist(
    (set, get) => ({
      items: [],

      upsertItem: (input) => {
        const now = Date.now();
        const state = get().items;

        if (input.dedupeKey) {
          const idx = state.findIndex((i) => i.dedupeKey === input.dedupeKey);
          if (idx !== -1) {
            const existing = state[idx];
            const merged: InboxItem = {
              ...existing,
              category: input.category,
              title: input.title,
              preview: input.preview,
              body: input.body ?? existing.body,
              action: input.action ?? existing.action,
              source: input.source ?? existing.source,
              updatedAt: now,
              readAt: existing.readAt,
            };
            const next = [...state];
            next[idx] = merged;
            next.sort((a, b) => b.updatedAt - a.updatedAt);
            set({ items: next });
            return merged.id;
          }
        }

        const id =
          typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : `inbox-${now}-${Math.random().toString(36).slice(2)}`;

        const item: InboxItem = {
          id,
          createdAt: now,
          updatedAt: now,
          readAt: null,
          category: input.category,
          dedupeKey: input.dedupeKey,
          title: input.title,
          preview: input.preview,
          body: input.body,
          action: input.action,
          source: input.source,
        };

        set({
          items: [...state, item].sort((a, b) => b.updatedAt - a.updatedAt),
        });
        return id;
      },

      markRead: (id) => {
        const t = Date.now();
        set({
          items: get().items.map((i) =>
            i.id === id ? { ...i, readAt: i.readAt ?? t } : i
          ),
        });
      },

      markReadMany: (ids) => {
        if (ids.length === 0) return;
        const t = Date.now();
        const setIds = new Set(ids);
        set({
          items: get().items.map((i) =>
            setIds.has(i.id) ? { ...i, readAt: i.readAt ?? t } : i
          ),
        });
      },

      markUnread: (id) => {
        set({
          items: get().items.map((i) =>
            i.id === id ? { ...i, readAt: null } : i
          ),
        });
      },

      toggleRead: (id) => {
        const item = get().items.find((i) => i.id === id);
        if (!item) return;
        if (item.readAt) get().markUnread(id);
        else get().markRead(id);
      },

      removeItem: (id) => {
        set({ items: get().items.filter((i) => i.id !== id) });
      },

      clearRead: () => {
        set({ items: get().items.filter((i) => i.readAt === null) });
      },
    }),
    {
      name: "ryos-inbox-v1",
      partialize: (s) => ({ items: s.items }),
      onRehydrateStorage: () => (state, error) => {
        if (error || !state) return;
        if (!state.items || state.items.length === 0) {
          state.items = [createWelcomeInboxItem()];
        }
      },
    }
  )
);
