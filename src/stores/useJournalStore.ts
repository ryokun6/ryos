import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  clampSidebarWidth,
  JOURNAL_SIDEBAR_DEFAULT_WIDTH,
  normalizeJournalState,
  reduceJournal,
  scrapPlacement,
} from "@/apps/journal/logic";
import type {
  FragmentPosition,
  JournalAction,
  JournalFeatureId,
  JournalDoc,
  JournalNotice,
  JournalScrapInput,
  JournalState,
  JournalView,
} from "@/apps/journal/types";

interface JournalStore {
  journal: JournalState;
  sidebarWidth: number;
  notice: JournalNotice | null;
  setView: (view: JournalView) => void;
  toggleFeature: (feature: JournalFeatureId) => void;
  moveFragment: (id: string, position: FragmentPosition) => void;
  selectDay: (dayId: string) => void;
  selectUndated: (id: string) => void;
  addUndatedPage: () => void;
  selectCanvasPage: (id: string) => void;
  addCanvasPage: () => void;
  setReminderTime: (time: string) => void;
  setMood: (dayId: string, mood: number) => void;
  setEntryText: (id: string, doc: JournalDoc) => void;
  addScrap: (input: JournalScrapInput) => void;
  selectCard: (id: string | null) => void;
  removeCard: (id: string) => void;
  moveCard: (id: string, dayId: string) => void;
  setPageTitle: (id: string, title: string) => void;
  resetDemo: () => void;
  setSidebarWidth: (width: number) => void;
  dismissNotice: () => void;
}

const STORE_VERSION = 3;

function commit(
  get: () => JournalStore,
  set: (partial: Partial<JournalStore>) => void,
  action: JournalAction,
  notice: JournalNotice | null
) {
  const next = reduceJournal(get().journal, action);
  if (next === get().journal) return;
  set({ journal: next, notice });
}

export const useJournalStore = create<JournalStore>()(
  persist(
    (set, get) => ({
      journal: normalizeJournalState(undefined),
      sidebarWidth: JOURNAL_SIDEBAR_DEFAULT_WIDTH,
      notice: null,
      setView: (view) => commit(get, set, { type: "setView", view }, null),
      toggleFeature: (feature) =>
        commit(get, set, { type: "toggleFeature", feature }, null),
      moveFragment: (id, position) =>
        commit(get, set, { type: "moveFragment", id, position }, null),
      selectDay: (dayId) => commit(get, set, { type: "selectDay", dayId }, null),
      selectUndated: (id) => commit(get, set, { type: "selectUndated", id }, null),
      addUndatedPage: () =>
        commit(get, set, { type: "addUndatedPage", id: crypto.randomUUID() }, null),
      selectCanvasPage: (id) => commit(get, set, { type: "selectCanvasPage", id }, null),
      addCanvasPage: () =>
        commit(get, set, { type: "addCanvasPage", id: crypto.randomUUID() }, null),
      setReminderTime: (time) =>
        commit(get, set, { type: "setReminderTime", time }, null),
      setMood: (dayId, mood) => commit(get, set, { type: "setMood", dayId, mood }, null),
      setEntryText: (id, doc) => {
        const current = get().journal.texts[id];
        if (current && JSON.stringify(current) === JSON.stringify(doc)) return;
        commit(get, set, { type: "setEntryText", id, doc }, null);
      },
      addScrap: (input) => {
        if (!input.pageId) return;
        const journal = get().journal;
        const placed = scrapPlacement(
          journal.scraps.filter((scrap) => scrap.pageId === input.pageId).length
        );
        commit(
          get,
          set,
          {
            type: "addScrap",
            scrap: {
              id: crypto.randomUUID(),
              pageId: input.pageId,
              kind: input.kind,
              photo: input.photo ?? null,
              songId: input.songId ?? null,
              songTitle: input.songTitle ?? null,
              songArtist: input.songArtist ?? null,
              songCover: input.songCover ?? null,
              canvasPageId: input.canvasPageId ?? journal.canvasPages[0] ?? null,
              ...placed,
            },
          },
          null
        );
      },
      selectCard: (id) => commit(get, set, { type: "selectCard", id }, null),
      removeCard: (id) => commit(get, set, { type: "removeCard", id }, null),
      moveCard: (id, dayId) => commit(get, set, { type: "moveCard", id, dayId }, null),
      setPageTitle: (id, title) => commit(get, set, { type: "setPageTitle", id, title }, null),
      resetDemo: () => commit(get, set, { type: "reset" }, "restored"),
      setSidebarWidth: (width) => set({ sidebarWidth: clampSidebarWidth(width) }),
      dismissNotice: () => set({ notice: null }),
    }),
    {
      name: "ryos:journal",
      version: STORE_VERSION,
      partialize: (state) => ({
        journal: state.journal,
        sidebarWidth: state.sidebarWidth,
      }),
      migrate: (persisted, version) => {
        if (!persisted || typeof persisted !== "object" || version >= 3) return persisted;
        const saved = persisted as { journal?: Record<string, unknown> };
        if (!saved.journal || typeof saved.journal !== "object") return persisted;
        return { ...saved, journal: { ...saved.journal, view: "compare" } };
      },
      merge: (persisted, current) => {
        const saved = persisted as { journal?: unknown; sidebarWidth?: unknown } | undefined;
        return {
          ...current,
          journal: normalizeJournalState(saved?.journal),
          sidebarWidth: clampSidebarWidth(saved?.sidebarWidth),
          notice: null,
        };
      },
    }
  )
);
