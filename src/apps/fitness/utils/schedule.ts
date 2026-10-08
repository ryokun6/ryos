import type { ExerciseMuscle, FitnessExercise } from "@/shared/fitness";
import {
  FOCUS_AREAS,
  type FocusArea,
  type ScheduleDay,
  type WeeklySchedule,
  type Workout,
} from "../types";
import { addDays, startOfWeek, weekDates, weekdayOf } from "./dates";

export interface ExerciseRef {
  id: string;
  name: string;
}

const ref = (id: string, name: string): ExerciseRef => ({ id, name });

const BENCH = ref("Barbell_Bench_Press_-_Medium_Grip", "Barbell Bench Press - Medium Grip");
const SQUAT = ref("Barbell_Squat", "Barbell Squat");
const ROW = ref("Bent_Over_Barbell_Row", "Bent Over Barbell Row");
const DEADLIFT = ref("Barbell_Deadlift", "Barbell Deadlift");
const LAT_PULLDOWN = ref("Wide-Grip_Lat_Pulldown", "Wide-Grip Lat Pulldown");
const TRICEPS_PUSHDOWN = ref("Triceps_Pushdown", "Triceps Pushdown");
const LUNGES = ref("Dumbbell_Lunges", "Dumbbell Lunges");
const CALF_RAISES = ref("Standing_Calf_Raises", "Standing Calf Raises");
const PLANK = ref("Plank", "Plank");

/** Hand-picked free-exercise-db ids per focus, in recommended order. */
export const CURATED_FOCUS_EXERCISES: Record<FocusArea, readonly ExerciseRef[]> = {
  push: [
    BENCH,
    ref("Standing_Military_Press", "Standing Military Press"),
    ref("Incline_Dumbbell_Press", "Incline Dumbbell Press"),
    ref("Dips_-_Triceps_Version", "Dips - Triceps Version"),
    ref("Side_Lateral_Raise", "Side Lateral Raise"),
    TRICEPS_PUSHDOWN,
  ],
  pull: [
    ref("Pullups", "Pullups"),
    ROW,
    LAT_PULLDOWN,
    ref("Seated_Cable_Rows", "Seated Cable Rows"),
    ref("Face_Pull", "Face Pull"),
    ref("Barbell_Curl", "Barbell Curl"),
    ref("Hammer_Curls", "Hammer Curls"),
  ],
  legs: [
    SQUAT,
    ref("Romanian_Deadlift", "Romanian Deadlift"),
    ref("Leg_Press", "Leg Press"),
    LUNGES,
    ref("Lying_Leg_Curls", "Lying Leg Curls"),
    CALF_RAISES,
  ],
  upper: [
    BENCH,
    ROW,
    ref("Dumbbell_Shoulder_Press", "Dumbbell Shoulder Press"),
    LAT_PULLDOWN,
    ref("Dumbbell_Bicep_Curl", "Dumbbell Bicep Curl"),
    TRICEPS_PUSHDOWN,
  ],
  lower: [
    SQUAT,
    DEADLIFT,
    ref("Barbell_Hip_Thrust", "Barbell Hip Thrust"),
    LUNGES,
    ref("Leg_Extensions", "Leg Extensions"),
    CALF_RAISES,
  ],
  core: [
    PLANK,
    ref("Hanging_Leg_Raise", "Hanging Leg Raise"),
    ref("Ab_Roller", "Ab Roller"),
    ref("Russian_Twist", "Russian Twist"),
    ref("Dead_Bug", "Dead Bug"),
    ref("Cable_Crunch", "Cable Crunch"),
  ],
  cardio: [
    ref("Jogging_Treadmill", "Jogging, Treadmill"),
    ref("Rowing_Stationary", "Rowing, Stationary"),
    ref("Bicycling_Stationary", "Bicycling, Stationary"),
    ref("Rope_Jumping", "Rope Jumping"),
    ref("Elliptical_Trainer", "Elliptical Trainer"),
    ref("Mountain_Climbers", "Mountain Climbers"),
  ],
  full: [
    SQUAT,
    BENCH,
    ROW,
    DEADLIFT,
    ref("Pushups", "Pushups"),
    ref("One-Arm_Kettlebell_Swings", "One-Arm Kettlebell Swings"),
    PLANK,
  ],
  rest: [],
};

/** Muscles that define each focus, used to extend recommendations from the library. */
export const FOCUS_MUSCLES: Record<FocusArea, readonly ExerciseMuscle[]> = {
  push: ["chest", "shoulders", "triceps"],
  pull: ["lats", "middle back", "biceps", "traps", "forearms"],
  legs: ["quadriceps", "hamstrings", "glutes", "calves", "adductors", "abductors"],
  upper: ["chest", "shoulders", "lats", "middle back", "biceps", "triceps", "traps"],
  lower: ["quadriceps", "hamstrings", "glutes", "calves", "lower back"],
  core: ["abdominals", "lower back"],
  cardio: [],
  full: [],
  rest: [],
};

export type ScheduleTemplateId = "upperLower" | "ppl" | "fullBody" | "balanced";
export const SCHEDULE_TEMPLATE_IDS: readonly ScheduleTemplateId[] = [
  "upperLower",
  "ppl",
  "fullBody",
  "balanced",
];

/** Monday → Sunday focus per template. */
export const SCHEDULE_TEMPLATES: Record<ScheduleTemplateId, readonly FocusArea[]> = {
  upperLower: ["upper", "lower", "rest", "upper", "lower", "cardio", "rest"],
  ppl: ["push", "pull", "legs", "push", "pull", "legs", "rest"],
  fullBody: ["full", "rest", "full", "rest", "full", "cardio", "rest"],
  balanced: ["upper", "lower", "cardio", "core", "full", "cardio", "rest"],
};

