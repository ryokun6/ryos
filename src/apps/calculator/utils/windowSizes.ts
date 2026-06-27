import type { CalculatorMode } from "../hooks/useCalculatorLogic";
import type { CalculatorTheme } from "../components/types";

const DEFAULT_SIZES: Record<CalculatorMode, { width: number; height: number }> = {
  basic: { width: 240, height: 360 },
  scientific: { width: 320, height: 520 },
  conversion: { width: 300, height: 420 },
};

const AQUA_SIZES: Record<CalculatorMode, { width: number; height: number }> = {
  basic: { width: 240, height: 304 },
  scientific: { width: 420, height: 304 },
  conversion: { width: 280, height: 340 },
};

const SYSTEM7_SIZES: Record<CalculatorMode, { width: number; height: number }> = {
  basic: { width: 148, height: 208 },
  scientific: { width: 148, height: 208 },
  conversion: { width: 220, height: 300 },
};

const WINDOWS_SIZES: Record<CalculatorMode, { width: number; height: number }> = {
  basic: { width: 272, height: 300 },
  scientific: { width: 320, height: 480 },
  conversion: { width: 300, height: 420 },
};

export function getCalculatorWindowSize(
  mode: CalculatorMode,
  theme: CalculatorTheme
): { width: number; height: number } {
  if (theme === "aqua") return AQUA_SIZES[mode];
  if (theme === "system7") return SYSTEM7_SIZES[mode];
  if (theme === "win98" || theme === "xp") return WINDOWS_SIZES[mode];
  return DEFAULT_SIZES[mode];
}

/** @deprecated use getCalculatorWindowSize */
export const CALCULATOR_WINDOW_SIZES = DEFAULT_SIZES;
