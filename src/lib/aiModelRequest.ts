import { resolveClientAiModel, type SupportedModel } from "@/shared/aiModels";
import { useAppStore } from "@/stores/useAppStore";
import { useChatsStore } from "@/stores/useChatsStore";
import { useDisplaySettingsStore } from "@/stores/useDisplaySettingsStore";

/** Client-side model + debug flag for /api/chat and /api/ie-generate. */
export function getAiModelRequestFields(selected?: SupportedModel | null): {
  model: SupportedModel | null;
  debugMode: boolean;
} {
  const debugMode = useDisplaySettingsStore.getState().debugMode;
  const username = useChatsStore.getState().username;
  const stored = selected === undefined ? useAppStore.getState().aiModel : selected;
  return {
    model: resolveClientAiModel(stored, { username, debugMode }),
    debugMode,
  };
}
