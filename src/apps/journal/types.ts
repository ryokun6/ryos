export const JOURNAL_FEATURES = [
  "date",
  "mood",
  "streak",
  "reminder",
  "weeklyReport",
] as const;

export type JournalFeatureId = (typeof JOURNAL_FEATURES)[number];

/** Toolbar tabs. Compare is a drawer preset, not a tab. */
export const JOURNAL_TOOLBAR_VIEWS = ["daily", "freeform"] as const;

export type JournalToolbarView = (typeof JOURNAL_TOOLBAR_VIEWS)[number];

export const JOURNAL_VIEWS = ["daily", "freeform", "compare"] as const;

export type JournalView = (typeof JOURNAL_VIEWS)[number];

export const JOURNAL_PRESETS = ["complete", "compare"] as const;

export type JournalPreset = (typeof JOURNAL_PRESETS)[number];

export interface JournalToggles {
  date: boolean;
  mood: boolean;
  streak: boolean;
  reminder: boolean;
  weeklyReport: boolean;
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
  positions: Record<string, FragmentPosition>;
  selectedDayId: string;
}

export type JournalAction =
  | { type: "setView"; view: JournalView }
  | { type: "toggleFeature"; feature: JournalFeatureId }
  | { type: "applyPreset"; preset: JournalPreset }
  | { type: "moveFragment"; id: string; position: FragmentPosition }
  | { type: "selectDay"; dayId: string }
  | { type: "setReminderTime"; time: string }
  | { type: "setMood"; dayId: string; mood: number }
  | { type: "setEntryText"; id: string; doc: JournalDoc }
  | { type: "reset" };
