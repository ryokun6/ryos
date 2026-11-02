import { DEFAULT_DAY_ID, fragmentsForDay, JOURNAL_DAYS } from "./sampleContent";
import type {
  JournalAction,
  JournalDoc,
  JournalDocNode,
  JournalFeatureId,
  JournalPreset,
  JournalState,
  JournalToggles,
  JournalView,
} from "./types";

export const ALL_FEATURES_ON: JournalToggles = {
  date: true,
  mood: true,
  streak: true,
  reminder: true,
  weeklyReport: true,
};

const VIEWS = new Set<JournalView>(["daily", "freeform", "compare"]);
const PRESETS = new Set<JournalPreset>(["journal", "freeform", "compare"]);
export const UPCOMING_DAY_COUNT = 7;
export const JOURNAL_SIDEBAR_DEFAULT_WIDTH = 148;
export const JOURNAL_SIDEBAR_MIN_WIDTH = 112;
export const JOURNAL_SIDEBAR_MAX_WIDTH = 280;

export function clampSidebarWidth(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return JOURNAL_SIDEBAR_DEFAULT_WIDTH;
  }
  return clamp(value, JOURNAL_SIDEBAR_MIN_WIDTH, JOURNAL_SIDEBAR_MAX_WIDTH);
}
const DAY_ID = /^\d{4}-\d{2}-\d{2}$/;
const FEATURES = new Set<JournalFeatureId>([
  "date",
  "mood",
  "streak",
  "reminder",
  "weeklyReport",
]);

const LEGACY_VIEWS: Record<string, JournalView> = {
  generated: "daily",
  counter: "daily",
  daily: "daily",
  freeform: "freeform",
  compare: "compare",
};

export function createInitialJournalState(): JournalState {
  return {
    view: "daily",
    toggles: { ...ALL_FEATURES_ON },
    reminderTime: "21:00",
    texts: {},
    moods: {},
    undatedPages: [],
    selectedUndatedId: null,
    positions: {},
    selectedDayId: DEFAULT_DAY_ID,
  };
}

export function entryDocId(dayId: string): string {
  return `entry:${dayId}`;
}

export function undatedDocId(pageId: string): string {
  return `page:${pageId}`;
}

