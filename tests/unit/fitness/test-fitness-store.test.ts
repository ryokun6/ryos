#!/usr/bin/env bun
import "../../helpers/local-storage-stub";
import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { settleAllPersistWrites } from "../../../src/utils/persistWriteQueue";
import {
  sanitizeBodyStat,
  sanitizeFoodEntry,
  sanitizeGoals,
  sanitizePlan,
  sanitizeWorkout,
  useFitnessStore,
} from "../../../src/stores/useFitnessStore";
import { useCloudSyncStore } from "../../../src/stores/useCloudSyncStore";
import { DELETION_BUCKET_PREFIXES, SYNC_CODECS } from "../../../src/sync/codecs";

const t = "01718180000000-0000-test";
const originalFitness = useFitnessStore.getState();
const originalCloud = useCloudSyncStore.getState();

afterAll(async () => {
  useFitnessStore.setState(originalFitness, true);
  useCloudSyncStore.setState(originalCloud, true);
  await settleAllPersistWrites();
});

function resetStores() {
  useFitnessStore.setState({
    workouts: [],
    bodyStats: [],
    foodEntries: [],
    goals: sanitizeGoals({}),
    planUpdatedAt: 0,
  });
  useCloudSyncStore.setState((state) => ({
    deletionMarkers: {
      ...state.deletionMarkers,
      fitnessWorkoutIds: {},
      fitnessBodyStatIds: {},
      fitnessFoodIds: {},
    },
  }));
}

describe("fitness sanitizers", () => {
  test("workouts drop malformed entries and sets", () => {
    expect(sanitizeWorkout({ date: "nope" }, "w1")).toBeNull();
    const workout = sanitizeWorkout(
      {
        date: "2026-10-08",
        focus: "push",
        entries: [
          { exerciseId: "Pullups", sets: [{ reps: 8.4, weightKg: 0 }, { reps: -1, weightKg: 5 }, null] },
          { name: "no id" },
        ],
      },
      "w1",
      10
    );
    expect(workout).toMatchObject({ id: "w1", focus: "push", createdAt: 10, notes: "" });
    expect(workout?.entries).toHaveLength(1);
    expect(workout?.entries[0]).toMatchObject({ exerciseId: "Pullups", name: "Pullups" });
    expect(workout?.entries[0].sets).toEqual([{ reps: 8, weightKg: 0 }]);
  });

  test("body stats require at least one value in range", () => {
    expect(sanitizeBodyStat({ date: "2026-10-08", weightKg: 5000 }, "b")).toBeNull();
    expect(sanitizeBodyStat({ date: "2026-10-08", waistCm: 80 }, "b")).toMatchObject({
      waistCm: 80,
      weightKg: null,
    });
  });

  test("food entries need items; oversized thumbnails are dropped", () => {
    expect(sanitizeFoodEntry({ date: "2026-10-08", items: [] }, "f")).toBeNull();
    const entry = sanitizeFoodEntry(
      {
        date: "2026-10-08",
        meal: "brunch",
        items: [{ name: "Toast", calories: 120, proteinG: 4, carbsG: 20, fatG: 2 }],
        thumbnail: `data:image/jpeg;base64,${"a".repeat(30_000)}`,
        source: "ai",
      },
      "f"
    );
    expect(entry).toMatchObject({ meal: "snack", name: "Toast", source: "ai", thumbnail: null });
  });

  test("plans and goals fall back to safe defaults", () => {
    const plan = sanitizePlan({ schedule: "bad", goals: { weeklyWorkoutTarget: 99 } }, 5);
    expect(plan?.schedule).toHaveLength(7);
    expect(plan?.goals.weeklyWorkoutTarget).toBe(3);
    expect(plan?.profile.activityLevel).toBe("moderate");
    expect(plan?.updatedAt).toBe(5);
  });
});

