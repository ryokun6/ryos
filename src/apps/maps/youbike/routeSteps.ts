import type { YouBikeRoutePlan, YouBikeRouteStep } from "./types";

/** One line for a turn: maneuver plus street when the street is not already in the text. */
export function formatYouBikeStepLabel(step: {
  instruction: string;
  streetName: string;
}): string {
  const instruction = step.instruction.trim();
  const street = step.streetName.trim();
  if (!street) return instruction;
  if (!instruction) return street;
  if (instruction.toLowerCase().includes(street.toLowerCase())) return instruction;
  return `${instruction} · ${street}`;
}

export function listYouBikeRouteSteps(plan: YouBikeRoutePlan): YouBikeRouteStep[] {
  return plan.legs.flatMap((leg) => leg.steps ?? []);
}
