import type { FoodItem } from "@/shared/fitness";

/**
 * How many people share one logged meal.
 * 1 means the whole meal is yours. The logged items are always your share;
 * `baseItems` keeps the full meal so a later split divides the originals
 * again instead of the already-divided numbers.
 */
export const FOOD_SPLIT_MIN = 1;
export const FOOD_SPLIT_MAX = 20;

export interface FoodSplitState {
  /** Your share. This is what the food log totals. */
  items: FoodItem[];
  /** Full meal before dividing. Mirrors `items` when `splitPeople` is 1. */
  baseItems: FoodItem[];
  splitPeople: number;
}

const UNICODE_FRACTIONS: Record<string, string> = {
  "½": "1/2",
  "⅓": "1/3",
  "⅔": "2/3",
  "¼": "1/4",
  "¾": "3/4",
  "⅛": "1/8",
  "⅜": "3/8",
  "⅝": "5/8",
  "⅞": "7/8",
};

/** Fractions and decimals, but not a number that is a percentage. */
const SCALABLE_NUMBER = /(\d+\s*\/\s*\d+|\d+(?:[.,]\d+)?)(?!\s*%)/g;

const COMMON_FRACTIONS: ReadonlyArray<readonly [number, string]> = [
  [1 / 8, "1/8"],
  [1 / 6, "1/6"],
  [1 / 4, "1/4"],
  [1 / 3, "1/3"],
  [3 / 8, "3/8"],
  [1 / 2, "1/2"],
  [5 / 8, "5/8"],
  [2 / 3, "2/3"],
  [3 / 4, "3/4"],
  [5 / 6, "5/6"],
  [7 / 8, "7/8"],
];

export function normalizeSplitPeople(value: unknown): number {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(n)) return FOOD_SPLIT_MIN;
  const rounded = Math.round(n);
  if (rounded <= FOOD_SPLIT_MIN) return FOOD_SPLIT_MIN;
  return Math.min(FOOD_SPLIT_MAX, rounded);
}

function roundMacro(value: number): number {
  return Math.round(value * 10) / 10;
}

function cloneItem(item: FoodItem): FoodItem {
  return {
    name: item.name,
    portion: item.portion,
    calories: item.calories,
    proteinG: item.proteinG,
    carbsG: item.carbsG,
    fatG: item.fatG,
  };
}

