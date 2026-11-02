import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  normalizeJournalState,
  reduceJournal,
} from "@/apps/journal/logic";
import type {
  FragmentPosition,
  JournalAction,
  JournalFeatureId,
  JournalNotice,
  JournalState,
  JournalView,
  WorkbenchEditId,
} from "@/apps/journal/types";

interface JournalStore {
  journal: JournalState;
  notice: JournalNotice | null;
  setView: (view: JournalView) => void;
  toggleFeature: (feature: JournalFeatureId) => void;
  setDecision: (
    edit: WorkbenchEditId,
    decision: "accepted" | "rejected"
  ) => void;
  addTrialPhoto: () => void;
  removeTrialPhoto: () => void;
  moveFragment: (id: string, position: FragmentPosition) => void;
  selectDay: (dayId: string) => void;
  setReminderTime: (time: string) => void;
  serviceAccept: () => void;
  serviceReject: () => void;
  serviceAskAgain: () => void;
  undo: () => void;
  revertPlan: () => void;
  resetDemo: () => void;
  dismissNotice: () => void;
}

const STORE_VERSION = 1;

function commit(
  get: () => JournalStore,
  set: (partial: Partial<JournalStore>) => void,
  action: JournalAction,
  notice: JournalNotice | null
) {
  const current = get().journal;
  const next = reduceJournal(current, action);
  if (next === current) {
    if (action.type === "undo") set({ notice: "nothing" });
    return;
  }
  set({ journal: next, notice });
}

export const useJournalStore = create<JournalStore>()(
  persist(
    (set, get) => ({
      journal: normalizeJournalState(undefined),
      notice: null,
      setView: (view) => commit(get, set, { type: "setView", view }, null),
      toggleFeature: (feature) =>
        commit(get, set, { type: "toggleFeature", feature }, null),
      setDecision: (edit, decision) => {
        const current = get().journal.decisions[edit];
        commit(
          get,
          set,
          current === decision
            ? { type: "clearDecision", edit }
            : { type: "setDecision", edit, decision },
          null
        );
      },
      addTrialPhoto: () =>
        commit(get, set, { type: "addTrialPhoto" }, "photo"),
      removeTrialPhoto: () =>
        commit(get, set, { type: "removeTrialPhoto" }, null),
      moveFragment: (id, position) =>
        commit(get, set, { type: "moveFragment", id, position }, null),
      selectDay: (dayId) =>
        commit(get, set, { type: "selectDay", dayId }, null),
      setReminderTime: (time) =>
        commit(get, set, { type: "setReminderTime", time }, null),
      serviceAccept: () =>
        commit(get, set, { type: "serviceAccept" }, null),
      serviceReject: () =>
        commit(get, set, { type: "serviceReject" }, null),
      serviceAskAgain: () =>
        commit(get, set, { type: "serviceAskAgain" }, null),
      undo: () => commit(get, set, { type: "undo" }, "undone"),
      revertPlan: () => commit(get, set, { type: "revertPlan" }, "reverted"),
      resetDemo: () => commit(get, set, { type: "reset" }, "restored"),
      dismissNotice: () => set({ notice: null }),
    }),
    {
      name: "ryos:journal",
      version: STORE_VERSION,
      partialize: (state) => ({ journal: state.journal }),
      merge: (persisted, current) => {
        const saved = persisted as { journal?: unknown } | undefined;
        return {
          ...current,
          journal: normalizeJournalState(saved?.journal),
          notice: null,
        };
      },
    }
  )
);
