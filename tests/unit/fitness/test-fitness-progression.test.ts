import { describe, expect, test } from "bun:test";
import type { Workout } from "../../../src/apps/fitness/types";
import {
  bestEstimatedOneRepMax,
  bestSet,
  estimateOneRepMax,
  exerciseProgress,
  lastSetsFor,
  loggedExerciseIds,
  personalRecords,
  workoutVolume,
} from "../../../src/apps/fitness/utils/progression";
import {
  displayToKg,
  kgToDisplay,
  parseNumberInput,
  cmToDisplay,
  displayToCm,
} from "../../../src/apps/fitness/utils/units";

function workout(
  id: string,
  date: string,
  entries: Array<[string, Array<[number, number]>]>,
  updatedAt = 0
): Workout {
  return {
    id,
    date,
    focus: null,
    notes: "",
    createdAt: updatedAt,
    updatedAt,
    entries: entries.map(([exerciseId, sets], i) => ({
      id: `${id}-${i}`,
      exerciseId,
      name: exerciseId.replace(/_/g, " "),
      sets: sets.map(([reps, weightKg]) => ({ reps, weightKg })),
    })),
  };
}

const history: Workout[] = [
  workout("w2", "2026-03-08", [["Barbell_Squat", [[5, 100], [5, 105]]]], 2),
  workout("w1", "2026-03-01", [
    ["Barbell_Squat", [[5, 95], [5, 95]]],
    ["Pullups", [[8, 0]]],
  ], 1),
  workout("w3", "2026-03-15", [["Barbell_Squat", [[3, 115]]], ["Barbell_Squat", [[8, 90]]]], 3),
];

describe("one-rep max", () => {
  test("Epley estimate; singles return the weight", () => {
    expect(estimateOneRepMax(100, 1)).toBe(100);
    expect(estimateOneRepMax(100, 5)).toBeCloseTo(116.667, 2);
    expect(estimateOneRepMax(100, 30)).toBeCloseTo(estimateOneRepMax(100, 12));
    expect(estimateOneRepMax(0, 10)).toBe(0);
    expect(estimateOneRepMax(50, 0)).toBe(0);
  });

  test("best set prefers the highest estimate and ignores empty sets", () => {
    expect(bestSet([{ reps: 10, weightKg: 60 }, { reps: 3, weightKg: 80 }])).toEqual({
      reps: 3,
      weightKg: 80,
    });
    expect(bestSet([{ reps: 10, weightKg: 0 }])).toBeNull();
    expect(bestSet([])).toBeNull();
  });
});

describe("exercise progress", () => {
  test("one point per date, oldest first, merging same-day entries", () => {
    const points = exerciseProgress(history, "Barbell_Squat");
    expect(points.map((p) => p.date)).toEqual(["2026-03-01", "2026-03-08", "2026-03-15"]);
    expect(points[0]).toMatchObject({ topWeightKg: 95, volumeKg: 950, totalReps: 10 });
    expect(points[2].topWeightKg).toBe(115);
    expect(points[2].totalReps).toBe(11);
    expect(points[2].e1rmKg).toBeCloseTo(Math.max(estimateOneRepMax(115, 3), estimateOneRepMax(90, 8)));
    expect(bestEstimatedOneRepMax(history, "Barbell_Squat")).toBeCloseTo(126.5, 1);
    expect(exerciseProgress(history, "Unknown")).toEqual([]);
  });

  test("personal records, volume, and usage order", () => {
    const prs = personalRecords(history);
    expect(prs[0]).toMatchObject({ exerciseId: "Barbell_Squat", date: "2026-03-15", weightKg: 115, reps: 3 });
    // Bodyweight-only sets have no e1RM and produce no record.
    expect(prs.find((p) => p.exerciseId === "Pullups")).toBeUndefined();
    expect(workoutVolume(history[0])).toBe(1025);
    expect(loggedExerciseIds(history).map((e) => e.id)).toEqual(["Barbell_Squat", "Pullups"]);
  });

  test("last sets before a date", () => {
    expect(lastSetsFor(history, "Barbell_Squat", "2026-03-15")).toEqual([
      { reps: 5, weightKg: 100 },
      { reps: 5, weightKg: 105 },
    ]);
    expect(lastSetsFor(history, "Barbell_Squat", "2026-03-01")).toBeNull();
    expect(lastSetsFor(history, "Pullups")).toEqual([{ reps: 8, weightKg: 0 }]);
  });
});

describe("units", () => {
  test("kg/lb and cm/in round-trip", () => {
    expect(kgToDisplay(100, "imperial")).toBe(220.5);
    expect(kgToDisplay(72.34, "metric")).toBe(72.3);
    expect(displayToKg(225, "imperial")).toBeCloseTo(102.06, 2);
    expect(cmToDisplay(180, "imperial")).toBe(70.9);
    expect(displayToCm(10, "imperial")).toBeCloseTo(25.4);
  });

  test("parses user input", () => {
    expect(parseNumberInput(" 72,5 ")).toBe(72.5);
    expect(parseNumberInput("")).toBeNull();
    expect(parseNumberInput("abc")).toBeNull();
  });
});
