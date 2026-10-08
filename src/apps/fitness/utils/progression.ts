import type { Workout, WorkoutSet } from "../types";

/** Epley estimated one-rep max. Sets above 12 reps are capped for stability. */
export function estimateOneRepMax(weightKg: number, reps: number): number {
  if (!(weightKg > 0) || !(reps > 0)) return 0;
  if (reps === 1) return weightKg;
  return weightKg * (1 + Math.min(reps, 12) / 30);
}

export function setVolume(set: WorkoutSet): number {
  return Math.max(0, set.reps) * Math.max(0, set.weightKg);
}

export function bestSet(sets: readonly WorkoutSet[]): WorkoutSet | null {
  let best: WorkoutSet | null = null;
  let bestScore = -1;
  for (const set of sets) {
    const score = estimateOneRepMax(set.weightKg, set.reps);
    if (score > bestScore || (score === bestScore && best && set.reps > best.reps)) {
      best = set;
      bestScore = score;
    }
  }
  return best && bestScore > 0 ? best : null;
}

export interface ExerciseProgressPoint {
  date: string;
  topWeightKg: number;
  e1rmKg: number;
  volumeKg: number;
  totalReps: number;
}

/**
 * One point per workout date for `exerciseId`, oldest first. Multiple entries
 * on the same date are merged.
 */
export function exerciseProgress(
  workouts: readonly Workout[],
  exerciseId: string
): ExerciseProgressPoint[] {
  const byDate = new Map<string, ExerciseProgressPoint>();
  for (const workout of workouts) {
    for (const entry of workout.entries) {
      if (entry.exerciseId !== exerciseId || entry.sets.length === 0) continue;
      const point = byDate.get(workout.date) ?? {
        date: workout.date,
        topWeightKg: 0,
        e1rmKg: 0,
        volumeKg: 0,
        totalReps: 0,
      };
      for (const set of entry.sets) {
        point.topWeightKg = Math.max(point.topWeightKg, set.weightKg);
        point.e1rmKg = Math.max(point.e1rmKg, estimateOneRepMax(set.weightKg, set.reps));
        point.volumeKg += setVolume(set);
        point.totalReps += Math.max(0, set.reps);
      }
      byDate.set(workout.date, point);
    }
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function bestEstimatedOneRepMax(
  workouts: readonly Workout[],
  exerciseId: string
): number {
  let best = 0;
  for (const point of exerciseProgress(workouts, exerciseId)) {
    best = Math.max(best, point.e1rmKg);
  }
  return best;
}

export interface PersonalRecord {
  exerciseId: string;
  name: string;
  date: string;
  weightKg: number;
  reps: number;
  e1rmKg: number;
}

/** Best set (by e1RM) per exercise, highest e1RM first. */
export function personalRecords(workouts: readonly Workout[]): PersonalRecord[] {
  const records = new Map<string, PersonalRecord>();
  for (const workout of workouts) {
    for (const entry of workout.entries) {
      const set = bestSet(entry.sets);
      if (!set) continue;
      const e1rmKg = estimateOneRepMax(set.weightKg, set.reps);
      const current = records.get(entry.exerciseId);
      if (!current || e1rmKg > current.e1rmKg) {
        records.set(entry.exerciseId, {
          exerciseId: entry.exerciseId,
          name: entry.name,
          date: workout.date,
          weightKg: set.weightKg,
          reps: set.reps,
          e1rmKg,
        });
      }
    }
  }
  return [...records.values()].sort((a, b) => b.e1rmKg - a.e1rmKg);
}

export function workoutVolume(workout: Workout): number {
  return workout.entries.reduce(
    (total, entry) => total + entry.sets.reduce((sum, set) => sum + setVolume(set), 0),
    0
  );
}

/** Exercise ids that appear in at least one logged set, most recently used first. */
export function loggedExerciseIds(workouts: readonly Workout[]): { id: string; name: string }[] {
  const sorted = [...workouts].sort(
    (a, b) => b.date.localeCompare(a.date) || b.updatedAt - a.updatedAt
  );
  const seen = new Map<string, string>();
  for (const workout of sorted) {
    for (const entry of workout.entries) {
      if (entry.sets.length > 0 && !seen.has(entry.exerciseId)) {
        seen.set(entry.exerciseId, entry.name);
      }
    }
  }
  return [...seen.entries()].map(([id, name]) => ({ id, name }));
}

/** Most recent sets logged for an exercise before `beforeDate` (for "last time" hints). */
export function lastSetsFor(
  workouts: readonly Workout[],
  exerciseId: string,
  beforeDate?: string
): WorkoutSet[] | null {
  const sorted = [...workouts].sort(
    (a, b) => b.date.localeCompare(a.date) || b.updatedAt - a.updatedAt
  );
  for (const workout of sorted) {
    if (beforeDate && workout.date >= beforeDate) continue;
    const entry = workout.entries.find((e) => e.exerciseId === exerciseId && e.sets.length > 0);
    if (entry) return entry.sets;
  }
  return null;
}
