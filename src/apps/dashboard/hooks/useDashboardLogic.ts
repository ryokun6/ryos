import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useTranslatedHelpItems } from "@/hooks/useTranslatedHelpItems";
import { useThemeStore } from "@/stores/useThemeStore";
import { useDashboardStore, type WidgetType } from "@/stores/useDashboardStore";
import { helpItems } from "../metadata";
import { useShallow } from "zustand/react/shallow";

export function useDashboardLogic() {
  const { t } = useTranslation();
  const translatedHelpItems = useTranslatedHelpItems("dashboard", helpItems);

  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";

  const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false);
  const [isAboutDialogOpen, setIsAboutDialogOpen] = useState(false);

  const {
    widgets,
    addWidget,
    removeWidget,
    moveWidget,
    bringToFront,
    resetToDefaults,
  } = useDashboardStore(
    useShallow((state) => ({
      widgets: state.widgets,
      addWidget: state.addWidget,
      removeWidget: state.removeWidget,
      moveWidget: state.moveWidget,
      bringToFront: state.bringToFront,
      resetToDefaults: state.resetToDefaults,
    }))
  );

  const handleAddWidget = useCallback(
    (type: WidgetType) => {
      const sizeMap: Record<WidgetType, { width: number; height: number }> = {
        clock: { width: 170, height: 170 },
        calendar: { width: 240, height: 350 },
        weather: { width: 340, height: 180 },
        stocks: { width: 240, height: 340 },
        ipod: { width: 320, height: 125 },
        dictionary: { width: 240, height: 220 },
        stickynote: { width: 200, height: 200 },
        translation: { width: 300, height: 170 },
        calculator: { width: 160, height: 246 },
        converter: { width: 340, height: 150 },
      };
      const size = sizeMap[type];

      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const margin = 20;
      const bottomReserved = 120;
      const maxX = Math.max(margin, vw - size.width - margin);
      const maxY = Math.max(margin, vh - size.height - bottomReserved);
      const x = Math.max(margin, Math.min(200 + Math.floor(Math.random() * 200), maxX));
      const y = Math.max(margin, Math.min(100 + Math.floor(Math.random() * 100), maxY));

      const currentWidgets = useDashboardStore.getState().widgets;
      const maxZ = Math.max(0, ...currentWidgets.map((w) => w.zIndex ?? 0));

      addWidget({ type, position: { x, y }, size, zIndex: maxZ + 1 });
    },
    [addWidget]
  );

  return {
    t,
    translatedHelpItems,
    currentTheme,
    isXpTheme,
    isHelpDialogOpen,
    setIsHelpDialogOpen,
    isAboutDialogOpen,
    setIsAboutDialogOpen,
    widgets,
    handleAddWidget,
    removeWidget,
    moveWidget,
    bringToFront,
    resetToDefaults,
  };
}
