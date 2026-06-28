export type ConversionCategoryId =
  | "length"
  | "area"
  | "volume"
  | "mass"
  | "temperature"
  | "speed"
  | "time"
  | "pressure"
  | "energy"
  | "currency";

export interface ConversionUnit {
  id: string;
  labelKey: string;
  /** Multiply source value by factor to get base unit. Temperature uses special handlers. */
  factor?: number;
}

export interface ConversionCategory {
  id: ConversionCategoryId;
  labelKey: string;
  units: ConversionUnit[];
}

export const DEFAULT_CONVERSION_CATEGORY: ConversionCategoryId = "currency";
export const DEFAULT_CONVERSION_FROM_UNIT = "USD";
export const DEFAULT_CONVERSION_TO_UNIT = "EUR";

export const CONVERSION_CATEGORIES: ConversionCategory[] = [
  {
    id: "currency",
    labelKey: "apps.calculator.conversion.categories.currency",
    units: [
      { id: "USD", labelKey: "USD" },
      { id: "EUR", labelKey: "EUR" },
      { id: "GBP", labelKey: "GBP" },
      { id: "JPY", labelKey: "JPY" },
      { id: "CHF", labelKey: "CHF" },
      { id: "CAD", labelKey: "CAD" },
      { id: "AUD", labelKey: "AUD" },
      { id: "CNY", labelKey: "CNY" },
      { id: "INR", labelKey: "INR" },
      { id: "TWD", labelKey: "TWD" },
      { id: "SGD", labelKey: "SGD" },
      { id: "KRW", labelKey: "KRW" },
    ],
  },
  {
    id: "length",
    labelKey: "apps.calculator.conversion.categories.length",
    units: [
      { id: "m", labelKey: "apps.calculator.conversion.units.m", factor: 1 },
      { id: "km", labelKey: "apps.calculator.conversion.units.km", factor: 1000 },
      { id: "cm", labelKey: "apps.calculator.conversion.units.cm", factor: 0.01 },
      { id: "mm", labelKey: "apps.calculator.conversion.units.mm", factor: 0.001 },
      { id: "in", labelKey: "apps.calculator.conversion.units.in", factor: 0.0254 },
      { id: "ft", labelKey: "apps.calculator.conversion.units.ft", factor: 0.3048 },
      { id: "yd", labelKey: "apps.calculator.conversion.units.yd", factor: 0.9144 },
      { id: "mi", labelKey: "apps.calculator.conversion.units.mi", factor: 1609.344 },
    ],
  },
  {
    id: "area",
    labelKey: "apps.calculator.conversion.categories.area",
    units: [
      { id: "sqm", labelKey: "apps.calculator.conversion.units.sqm", factor: 1 },
      { id: "sqkm", labelKey: "apps.calculator.conversion.units.sqkm", factor: 1_000_000 },
      { id: "sqft", labelKey: "apps.calculator.conversion.units.sqft", factor: 0.09290304 },
      { id: "sqmi", labelKey: "apps.calculator.conversion.units.sqmi", factor: 2_589_988.110336 },
      { id: "acre", labelKey: "apps.calculator.conversion.units.acre", factor: 4046.8564224 },
      { id: "ha", labelKey: "apps.calculator.conversion.units.ha", factor: 10_000 },
    ],
  },
  {
    id: "volume",
    labelKey: "apps.calculator.conversion.categories.volume",
    units: [
      { id: "l", labelKey: "apps.calculator.conversion.units.l", factor: 1 },
      { id: "ml", labelKey: "apps.calculator.conversion.units.ml", factor: 0.001 },
      { id: "gal", labelKey: "apps.calculator.conversion.units.gal", factor: 3.785411784 },
      { id: "qt", labelKey: "apps.calculator.conversion.units.qt", factor: 0.946352946 },
      { id: "pt", labelKey: "apps.calculator.conversion.units.pt", factor: 0.473176473 },
      { id: "floz", labelKey: "apps.calculator.conversion.units.floz", factor: 0.0295735296 },
      { id: "cup", labelKey: "apps.calculator.conversion.units.cup", factor: 0.2365882365 },
    ],
  },
  {
    id: "mass",
    labelKey: "apps.calculator.conversion.categories.mass",
    units: [
      { id: "kg", labelKey: "apps.calculator.conversion.units.kg", factor: 1 },
      { id: "g", labelKey: "apps.calculator.conversion.units.g", factor: 0.001 },
      { id: "mg", labelKey: "apps.calculator.conversion.units.mg", factor: 0.000001 },
      { id: "lb", labelKey: "apps.calculator.conversion.units.lb", factor: 0.45359237 },
      { id: "oz", labelKey: "apps.calculator.conversion.units.oz", factor: 0.028349523125 },
      { id: "t", labelKey: "apps.calculator.conversion.units.t", factor: 1000 },
    ],
  },
  {
    id: "temperature",
    labelKey: "apps.calculator.conversion.categories.temperature",
    units: [
      { id: "c", labelKey: "apps.calculator.conversion.units.c" },
      { id: "f", labelKey: "apps.calculator.conversion.units.f" },
      { id: "k", labelKey: "apps.calculator.conversion.units.k" },
    ],
  },
  {
    id: "speed",
    labelKey: "apps.calculator.conversion.categories.speed",
    units: [
      { id: "mps", labelKey: "apps.calculator.conversion.units.mps", factor: 1 },
      { id: "kph", labelKey: "apps.calculator.conversion.units.kph", factor: 1 / 3.6 },
      { id: "mph", labelKey: "apps.calculator.conversion.units.mph", factor: 0.44704 },
      { id: "knot", labelKey: "apps.calculator.conversion.units.knot", factor: 0.514444444 },
    ],
  },
  {
    id: "time",
    labelKey: "apps.calculator.conversion.categories.time",
    units: [
      { id: "s", labelKey: "apps.calculator.conversion.units.s", factor: 1 },
      { id: "min", labelKey: "apps.calculator.conversion.units.min", factor: 60 },
      { id: "hr", labelKey: "apps.calculator.conversion.units.hr", factor: 3600 },
      { id: "day", labelKey: "apps.calculator.conversion.units.day", factor: 86400 },
      { id: "wk", labelKey: "apps.calculator.conversion.units.wk", factor: 604800 },
    ],
  },
  {
    id: "pressure",
    labelKey: "apps.calculator.conversion.categories.pressure",
    units: [
      { id: "pa", labelKey: "apps.calculator.conversion.units.pa", factor: 1 },
      { id: "kpa", labelKey: "apps.calculator.conversion.units.kpa", factor: 1000 },
      { id: "bar", labelKey: "apps.calculator.conversion.units.bar", factor: 100_000 },
      { id: "atm", labelKey: "apps.calculator.conversion.units.atm", factor: 101_325 },
      { id: "psi", labelKey: "apps.calculator.conversion.units.psi", factor: 6894.757293168 },
    ],
  },
  {
    id: "energy",
    labelKey: "apps.calculator.conversion.categories.energy",
    units: [
      { id: "j", labelKey: "apps.calculator.conversion.units.j", factor: 1 },
      { id: "kj", labelKey: "apps.calculator.conversion.units.kj", factor: 1000 },
      { id: "cal", labelKey: "apps.calculator.conversion.units.cal", factor: 4.184 },
      { id: "kcal", labelKey: "apps.calculator.conversion.units.kcal", factor: 4184 },
      { id: "wh", labelKey: "apps.calculator.conversion.units.wh", factor: 3600 },
      { id: "kwh", labelKey: "apps.calculator.conversion.units.kwh", factor: 3_600_000 },
    ],
  },
];

