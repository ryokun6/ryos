import { useEffect, useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { AppProps } from "@/apps/base/types";
import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { appMetadata } from "../metadata";
import { useDashboardLogic } from "../hooks/useDashboardLogic";
import { WidgetChrome } from "@/components/layout/dashboard/WidgetChrome";
import { ClockWidget } from "@/components/layout/dashboard/ClockWidget";
import { CalendarWidget } from "@/components/layout/dashboard/CalendarWidget";
import { WeatherWidget } from "@/components/layout/dashboard/WeatherWidget";
import { DashboardMenuBar } from "./DashboardMenuBar";
import { useAppStore } from "@/stores/useAppStore";
import { useTranslation } from "react-i18next";
import { Plus } from "@phosphor-icons/react";
import type { WidgetType } from "@/stores/useDashboardStore";

function WidgetContent({ type }: { type: string }) {
  switch (type) {
    case "clock":
      return <ClockWidget />;
    case "calendar":
      return <CalendarWidget />;
    case "weather":
      return <WeatherWidget />;
    default:
      return null;
  }
}

// Widget picker tray (shown when + is clicked)
function WidgetPicker({
  onAdd,
  onClose,
  isXpTheme,
}: {
  onAdd: (type: WidgetType) => void;
  onClose: () => void;
  isXpTheme: boolean;
}) {
  const { t } = useTranslation();

  const widgets: { type: WidgetType; icon: string; label: string }[] = [
    { type: "clock", icon: "🕐", label: t("apps.dashboard.widgets.clock") },
    { type: "calendar", icon: "📅", label: t("apps.dashboard.widgets.calendar") },
    { type: "weather", icon: "🌤️", label: t("apps.dashboard.widgets.weather") },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.9 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className="absolute bottom-14 left-4 flex gap-2"
      style={{ zIndex: 10 }}
    >
      {widgets.map((w) => (
        <button
          key={w.type}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onAdd(w.type);
            onClose();
          }}
          className="flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-transform hover:scale-105 active:scale-95"
          style={{
            background: isXpTheme
              ? "rgba(255,255,255,0.9)"
              : "rgba(255,255,255,0.15)",
            backdropFilter: isXpTheme ? "none" : "blur(12px)",
            WebkitBackdropFilter: isXpTheme ? "none" : "blur(12px)",
            border: isXpTheme
              ? "1px solid #ACA899"
              : "1px solid rgba(255,255,255,0.2)",
            boxShadow: isXpTheme
              ? "1px 1px 4px rgba(0,0,0,0.3)"
              : "0 4px 16px rgba(0,0,0,0.3)",
          }}
        >
          <span className="text-2xl">{w.icon}</span>
          <span
            className="text-[10px] font-medium"
            style={{
              color: isXpTheme ? "#000" : "rgba(255,255,255,0.8)",
            }}
          >
            {w.label}
          </span>
        </button>
      ))}
    </motion.div>
  );
}

