/**
 * Runtime-neutral Fitness app contracts shared by `api/fitness/*` and
 * `src/apps/fitness/*`.
 */

export const FREE_EXERCISE_DB_COMMIT = "f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5";
export const FREE_EXERCISE_DB_REPO = "yuhonas/free-exercise-db";
export const FREE_EXERCISE_DB_URL = "https://github.com/yuhonas/free-exercise-db";
export const FREE_EXERCISE_DB_LICENSE = "Unlicense (public domain)";

export const EXERCISE_IMAGE_BASE_URL = `https://cdn.jsdelivr.net/gh/${FREE_EXERCISE_DB_REPO}@${FREE_EXERCISE_DB_COMMIT}/exercises/`;

export const EXERCISE_MUSCLES = [
  "abdominals",
  "abductors",
  "adductors",
  "biceps",
  "calves",
  "chest",
  "forearms",
  "glutes",
  "hamstrings",
  "lats",
  "lower back",
  "middle back",
  "neck",
  "quadriceps",
  "shoulders",
  "traps",
  "triceps",
] as const;
export type ExerciseMuscle = (typeof EXERCISE_MUSCLES)[number];

export const EXERCISE_CATEGORIES = [
  "strength",
  "stretching",
  "plyometrics",
  "powerlifting",
  "olympic weightlifting",
  "strongman",
  "cardio",
] as const;
export type ExerciseCategory = (typeof EXERCISE_CATEGORIES)[number];

export const EXERCISE_EQUIPMENT = [
  "barbell",
  "dumbbell",
  "body only",
  "cable",
  "machine",
  "kettlebells",
  "bands",
  "medicine ball",
  "exercise ball",
  "foam roll",
  "e-z curl bar",
  "other",
] as const;
export type ExerciseEquipment = (typeof EXERCISE_EQUIPMENT)[number];

export const EXERCISE_LEVELS = ["beginner", "intermediate", "expert"] as const;
export type ExerciseLevel = (typeof EXERCISE_LEVELS)[number];

export type ExerciseForce = "push" | "pull" | "static";
export type ExerciseMechanic = "compound" | "isolation";

/** Compact exercise record served by `GET /api/fitness/exercises`. */
export interface FitnessExercise {
  id: string;
  name: string;
  category: ExerciseCategory;
  equipment: ExerciseEquipment;
  level: ExerciseLevel;
  force: ExerciseForce | null;
  mechanic: ExerciseMechanic | null;
  primaryMuscles: ExerciseMuscle[];
  secondaryMuscles: ExerciseMuscle[];
  instructions: string[];
  /** Relative image paths under {@link EXERCISE_IMAGE_BASE_URL}. */
  images: string[];
}

export interface FitnessExerciseLibraryResponse {
  source: { name: string; url: string; license: string; commit: string };
  exercises: FitnessExercise[];
}

function pickEnum<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

function pickMuscles(value: unknown): ExerciseMuscle[] {
  if (!Array.isArray(value)) return [];
  const muscles = new Set<ExerciseMuscle>();
  for (const m of value) {
    const muscle = pickEnum(m, EXERCISE_MUSCLES);
    if (muscle) muscles.add(muscle);
  }
  return [...muscles];
}

const SAFE_IMAGE_PATH_RE = /^[A-Za-z0-9_\-()',.]+\/\d+\.(?:jpg|png|gif)$/;

/** Normalize a raw free-exercise-db record (or any untrusted input). */
export function normalizeExerciseRecord(value: unknown): FitnessExercise | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!id || !name || id.length > 120) return null;
  const primaryMuscles = pickMuscles(raw.primaryMuscles);
  return {
    id,
    name: name.slice(0, 120),
    category: pickEnum(raw.category, EXERCISE_CATEGORIES) ?? "strength",
    equipment: pickEnum(raw.equipment, EXERCISE_EQUIPMENT) ?? "other",
    level: pickEnum(raw.level, EXERCISE_LEVELS) ?? "beginner",
    force: pickEnum(raw.force, ["push", "pull", "static"] as const),
    mechanic: pickEnum(raw.mechanic, ["compound", "isolation"] as const),
    primaryMuscles,
    secondaryMuscles: pickMuscles(raw.secondaryMuscles).filter(
      (m) => !primaryMuscles.includes(m)
    ),
    instructions: Array.isArray(raw.instructions)
      ? raw.instructions
          .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
          .map((s) => s.trim().slice(0, 1000))
          .slice(0, 20)
      : [],
    images: Array.isArray(raw.images)
      ? raw.images
          .filter((p): p is string => typeof p === "string" && SAFE_IMAGE_PATH_RE.test(p))
          .slice(0, 4)
      : [],
  };
}

export function exerciseImageUrl(path: string): string {
  return `${EXERCISE_IMAGE_BASE_URL}${path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`;
}

// ---------------------------------------------------------------------------
// Food analysis
// ---------------------------------------------------------------------------

export const FOOD_TEXT_MAX_LENGTH = 500;
export const FOOD_IMAGE_MAX_BASE64_LENGTH = 4 * 1024 * 1024;
export const FOOD_IMAGE_MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type FoodImageMediaType = (typeof FOOD_IMAGE_MEDIA_TYPES)[number];
export const FOOD_MAX_ITEMS = 12;

export interface FoodNutrients {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface FoodItem extends FoodNutrients {
  name: string;
  /** Human-readable portion, e.g. "1 cup (180 g)". */
  portion: string;
}

export interface FoodAnalyzeRequest {
  image?: { mediaType: FoodImageMediaType; data: string };
  text?: string;
  locale?: string;
}

export interface FoodAnalyzeResponse {
  /** Short dish/meal title. */
  title: string;
  items: FoodItem[];
  /** 0–1 overall confidence. */
  confidence: number;
  notes: string | null;
  isFood: boolean;
}

const MAX_CALORIES_PER_ITEM = 5000;
const MAX_GRAMS_PER_ITEM = 500;

function clampNumber(value: unknown, max: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, max);
}

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

/** Normalize an untrusted food item (AI output, sync payload, or user input). */
export function sanitizeFoodItem(value: unknown): FoodItem | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const name = cleanText(raw.name, 80);
  if (!name) return null;
  return {
    name,
    portion: cleanText(raw.portion, 60),
    calories: Math.round(clampNumber(raw.calories, MAX_CALORIES_PER_ITEM)),
    proteinG: Math.round(clampNumber(raw.proteinG, MAX_GRAMS_PER_ITEM) * 10) / 10,
    carbsG: Math.round(clampNumber(raw.carbsG, MAX_GRAMS_PER_ITEM) * 10) / 10,
    fatG: Math.round(clampNumber(raw.fatG, MAX_GRAMS_PER_ITEM) * 10) / 10,
  };
}

export function sumFoodNutrients(items: readonly FoodNutrients[]): FoodNutrients {
  const total = items.reduce(
    (acc, item) => ({
      calories: acc.calories + (item.calories || 0),
      proteinG: acc.proteinG + (item.proteinG || 0),
      carbsG: acc.carbsG + (item.carbsG || 0),
      fatG: acc.fatG + (item.fatG || 0),
    }),
    { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 }
  );
  return {
    calories: Math.round(total.calories),
    proteinG: Math.round(total.proteinG * 10) / 10,
    carbsG: Math.round(total.carbsG * 10) / 10,
    fatG: Math.round(total.fatG * 10) / 10,
  };
}