export function scheduleFromTemplate(id: ScheduleTemplateId): WeeklySchedule {
  return SCHEDULE_TEMPLATES[id].map((focus) => ({ focus, exerciseIds: [] }));
}

export const DEFAULT_SCHEDULE: WeeklySchedule = scheduleFromTemplate("upperLower");

export function isFocusArea(value: unknown): value is FocusArea {
  return typeof value === "string" && (FOCUS_AREAS as readonly string[]).includes(value);
}

export function sanitizeSchedule(value: unknown): WeeklySchedule {
  if (!Array.isArray(value) || value.length !== 7) {
    return DEFAULT_SCHEDULE.map((day) => ({ ...day, exerciseIds: [] }));
  }
  return value.map((raw, index): ScheduleDay => {
    const day = (raw ?? {}) as Partial<ScheduleDay>;
    return {
      focus: isFocusArea(day.focus) ? day.focus : DEFAULT_SCHEDULE[index].focus,
      exerciseIds: Array.isArray(day.exerciseIds)
        ? day.exerciseIds.filter((id): id is string => typeof id === "string").slice(0, 20)
        : [],
    };
  });
}

export function focusForDate(schedule: WeeklySchedule, dateKey: string): FocusArea {
  return schedule[weekdayOf(dateKey)]?.focus ?? "rest";
}

function libraryScore(exercise: FitnessExercise, focus: FocusArea): number {
  let score = 0;
  if (exercise.mechanic === "compound") score += 3;
  if (exercise.level === "beginner") score += 2;
  else if (exercise.level === "intermediate") score += 1;
  if (["barbell", "dumbbell", "body only", "cable", "machine"].includes(exercise.equipment)) {
    score += 1;
  }
  if (focus === "push" && exercise.force === "push") score += 2;
  if (focus === "pull" && exercise.force === "pull") score += 2;
  return score;
}

function matchesFocus(exercise: FitnessExercise, focus: FocusArea): boolean {
  if (focus === "rest") return false;
  if (focus === "cardio") return exercise.category === "cardio";
  if (exercise.category !== "strength" && exercise.category !== "powerlifting") return false;
  if (focus === "full") return exercise.mechanic === "compound";
  const muscles = FOCUS_MUSCLES[focus];
  if (!exercise.primaryMuscles.some((m) => muscles.includes(m))) return false;
  if (focus === "push" && exercise.force === "pull") return false;
  if (focus === "pull" && exercise.force === "push") return false;
  return true;
}

/**
 * Exercise recommendations for a focus: curated picks first, then the best
 * matching library exercises (compound, approachable equipment) to fill up
 * to `limit`. Without a library only curated picks are returned.
 */
export function recommendExercises(
  focus: FocusArea,
  options: {
    library?: readonly FitnessExercise[] | null;
    limit?: number;
    exclude?: Iterable<string>;
  } = {}
): ExerciseRef[] {
  const limit = options.limit ?? 6;
  const exclude = new Set(options.exclude ?? []);
  const result: ExerciseRef[] = [];
  const seen = new Set<string>();
  const push = (item: ExerciseRef) => {
    if (result.length >= limit || seen.has(item.id) || exclude.has(item.id)) return;
    seen.add(item.id);
    result.push(item);
  };
  CURATED_FOCUS_EXERCISES[focus].forEach(push);
  if (result.length < limit && options.library?.length) {
    const candidates = options.library
      .filter((exercise) => matchesFocus(exercise, focus))
      .map((exercise) => ({ exercise, score: libraryScore(exercise, focus) }))
      .sort((a, b) => b.score - a.score || a.exercise.name.localeCompare(b.exercise.name));
    for (const { exercise } of candidates) {
      push({ id: exercise.id, name: exercise.name });
      if (result.length >= limit) break;
    }
  }
  return result;
}

/** Distinct dates with at least one logged set in the week containing `dateKey`. */
export function workoutDatesInWeek(workouts: readonly Workout[], dateKey: string): string[] {
  const dates = new Set(weekDates(dateKey));
  const done = new Set<string>();
  for (const workout of workouts) {
    if (dates.has(workout.date) && workout.entries.some((e) => e.sets.length > 0)) {
      done.add(workout.date);
    }
  }
  return [...done].sort();
}

export interface WeekPlanDay {
  date: string;
  focus: FocusArea;
  isToday: boolean;
  isPast: boolean;
  completed: boolean;
}

export function weekPlan(
  schedule: WeeklySchedule,
  workouts: readonly Workout[],
  todayKey: string
): WeekPlanDay[] {
  const done = new Set(workoutDatesInWeek(workouts, todayKey));
  return weekDates(todayKey).map((date, index) => ({
    date,
    focus: schedule[index]?.focus ?? "rest",
    isToday: date === todayKey,
    isPast: date < todayKey,
    completed: done.has(date),
  }));
}

export function plannedTrainingDays(schedule: WeeklySchedule): number {
  return schedule.filter((day) => day.focus !== "rest").length;
}

/**
 * Consecutive weeks (ending with the current week if already met, otherwise the
 * previous week) in which the workout target was reached.
 */
export function weeklyStreak(
  workouts: readonly Workout[],
  weeklyTarget: number,
  todayKey: string
): number {
  if (weeklyTarget <= 0) return 0;
  let week = startOfWeek(todayKey);
  let streak = 0;
  if (workoutDatesInWeek(workouts, week).length >= weeklyTarget) streak += 1;
  week = addDays(week, -7);
  for (let i = 0; i < 520; i++) {
    if (workoutDatesInWeek(workouts, week).length < weeklyTarget) break;
    streak += 1;
    week = addDays(week, -7);
  }
  return streak;
}
