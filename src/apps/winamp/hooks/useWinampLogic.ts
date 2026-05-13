import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useTranslatedHelpItems } from "@/hooks/useTranslatedHelpItems";
import { helpItems } from "..";
import { useThemeFlags } from "@/hooks/useThemeFlags";

export function useWinampLogic() {
  const { t } = useTranslation();
  const translatedHelpItems = useTranslatedHelpItems("winamp", helpItems);
  const { isWindowsTheme: isXpTheme } = useThemeFlags();

  const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false);
  const [isAboutDialogOpen, setIsAboutDialogOpen] = useState(false);

  return {
    t,
    translatedHelpItems,
    isXpTheme,
    isHelpDialogOpen,
    setIsHelpDialogOpen,
    isAboutDialogOpen,
    setIsAboutDialogOpen,
  };
}
