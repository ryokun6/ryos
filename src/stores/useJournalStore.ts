import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  clampSidebarWidth,
  JOURNAL_SIDEBAR_DEFAULT_WIDTH,
  normalizeJournalState,
  reduceJournal,
} from "@/apps/journal/logic";
import type {
  FragmentPosition,
  JournalAction,
  JournalFeatureId,
  JournalDoc,
  JournalNotice,
  JournalPreset,
  JournalState,
  JournalView,
} from "@/apps/journal/types";

interface JournalStore {
  journal: JournalState;
  sidebarWidth: number;
  notice: JournalNotice | null;
  setView: (view: JournalView) => void;
  toggleFeature: (feature: JournalFeatureId) => void;
  applyPreset: (preset: JournalPreset) => void;
  moveFragment: (id: string, position: FragmentPosition) => void;
  selectDay: (dayId: string) => void;
  selectUndated: (id: string) => void;
  addUndatedPage: () => void;
  setReminderTime: (time: string) => void;
  setMood: (dayId: string, mood: number) => void;
  setEntryText: (id: string, doc: JournalDoc) => void;
  resetDemo: () => void;
  setSidebarWidth: (width: number) => void;
  dismissNotice: () => void;
}

const STORE_VERSION = 2;

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
      applyPreset: (preset) => commit(get, set, { type: "applyPreset", preset }, null),
      moveFragment: (id, position) =>
        commit(get, set, { type: "moveFragment", id, position }, null),
      selectDay: (dayId) => commit(get, set, { type: "selectDay", dayId }, null),
      selectUndated: (id) => commit(get, set, { type: "selectUndated", id }, null),
      addUndatedPage: () =>
        commit(get, set, { type: "addUndatedPage", id: crypto.randomUUID() }, null),
      setReminderTime: (time) =>
        commit(get, set, { type: "setReminderTime", time }, null),
      setMood: (dayId, mood) => commit(get, set, { type: "setMood", dayId, mood }, null),
      setEntryText: (id, doc) => {
        const current = get().journal.texts[id];
        if (current && JSON.stringify(current) === JSON.stringify(doc)) return;
        commit(get, set, { type: "setEntryText", id, doc }, null);
      },
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
      migrate: (persisted) => persisted,
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
