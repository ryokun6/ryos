import type { CalculatorMode } from "../hooks/useCalculatorLogic";
import type { CalculatorTheme } from "../components/types";

const DEFAULT_SIZES: Record<CalculatorMode, { width: number; height: number }> = {
  basic: { width: 240, height: 360 },
  scientific: { width: 320, height: 520 },
  conversion: { width: 300, height: 460 },
};

const AQUA_SIZES: Record<CalculatorMode, { width: number; height: number }> = {
  basic: { width: 198, height: 292 },
  scientific: { width: 338, height: 268 },
  conversion: { width: 280, height: 380 },
};

const SYSTEM7_SIZES: Record<CalculatorMode, { width: number; height: number }> = {
  basic: { width: 148, height: 208 },
  scientific: { width: 148, height: 208 },
  conversion: { width: 220, height: 320 },
};

export function getCalculatorWindowSize(
  mode: CalculatorMode,
  theme: CalculatorTheme
): { width: number; height: number } {
  if (theme === "aqua") return AQUA_SIZES[mode];
  if (theme === "system7") return SYSTEM7_SIZES[mode];
  return DEFAULT_SIZES[mode];
}

/** @deprecated use getCalculatorWindowSize */
export const CALCULATOR_WINDOW_SIZES = DEFAULT_SIZES;