describe("fitness store", () => {
  beforeEach(resetStores);

  test("workout logging: one workout per day, deduped entries, set edits", () => {
    const store = useFitnessStore.getState();
    const id = store.ensureWorkout("2026-10-08", "push");
    expect(useFitnessStore.getState().ensureWorkout("2026-10-08")).toBe(id);
    const entryId = store.addWorkoutEntry(id, "Pullups", "Pullups")!;
    expect(store.addWorkoutEntry(id, "Pullups", "Pullups")).toBe(entryId);
    store.addSet(id, entryId, { reps: 8, weightKg: 0 });
    store.addSet(id, entryId, { reps: 6, weightKg: 10 });
    store.updateSet(id, entryId, 0, { reps: 10, weightKg: 0 });
    store.removeSet(id, entryId, 1);
    const workout = useFitnessStore.getState().workouts[0];
    expect(workout.focus).toBe("push");
    expect(workout.entries[0].sets).toEqual([{ reps: 10, weightKg: 0 }]);
  });

  test("deleting records tombstones", () => {
    const store = useFitnessStore.getState();
    const workoutId = store.ensureWorkout("2026-10-08");
    const bodyId = store.addBodyStat({
      date: "2026-10-08",
      weightKg: 80,
      bodyFatPct: null,
      waistCm: null,
      chestCm: null,
      hipsCm: null,
      armCm: null,
      thighCm: null,
    })!;
    const foodId = store.addFoodEntry({
      date: "2026-10-08",
      meal: "lunch",
      name: "Salad",
      items: [{ name: "Salad", portion: "1 bowl", calories: 300, proteinG: 10, carbsG: 20, fatG: 15 }],
      source: "manual",
      thumbnail: null,
    })!;
    store.deleteWorkout(workoutId);
    store.deleteBodyStat(bodyId);
    store.deleteFoodEntry(foodId);
    const markers = useCloudSyncStore.getState().deletionMarkers;
    expect(Object.keys(markers.fitnessWorkoutIds)).toEqual([workoutId]);
    expect(Object.keys(markers.fitnessBodyStatIds)).toEqual([bodyId]);
    expect(Object.keys(markers.fitnessFoodIds)).toEqual([foodId]);
    const state = useFitnessStore.getState();
    expect([state.workouts, state.bodyStats, state.foodEntries]).toEqual([[], [], []]);
  });

  test("weight goals record a starting weight", () => {
    const store = useFitnessStore.getState();
    store.addBodyStat({
      date: "2026-10-01",
      weightKg: 82,
      bodyFatPct: null,
      waistCm: null,
      chestCm: null,
      hipsCm: null,
      armCm: null,
      thighCm: null,
    });
    store.setGoals({ targetWeightKg: 76 });
    expect(useFitnessStore.getState().goals).toMatchObject({ targetWeightKg: 76, startWeightKg: 82 });
    expect(useFitnessStore.getState().planUpdatedAt).toBeGreaterThan(0);
    store.addStrengthGoal({ exerciseId: "Pullups", name: "Pullups", targetKg: 20 });
    store.addStrengthGoal({ exerciseId: "Pullups", name: "Pullups", targetKg: 25 });
    expect(useFitnessStore.getState().goals.strengthGoals.map((g) => g.targetKg)).toEqual([25]);
  });

  test("schedule edits and templates bump the plan timestamp", () => {
    const store = useFitnessStore.getState();
    store.applyScheduleTemplate("ppl");
    expect(useFitnessStore.getState().schedule.map((d) => d.focus)).toEqual([
      "push",
      "pull",
      "legs",
      "push",
      "pull",
      "legs",
      "rest",
    ]);
    store.setScheduleDay(6, { focus: "cardio" });
    store.setScheduleDay(9, { focus: "core" });
    expect(useFitnessStore.getState().schedule[6].focus).toBe("cardio");
  });
});

describe("fitness sync codec", () => {
  beforeEach(resetStores);

  test("collects one doc per record plus the plan once edited", () => {
    const store = useFitnessStore.getState();
    const workoutId = store.ensureWorkout("2026-10-08");
    let docs = SYNC_CODECS.fitness.collect({}) as Map<string, unknown>;
    expect(Array.from(docs.keys())).toEqual([`fitness/workout:${workoutId}`]);
    store.setUnits("imperial");
    store.setScheduleDay(0, { focus: "core" });
    docs = SYNC_CODECS.fitness.collect({}) as Map<string, unknown>;
    expect(docs.has("fitness/plan")).toBe(true);
    expect(JSON.stringify(docs.get("fitness/plan"))).not.toContain("imperial");
    expect(DELETION_BUCKET_PREFIXES.fitnessFoodIds).toBe("fitness/food:");
  });

  test("applies remote upserts, deletes and plan", async () => {
    const workoutId = useFitnessStore.getState().ensureWorkout("2026-10-08");
    await SYNC_CODECS.fitness.apply(
      [
        { k: `fitness/workout:${workoutId}`, del: true, t },
        { k: "fitness/workout:remote", v: { date: "2026-10-07", entries: [] }, t },
        { k: "fitness/body:bad", v: { date: "2026-10-07" }, t },
        {
          k: "fitness/food:f1",
          v: { date: "2026-10-07", items: [{ name: "Egg", calories: 70, proteinG: 6, carbsG: 0, fatG: 5 }] },
          t,
        },
        {
          k: "fitness/plan",
          v: { schedule: Array.from({ length: 7 }, () => ({ focus: "full", exerciseIds: [] })), updatedAt: 42 },
          t,
        },
      ],
      {}
    );
    const state = useFitnessStore.getState();
    expect(state.workouts.map((w) => w.id)).toEqual(["remote"]);
    expect(state.bodyStats).toEqual([]);
    expect(state.foodEntries.map((e) => e.name)).toEqual(["Egg"]);
    expect(state.schedule.every((d) => d.focus === "full")).toBe(true);
    expect(state.planUpdatedAt).toBe(42);
  });
});
