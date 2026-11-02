import { DEFAULT_DAY_ID, JOURNAL_DAYS } from "./sampleContent";
import type {
  EditDecision,
  JournalAction,
  JournalDecisions,
  JournalFeatureId,
  JournalSnapshot,
  JournalState,
  JournalStructure,
  JournalToggles,
  JournalView,
  PlanDiff,
  PlanPicture,
  ServicePhase,
  WorkbenchEditId,
} from "./types";

export const HISTORY_LIMIT = 40;

export const ALL_FEATURES_ON: JournalToggles = {
  date: true,
  mood: true,
  streak: true,
  reminder: true,
  weeklyReport: true,
};

export const PENDING_DECISIONS: JournalDecisions = {
  removeStreak: "pending",
  disableReminder: "pending",
  switchToFreeform: "pending",
};

const VIEWS = new Set<JournalView>(["generated", "counter", "compare"]);
const DECISIONS = new Set<EditDecision>(["pending", "accepted", "rejected"]);
const PHASES = new Set<ServicePhase>([
  "delivered",
  "accepted",
  "rejected",
  "askedAgain",
]);
const FEATURES = new Set<JournalFeatureId>([
  "date",
  "mood",
  "streak",
  "reminder",
  "weeklyReport",
]);
const EDITS = new Set<WorkbenchEditId>([
  "removeStreak",
  "disableReminder",
  "switchToFreeform",
]);

export const ORIGINAL_PICTURE: PlanPicture = {
  date: true,
  mood: true,
  streak: true,
  reminder: true,
  weeklyReport: true,
  structure: "dailyPages",
  trialPhoto: false,
};

/** What the service window hands back: the ask, plus two changes nobody requested. */
export const SERVICE_PICTURE: PlanPicture = {
  date: true,
  mood: true,
  streak: false,
  reminder: false,
  weeklyReport: true,
  structure: "freeform",
  trialPhoto: false,
};

export function createInitialJournalState(): JournalState {
  return {
    view: "generated",
    toggles: { ...ALL_FEATURES_ON },
    baselineToggles: { ...ALL_FEATURES_ON },
    decisions: { ...PENDING_DECISIONS },
    trialPhoto: false,
    reminderTime: "21:00",
    servicePhase: "delivered",
    serviceAsks: 0,
    positions: {},
    selectedDayId: DEFAULT_DAY_ID,
    past: [],
  };
}

export function snapshotOf(state: JournalState): JournalSnapshot {
  return {
    toggles: { ...state.toggles },
    baselineToggles: { ...state.baselineToggles },
    decisions: { ...state.decisions },
    trialPhoto: state.trialPhoto,
    reminderTime: state.reminderTime,
    servicePhase: state.servicePhase,
    serviceAsks: state.serviceAsks,
  };
}

function cloneToggles(value: Partial<JournalToggles> | undefined, fallback: JournalToggles): JournalToggles {
  return {
    date: typeof value?.date === "boolean" ? value.date : fallback.date,
    mood: typeof value?.mood === "boolean" ? value.mood : fallback.mood,
    streak: typeof value?.streak === "boolean" ? value.streak : fallback.streak,
    reminder: typeof value?.reminder === "boolean" ? value.reminder : fallback.reminder,
    weeklyReport:
      typeof value?.weeklyReport === "boolean"
        ? value.weeklyReport
        : fallback.weeklyReport,
  };
}

function cloneDecisions(value: Partial<JournalDecisions> | undefined): JournalDecisions {
  return {
    removeStreak: DECISIONS.has(value?.removeStreak as EditDecision)
      ? (value!.removeStreak as EditDecision)
      : "pending",
    disableReminder: DECISIONS.has(value?.disableReminder as EditDecision)
      ? (value!.disableReminder as EditDecision)
      : "pending",
    switchToFreeform: DECISIONS.has(value?.switchToFreeform as EditDecision)
      ? (value!.switchToFreeform as EditDecision)
      : "pending",
  };
}

function cloneSnapshot(value: Partial<JournalSnapshot> | undefined): JournalSnapshot {
  const initial = createInitialJournalState();
  return {
    toggles: cloneToggles(value?.toggles, initial.toggles),
    baselineToggles: cloneToggles(value?.baselineToggles, initial.baselineToggles),
    decisions: cloneDecisions(value?.decisions),
    trialPhoto: value?.trialPhoto === true,
    reminderTime: isReminderTime(value?.reminderTime) ? value.reminderTime : initial.reminderTime,
    servicePhase: PHASES.has(value?.servicePhase as ServicePhase)
      ? (value!.servicePhase as ServicePhase)
      : "delivered",
    serviceAsks:
      typeof value?.serviceAsks === "number" && value.serviceAsks >= 0
        ? Math.floor(value.serviceAsks)
        : 0,
  };
}

