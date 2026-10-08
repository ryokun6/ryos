import {
  FREE_EXERCISE_DB_COMMIT,
  FREE_EXERCISE_DB_REPO,
  normalizeExerciseRecord,
  type FitnessExercise,
} from "../../../src/shared/fitness.js";

export const EXERCISE_SOURCE_URLS = [
  `https://cdn.jsdelivr.net/gh/${FREE_EXERCISE_DB_REPO}@${FREE_EXERCISE_DB_COMMIT}/dist/exercises.json`,
  `https://raw.githubusercontent.com/${FREE_EXERCISE_DB_REPO}/${FREE_EXERCISE_DB_COMMIT}/dist/exercises.json`,
];

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 15_000;
const MAX_SOURCE_BYTES = 5 * 1024 * 1024;

export interface ExerciseLibraryCache {
  exercises: FitnessExercise[];
  byId: Map<string, FitnessExercise>;
  fetchedAt: number;
}

let cache: ExerciseLibraryCache | null = null;
let inflight: Promise<ExerciseLibraryCache> | null = null;

export function parseExerciseLibrary(raw: unknown): FitnessExercise[] {
  if (!Array.isArray(raw)) throw new Error("exercise source is not an array");
  const seen = new Set<string>();
  const exercises: FitnessExercise[] = [];
  for (const record of raw) {
    const exercise = normalizeExerciseRecord(record);
    if (!exercise || seen.has(exercise.id)) continue;
    seen.add(exercise.id);
    exercises.push(exercise);
  }
  exercises.sort((a, b) => a.name.localeCompare(b.name));
  return exercises;
}

/** List payload: everything except instructions (fetched per exercise). */
export function toListExercise(exercise: FitnessExercise): FitnessExercise {
  return { ...exercise, instructions: [] };
}

async function fetchSource(
  fetchImpl: typeof fetch
): Promise<FitnessExercise[]> {
  let lastError: unknown = null;
  for (const url of EXERCISE_SOURCE_URLS) {
    try {
      const response = await fetchImpl(url, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
      const text = await response.text();
      if (text.length > MAX_SOURCE_BYTES) throw new Error("exercise source too large");
      const exercises = parseExerciseLibrary(JSON.parse(text));
      if (exercises.length === 0) throw new Error("exercise source empty");
      return exercises;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("exercise source unavailable");
}

/** Process-memory cache (24h) with in-flight request sharing. */
export async function getExerciseLibrary(
  options: { fetchImpl?: typeof fetch; now?: number } = {}
): Promise<ExerciseLibraryCache> {
  const now = options.now ?? Date.now();
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) return cache;
  if (!inflight) {
    inflight = fetchSource(options.fetchImpl ?? fetch)
      .then((exercises) => {
        cache = {
          exercises,
          byId: new Map(exercises.map((exercise) => [exercise.id, exercise])),
          fetchedAt: now,
        };
        return cache;
      })
      .catch((error) => {
        // Serve stale data rather than failing when the CDN hiccups.
        if (cache) return cache;
        throw error;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** @internal Test-only reset. */
export function resetExerciseLibraryCacheForTests(): void {
  cache = null;
  inflight = null;
}
