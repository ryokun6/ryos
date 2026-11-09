import { isIosShell } from "@/utils/platform";

/**
 * Effective "replace Apple logos" flag.
 *
 * `null` / `undefined` means auto: on in the iOS shell, off everywhere else.
 * An explicit boolean from Control Panels (debug) overrides that default.
 */
export function resolveReplaceAppleLogos(
  stored: boolean | null | undefined,
  inIosShell: boolean = isIosShell()
): boolean {
  if (typeof stored === "boolean") return stored;
  return inIosShell;
}
