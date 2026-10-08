import type {
  ExerciseCategory,
  ExerciseEquipment,
  ExerciseLevel,
  ExerciseMuscle,
  FitnessExercise,
  FitnessExerciseLibraryResponse,
} from "@/shared/fitness";
import { normalizeExerciseRecord } from "@/shared/fitness";
import { abortableFetch } from "@/utils/abortableFetch";
import { getApiUrl } from "@/utils/platform";

export interface ExerciseFilters {
  query: string;
  muscle: ExerciseMuscle | "all";
  equipment: ExerciseEquipment | "all";
  category: ExerciseCategory | "all";
  level: ExerciseLevel | "all";
}

export const DEFAULT_EXERCISE_FILTERS: ExerciseFilters = {
  query: "",
  muscle: "all",
  equipment: "all",
  category: "all",
  level: "all",
};

/** Fold case, strip diacritics, and keep letters from every script. */
export function normalizeExerciseQuery(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function queryTokens(query: string): string[] {
  return normalizeExerciseQuery(query).split(" ").filter(Boolean);
}

/** True when every query token appears in at least one label. */
export function exerciseQueryMatches(query: string, labels: readonly string[]): boolean {
  const tokens = queryTokens(query);
  if (!tokens.length) return true;
  const haystack = labels.map((label) => normalizeExerciseQuery(label)).join(" ");
  return tokens.every((token) => haystack.includes(token));
}

/**
 * Filter + rank exercises. Every query token must appear in a name, muscles,
 * or equipment; name-prefix matches rank first.
 *
 * `names` adds localized labels. English `exercise.name` is always searched.
 */
export function filterExercises(
  exercises: readonly FitnessExercise[],
  filters: ExerciseFilters,
  options?: { names?: (exercise: FitnessExercise) => readonly string[] }
): FitnessExercise[] {
  const tokens = queryTokens(filters.query);
  const results: { exercise: FitnessExercise; score: number }[] = [];
  for (const exercise of exercises) {
    if (filters.category !== "all" && exercise.category !== filters.category) continue;
    if (filters.equipment !== "all" && exercise.equipment !== filters.equipment) continue;
    if (filters.level !== "all" && exercise.level !== filters.level) continue;
    if (
      filters.muscle !== "all" &&
      !exercise.primaryMuscles.includes(filters.muscle) &&
      !exercise.secondaryMuscles.includes(filters.muscle)
    ) {
      continue;
    }
    let score = 0;
    if (tokens.length) {
      const labels = [
        exercise.name,
        ...(options?.names?.(exercise) ?? []),
      ];
      const normalizedNames = labels
        .map((label) => normalizeExerciseQuery(label))
        .filter(Boolean);
      const nameBlob = normalizedNames.join(" ");
      const haystack = `${nameBlob} ${exercise.primaryMuscles.join(" ")} ${exercise.secondaryMuscles.join(" ")} ${exercise.equipment}`;
      if (!tokens.every((token) => haystack.includes(token))) continue;
      if (normalizedNames.some((name) => name.startsWith(tokens[0]))) score += 3;
      if (tokens.every((token) => nameBlob.includes(token))) score += 2;
    }
    if (filters.muscle !== "all" && exercise.primaryMuscles.includes(filters.muscle)) score += 1;
    results.push({ exercise, score });
  }
  return results
    .sort((a, b) => b.score - a.score || a.exercise.name.localeCompare(b.exercise.name))
    .map((r) => r.exercise);
}

export function indexExercises(
  exercises: readonly FitnessExercise[]
): Map<string, FitnessExercise> {
  return new Map(exercises.map((exercise) => [exercise.id, exercise]));
}

/** Readable fallback name for an id when the library is not loaded. */
export function exerciseNameFromId(id: string): string {
  return id.replace(/_/g, " ").replace(/\s+/g, " ").trim();
}

let libraryCache: FitnessExerciseLibraryResponse | null = null;
let libraryPromise: Promise<FitnessExerciseLibraryResponse> | null = null;

export function getCachedExerciseLibrary(): FitnessExerciseLibraryResponse | null {
  return libraryCache;
}

/** Fetch the library once per session; concurrent callers share the request. */
export function loadExerciseLibrary(): Promise<FitnessExerciseLibraryResponse> {
  if (libraryCache) return Promise.resolve(libraryCache);
  if (!libraryPromise) {
    libraryPromise = abortableFetch(getApiUrl("/api/fitness/exercises"), {
      method: "GET",
      timeout: 30000,
      throwOnHttpError: false,
      retry: { maxAttempts: 2, initialDelayMs: 500 },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = (await response.json()) as FitnessExerciseLibraryResponse;
        const exercises = (Array.isArray(data?.exercises) ? data.exercises : []).flatMap(
          (raw) => {
            const exercise = normalizeExerciseRecord(raw);
            return exercise ? [exercise] : [];
          }
        );
        libraryCache = { source: data.source, exercises };
        return libraryCache;
      })
      .finally(() => {
        libraryPromise = null;
      });
  }
  return libraryPromise;
}
