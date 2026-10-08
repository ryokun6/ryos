import type { UnitSystem } from "../types";

export const KG_PER_LB = 0.45359237;
export const CM_PER_IN = 2.54;

export function roundTo(value: number, step: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value / step) * step;
}

/** Trim floating-point noise (e.g. 72.30000000001 → 72.3). */
export function tidy(value: number, decimals = 1): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function kgToDisplay(kg: number, units: UnitSystem): number {
  return units === "imperial" ? tidy(kg / KG_PER_LB) : tidy(kg);
}

export function displayToKg(value: number, units: UnitSystem): number {
  return units === "imperial" ? value * KG_PER_LB : value;
}

export function cmToDisplay(cm: number, units: UnitSystem): number {
  return units === "imperial" ? tidy(cm / CM_PER_IN) : tidy(cm);
}

export function displayToCm(value: number, units: UnitSystem): number {
  return units === "imperial" ? value * CM_PER_IN : value;
}

export function weightUnitLabel(units: UnitSystem): "kg" | "lb" {
  return units === "imperial" ? "lb" : "kg";
}

export function lengthUnitLabel(units: UnitSystem): "cm" | "in" {
  return units === "imperial" ? "in" : "cm";
}

/** Parse a user-typed number; accepts comma decimals. Returns null for blanks/invalid. */
export function parseNumberInput(value: string): number | null {
  const trimmed = value.trim().replace(",", ".");
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}
