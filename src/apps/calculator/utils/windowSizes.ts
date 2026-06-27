import type { CalculatorMode } from "../hooks/useCalculatorLogic";

export const CALCULATOR_WINDOW_SIZES: Record<
  CalculatorMode,
  { width: number; height: number }
> = {
  basic: { width: 240, height: 360 },
  scientific: { width: 320, height: 520 },
  conversion: { width: 300, height: 460 },
};
