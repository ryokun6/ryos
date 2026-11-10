import type { FoodItem } from "@/shared/fitness";

export type FitnessView = "exercises" | "workouts" | "schedule" | "body" | "food";
/** Display order for the toolbar and View menu. */
export const FITNESS_VIEWS: readonly FitnessView[] = [
  "schedule",
  "exercises",
  "workouts",
  "body",
  "food",
];

export type UnitSystem = "metric" | "imperial";

export const FOCUS_AREAS = [
  "upper",
  "lower",
  "push",
  "pull",
  "legs",
  "core",
  "cardio",
  "full",
  "rest",
] as const;
export type FocusArea = (typeof FOCUS_AREAS)[number];

/** 0 = Monday … 6 = Sunday. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface ScheduleDay {
  focus: FocusArea;
  /** Optional hand-picked exercise ids; empty means "use recommendations". */
  exerciseIds: string[];
}

export type WeeklySchedule = ScheduleDay[];

export const WORKOUT_PHASES = ["warmup", "main"] as const;
export type WorkoutPhase = (typeof WORKOUT_PHASES)[number];

/** Prescription cues stored on an entry and translated in the UI. */
export const WORKOUT_CUES = ["holdEachRep3s", "hold2s", "eachSide"] as const;
export type WorkoutCue = (typeof WORKOUT_CUES)[number];

export interface WorkoutSet {
  reps: number;
  /** Inclusive upper bound when the prescription is a range, such as 10–12. */
  repsMax?: number;
  weightKg: number;
  /**
   * `false` is a planned set from a template and does not count as logged.
   * Omitted or `true` is a completed set. Existing history omits the field.
   */
  completed?: boolean;
}

export interface WorkoutEntry {
  id: string;
  exerciseId: string;
  name: string;
  sets: WorkoutSet[];
  /** Warm-up versus main, when the entry came from a workout template. */
  phase?: WorkoutPhase;
  /** Hold, per-side, or other prescription cue. */
  cue?: WorkoutCue;
}

export interface Workout {
  id: string;
  /** Local calendar date, `YYYY-MM-DD`. */
  date: string;
  focus: FocusArea | null;
  entries: WorkoutEntry[];
  notes: string;
  /**
   * The day carries the program coaching (reps in reserve, rest, stability).
   * The sentence itself is translated; this flag only records that it applies.
   */
  guidance?: boolean;
  createdAt: number;
  updatedAt: number;
}

export const BODY_MEASUREMENTS = ["waistCm", "chestCm", "hipsCm", "armCm", "thighCm"] as const;
export type BodyMeasurement = (typeof BODY_MEASUREMENTS)[number];

export interface BodyStatEntry {
  id: string;
  date: string;
  weightKg: number | null;
  bodyFatPct: number | null;
  waistCm: number | null;
  chestCm: number | null;
  hipsCm: number | null;
  armCm: number | null;
  thighCm: number | null;
  createdAt: number;
  updatedAt: number;
}

export type Sex = "male" | "female";
export const ACTIVITY_LEVELS = ["sedentary", "light", "moderate", "active", "veryActive"] as const;
export type ActivityLevel = (typeof ACTIVITY_LEVELS)[number];

export interface FitnessProfile {
  sex: Sex;
  birthYear: number | null;
  heightCm: number | null;
  activityLevel: ActivityLevel;
}

export interface NutritionOverrides {
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
}

export interface FitnessGoals {
  targetWeightKg: number | null;
  /** Weight when the target was set; progress is measured from here. */
  startWeightKg: number | null;
  weeklyWorkoutTarget: number;
  nutrition: NutritionOverrides;
}

export const MEALS = ["breakfast", "lunch", "dinner", "snack"] as const;
export type Meal = (typeof MEALS)[number];

export interface FoodEntry {
  id: string;
  date: string;
  meal: Meal;
  name: string;
  /**
   * Your share of the meal. Daily totals use these numbers.
   * When `splitPeople` is greater than 1 they are `baseItems` divided by that count.
   */
  items: FoodItem[];
  /**
   * People sharing this meal. Omitted or 1 means `items` is the whole meal.
   * Changing the split recomputes `items` from `baseItems` so it does not compound.
   */
  splitPeople?: number;
  /** Full meal before splitting. Present only when `splitPeople` is greater than 1. */
  baseItems?: FoodItem[];
  source: "ai" | "manual";
  /** Small JPEG data URL (≤ ~12 KB) kept for history thumbnails. */
  thumbnail: string | null;
  createdAt: number;
  updatedAt: number;
}
