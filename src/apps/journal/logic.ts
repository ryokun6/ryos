import {
  DEFAULT_DAY_ID,
  JOURNAL_DAYS,
  JOURNAL_FRAGMENTS,
  type JournalFragment,
} from "./sampleContent";
import type {
  JournalAction,
  JournalDoc,
  JournalDocNode,
  JournalFeatureId,
  JournalScrap,
  JournalState,
  JournalToggles,
  JournalView,
} from "./types";

export const ALL_FEATURES_ON: JournalToggles = {
  date: true,
  mood: true,
  reminder: true,
};

const VIEWS = new Set<JournalView>(["daily", "freeform", "compare"]);
export const UPCOMING_DAY_COUNT = 7;
export const JOURNAL_CANVAS_PAGE_ID = "board";
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
const FEATURES = new Set<JournalFeatureId>(["date", "mood", "reminder"]);

const LEGACY_VIEWS: Record<string, JournalView> = {
  generated: "daily",
  counter: "daily",
  daily: "daily",
  freeform: "freeform",
  compare: "compare",
};

export function createInitialJournalState(): JournalState {
  return {
    view: "compare",
    toggles: { ...ALL_FEATURES_ON },
    reminderTime: "21:00",
    texts: {},
    moods: {},
    undatedPages: [],
    selectedUndatedId: null,
    scraps: [],
    canvasPages: [JOURNAL_CANVAS_PAGE_ID],
    selectedCanvasPageId: JOURNAL_CANVAS_PAGE_ID,
    removedFragmentIds: [],
    fragmentDays: {},
    selectedCardId: null,
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

/** The dated page on screen. A selected blank page highlights nothing dated. */
export function activeJournalDayId(state: JournalState): string | null {
  if (
    state.selectedUndatedId !== null &&
    state.undatedPages.includes(state.selectedUndatedId)
  ) {
    return null;
  }
  return state.selectedDayId;
}

export function isJournalDayId(value: string): boolean {
  return DAY_ID.test(value);
}

export interface JournalPageRef {
  kind: "day" | "page";
  id: string;
}

/** Days in the sidebar, then any blank pages added from the toolbar. */
export function journalPages(state: JournalState, today = todayDayId()): JournalPageRef[] {
  const dayIds = state.toggles.date
    ? sidebarDates(today)
    : JOURNAL_DAYS.map((day) => day.id);
  return [
    ...dayIds.map((id) => ({ kind: "day" as const, id })),
    ...state.undatedPages.map((id) => ({ kind: "page" as const, id })),
  ];
}

export function currentJournalPage(state: JournalState): JournalPageRef {
  if (
    state.selectedUndatedId !== null &&
    state.undatedPages.includes(state.selectedUndatedId)
  ) {
    return { kind: "page", id: state.selectedUndatedId };
  }
  return { kind: "day", id: state.selectedDayId };
}

export function journalPageIndex(state: JournalState, today = todayDayId()): number {
  const pages = journalPages(state, today);
  const current = currentJournalPage(state);
  const index = pages.findIndex((page) => page.kind === current.kind && page.id === current.id);
  return index < 0 ? 0 : index;
}

export function scrapPlacement(index: number): Pick<JournalScrap, "x" | "y" | "w" | "rotate"> {
  return {
    x: 8 + (index % 4) * 7,
    y: 10 + (index % 5) * 11,
    w: 30,
    rotate: index % 2 === 0 ? -2 : 2,
  };
}

export function journalFragments(state: JournalState): JournalFragment[] {
  const removed = new Set(state.removedFragmentIds);
  return JOURNAL_FRAGMENTS.flatMap((fragment) => {
    if (removed.has(fragment.id)) return [];
    const dayId = state.fragmentDays[fragment.id];
    return dayId && dayId !== fragment.dayId ? [{ ...fragment, dayId }] : [fragment];
  });
}

export function fragmentsForJournalDay(state: JournalState, dayId: string): JournalFragment[] {
  return journalFragments(state).filter((fragment) => fragment.dayId === dayId);
}

export function journalCardExists(state: JournalState, id: string): boolean {
  if (state.scraps.some((scrap) => scrap.id === id)) return true;
  return JOURNAL_FRAGMENTS.some((fragment) => fragment.id === id) && !state.removedFragmentIds.includes(id);
}

export function journalCardDayId(state: JournalState, id: string): string | null {
  const scrap = state.scraps.find((item) => item.id === id);
  if (scrap) return isJournalDayId(scrap.pageId) ? scrap.pageId : null;
  const fragment = JOURNAL_FRAGMENTS.find((item) => item.id === id);
  if (!fragment || state.removedFragmentIds.includes(id)) return null;
  return state.fragmentDays[id] ?? fragment.dayId;
}

export function dayHasEntry(state: JournalState, dayId: string): boolean {
  if (fragmentsForJournalDay(state, dayId).length > 0) return true;
  if (state.scraps.some((scrap) => scrap.pageId === dayId)) return true;
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
    reminder: typeof value?.reminder === "boolean" ? value.reminder : fallback.reminder,
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
  const canvasPages = cloneCanvasPages(raw.canvasPages);
  const scraps = cloneScraps(raw.scraps);
  const removedFragmentIds = cloneRemovedFragments(raw.removedFragmentIds);
  const fragmentDays = cloneFragmentDays(raw.fragmentDays, removedFragmentIds);
  const selectedCardId =
    typeof raw.selectedCardId === "string" &&
    (scraps.some((scrap) => scrap.id === raw.selectedCardId) ||
      (JOURNAL_FRAGMENTS.some((fragment) => fragment.id === raw.selectedCardId) &&
        !removedFragmentIds.includes(raw.selectedCardId)))
      ? raw.selectedCardId
      : null;
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
    scraps,
    canvasPages,
    selectedCanvasPageId: selectedCanvasPage(raw.selectedCanvasPageId, canvasPages),
    removedFragmentIds,
    fragmentDays,
    selectedCardId,
    positions,
    selectedDayId: DAY_ID.test(raw.selectedDayId ?? "")
      ? raw.selectedDayId!
      : initial.selectedDayId,
  };
}

function cloneCanvasPages(value: unknown): string[] {
  if (!Array.isArray(value)) return [JOURNAL_CANVAS_PAGE_ID];
  const pages: string[] = [];
  for (const id of value) {
    if (typeof id !== "string" || id.length === 0 || pages.includes(id)) continue;
    pages.push(id);
  }
  return pages.length > 0 ? pages : [JOURNAL_CANVAS_PAGE_ID];
}

function selectedCanvasPage(value: unknown, pages: string[]): string {
  return typeof value === "string" && pages.includes(value) ? value : pages[0];
}

const SCRAP_KINDS = new Set<JournalScrap["kind"]>(["text", "photo", "song"]);
const MAX_SCRAP_PHOTO_LENGTH = 500_000;
const MAX_SONG_COVER_LENGTH = 2048;
const FRAGMENT_IDS = new Set(JOURNAL_FRAGMENTS.map((fragment) => fragment.id));

function cloneRemovedFragments(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids: string[] = [];
  for (const id of value) {
    if (typeof id !== "string" || !FRAGMENT_IDS.has(id) || ids.includes(id)) continue;
    ids.push(id);
  }
  return ids;
}

function cloneFragmentDays(value: unknown, removed: string[]): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  const removedSet = new Set(removed);
  const days: Record<string, string> = {};
  for (const [id, dayId] of Object.entries(value)) {
    if (!FRAGMENT_IDS.has(id) || removedSet.has(id) || typeof dayId !== "string" || !DAY_ID.test(dayId)) {
      continue;
    }
    const original = JOURNAL_FRAGMENTS.find((fragment) => fragment.id === id)?.dayId;
    if (original === dayId) continue;
    days[id] = dayId;
  }
  return days;
}