function toCelsius(value: number, unitId: string): number {
  switch (unitId) {
    case "c":
      return value;
    case "f":
      return ((value - 32) * 5) / 9;
    case "k":
      return value - 273.15;
    default:
      return value;
  }
}

function fromCelsius(celsius: number, unitId: string): number {
  switch (unitId) {
    case "c":
      return celsius;
    case "f":
      return (celsius * 9) / 5 + 32;
    case "k":
      return celsius + 273.15;
    default:
      return celsius;
  }
}

export function convertLinearUnits(
  value: number,
  fromUnit: ConversionUnit,
  toUnit: ConversionUnit
): number {
  if (fromUnit.factor == null || toUnit.factor == null) return NaN;
  const base = value * fromUnit.factor;
  return base / toUnit.factor;
}

export function convertTemperature(
  value: number,
  fromUnitId: string,
  toUnitId: string
): number {
  const celsius = toCelsius(value, fromUnitId);
  return fromCelsius(celsius, toUnitId);
}

export function convertValue(
  value: number,
  categoryId: ConversionCategoryId,
  fromUnitId: string,
  toUnitId: string,
  currencyRate = 1
): number {
  if (!Number.isFinite(value)) return NaN;
  const category = CONVERSION_CATEGORIES.find((c) => c.id === categoryId);
  if (!category) return NaN;

  if (categoryId === "currency") {
    return value * currencyRate;
  }

  const fromUnit = category.units.find((u) => u.id === fromUnitId);
  const toUnit = category.units.find((u) => u.id === toUnitId);
  if (!fromUnit || !toUnit) return NaN;

  if (categoryId === "temperature") {
    return convertTemperature(value, fromUnitId, toUnitId);
  }

  return convertLinearUnits(value, fromUnit, toUnit);
}

export function getCategoryById(id: ConversionCategoryId): ConversionCategory {
  return CONVERSION_CATEGORIES.find((c) => c.id === id) ?? CONVERSION_CATEGORIES[0];
}
