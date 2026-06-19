import { useDisplaySettingsStore } from "@/stores/useDisplaySettingsStore";

/**
 * True when user-facing shader effects are globally enabled. Components should
 * avoid mounting shader renderers entirely when this is false.
 */
export function useShaderEffectsEnabled(): boolean {
  return useDisplaySettingsStore((state) => state.shaderEffectEnabled);
}