function cloneScraps(value: unknown): JournalScrap[] {
  if (!Array.isArray(value)) return [];
  const scraps: JournalScrap[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Partial<JournalScrap>;
    if (typeof raw.id !== "string" || raw.id.length === 0 || seen.has(raw.id)) continue;
    if (typeof raw.pageId !== "string" || raw.pageId.length === 0) continue;
    if (typeof raw.kind !== "string" || !SCRAP_KINDS.has(raw.kind)) continue;
    const photo =
      typeof raw.photo === "string" &&
      raw.photo.length > 0 &&
      raw.photo.length <= MAX_SCRAP_PHOTO_LENGTH
        ? raw.photo
        : null;
    const songId = typeof raw.songId === "string" && raw.songId.length > 0 ? raw.songId : null;
    if (raw.kind === "photo" && !photo) continue;
    if (raw.kind === "song" && !songId) continue;
    seen.add(raw.id);
    scraps.push({
      id: raw.id,
      pageId: raw.pageId,
      kind: raw.kind,
      photo,
      songId,
      songTitle: typeof raw.songTitle === "string" ? raw.songTitle : null,
      songArtist: typeof raw.songArtist === "string" ? raw.songArtist : null,
      songCover:
        typeof raw.songCover === "string" &&
        raw.songCover.length > 0 &&
        raw.songCover.length <= MAX_SONG_COVER_LENGTH
          ? raw.songCover
          : null,
      canvasPageId:
        typeof raw.canvasPageId === "string" && raw.canvasPageId.length > 0
          ? raw.canvasPageId
          : null,
      x: typeof raw.x === "number" ? clamp(raw.x, 0, 100) : 8,
      y: typeof raw.y === "number" ? clamp(raw.y, 0, 100) : 8,
      w: typeof raw.w === "number" ? clamp(raw.w, 12, 80) : 30,
      rotate: typeof raw.rotate === "number" ? clamp(raw.rotate, -15, 15) : 0,
    });
  }
  return scraps;
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
  return toggles.date && toggles.mood && toggles.reminder;
}

