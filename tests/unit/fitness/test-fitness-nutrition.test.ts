import { describe, expect, test } from "bun:test";
import { sanitizeFoodItem, sumFoodNutrients } from "../../../src/shared/fitness";
import type {
  BodyStatEntry,
  FitnessGoals,
  FitnessProfile,
  FoodEntry,
  Workout,
} from "../../../src/apps/fitness/types";
import {
  ageFromBirthYear,
  basalMetabolicRate,
  computeNutritionTargets,
  dailyTotals,
  DEFAULT_NUTRITION_TARGETS,
  entriesByMeal,
  mealForHour,
  nutritionHistory,
  targetProgress,
  weightDirection,
} from "../../../src/apps/fitness/utils/nutrition";
import {
  bodyChange,
  bodySeries,
  latestBodyValue,
  weeklyWorkoutProgress,
  weightGoalProgress,
} from "../../../src/apps/fitness/utils/goals";

const profile: FitnessProfile = {
  sex: "male",
  birthYear: 1996,
  heightCm: 180,
  activityLevel: "moderate",
};

const goals = (patch: Partial<FitnessGoals> = {}): FitnessGoals => ({
  targetWeightKg: null,
  startWeightKg: null,
  weeklyWorkoutTarget: 3,
  nutrition: { calories: null, proteinG: null, carbsG: null, fatG: null },
  ...patch,
});

const today = new Date(2026, 9, 8);

describe("energy math", () => {
  test("Mifflin-St Jeor BMR", () => {
    expect(basalMetabolicRate({ sex: "male", weightKg: 80, heightCm: 180, age: 30 })).toBe(1780);
    expect(basalMetabolicRate({ sex: "female", weightKg: 60, heightCm: 165, age: 30 })).toBe(1320.25);
  });

  test("age and weight direction", () => {
    expect(ageFromBirthYear(1996, today)).toBe(30);
    expect(ageFromBirthYear(null, today)).toBeNull();
    expect(ageFromBirthYear(2025, today)).toBeNull();
    expect(weightDirection(80, 75)).toBe("lose");
    expect(weightDirection(80, 80.3)).toBe("maintain");
    expect(weightDirection(80, 85)).toBe("gain");
    expect(weightDirection(null, 85)).toBe("maintain");
  });
});

describe("nutrition targets", () => {
  test("defaults when profile data is missing", () => {
    const targets = computeNutritionTargets({
      profile: { ...profile, heightCm: null },
      goals: goals(),
      currentWeightKg: 80,
      today,
    });
    expect(targets).toMatchObject({ ...DEFAULT_NUTRITION_TARGETS, isPersonalized: false, bmr: null });
  });

  test("maintenance targets from TDEE with macro split", () => {
    const t = computeNutritionTargets({ profile, goals: goals(), currentWeightKg: 80, today });
    // BMR 1780 × 1.55 = 2759 → 2760.
    expect(t).toMatchObject({ bmr: 1780, tdee: 2759, calories: 2760, direction: "maintain" });
    expect(t.proteinG).toBe(144);
    expect(t.fatG).toBe(77);
    expect(t.carbsG).toBe(Math.round((2760 - 144 * 4 - 77 * 9) / 4));
    expect(t.isPersonalized).toBe(true);
  });

  test("cut/bulk adjust calories, floors apply, overrides win", () => {
    const cut = computeNutritionTargets({
      profile,
      goals: goals({ targetWeightKg: 72 }),
      currentWeightKg: 80,
      today,
    });
    expect(cut.calories).toBe(2260);
    expect(cut.proteinG).toBe(160);
    const bulk = computeNutritionTargets({
      profile,
      goals: goals({ targetWeightKg: 90 }),
      currentWeightKg: 80,
      today,
    });
    expect(bulk.calories).toBe(3060);
    const floor = computeNutritionTargets({
      profile: { sex: "female", birthYear: 1950, heightCm: 150, activityLevel: "sedentary" },
      goals: goals({ targetWeightKg: 40 }),
      currentWeightKg: 45,
      today,
    });
    expect(floor.calories).toBe(1200);
    const overridden = computeNutritionTargets({
      profile,
      goals: goals({ nutrition: { calories: 2000, proteinG: null, carbsG: 150, fatG: null } }),
      currentWeightKg: 80,
      today,
    });
    expect(overridden.calories).toBe(2000);
    expect(overridden.carbsG).toBe(150);
    expect(overridden.proteinG).toBe(144);
  });
});

