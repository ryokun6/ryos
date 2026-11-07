export const JOURNAL_FEATURES = ["date", "mood", "reminder"] as const;

export type JournalFeatureId = (typeof JOURNAL_FEATURES)[number];

/** Days, Freeform, and Combined stay in the toolbar. Combined is the default. */
export const JOURNAL_VIEWS = ["daily", "freeform", "compare"] as const;

export type JournalView = (typeof JOURNAL_VIEWS)[number];

export interface JournalToggles {
  date: boolean;
  mood: boolean;
  reminder: boolean;
}

export interface FragmentPosition {
  x: number;
  y: number;
}

export type JournalNotice = "restored";

/** TipTap document JSON saved for one entry. */
export interface JournalDoc {
  type: "doc";
  content?: JournalDocNode[];
  [key: string]: unknown;
}

export interface JournalDocNode {
  type?: string;
  text?: string;
  content?: JournalDocNode[];
  [key: string]: unknown;
}

export interface JournalState {
  view: JournalView;
  toggles: JournalToggles;
  reminderTime: string;
  /** Edited entry documents, keyed by fragment id. Absent means the sample text. */
  texts: Record<string, JournalDoc>;
  /** Mood overrides, keyed by day id. Absent means the sample score. */
  moods: Record<string, number>;
  /** Blank pages that are not tied to a date. */
  undatedPages: string[];
  /** Selected blank page. When set, the page view shows this page instead of the selected day. */
  selectedUndatedId: string | null;
  /** Notes, photos, and songs added from the page toolbar. */
  scraps: JournalScrap[];
  /** Freeform boards. These are not journal days. */
  canvasPages: string[];
  selectedCanvasPageId: string;
  /** Sample cards the user removed. */
  removedFragmentIds: string[];
  /** Sample cards moved onto a different day. */
  fragmentDays: Record<string, string>;
  /** The card the trash button and context menu act on. */
  selectedCardId: string | null;
  positions: Record<string, FragmentPosition>;
  selectedDayId: string;
}

export type JournalScrapKind = "text" | "photo" | "song";

export interface JournalScrap {
  id: string;
  pageId: string;
  kind: JournalScrapKind;
  photo: string | null;
  songId: string | null;
  songTitle: string | null;
  songArtist: string | null;
  songCover: string | null;
  /** Canvas board this scrap is drawn on. Null stays on the first board. */
  canvasPageId: string | null;
  x: number;
  y: number;
  w: number;
  rotate: number;
}

export interface JournalScrapInput {
  pageId: string;
  kind: JournalScrapKind;
  photo?: string | null;
  songId?: string | null;
  songTitle?: string | null;
  songArtist?: string | null;
  songCover?: string | null;
  canvasPageId?: string | null;
}

export type JournalAction =
  | { type: "setView"; view: JournalView }
  | { type: "toggleFeature"; feature: JournalFeatureId }
  | { type: "moveFragment"; id: string; position: FragmentPosition }
  | { type: "selectDay"; dayId: string }
  | { type: "selectUndated"; id: string }
  | { type: "addUndatedPage"; id: string }
  | { type: "setReminderTime"; time: string }
  | { type: "setMood"; dayId: string; mood: number }
  | { type: "setEntryText"; id: string; doc: JournalDoc }
  | { type: "addScrap"; scrap: JournalScrap }
  | { type: "selectCard"; id: string | null }
  | { type: "removeCard"; id: string }
  | { type: "moveCard"; id: string; dayId: string }
  | { type: "selectCanvasPage"; id: string }
  | { type: "addCanvasPage"; id: string }
  | { type: "reset" };
