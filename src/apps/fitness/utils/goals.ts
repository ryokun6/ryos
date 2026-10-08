import type { BodyMeasurement, BodyStatEntry, FitnessGoals, StrengthGoal, Workout } from "../types";
import { bestEstimatedOneRepMax } from "./progression";
import { workoutDatesInWeek } from "./schedule";

export interface ProgressValue {
  current: number;
  target: number;
  /** 0–1. */
  fraction: number;
  achieved: boolean;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Body stat entries sorted oldest → newest. */
export function sortedBodyStats(entries: readonly BodyStatEntry[]): BodyStatEntry[] {
  return [...entries].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
}

type BodyField = "weightKg" | "bodyFatPct" | BodyMeasurement;

export function latestBodyValue(
  entries: readonly BodyStatEntry[],
  field: BodyField
): { value: number; date: string } | null {
  const sorted = sortedBodyStats(entries);
  for (let i = sorted.length - 1; i >= 0; i--) {
    const value = sorted[i][field];
    if (typeof value === "number") return { value, date: sorted[i].date };
  }
  return null;
}

export function bodySeries(
  entries: readonly BodyStatEntry[],
  field: BodyField
): { date: string; value: number }[] {
  const byDate = new Map<string, number>();
  for (const entry of sortedBodyStats(entries)) {
    const value = entry[field];
    if (typeof value === "number") byDate.set(entry.date, value);
  }
  return [...byDate.entries()].map(([date, value]) => ({ date, value }));
}

/** Change from the first recorded value to the latest one. */
export function bodyChange(
  entries: readonly BodyStatEntry[],
  field: BodyField
): number | null {
  const series = bodySeries(entries, field);
  if (series.length < 2) return null;
  return series[series.length - 1].value - series[0].value;
}

/**
 * Progress toward the target weight from the starting weight. Works for both
 * cutting and bulking; overshooting counts as achieved.
 */
export function weightGoalProgress(
  goals: FitnessGoals,
  currentKg: number | null
): ProgressValue | null {
  const target = goals.targetWeightKg;
  if (target == null || currentKg == null) return null;
  const start = goals.startWeightKg ?? currentKg;
  const total = target - start;
  if (Math.abs(total) < 0.05) {
    const achieved = Math.abs(currentKg - target) <= 0.5;
    return { current: currentKg, target, fraction: achieved ? 1 : 0, achieved };
  }
  const fraction = clamp01((currentKg - start) / total);
  return { current: currentKg, target, fraction, achieved: fraction >= 1 };
}

export function strengthGoalProgress(
  goal: StrengthGoal,
  workouts: readonly Workout[]
): ProgressValue {
  const current = bestEstimatedOneRepMax(workouts, goal.exerciseId);
  const fraction = goal.targetKg > 0 ? clamp01(current / goal.targetKg) : 0;
  return { current, target: goal.targetKg, fraction, achieved: fraction >= 1 };
}

export function weeklyWorkoutProgress(
  goals: FitnessGoals,
  workouts: readonly Workout[],
  todayKey: string
): ProgressValue {
  const current = workoutDatesInWeek(workouts, todayKey).length;
  const target = Math.max(0, goals.weeklyWorkoutTarget);
  const fraction = target > 0 ? clamp01(current / target) : 0;
  return { current, target, fraction, achieved: target > 0 && current >= target };
}