export function isReminderTime(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function normalizeJournalState(value: unknown): JournalState {
  const initial = createInitialJournalState();
  if (!value || typeof value !== "object") return initial;
  const raw = value as Partial<JournalState>;
  const snapshot = cloneSnapshot(raw);
  const positions: Record<string, { x: number; y: number }> = {};
  if (raw.positions && typeof raw.positions === "object") {
    for (const [id, position] of Object.entries(raw.positions)) {
      if (!position || typeof position.x !== "number" || typeof position.y !== "number") {
        continue;
      }
      positions[id] = {
        x: clamp(position.x, 0, 100),
        y: clamp(position.y, 0, 100),
      };
    }
  }
  const dayIds = new Set(JOURNAL_DAYS.map((day) => day.id));
  const past = Array.isArray(raw.past)
    ? raw.past.slice(-HISTORY_LIMIT).map((entry) => cloneSnapshot(entry))
    : [];
  return {
    ...snapshot,
    view: VIEWS.has(raw.view as JournalView) ? (raw.view as JournalView) : initial.view,
    positions,
    selectedDayId: dayIds.has(raw.selectedDayId ?? "")
      ? raw.selectedDayId!
      : initial.selectedDayId,
    past,
  };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function featureFromEdit(edit: WorkbenchEditId): "streak" | "reminder" | null {
  if (edit === "removeStreak") return "streak";
  if (edit === "disableReminder") return "reminder";
  return null;
}

function editFromFeature(feature: JournalFeatureId): WorkbenchEditId | null {
  if (feature === "streak") return "removeStreak";
  if (feature === "reminder") return "disableReminder";
  return null;
}

/**
 * Direct toggles are the audience's own switches.
 * An accepted or rejected plan edit overrides the matching switch until it
 * returns to pending. Other features are never touched by the plan.
 */
export function visibleFeatures(
  toggles: JournalToggles,
  decisions: JournalDecisions
): JournalToggles {
  return {
    date: toggles.date,
    mood: toggles.mood,
    weeklyReport: toggles.weeklyReport,
    streak:
      decisions.removeStreak === "accepted"
        ? false
        : decisions.removeStreak === "rejected"
          ? true
          : toggles.streak,
    reminder:
      decisions.disableReminder === "accepted"
        ? false
        : decisions.disableReminder === "rejected"
          ? true
          : toggles.reminder,
  };
}

export function visibleStructure(decisions: JournalDecisions): JournalStructure {
  return decisions.switchToFreeform === "accepted" ? "freeform" : "dailyPages";
}

export function visibleJournal(state: JournalSnapshot): {
  features: JournalToggles;
  structure: JournalStructure;
  trialPhoto: boolean;
} {
  return {
    features: visibleFeatures(state.toggles, state.decisions),
    structure: visibleStructure(state.decisions),
    trialPhoto: state.trialPhoto,
  };
}

export function pictureFrom(
  features: JournalToggles,
  structure: JournalStructure,
  trialPhoto: boolean
): PlanPicture {
  return { ...features, structure, trialPhoto };
}

/** Before/after follows the plan only, starting from the complete answer. */
export function buildPlanDiff(
  decisions: JournalDecisions,
  trialPhoto: boolean
): PlanDiff {
  const afterFeatures = visibleFeatures(ALL_FEATURES_ON, decisions);
  return {
    before: { ...ORIGINAL_PICTURE },
    after: pictureFrom(afterFeatures, visibleStructure(decisions), trialPhoto),
  };
}

export function servicePicture(phase: ServicePhase): PlanPicture {
  return phase === "rejected" ? { ...ORIGINAL_PICTURE } : { ...SERVICE_PICTURE };
}

export function consecutiveDayStreak(dayIds: readonly string[]): number {
  const unique = [...new Set(dayIds)].filter((id) => /^\d{4}-\d{2}-\d{2}$/.test(id));
  unique.sort();
  if (unique.length === 0) return 0;
  let streak = 1;
  for (let index = unique.length - 1; index > 0; index -= 1) {
    const previous = Date.parse(`${unique[index - 1]}T00:00:00Z`);
    const current = Date.parse(`${unique[index]}T00:00:00Z`);
    if (current - previous === 86_400_000) {
      streak += 1;
    } else {
      break;
    }
  }
  return streak;
}

export function averageMood(moods: readonly number[]): number {
  if (moods.length === 0) return 0;
  const sum = moods.reduce((total, mood) => total + mood, 0);
  return Math.round((sum / moods.length) * 10) / 10;
}

export function sampleStreak(): number {
  return consecutiveDayStreak(JOURNAL_DAYS.map((day) => day.id));
}

export function sampleAverageMood(): number {
  return averageMood(JOURNAL_DAYS.map((day) => day.mood));
}

function withHistory(state: JournalState, patch: Partial<JournalState>): JournalState {
  return {
    ...state,
    ...patch,
    past: [...state.past, snapshotOf(state)].slice(-HISTORY_LIMIT),
  };
}

function applyDecision(
  state: JournalState,
  edit: WorkbenchEditId,
  decision: Exclude<EditDecision, "pending">
): JournalState {
  const toggles = { ...state.toggles };
  const feature = featureFromEdit(edit);
  if (feature) toggles[feature] = decision !== "accepted";
  return withHistory(state, {
    decisions: { ...state.decisions, [edit]: decision },
    toggles,
  });
}

export function reduceJournal(state: JournalState, action: JournalAction): JournalState {
  switch (action.type) {
    case "setView":
      return state.view === action.view ? state : { ...state, view: action.view };
    case "toggleFeature": {
      if (!FEATURES.has(action.feature)) return state;
      const visible = visibleFeatures(state.toggles, state.decisions);
      const next = !visible[action.feature];
      const decisions = { ...state.decisions };
      const edit = editFromFeature(action.feature);
      if (edit) decisions[edit] = "pending";
      const toggles = { ...state.toggles, [action.feature]: next };
      return withHistory(state, {
        toggles,
        baselineToggles: { ...state.baselineToggles, [action.feature]: next },
        decisions,
      });
    }
    case "setDecision": {
      if (!EDITS.has(action.edit)) return state;
      if (state.decisions[action.edit] === action.decision) return state;
      return applyDecision(state, action.edit, action.decision);
    }
    case "clearDecision": {
      if (!EDITS.has(action.edit)) return state;
      if (state.decisions[action.edit] === "pending") return state;
      const toggles = { ...state.toggles };
      const feature = featureFromEdit(action.edit);
      if (feature) toggles[feature] = state.baselineToggles[feature];
      return withHistory(state, {
        decisions: { ...state.decisions, [action.edit]: "pending" },
        toggles,
      });
    }
    case "addTrialPhoto":
      return state.trialPhoto ? state : withHistory(state, { trialPhoto: true });
    case "removeTrialPhoto":
      return state.trialPhoto ? withHistory(state, { trialPhoto: false }) : state;
    case "moveFragment": {
      const x = clamp(action.position.x, 0, 100);
      const y = clamp(action.position.y, 0, 100);
      const current = state.positions[action.id];
      if (current && current.x === x && current.y === y) return state;
      return {
        ...state,
        positions: { ...state.positions, [action.id]: { x, y } },
      };
    }
    case "selectDay": {
      if (!JOURNAL_DAYS.some((day) => day.id === action.dayId)) return state;
      if (state.selectedDayId === action.dayId) return state;
      return { ...state, selectedDayId: action.dayId };
    }
    case "setReminderTime": {
      if (!isReminderTime(action.time) || state.reminderTime === action.time) return state;
      return withHistory(state, { reminderTime: action.time });
    }
    case "serviceAccept":
      return state.servicePhase === "accepted"
        ? state
        : withHistory(state, { servicePhase: "accepted" });
    case "serviceReject":
      return state.servicePhase === "rejected"
        ? state
        : withHistory(state, { servicePhase: "rejected" });
    case "serviceAskAgain":
      return withHistory(state, {
        servicePhase: "askedAgain",
        serviceAsks: state.serviceAsks + 1,
      });
    case "undo": {
      const previous = state.past[state.past.length - 1];
      if (!previous) return state;
      return {
        ...state,
        ...cloneSnapshot(previous),
        past: state.past.slice(0, -1),
      };
    }
    case "revertPlan": {
      const reverted =
        state.trialPhoto === false &&
        state.decisions.removeStreak === "pending" &&
        state.decisions.disableReminder === "pending" &&
        state.decisions.switchToFreeform === "pending" &&
        state.toggles.streak === state.baselineToggles.streak &&
        state.toggles.reminder === state.baselineToggles.reminder &&
        state.toggles.date === state.baselineToggles.date &&
        state.toggles.mood === state.baselineToggles.mood &&
        state.toggles.weeklyReport === state.baselineToggles.weeklyReport;
      if (reverted) return state;
      return withHistory(state, {
        decisions: { ...PENDING_DECISIONS },
        trialPhoto: false,
        toggles: { ...state.baselineToggles },
      });
    }
    case "reset":
      return createInitialJournalState();
    default:
      return state;
  }
}
