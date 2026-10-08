import { sumFoodNutrients, type FoodNutrients } from "@/shared/fitness";
import type {
  ActivityLevel,
  FitnessGoals,
  FitnessProfile,
  FoodEntry,
  Meal,
  Sex,
} from "../types";
import { MEALS } from "../types";

export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  veryActive: 1.9,
};

export const DEFAULT_NUTRITION_TARGETS: FoodNutrients = {
  calories: 2000,
  proteinG: 120,
  carbsG: 225,
  fatG: 65,
};

const DEFICIT_KCAL = 500;
const SURPLUS_KCAL = 300;
const MAINTAIN_TOLERANCE_KG = 0.5;
const FAT_SHARE = 0.25;

export type WeightDirection = "lose" | "maintain" | "gain";

/** Mifflin-St Jeor basal metabolic rate (kcal/day). */
export function basalMetabolicRate(input: {
  sex: Sex;
  weightKg: number;
  heightCm: number;
  age: number;
}): number {
  const base = 10 * input.weightKg + 6.25 * input.heightCm - 5 * input.age;
  return base + (input.sex === "male" ? 5 : -161);
}

export function totalDailyEnergyExpenditure(bmr: number, activity: ActivityLevel): number {
  return bmr * ACTIVITY_FACTORS[activity];
}

export function ageFromBirthYear(birthYear: number | null, today: Date = new Date()): number | null {
  if (!birthYear || birthYear < 1900) return null;
  const age = today.getFullYear() - birthYear;
  return age >= 10 && age <= 110 ? age : null;
}

export function weightDirection(
  currentKg: number | null,
  targetKg: number | null
): WeightDirection {
  if (currentKg == null || targetKg == null) return "maintain";
  if (targetKg < currentKg - MAINTAIN_TOLERANCE_KG) return "lose";
  if (targetKg > currentKg + MAINTAIN_TOLERANCE_KG) return "gain";
  return "maintain";
}

export interface NutritionTargets extends FoodNutrients {
  bmr: number | null;
  tdee: number | null;
  direction: WeightDirection;
  /** False when profile data was missing and defaults were used. */
  isPersonalized: boolean;
}

/**
 * Daily calorie + macro targets derived from body stats and goals:
 * TDEE ±500/300 kcal toward the target weight, protein 1.8–2.0 g/kg,
 * fat 25% of calories, carbs fill the rest. Explicit overrides always win.
 */
export function computeNutritionTargets(input: {
  profile: FitnessProfile;
  goals: FitnessGoals;
  currentWeightKg: number | null;
  today?: Date;
}): NutritionTargets {
  const { profile, goals, currentWeightKg } = input;
  const age = ageFromBirthYear(profile.birthYear, input.today);
  const direction = weightDirection(currentWeightKg, goals.targetWeightKg);

  let base: FoodNutrients = { ...DEFAULT_NUTRITION_TARGETS };
  let bmr: number | null = null;
  let tdee: number | null = null;
  const canPersonalize = currentWeightKg != null && profile.heightCm != null && age != null;

  if (canPersonalize) {
    bmr = basalMetabolicRate({
      sex: profile.sex,
      weightKg: currentWeightKg,
      heightCm: profile.heightCm!,
      age: age!,
    });
    tdee = totalDailyEnergyExpenditure(bmr, profile.activityLevel);
    const adjustment =
      direction === "lose" ? -DEFICIT_KCAL : direction === "gain" ? SURPLUS_KCAL : 0;
    const floor = profile.sex === "male" ? 1500 : 1200;
    const calories = Math.max(floor, Math.round((tdee + adjustment) / 10) * 10);
    const proteinG = Math.round(currentWeightKg * (direction === "lose" ? 2.0 : 1.8));
    const fatG = Math.round((calories * FAT_SHARE) / 9);
    const carbsG = Math.max(0, Math.round((calories - proteinG * 4 - fatG * 9) / 4));
    base = { calories, proteinG, carbsG, fatG };
  }

  const overrides = goals.nutrition;
  return {
    calories: overrides.calories ?? base.calories,
    proteinG: overrides.proteinG ?? base.proteinG,
    carbsG: overrides.carbsG ?? base.carbsG,
    fatG: overrides.fatG ?? base.fatG,
    bmr: bmr == null ? null : Math.round(bmr),
    tdee: tdee == null ? null : Math.round(tdee),
    direction,
    isPersonalized: canPersonalize,
  };
}

export function entryTotals(entry: Pick<FoodEntry, "items">): FoodNutrients {
  return sumFoodNutrients(entry.items);
}

export function dailyTotals(entries: readonly FoodEntry[], date: string): FoodNutrients {
  return sumFoodNutrients(entries.filter((e) => e.date === date).flatMap((e) => e.items));
}

export function entriesByMeal(
  entries: readonly FoodEntry[],
  date: string
): Record<Meal, FoodEntry[]> {
  const grouped = Object.fromEntries(MEALS.map((meal) => [meal, [] as FoodEntry[]])) as Record<
    Meal,
    FoodEntry[]
  >;
  for (const entry of entries) {
    if (entry.date === date) grouped[entry.meal].push(entry);
  }
  for (const meal of MEALS) grouped[meal].sort((a, b) => a.createdAt - b.createdAt);
  return grouped;
}

export interface DayNutritionSummary {
  date: string;
  totals: FoodNutrients;
  entryCount: number;
}

/** Per-day totals, newest first. */
export function nutritionHistory(entries: readonly FoodEntry[]): DayNutritionSummary[] {
  const byDate = new Map<string, FoodEntry[]>();
  for (const entry of entries) {
    const list = byDate.get(entry.date) ?? [];
    list.push(entry);
    byDate.set(entry.date, list);
  }
  return [...byDate.entries()]
    .map(([date, list]) => ({
      date,
      totals: sumFoodNutrients(list.flatMap((e) => e.items)),
      entryCount: list.length,
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** Fraction of target consumed, clamped to [0, 2] for progress bars. */
export function targetProgress(consumed: number, target: number): number {
  if (!(target > 0)) return 0;
  return Math.min(2, Math.max(0, consumed / target));
}

/** Suggest a meal from the local hour (used as the default for new entries). */
export function mealForHour(hour: number): Meal {
  if (hour >= 4 && hour < 11) return "breakfast";
  if (hour >= 11 && hour < 16) return "lunch";
  if (hour >= 16 && hour < 22) return "dinner";
  return "snack";
}