describe("food totals", () => {
  const entry = (id: string, date: string, meal: FoodEntry["meal"], calories: number, createdAt = 0): FoodEntry => ({
    id,
    date,
    meal,
    name: id,
    items: [
      { name: `${id}-a`, portion: "", calories, proteinG: 10, carbsG: 20.25, fatG: 5 },
      { name: `${id}-b`, portion: "", calories: 100, proteinG: 0.5, carbsG: 0, fatG: 1 },
    ],
    source: "manual",
    thumbnail: null,
    createdAt,
    updatedAt: createdAt,
  });
  const entries = [
    entry("oats", "2026-10-08", "breakfast", 300, 2),
    entry("eggs", "2026-10-08", "breakfast", 200, 1),
    entry("salad", "2026-10-08", "lunch", 400),
    entry("pizza", "2026-10-07", "dinner", 800),
  ];

  test("daily totals and grouping by meal", () => {
    expect(dailyTotals(entries, "2026-10-08")).toEqual({
      calories: 1200,
      proteinG: 31.5,
      carbsG: 60.8,
      fatG: 18,
    });
    const meals = entriesByMeal(entries, "2026-10-08");
    expect(meals.breakfast.map((e) => e.id)).toEqual(["eggs", "oats"]);
    expect(meals.dinner).toEqual([]);
  });

  test("history newest first", () => {
    const history = nutritionHistory(entries);
    expect(history.map((d) => [d.date, d.entryCount, d.totals.calories])).toEqual([
      ["2026-10-08", 3, 1200],
      ["2026-10-07", 1, 900],
    ]);
  });

  test("progress, meal suggestion, item sanitizing", () => {
    expect(targetProgress(1000, 2000)).toBe(0.5);
    expect(targetProgress(5000, 2000)).toBe(2);
    expect(targetProgress(100, 0)).toBe(0);
    expect(mealForHour(8)).toBe("breakfast");
    expect(mealForHour(13)).toBe("lunch");
    expect(mealForHour(19)).toBe("dinner");
    expect(mealForHour(23)).toBe("snack");
    expect(sanitizeFoodItem({ name: "  Rice ", calories: -5, proteinG: "4.44", carbsG: 9999 })).toEqual({
      name: "Rice",
      portion: "",
      calories: 0,
      proteinG: 4.4,
      carbsG: 500,
      fatG: 0,
    });
    expect(sanitizeFoodItem({ name: "" })).toBeNull();
    expect(sumFoodNutrients([])).toEqual({ calories: 0, proteinG: 0, carbsG: 0, fatG: 0 });
  });
});

describe("goals and body stats", () => {
  const stat = (date: string, weightKg: number | null, waistCm: number | null = null): BodyStatEntry => ({
    id: date,
    date,
    weightKg,
    bodyFatPct: null,
    waistCm,
    chestCm: null,
    hipsCm: null,
    armCm: null,
    thighCm: null,
    createdAt: 0,
    updatedAt: 0,
  });
  const stats = [stat("2026-10-01", 82, 90), stat("2026-09-01", 85), stat("2026-10-05", null, 88)];

  test("latest values, series and change", () => {
    expect(latestBodyValue(stats, "weightKg")).toEqual({ value: 82, date: "2026-10-01" });
    expect(latestBodyValue(stats, "waistCm")).toEqual({ value: 88, date: "2026-10-05" });
    expect(latestBodyValue([], "weightKg")).toBeNull();
    expect(bodySeries(stats, "weightKg").map((p) => p.value)).toEqual([85, 82]);
    expect(bodyChange(stats, "weightKg")).toBe(-3);
    expect(bodyChange(stats, "bodyFatPct")).toBeNull();
  });

  test("weight goal progress works for cutting and bulking", () => {
    expect(weightGoalProgress(goals({ targetWeightKg: 75, startWeightKg: 85 }), 80)).toMatchObject({
      fraction: 0.5,
      achieved: false,
    });
    expect(weightGoalProgress(goals({ targetWeightKg: 90, startWeightKg: 80 }), 92)).toMatchObject({
      fraction: 1,
      achieved: true,
    });
    expect(weightGoalProgress(goals({ targetWeightKg: 75, startWeightKg: 85 }), 88)?.fraction).toBe(0);
    expect(weightGoalProgress(goals(), 80)).toBeNull();
    expect(weightGoalProgress(goals({ targetWeightKg: 80, startWeightKg: 80 }), 80.2)?.achieved).toBe(true);
  });

  test("weekly workout goal", () => {
    const workouts: Workout[] = [
      {
        id: "w",
        date: "2026-10-06",
        focus: null,
        notes: "",
        createdAt: 0,
        updatedAt: 0,
        entries: [{ id: "e", exerciseId: "Bench", name: "Bench", sets: [{ reps: 1, weightKg: 90 }] }],
      },
    ];
    expect(weeklyWorkoutProgress(goals({ weeklyWorkoutTarget: 2 }), workouts, "2026-10-08")).toMatchObject({
      current: 1,
      target: 2,
      fraction: 0.5,
    });
  });
});
