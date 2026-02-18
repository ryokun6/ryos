import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useThemeStore } from "@/stores/useThemeStore";
import { appRegistry } from "@/config/appRegistry";
import type { AppId } from "@/config/appRegistryData";

export function useAppMenuBar(appId: AppId) {
  const { t } = useTranslation();
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const appName = appRegistry[appId]?.name || appId;
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  const isMacOsxTheme = currentTheme === "macosx";

  return {
    t,
    appName,
    isXpTheme,
    isMacOsxTheme,
    isShareDialogOpen,
    setIsShareDialogOpen,
  };
}
