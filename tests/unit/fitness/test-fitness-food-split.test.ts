import { describe, expect, test } from "bun:test";
import type { FoodItem } from "../../../src/shared/fitness";
import type { FoodEntry } from "../../../src/apps/fitness/types";
import { dailyTotals } from "../../../src/apps/fitness/utils/nutrition";
import {
  changeFoodSplit,
  divideFoodItem,
  foodSplitForPersist,
  foodSplitFromEntry,
  foodSplitFromItems,
  normalizeSplitPeople,
  patchFoodSplitItem,
  scalePortion,
} from "../../../src/apps/fitness/utils/foodSplit";

const pizza = (patch: Partial<FoodItem> = {}): FoodItem => ({
  name: "Pizza",
  portion: "1 pizza (800 g)",
  calories: 800,
  proteinG: 40,
  carbsG: 90.5,
  fatG: 32,
  ...patch,
});

describe("food split math", () => {
  test("normalizes the people count", () => {
    expect(normalizeSplitPeople(undefined)).toBe(1);
    expect(normalizeSplitPeople(1)).toBe(1);
    expect(normalizeSplitPeople(0)).toBe(1);
    expect(normalizeSplitPeople(-4)).toBe(1);
    expect(normalizeSplitPeople(2.4)).toBe(2);
    expect(normalizeSplitPeople(2.6)).toBe(3);
    expect(normalizeSplitPeople("4")).toBe(4);
    expect(normalizeSplitPeople("nope")).toBe(1);
    expect(normalizeSplitPeople(99)).toBe(20);
  });

  test("divides calories, macros, and portion amounts by 2, 3, 4, and a custom count", () => {
    expect(divideFoodItem(pizza(), 2)).toMatchObject({
      name: "Pizza",
      portion: "1/2 pizza (400 g)",
      calories: 400,
      proteinG: 20,
      carbsG: 45.3,
      fatG: 16,
    });
    expect(divideFoodItem(pizza({ calories: 100, proteinG: 10, carbsG: 10, fatG: 10, portion: "3 eggs" }), 3)).toMatchObject({
      calories: 33,
      proteinG: 3.3,
      carbsG: 3.3,
      fatG: 3.3,
      portion: "1 eggs",
    });
    expect(divideFoodItem(pizza({ portion: "1 slice (100 g)", calories: 400 }), 4).portion).toBe("1/4 slice (25 g)");
    expect(divideFoodItem(pizza({ calories: 700, portion: "700 g" }), 7)).toMatchObject({
      calories: 100,
      portion: "100 g",
    });
  });

  test("scales portion quantities and leaves percentages and numberless text alone", () => {
    expect(scalePortion("1 cup (180 g)", 1 / 2)).toBe("1/2 cup (90 g)");
    expect(scalePortion("2% milk (240 ml)", 1 / 2)).toBe("2% milk (120 ml)");
    expect(scalePortion("½ pizza", 1 / 2)).toBe("1/4 pizza");
    expect(scalePortion("1,5 cup", 1 / 2)).toBe("3/4 cup");
    expect(scalePortion("a handful", 1 / 3)).toBe("a handful");
    expect(scalePortion("", 1 / 2)).toBe("");
    expect(scalePortion("180 g", 1)).toBe("180 g");
  });

  test("changing the split recomputes from the original meal", () => {
    let state = foodSplitFromItems([pizza()]);
    state = changeFoodSplit(state, 2);
    expect(state.items[0].calories).toBe(400);
    expect(state.baseItems[0].calories).toBe(800);
    state = changeFoodSplit(state, 4);
    expect(state.items[0].calories).toBe(200);
    expect(state.items[0].portion).toBe("1/4 pizza (200 g)");
    expect(state.baseItems[0]).toMatchObject({ calories: 800, portion: "1 pizza (800 g)" });
    state = changeFoodSplit(state, 1);
    expect(state.splitPeople).toBe(1);
    expect(state.items[0]).toEqual(state.baseItems[0]);
    expect(state.items[0].calories).toBe(800);
    expect(state.items[0].portion).toBe("1 pizza (800 g)");
  });

  test("editing a share updates the original, then the next split uses that", () => {
    let state = changeFoodSplit(foodSplitFromItems([pizza()]), 2);
    state = patchFoodSplitItem(state, 0, { calories: 300 });
    expect(state.items[0].calories).toBe(300);
    expect(state.baseItems[0].calories).toBe(600);
    expect(state.baseItems[0].portion).toBe("1 pizza (800 g)");
    state = changeFoodSplit(state, 3);
    expect(state.items[0].calories).toBe(200);
    state = changeFoodSplit(state, 2);
    expect(state.items[0].calories).toBe(300);
  });

  test("editing a portion scales the original amount back up", () => {
    let state = changeFoodSplit(foodSplitFromItems([pizza({ portion: "180 g", calories: 180 })]), 2);
    expect(state.items[0].portion).toBe("90 g");
    state = patchFoodSplitItem(state, 0, { portion: "80 g" });
    expect(state.baseItems[0].portion).toBe("160 g");
    state = changeFoodSplit(state, 4);
    expect(state.items[0].portion).toBe("40 g");
  });

  test("opening a saved split does not divide the share again", () => {
    const saved = foodSplitForPersist(changeFoodSplit(foodSplitFromItems([pizza()]), 2));
    const reopened = foodSplitFromEntry({
      items: saved.items,
      baseItems: saved.baseItems,
      splitPeople: saved.splitPeople,
    });
    expect(reopened.items[0].calories).toBe(400);
    expect(reopened.baseItems[0].calories).toBe(800);
    const again = changeFoodSplit(reopened, 2);
    expect(again.items[0].calories).toBe(400);
  });

  test("daily totals count the share, not the full meal", () => {
    const split = foodSplitForPersist(changeFoodSplit(foodSplitFromItems([pizza()]), 2));
    const entry: FoodEntry = {
      id: "pizza",
      date: "2026-10-09",
      meal: "dinner",
      name: "Pizza",
      items: split.items,
      baseItems: split.baseItems,
      splitPeople: split.splitPeople,
      source: "manual",
      thumbnail: null,
      createdAt: 0,
      updatedAt: 0,
    };
    expect(dailyTotals([entry], "2026-10-09").calories).toBe(400);
  });
});
