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
    expect(entry?.splitPeople).toBeUndefined();
    expect(entry?.baseItems).toBeUndefined();
  });

  test("food split keeps the original meal and does not compound", () => {
    const legacy = sanitizeFoodEntry(
      {
        date: "2026-10-08",
        items: [{ name: "Toast", portion: "1 slice", calories: 120, proteinG: 4, carbsG: 20, fatG: 2 }],
      },
      "legacy"
    );
    expect(legacy?.items[0].calories).toBe(120);
    expect(legacy?.splitPeople).toBeUndefined();
    expect(legacy?.baseItems).toBeUndefined();
    expect("splitPeople" in (legacy ?? {})).toBe(false);

    const shared = sanitizeFoodEntry(
      {
        date: "2026-10-08",
        splitPeople: 2,
        baseItems: [{ name: "Pizza", portion: "1 pizza (800 g)", calories: 800, proteinG: 40, carbsG: 80, fatG: 30 }],
        items: [{ name: "Pizza", portion: "stale", calories: 1, proteinG: 1, carbsG: 1, fatG: 1 }],
      },
      "shared"
    );
    expect(shared).toMatchObject({
      splitPeople: 2,
      items: [{ calories: 400, proteinG: 20, portion: "1/2 pizza (400 g)" }],
      baseItems: [{ calories: 800, portion: "1 pizza (800 g)" }],
    });
    const again = sanitizeFoodEntry(shared, "shared");
    expect(again?.items[0].calories).toBe(400);
    expect(again?.baseItems?.[0].calories).toBe(800);

    const withoutBase = sanitizeFoodEntry(
      {
        date: "2026-10-08",
        splitPeople: 3,
        items: [{ name: "Cake", portion: "1 slice", calories: 200, proteinG: 3, carbsG: 30, fatG: 8 }],
      },
      "nobase"
    );
    expect(withoutBase?.items[0].calories).toBe(200);
    expect(withoutBase?.baseItems?.[0].calories).toBe(600);
    expect(sanitizeFoodEntry(withoutBase, "nobase")?.items[0].calories).toBe(200);
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

  test("food split survives save, rename, resplit, and undo", () => {
    const store = useFitnessStore.getState();
    const full = { name: "Pizza", portion: "1 pizza (800 g)", calories: 800, proteinG: 40, carbsG: 80, fatG: 30 };
    const id = store.addFoodEntry({
      date: "2026-10-08",
      meal: "dinner",
      name: "Pizza",
      items: [{ ...full, calories: 400, proteinG: 20, carbsG: 40, fatG: 15, portion: "1/2 pizza (400 g)" }],
      baseItems: [full],
      splitPeople: 2,
      source: "ai",
      thumbnail: null,
    })!;
    let entry = useFitnessStore.getState().foodEntries.find((item) => item.id === id)!;
    expect(entry).toMatchObject({ splitPeople: 2, items: [{ calories: 400 }], baseItems: [{ calories: 800 }] });

    store.updateFoodEntry(id, { name: "Pizza night" });
    entry = useFitnessStore.getState().foodEntries.find((item) => item.id === id)!;
    expect(entry.name).toBe("Pizza night");
    expect(entry.items[0].calories).toBe(400);
    expect(entry.baseItems?.[0].calories).toBe(800);

    store.updateFoodEntry(id, { splitPeople: 4, baseItems: entry.baseItems, items: entry.items });
    entry = useFitnessStore.getState().foodEntries.find((item) => item.id === id)!;
    expect(entry.splitPeople).toBe(4);
    expect(entry.items[0].calories).toBe(200);

    store.updateFoodEntry(id, {
      splitPeople: undefined,
      baseItems: undefined,
      items: entry.baseItems ?? entry.items,
    });
    entry = useFitnessStore.getState().foodEntries.find((item) => item.id === id)!;
    expect(entry.splitPeople).toBeUndefined();
    expect(entry.baseItems).toBeUndefined();
    expect(entry.items[0].calories).toBe(800);

    const sharedId = store.addFoodEntry({
      date: "2026-10-08",
      meal: "lunch",
      name: "Salad",
      items: [{ name: "Salad", portion: "1/2 bowl", calories: 150, proteinG: 5, carbsG: 10, fatG: 8 }],
      baseItems: [{ name: "Salad", portion: "1 bowl", calories: 300, proteinG: 10, carbsG: 20, fatG: 16 }],
      splitPeople: 2,
      source: "manual",
      thumbnail: null,
    })!;
    const docs = SYNC_CODECS.fitness.collect({}) as Map<string, { splitPeople?: number; baseItems?: unknown[] }>;
    expect(docs.get(`fitness/food:${sharedId}`)).toMatchObject({
      splitPeople: 2,
      baseItems: [{ calories: 300 }],
      items: [{ calories: 150 }],
    });
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
          k: "fitness/food:f2",
          v: {
            date: "2026-10-07",
            name: "Pizza",
            splitPeople: 2,
            baseItems: [{ name: "Pizza", portion: "800 g", calories: 800, proteinG: 40, carbsG: 80, fatG: 30 }],
            items: [{ name: "Pizza", portion: "400 g", calories: 400, proteinG: 20, carbsG: 40, fatG: 15 }],
          },
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
    expect(state.foodEntries.map((e) => e.name)).toEqual(["Egg", "Pizza"]);
    expect(state.foodEntries[0].splitPeople).toBeUndefined();
    expect(state.foodEntries[1]).toMatchObject({
      splitPeople: 2,
      items: [{ calories: 400 }],
      baseItems: [{ calories: 800 }],
    });
    expect(state.schedule.every((d) => d.focus === "full")).toBe(true);
    expect(state.planUpdatedAt).toBe(42);
  });
});
