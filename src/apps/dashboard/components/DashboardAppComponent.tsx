import { useEffect, useCallback } from "react";
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

export function DashboardAppComponent({
  isWindowOpen,
  onClose: _onClose,
  isForeground,
  instanceId,
}: AppProps) {
  const { t } = useTranslation();
  const closeAppInstance = useAppStore((state) => state.closeAppInstance);

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

  // Listen for close requests (from dock, menu bar, etc.)
  useEffect(() => {
    if (!instanceId) return;
    const handleRequestClose = () => handleClose();
    window.addEventListener(`requestCloseWindow-${instanceId}`, handleRequestClose);
    return () => {
      window.removeEventListener(`requestCloseWindow-${instanceId}`, handleRequestClose);
    };
  }, [instanceId, handleClose]);

  // Escape key closes dashboard
  useEffect(() => {
    if (!isWindowOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isWindowOpen, handleClose]);

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
      {/* Menu bar for macOS themes */}
      {!isXpTheme && isForeground && menuBar}

      {/* Dashboard overlay rendered as a portal */}
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
                  ? "rgba(0,0,0,0.5)"
                  : "rgba(0,0,0,0.45)",
                backdropFilter: isXpTheme ? "none" : "blur(30px) saturate(1.5)",
                WebkitBackdropFilter: isXpTheme ? "none" : "blur(30px) saturate(1.5)",
              }}
              onClick={(e) => {
                // Close when clicking on the backdrop (not a widget)
                if (e.target === e.currentTarget) {
                  handleClose();
                }
              }}
            >
              {/* Dashboard title */}
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.2 }}
                className="absolute top-4 left-0 right-0 text-center"
              >
                <span
                  className="text-sm font-medium"
                  style={{
                    color: isXpTheme ? "#FFF" : "rgba(255,255,255,0.6)",
                    textShadow: "0 1px 3px rgba(0,0,0,0.5)",
                  }}
                >
                  {t("apps.dashboard.title")}
                </span>
              </motion.div>

              {/* Widgets */}
              {widgets.map((widget, index) => (
                <motion.div
                  key={widget.id}
                  initial={{ opacity: 0, scale: 0.8, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.8, y: 20 }}
                  transition={{
                    delay: 0.05 * index,
                    duration: 0.3,
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
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* Dialogs */}
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