export function averageMood(moods: readonly number[]): number {
  if (moods.length === 0) return 0;
  const sum = moods.reduce((total, mood) => total + mood, 0);
  return Math.round((sum / moods.length) * 10) / 10;
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
    case "addScrap": {
      const [scrap] = cloneScraps([action.scrap]);
      if (!scrap || state.scraps.some((item) => item.id === scrap.id)) return state;
      return { ...state, scraps: [...state.scraps, scrap], selectedCardId: scrap.id };
    }
    case "selectCard": {
      if (action.id === state.selectedCardId) return state;
      if (action.id !== null && !journalCardExists(state, action.id)) return state;
      return { ...state, selectedCardId: action.id };
    }
    case "removeCard": {
      if (!action.id || !journalCardExists(state, action.id)) return state;
      const texts = { ...state.texts };
      const positions = { ...state.positions };
      delete texts[action.id];
      delete positions[action.id];
      const selectedCardId = state.selectedCardId === action.id ? null : state.selectedCardId;
      if (state.scraps.some((scrap) => scrap.id === action.id)) {
        return {
          ...state,
          scraps: state.scraps.filter((scrap) => scrap.id !== action.id),
          texts,
          positions,
          selectedCardId,
        };
      }
      const fragmentDays = { ...state.fragmentDays };
      delete fragmentDays[action.id];
      return {
        ...state,
        removedFragmentIds: [...state.removedFragmentIds, action.id],
        fragmentDays,
        texts,
        positions,
        selectedCardId,
      };
    }
    case "moveCard": {
      if (!action.id || !DAY_ID.test(action.dayId) || !journalCardExists(state, action.id)) return state;
      const scrapIndex = state.scraps.findIndex((scrap) => scrap.id === action.id);
      if (scrapIndex >= 0) {
        const scrap = state.scraps[scrapIndex];
        if (scrap.pageId === action.dayId) return state;
        const scraps = state.scraps.slice();
        scraps[scrapIndex] = { ...scrap, pageId: action.dayId };
        return { ...state, scraps, selectedCardId: action.id };
      }
      const fragment = JOURNAL_FRAGMENTS.find((item) => item.id === action.id);
      if (!fragment) return state;
      const currentDay = state.fragmentDays[action.id] ?? fragment.dayId;
      if (currentDay === action.dayId) return state;
      const fragmentDays = { ...state.fragmentDays };
      if (action.dayId === fragment.dayId) delete fragmentDays[action.id];
      else fragmentDays[action.id] = action.dayId;
      return { ...state, fragmentDays, selectedCardId: action.id };
    }
    case "selectCanvasPage": {
      if (!state.canvasPages.includes(action.id) || state.selectedCanvasPageId === action.id) {
        return state;
      }
      return { ...state, selectedCanvasPageId: action.id };
    }
    case "addCanvasPage": {
      if (!action.id || state.canvasPages.includes(action.id)) return state;
      return {
        ...state,
        canvasPages: [...state.canvasPages, action.id],
        selectedCanvasPageId: action.id,
      };
    }
    case "reset":
      return createInitialJournalState();
    default:
      return state;
  }
}
