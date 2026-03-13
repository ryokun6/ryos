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
      const padding = 20;
      const bottomReserved = 120;

      const currentWidgets = useDashboardStore.getState().widgets;
      const maxZ = Math.max(0, ...currentWidgets.map((w) => w.zIndex ?? 0));

      const overlaps = (
        cx: number,
        cy: number,
        cw: number,
        ch: number
      ): boolean =>
        currentWidgets.some((w) => {
          const wx = w.position.x - padding;
          const wy = w.position.y - padding;
          const ww = w.size.width + padding * 2;
          const wh = w.size.height + padding * 2;
          return cx < wx + ww && cx + cw > wx && cy < wy + wh && cy + ch > wy;
        });

      const step = 20;
      const maxX = vw - size.width - margin;
      const maxY = vh - size.height - bottomReserved;
      let placed = false;
      let x = margin;
      let y = margin;

      for (let cy = margin; cy <= maxY; cy += step) {
        for (let cx = margin; cx <= maxX; cx += step) {
          if (!overlaps(cx, cy, size.width, size.height)) {
            x = cx;
            y = cy;
            placed = true;
            break;
          }
        }
        if (placed) break;
      }

      if (!placed) {
        const cascade = (currentWidgets.length % 10) * 30;
        x = Math.max(margin, Math.min(margin + cascade, maxX));
        y = Math.max(margin, Math.min(margin + cascade, maxY));
      }

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