function parseNumberToken(token: string): number | null {
  const fraction = /^(\d+)\s*\/\s*(\d+)$/.exec(token);
  if (fraction) {
    const denominator = Number(fraction[2]);
    if (denominator === 0) return null;
    return Number(fraction[1]) / denominator;
  }
  const value = Number(token.replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

function formatPortionNumber(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0";
  const nearest = Math.round(value);
  if (Math.abs(value - nearest) < 0.045) return String(nearest);
  if (value < 10) {
    for (const [target, label] of COMMON_FRACTIONS) {
      if (Math.abs(value - target) < 0.04) return label;
    }
    const tenths = Math.round(value * 10) / 10;
    if (Math.abs(value - tenths) < 0.02) return String(tenths);
    return String(Math.round(value * 100) / 100);
  }
  return String(Math.round(value));
}

/** Scale numeric amounts in a portion string. Percentages are left alone. */
export function scalePortion(portion: string, factor: number): string {
  if (!portion || factor === 1 || !Number.isFinite(factor) || factor <= 0) return portion;
  const expanded = portion.replace(/[½⅓⅔¼¾⅛⅜⅝⅞]/g, (char) => UNICODE_FRACTIONS[char] ?? char);
  return expanded.replace(SCALABLE_NUMBER, (token) => {
    const value = parseNumberToken(token);
    if (value == null) return token;
    return formatPortionNumber(value * factor);
  });
}

export function divideFoodItem(item: FoodItem, people: number): FoodItem {
  const count = normalizeSplitPeople(people);
  if (count <= 1) return cloneItem(item);
  return {
    name: item.name,
    portion: scalePortion(item.portion, 1 / count),
    calories: Math.round(item.calories / count),
    proteinG: roundMacro(item.proteinG / count),
    carbsG: roundMacro(item.carbsG / count),
    fatG: roundMacro(item.fatG / count),
  };
}

export function divideFoodItems(items: readonly FoodItem[], people: number): FoodItem[] {
  return items.map((item) => divideFoodItem(item, people));
}

/** Turn one edited share back into the full-meal amount for that field. */
export function shareToBaseItem(share: FoodItem, people: number): FoodItem {
  const count = normalizeSplitPeople(people);
  if (count <= 1) return cloneItem(share);
  return {
    name: share.name,
    portion: scalePortion(share.portion, count),
    calories: Math.round(share.calories * count),
    proteinG: roundMacro(share.proteinG * count),
    carbsG: roundMacro(share.carbsG * count),
    fatG: roundMacro(share.fatG * count),
  };
}

export function foodSplitFromItems(items: readonly FoodItem[]): FoodSplitState {
  const cloned = items.map(cloneItem);
  return { splitPeople: 1, items: cloned.map(cloneItem), baseItems: cloned };
}

export function foodSplitFromEntry(entry: {
  items: readonly FoodItem[];
  baseItems?: readonly FoodItem[] | null;
  splitPeople?: number | null;
}): FoodSplitState {
  const splitPeople = normalizeSplitPeople(entry.splitPeople);
  if (splitPeople <= 1) return foodSplitFromItems(entry.items);
  const baseItems =
    entry.baseItems && entry.baseItems.length > 0
      ? entry.baseItems.map(cloneItem)
      : entry.items.map((item) => shareToBaseItem(item, splitPeople));
  return {
    splitPeople,
    baseItems,
    items: divideFoodItems(baseItems, splitPeople),
  };
}

export function changeFoodSplit(state: FoodSplitState, people: number): FoodSplitState {
  const splitPeople = normalizeSplitPeople(people);
  const source = state.baseItems.length > 0 ? state.baseItems : state.items;
  const baseItems = source.map(cloneItem);
  if (splitPeople <= 1) {
    const whole = baseItems.map(cloneItem);
    return { splitPeople: 1, baseItems: whole, items: baseItems.map(cloneItem) };
  }
  return {
    splitPeople,
    baseItems,
    items: divideFoodItems(baseItems, splitPeople),
  };
}

export function patchFoodSplitItem(
  state: FoodSplitState,
  index: number,
  patch: Partial<FoodItem>
): FoodSplitState {
  if (index < 0 || index >= state.items.length) return state;
  const items = state.items.map(cloneItem);
  const baseItems = state.baseItems.map(cloneItem);
  const nextShare: FoodItem = { ...items[index], ...patch };
  items[index] = nextShare;
  if (state.splitPeople <= 1) {
    baseItems[index] = cloneItem(nextShare);
    return { ...state, items, baseItems };
  }
  const base = baseItems[index] ?? shareToBaseItem(items[index], state.splitPeople);
  const nextBase: FoodItem = { ...base, name: nextShare.name };
  if (patch.portion !== undefined) nextBase.portion = scalePortion(nextShare.portion, state.splitPeople);
  if (patch.calories !== undefined) nextBase.calories = Math.round(nextShare.calories * state.splitPeople);
  if (patch.proteinG !== undefined) nextBase.proteinG = roundMacro(nextShare.proteinG * state.splitPeople);
  if (patch.carbsG !== undefined) nextBase.carbsG = roundMacro(nextShare.carbsG * state.splitPeople);
  if (patch.fatG !== undefined) nextBase.fatG = roundMacro(nextShare.fatG * state.splitPeople);
  baseItems[index] = nextBase;
  return { ...state, items, baseItems };
}

export function addFoodSplitItem(state: FoodSplitState, item: FoodItem): FoodSplitState {
  const share = cloneItem(item);
  const base = state.splitPeople <= 1 ? cloneItem(item) : shareToBaseItem(item, state.splitPeople);
  return {
    ...state,
    items: [...state.items.map(cloneItem), share],
    baseItems: [...state.baseItems.map(cloneItem), base],
  };
}

export function removeFoodSplitItem(state: FoodSplitState, index: number): FoodSplitState {
  return {
    ...state,
    items: state.items.filter((_, i) => i !== index).map(cloneItem),
    baseItems: state.baseItems.filter((_, i) => i !== index).map(cloneItem),
  };
}

/** Drop blank rows and omit split fields when the meal isn't shared. */
export function foodSplitForPersist(state: FoodSplitState): {
  items: FoodItem[];
  baseItems?: FoodItem[];
  splitPeople?: number;
} {
  const pairs = state.items.flatMap((share, index) => {
    const name = share.name.trim();
    if (!name) return [];
    const base = state.baseItems[index] ?? share;
    return [{ share: { ...share, name }, base: { ...base, name } }];
  });
  const items = pairs.map((pair) => pair.share);
  const splitPeople = normalizeSplitPeople(state.splitPeople);
  if (splitPeople <= 1) return { items };
  return {
    items,
    splitPeople,
    baseItems: pairs.map((pair) => pair.base),
  };
}
