import { useEffect, useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { AppProps } from "@/apps/base/types";
import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { appMetadata } from "../metadata";
import { useDashboardLogic } from "../hooks/useDashboardLogic";
import { WidgetChrome } from "@/components/layout/dashboard/WidgetChrome";
import { ClockWidget, ClockBackPanel } from "@/components/layout/dashboard/ClockWidget";
import { CalendarWidget, CalendarBackPanel } from "@/components/layout/dashboard/CalendarWidget";
import { WeatherWidget, WeatherEmojiOverflow, WeatherBackPanel } from "@/components/layout/dashboard/WeatherWidget";
import { DashboardMenuBar } from "./DashboardMenuBar";
import { useAppStore } from "@/stores/useAppStore";
import { useTranslation } from "react-i18next";
import { Plus } from "@phosphor-icons/react";
import type { WidgetType } from "@/stores/useDashboardStore";

function WidgetContent({ type, widgetId }: { type: string; widgetId: string }) {
  switch (type) {
    case "clock":
      return <ClockWidget widgetId={widgetId} />;
    case "calendar":
      return <CalendarWidget widgetId={widgetId} />;
    case "weather":
      return <WeatherWidget widgetId={widgetId} />;
    default:
      return null;
  }
}

function WidgetBackContent({ type, widgetId, onDone }: { type: string; widgetId: string; onDone: () => void }) {
  switch (type) {
    case "clock":
      return <ClockBackPanel widgetId={widgetId} onDone={onDone} />;
    case "calendar":
      return <CalendarBackPanel widgetId={widgetId} />;
    case "weather":
      return <WeatherBackPanel widgetId={widgetId} onDone={onDone} />;
    default:
      return null;
  }
}

function WidgetOverflow({ type, widgetId }: { type: string; widgetId: string }) {
  if (type === "weather") return <WeatherEmojiOverflow widgetId={widgetId} />;
  return null;
}

// Widget picker tray — dark pill style matching karaoke controls
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
      initial={{ opacity: 0, y: 12, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 12, scale: 0.95 }}
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
          className="flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-all hover:brightness-125 active:scale-95"
          style={{
            background: isXpTheme
              ? "rgba(255,255,255,0.9)"
              : "linear-gradient(to bottom, rgba(60,60,60,0.7), rgba(30,30,30,0.6))",
            border: isXpTheme
              ? "1px solid #ACA899"
              : "1px solid rgba(255,255,255,0.1)",
            boxShadow: isXpTheme
              ? "1px 1px 4px rgba(0,0,0,0.3)"
              : "0 4px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)",
          }}
        >
          <span className="text-2xl">{w.icon}</span>
          <span
            className="text-[10px] font-medium"
            style={{ color: isXpTheme ? "#000" : "rgba(255,255,255,0.7)" }}
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
  const [isClosing, setIsClosing] = useState(false);

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
    bringToFront,
    resetToDefaults,
  } = useDashboardLogic();

  const handleClose = useCallback(() => {
    if (isClosing) return;
    setIsClosing(true);
  }, [isClosing]);

  const handleExitComplete = useCallback(() => {
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

  const showOverlay = isWindowOpen && !isClosing;

  return (
    <>
      {isWindowOpen && !isXpTheme && isForeground && menuBar}

      {createPortal(
        <AnimatePresence onExitComplete={handleExitComplete}>
          {showOverlay && (
            <motion.div
              key="dashboard-overlay"
              initial={{ opacity: 0, scale: 1.15 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.15 }}
              transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
              className="fixed inset-0 dashboard-overlay"
              style={{
                zIndex: 9998,
                background: isXpTheme
                  ? "rgba(0,0,0,0.6)"
                  : "rgba(0,0,0,0.55)",
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
                  style={{ zIndex: widget.zIndex ?? 1 }}
                >
                  <WidgetChrome
                    width={widget.size.width}
                    height={widget.size.height}
                    x={widget.position.x}
                    y={widget.position.y}
                    zIndex={widget.zIndex ?? 1}
                    onRemove={() => removeWidget(widget.id)}
                    onMove={(pos) => moveWidget(widget.id, pos)}
                    onBringToFront={() => bringToFront(widget.id)}
                    overflowContent={<WidgetOverflow type={widget.type} widgetId={widget.id} />}
                    backContent={(onFlipBack) => <WidgetBackContent type={widget.type} widgetId={widget.id} onDone={onFlipBack} />}
                  >
                    <WidgetContent type={widget.type} widgetId={widget.id} />
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

              {/* + Button */}
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
                className="absolute flex items-center justify-center transition-all hover:brightness-125 active:scale-95"
                style={{
                  bottom: 16,
                  left: 16,
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  background: isXpTheme
                    ? "rgba(255,255,255,0.85)"
                    : "linear-gradient(to bottom, rgba(60,60,60,0.7), rgba(30,30,30,0.6))",
                  border: isXpTheme
                    ? "1px solid #ACA899"
                    : "1px solid rgba(255,255,255,0.12)",
                  boxShadow: isXpTheme
                    ? "1px 1px 4px rgba(0,0,0,0.3)"
                    : "0 2px 8px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)",
                  color: isXpTheme ? "#000" : "rgba(255,255,255,0.7)",
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
