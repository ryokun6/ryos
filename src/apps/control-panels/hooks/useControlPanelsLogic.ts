import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useTranslatedHelpItems } from "@/hooks/useTranslatedHelpItems";
import { helpItems } from "..";
import type { ControlPanelsInitialData } from "@/apps/base/types";
import { useAppearanceSettings } from "./useAppearanceSettings";
import { useAccountSettings } from "./useAccountSettings";
import { useSystemSettings } from "./useSystemSettings";
import { useSyncSettings } from "./useSyncSettings";

export interface UseControlPanelsLogicProps {
  initialData?: ControlPanelsInitialData;
}

export function useControlPanelsLogic({
  initialData,
}: UseControlPanelsLogicProps) {
  const { t } = useTranslation();
  const translatedHelpItems = useTranslatedHelpItems(
    "control-panels",
    helpItems
  );
  const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false);
  const [isAboutDialogOpen, setIsAboutDialogOpen] = useState(false);

  const appearance = useAppearanceSettings({ initialData });
  const account = useAccountSettings();
  const system = useSystemSettings();
  const sync = useSyncSettings({
    username: account.username,
    isAuthenticated: account.isAuthenticated,
  });

  return {
    t,
    translatedHelpItems,
    isHelpDialogOpen,
    setIsHelpDialogOpen,
    isAboutDialogOpen,
    setIsAboutDialogOpen,
    ...appearance,
    ...account,
    ...system,
    ...sync,
  };
}
