import { useAppHelpAboutDialogs } from "@/hooks/useAppHelpAboutDialogs";
import { useTranslatedHelpItems } from "@/hooks/useTranslatedHelpItems";
import { useThemeStore } from "@/stores/useThemeStore";
import { useAssistantStore } from "@/stores/useAssistantStore";
import type { AssistantCharacterId } from "@/components/assistant/characters";
import { helpItems } from "../metadata";

export function useAssistantLogic() {
  const translatedHelpItems = useTranslatedHelpItems("assistant", helpItems);
  const currentTheme = useThemeStore((state) => state.current);
  const isWindowsTheme = currentTheme === "xp" || currentTheme === "win98";

  const {
    isHelpDialogOpen,
    setIsHelpDialogOpen,
    isAboutDialogOpen,
    setIsAboutDialogOpen,
  } = useAppHelpAboutDialogs();

  const enabled = useAssistantStore((state) => state.enabled);
  const setEnabled = useAssistantStore((state) => state.setEnabled);
  const characterId = useAssistantStore((state) => state.characterId);
  const setCharacterId = useAssistantStore((state) => state.setCharacterId);

  const selectCharacter = (id: AssistantCharacterId) => {
    setCharacterId(id);
    setEnabled(true);
  };

  return {
    translatedHelpItems,
    isWindowsTheme,
    isHelpDialogOpen,
    setIsHelpDialogOpen,
    isAboutDialogOpen,
    setIsAboutDialogOpen,
    enabled,
    setEnabled,
    characterId,
    selectCharacter,
  };
}
