import { useIsPhone } from "@/hooks/useIsPhone";
import { isLowPowerHardware } from "@/utils/performanceCheck";

/**
 * True when animated shader backgrounds should run in their reduced-quality
 * tier (lower internal resolution / frame rate / backing-buffer size).
 *
 * This covers phones AND low-power desktops (few CPU cores / little memory),
 * reusing the same hardware signal we probe at boot via
 * {@link isLowPowerHardware}. The phone check is reactive (it re-evaluates on
 * resize); the hardware check is a stable, cached per-session value.
 */
export function useReducedGraphics(): boolean {
  const isPhone = useIsPhone();
  return isPhone || isLowPowerHardware();
}
