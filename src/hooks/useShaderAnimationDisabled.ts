import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useBatterySaver } from "@/hooks/useBatterySaver";

/**
 * True when animated shader effects should be turned off entirely — either the
 * user prefers reduced motion, or the device is in a battery-saving state (low
 * battery and discharging, where detectable). Shader backgrounds fall back to a
 * static frame / CSS gradient when this is true, stopping their render loops.
 */
export function useShaderAnimationDisabled(): boolean {
  const prefersReducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const batterySaver = useBatterySaver();
  return prefersReducedMotion || batterySaver;
}