export function addDays(dayId: string, days: number): string {
  const date = new Date(`${dayId}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function todayDayId(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function sidebarDates(today: string): string[] {
  const first = JOURNAL_DAYS[0]?.id;
  const lastSample = JOURNAL_DAYS[JOURNAL_DAYS.length - 1]?.id;
  if (!first || !lastSample || !DAY_ID.test(today)) return JOURNAL_DAYS.map((day) => day.id);
  const anchor = today > lastSample ? today : lastSample;
  const end = addDays(anchor, UPCOMING_DAY_COUNT);
  const dates: string[] = [];
  let cursor = first;
  while (cursor <= end) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
}

export function dayHasEntry(state: JournalState, dayId: string): boolean {
  if (fragmentsForDay(dayId).length > 0) return true;
  const doc = state.texts[entryDocId(dayId)];
  return Boolean(doc && plainTextFromDoc(doc).length > 0);
}

export function isReminderTime(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/** Half-hour choices for the daily reminder. An already-saved off-grid time stays selectable. */
export function reminderTimeOptions(current?: string): string[] {
  const options: string[] = [];
  for (let hour = 0; hour < 24; hour += 1) {
    options.push(`${String(hour).padStart(2, "0")}:00`);
    options.push(`${String(hour).padStart(2, "0")}:30`);
  }
  if (current && isReminderTime(current) && !options.includes(current)) {
    options.push(current);
    options.sort();
  }
  return options;
}

function cloneToggles(
  value: Partial<JournalToggles> | undefined,
  fallback: JournalToggles
): JournalToggles {
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

export function normalizeJournalState(value: unknown): JournalState {
  const initial = createInitialJournalState();
  if (!value || typeof value !== "object") return initial;
  const raw = value as Partial<JournalState> & { view?: string };
  const positions: JournalState["positions"] = {};
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
  const view = LEGACY_VIEWS[raw.view ?? ""] ?? initial.view;
  const undatedPages = Array.isArray(raw.undatedPages)
    ? raw.undatedPages.filter((id): id is string => typeof id === "string" && id.length > 0)
    : [];
  return {
    view: VIEWS.has(view) ? view : initial.view,
    toggles: cloneToggles(raw.toggles, initial.toggles),
    reminderTime: isReminderTime(raw.reminderTime) ? raw.reminderTime : initial.reminderTime,
    texts: cloneTexts(raw.texts),
    moods: cloneMoods(raw.moods),
    undatedPages,
    selectedUndatedId:
      typeof raw.selectedUndatedId === "string" && undatedPages.includes(raw.selectedUndatedId)
        ? raw.selectedUndatedId
        : null,
    positions,
    selectedDayId: DAY_ID.test(raw.selectedDayId ?? "")
      ? raw.selectedDayId!
      : initial.selectedDayId,
  };
}

function cloneTexts(value: unknown): Record<string, JournalDoc> {
  if (!value || typeof value !== "object") return {};
  const texts: Record<string, JournalDoc> = {};
  for (const [id, doc] of Object.entries(value)) {
    if (!doc || typeof doc !== "object" || (doc as JournalDoc).type !== "doc") continue;
    texts[id] = doc as JournalDoc;
  }
  return texts;
}

function cloneMoods(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object") return {};
  const moods: Record<string, number> = {};
  for (const [id, mood] of Object.entries(value)) {
    if (typeof mood !== "number" || !Number.isFinite(mood)) continue;
    moods[id] = clamp(Math.round(mood), 1, 5);
  }
  return moods;
}

export function moodForDay(state: JournalState, dayId: string): number {
  const override = state.moods[dayId];
  if (typeof override === "number") return override;
  return JOURNAL_DAYS.find((day) => day.id === dayId)?.mood ?? 3;
}

export function plainTextFromDoc(doc: JournalDoc): string {
  const chunks: string[] = [];
  const walk = (node: JournalDocNode, block: boolean) => {
    if (typeof node.text === "string") chunks.push(node.text);
    const children = node.content ?? [];
    if (block) {
      for (const child of children) walk(child, false);
      chunks.push("\n");
      return;
    }
    for (const child of children) {
      walk(child, child.type === "paragraph" || child.type === "heading");
    }
  };
  walk(doc, false);
  return chunks.join("").replace(/\n{3,}/g, "\n\n").trim();
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function allFeaturesOn(toggles: JournalToggles): boolean {
  return (
    toggles.date &&
    toggles.mood &&
    toggles.streak &&
    toggles.reminder &&
    toggles.weeklyReport
  );
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

export function reduceJournal(state: JournalState, action: JournalAction): JournalState {
  switch (action.type) {
    case "setView":
      return state.view === action.view ? state : { ...state, view: action.view };
    case "toggleFeature": {
      if (!FEATURES.has(action.feature)) return state;
      return {
        ...state,
        toggles: { ...state.toggles, [action.feature]: !state.toggles[action.feature] },
      };
    }
    case "applyPreset": {
      if (!PRESETS.has(action.preset)) return state;
      if (action.preset === "compare") {
        return state.view === "compare" ? state : { ...state, view: "compare" };
      }
      if (action.preset === "freeform") {
        return state.view === "freeform" ? state : { ...state, view: "freeform" };
      }
      if (state.view === "daily" && allFeaturesOn(state.toggles)) return state;
      return {
        ...state,
        view: "daily",
        toggles: { ...ALL_FEATURES_ON },
      };
    }
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
      if (!DAY_ID.test(action.dayId)) return state;
      if (state.selectedDayId === action.dayId && state.selectedUndatedId === null) return state;
      return { ...state, selectedDayId: action.dayId, selectedUndatedId: null };
    }
    case "selectUndated": {
      if (!state.undatedPages.includes(action.id)) return state;
      if (state.selectedUndatedId === action.id) return state;
      return { ...state, selectedUndatedId: action.id };
    }
    case "addUndatedPage": {
      if (!action.id || state.undatedPages.includes(action.id)) return state;
      return {
        ...state,
        undatedPages: [...state.undatedPages, action.id],
        selectedUndatedId: action.id,
      };
    }
    case "setReminderTime": {
      if (!isReminderTime(action.time) || state.reminderTime === action.time) return state;
      return { ...state, reminderTime: action.time };
    }
    case "setMood": {
      if (!action.dayId) return state;
      const mood = clamp(Math.round(action.mood), 1, 5);
      if (state.moods[action.dayId] === mood) return state;
      return { ...state, moods: { ...state.moods, [action.dayId]: mood } };
    }
    case "setEntryText": {
      if (!action.id || action.doc?.type !== "doc") return state;
      return { ...state, texts: { ...state.texts, [action.id]: action.doc } };
    }
    case "reset":
      return createInitialJournalState();
    default:
      return state;
  }
}
