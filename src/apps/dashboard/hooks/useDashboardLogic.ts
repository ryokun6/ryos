import { useState, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useTranslatedHelpItems } from "@/hooks/useTranslatedHelpItems";
import { useThemeStore } from "@/stores/useThemeStore";
import {
  DASHBOARD_WIDGET_DEFAULT_SIZES,
  LEGACY_CALENDAR_WIDGET_HEIGHT,
  SHORT_CALENDAR_WIDGET_HEIGHT,
  useDashboardStore,
  type WidgetType,
} from "@/stores/useDashboardStore";
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
    updateWidget,
    resetToDefaults,
  } = useDashboardStore(
    useShallow((state) => ({
      widgets: state.widgets,
      addWidget: state.addWidget,
      removeWidget: state.removeWidget,
      moveWidget: state.moveWidget,
      bringToFront: state.bringToFront,
      updateWidget: state.updateWidget,
      resetToDefaults: state.resetToDefaults,
    }))
  );

  useEffect(() => {
    const targetHeight = DASHBOARD_WIDGET_DEFAULT_SIZES.calendar.height;
    widgets
      .filter(
        (widget) =>
          widget.type === "calendar" &&
          (
            widget.size.height === LEGACY_CALENDAR_WIDGET_HEIGHT ||
            widget.size.height === SHORT_CALENDAR_WIDGET_HEIGHT
          )
      )
      .forEach((widget) => {
        updateWidget(widget.id, {
          size: { ...widget.size, height: targetHeight },
        });
      });
  }, [updateWidget, widgets]);

  const handleAddWidget = useCallback(
    (type: WidgetType) => {
      const size = DASHBOARD_WIDGET_DEFAULT_SIZES[type];

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
