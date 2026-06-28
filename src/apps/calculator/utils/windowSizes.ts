import type { CalculatorMode } from "../hooks/useCalculatorLogic";
import type { CalculatorTheme } from "../components/types";

const DEFAULT_SIZES: Record<CalculatorMode, { width: number; height: number }> = {
  basic: { width: 240, height: 360 },
  scientific: { width: 320, height: 520 },
  conversion: { width: 300, height: 420 },
};

const AQUA_SIZES: Record<CalculatorMode, { width: number; height: number }> = {
  basic: { width: 260, height: 304 },
  scientific: { width: 420, height: 304 },
  conversion: { width: 260, height: 360 },
};

const SYSTEM7_SIZES: Record<CalculatorMode, { width: number; height: number }> = {
  basic: { width: 176, height: 244 },
  scientific: { width: 176, height: 244 },
  conversion: { width: 220, height: 370 },
};

const WINDOWS_SIZES: Record<CalculatorMode, { width: number; height: number }> = {
  basic: { width: 272, height: 260 },
  scientific: { width: 320, height: 380 },
  conversion: { width: 300, height: 420 },
};

// On mobile (< 768px) the outer WindowFrame container has `p-2` padding
// (8px top + 8px bottom = 16px) which, with border-box sizing, is subtracted
// from the fixed window height and clips the calculator keypad. Add it back so
// the usable body height matches desktop.
const MOBILE_FRAME_BREAKPOINT = 768;
const MOBILE_FRAME_VERTICAL_PADDING = 16;

export function getCalculatorWindowSize(
  mode: CalculatorMode,
  theme: CalculatorTheme
): { width: number; height: number } {
  const base =
    theme === "aqua"
      ? AQUA_SIZES[mode]
      : theme === "system7"
        ? SYSTEM7_SIZES[mode]
        : theme === "win98" || theme === "xp"
          ? WINDOWS_SIZES[mode]
          : DEFAULT_SIZES[mode];

  const isMobile =
    typeof window !== "undefined" &&
    window.innerWidth < MOBILE_FRAME_BREAKPOINT;

  if (isMobile) {
    return {
      width: base.width,
      height: base.height + MOBILE_FRAME_VERTICAL_PADDING,
    };
  }

  return base;
}
