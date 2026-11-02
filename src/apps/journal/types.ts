export const JOURNAL_FEATURES = [
  "date",
  "mood",
  "streak",
  "reminder",
  "weeklyReport",
] as const;

export type JournalFeatureId = (typeof JOURNAL_FEATURES)[number];

export const WORKBENCH_EDITS = [
  "removeStreak",
  "disableReminder",
  "switchToFreeform",
] as const;

export type WorkbenchEditId = (typeof WORKBENCH_EDITS)[number];

export const JOURNAL_VIEWS = ["generated", "counter", "compare"] as const;

export type JournalView = (typeof JOURNAL_VIEWS)[number];

export type EditDecision = "pending" | "accepted" | "rejected";

export type ServicePhase = "delivered" | "accepted" | "rejected" | "askedAgain";

export type JournalStructure = "dailyPages" | "freeform";

export type JournalNotice =
  | "restored"
  | "reverted"
  | "undone"
  | "nothing"
  | "photo";

export interface JournalToggles {
  date: boolean;
  mood: boolean;
  streak: boolean;
  reminder: boolean;
  weeklyReport: boolean;
}

export interface JournalDecisions {
  removeStreak: EditDecision;
  disableReminder: EditDecision;
  switchToFreeform: EditDecision;
}

export interface FragmentPosition {
  x: number;
  y: number;
}

/** Fields a discrete edit can undo. View, selection, and drag positions stay put. */
export interface JournalSnapshot {
  toggles: JournalToggles;
  baselineToggles: JournalToggles;
  decisions: JournalDecisions;
  trialPhoto: boolean;
  reminderTime: string;
  servicePhase: ServicePhase;
  serviceAsks: number;
}

export interface JournalState extends JournalSnapshot {
  view: JournalView;
  positions: Record<string, FragmentPosition>;
  selectedDayId: string;
  past: JournalSnapshot[];
}

export interface PlanPicture {
  date: boolean;
  mood: boolean;
  streak: boolean;
  reminder: boolean;
  weeklyReport: boolean;
  structure: JournalStructure;
  trialPhoto: boolean;
}

export interface PlanDiff {
  before: PlanPicture;
  after: PlanPicture;
}

export type JournalAction =
  | { type: "setView"; view: JournalView }
  | { type: "toggleFeature"; feature: JournalFeatureId }
  | { type: "setDecision"; edit: WorkbenchEditId; decision: Exclude<EditDecision, "pending"> }
  | { type: "clearDecision"; edit: WorkbenchEditId }
  | { type: "addTrialPhoto" }
  | { type: "removeTrialPhoto" }
  | { type: "moveFragment"; id: string; position: FragmentPosition }
  | { type: "selectDay"; dayId: string }
  | { type: "setReminderTime"; time: string }
  | { type: "serviceAccept" }
  | { type: "serviceReject" }
  | { type: "serviceAskAgain" }
  | { type: "undo" }
  | { type: "revertPlan" }
  | { type: "reset" };