export function DashboardAppComponent({
  isWindowOpen,
  onClose: _onClose,
  isForeground,
  instanceId,
}: AppProps) {
  const { t } = useTranslation();
  const closeAppInstance = useAppStore((state) => state.closeAppInstance);
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  const {
    translatedHelpItems,
    isHelpDialogOpen,
    setIsHelpDialogOpen,
    isAboutDialogOpen,
    setIsAboutDialogOpen,
    isXpTheme,
    widgets,
    handleAddWidget,
    removeWidget,
    moveWidget,
    resetToDefaults,
  } = useDashboardLogic();

  const handleClose = useCallback(() => {
    if (instanceId) {
      closeAppInstance(instanceId);
    }
  }, [instanceId, closeAppInstance]);

  useEffect(() => {
    if (!instanceId) return;
    const handleRequestClose = () => handleClose();
    window.addEventListener(`requestCloseWindow-${instanceId}`, handleRequestClose);
    return () => {
      window.removeEventListener(`requestCloseWindow-${instanceId}`, handleRequestClose);
    };
  }, [instanceId, handleClose]);

  useEffect(() => {
    if (!isWindowOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (isPickerOpen) {
          setIsPickerOpen(false);
        } else {
          handleClose();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isWindowOpen, handleClose, isPickerOpen]);

  const menuBar = (
    <DashboardMenuBar
      onClose={handleClose}
      onShowHelp={() => setIsHelpDialogOpen(true)}
      onShowAbout={() => setIsAboutDialogOpen(true)}
      onAddClock={() => handleAddWidget("clock")}
      onAddCalendar={() => handleAddWidget("calendar")}
      onAddWeather={() => handleAddWidget("weather")}
      onResetWidgets={resetToDefaults}
    />
  );

  if (!isWindowOpen) return null;

  return (
    <>
      {!isXpTheme && isForeground && menuBar}

      {createPortal(
        <AnimatePresence>
          {isWindowOpen && (
            <motion.div
              key="dashboard-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="fixed inset-0"
              style={{
                zIndex: 9998,
                background: isXpTheme
                  ? "rgba(0,0,0,0.6)"
                  : "rgba(0,0,0,0.5)",
                backdropFilter: isXpTheme ? "none" : "blur(24px) saturate(1.4)",
                WebkitBackdropFilter: isXpTheme ? "none" : "blur(24px) saturate(1.4)",
              }}
              onClick={(e) => {
                if (e.target === e.currentTarget) {
                  if (isPickerOpen) {
                    setIsPickerOpen(false);
                  } else {
                    handleClose();
                  }
                }
              }}
            >
              {/* Widgets */}
              {widgets.map((widget, index) => (
                <motion.div
                  key={widget.id}
                  initial={{ opacity: 0, scale: 0.8, y: 30 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.8, y: 30 }}
                  transition={{
                    delay: 0.04 * index,
                    duration: 0.35,
                    type: "spring",
                    stiffness: 300,
                    damping: 25,
                  }}
                >
                  <WidgetChrome
                    width={widget.size.width}
                    height={widget.size.height}
                    x={widget.position.x}
                    y={widget.position.y}
                    onRemove={() => removeWidget(widget.id)}
                    onMove={(pos) => moveWidget(widget.id, pos)}
                  >
                    <WidgetContent type={widget.type} />
                  </WidgetChrome>
                </motion.div>
              ))}

              {/* Widget picker tray */}
              <AnimatePresence>
                {isPickerOpen && (
                  <WidgetPicker
                    onAdd={handleAddWidget}
                    onClose={() => setIsPickerOpen(false)}
                    isXpTheme={isXpTheme}
                  />
                )}
              </AnimatePresence>

              {/* + Button (bottom-left, Tiger-style) */}
              <motion.button
                type="button"
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0 }}
                transition={{ delay: 0.2, type: "spring", stiffness: 400, damping: 25 }}
                onClick={(e) => {
                  e.stopPropagation();
                  setIsPickerOpen((prev) => !prev);
                }}
                className="absolute flex items-center justify-center transition-transform hover:scale-110 active:scale-95"
                style={{
                  bottom: 16,
                  left: 16,
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  background: isXpTheme
                    ? "rgba(255,255,255,0.85)"
                    : "rgba(255,255,255,0.15)",
                  backdropFilter: isXpTheme ? "none" : "blur(12px)",
                  WebkitBackdropFilter: isXpTheme ? "none" : "blur(12px)",
                  border: isXpTheme
                    ? "1px solid #ACA899"
                    : "1px solid rgba(255,255,255,0.3)",
                  boxShadow: isXpTheme
                    ? "1px 1px 4px rgba(0,0,0,0.3)"
                    : "0 2px 12px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.15)",
                  color: isXpTheme ? "#000" : "rgba(255,255,255,0.8)",
                  zIndex: 10,
                  transform: isPickerOpen ? "rotate(45deg)" : undefined,
                }}
                title={t("apps.dashboard.widgets.addWidget")}
              >
                <Plus size={18} weight="bold" />
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

      <HelpDialog
        isOpen={isHelpDialogOpen}
        onOpenChange={setIsHelpDialogOpen}
        appId="dashboard"
        helpItems={translatedHelpItems}
      />
      <AboutDialog
        isOpen={isAboutDialogOpen}
        onOpenChange={setIsAboutDialogOpen}
        metadata={appMetadata}
        appId="dashboard"
      />
    </>
  );
}
