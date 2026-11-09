import { useDisplaySettingsStore } from "@/stores/useDisplaySettingsStore";
import { resolveReplaceAppleLogos } from "@/utils/replaceAppleLogos";

export { resolveReplaceAppleLogos } from "@/utils/replaceAppleLogos";

export function useReplaceAppleLogos(): boolean {
  const stored = useDisplaySettingsStore((state) => state.replaceAppleLogos);
  return resolveReplaceAppleLogos(stored);
}
