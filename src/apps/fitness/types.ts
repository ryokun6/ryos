import type { FoodItem } from "@/shared/fitness";

export type FitnessView = "exercises" | "workouts" | "schedule" | "body" | "food";
export const FITNESS_VIEWS: readonly FitnessView[] = [
  "exercises",
  "workouts",
  "schedule",
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
export const WEEKDAYS: readonly Weekday[] = [0, 1, 2, 3, 4, 5, 6];

export interface ScheduleDay {
  focus: FocusArea;
  /** Optional hand-picked exercise ids; empty means "use recommendations". */
  exerciseIds: string[];
}

export type WeeklySchedule = ScheduleDay[];

export interface WorkoutSet {
  reps: number;
  weightKg: number;
}

export interface WorkoutEntry {
  id: string;
  exerciseId: string;
  name: string;
  sets: WorkoutSet[];
}

export interface Workout {
  id: string;
  /** Local calendar date, `YYYY-MM-DD`. */
  date: string;
  focus: FocusArea | null;
  entries: WorkoutEntry[];
  notes: string;
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

export interface StrengthGoal {
  id: string;
  exerciseId: string;
  name: string;
  targetKg: number;
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
  strengthGoals: StrengthGoal[];
  nutrition: NutritionOverrides;
}

export const MEALS = ["breakfast", "lunch", "dinner", "snack"] as const;
export type Meal = (typeof MEALS)[number];

export interface FoodEntry {
  id: string;
  date: string;
  meal: Meal;
  name: string;
  items: FoodItem[];
  source: "ai" | "manual";
  /** Small JPEG data URL (≤ ~12 KB) kept for history thumbnails. */
  thumbnail: string | null;
  createdAt: number;
  updatedAt: number;
}
