import { useEffect, useCallback, useState, useRef } from "react";
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
import { StocksWidget, StocksBackPanel } from "@/components/layout/dashboard/StocksWidget";
import { IpodWidget, IpodBackPanel } from "@/components/layout/dashboard/IpodWidget";
import { TranslationWidget, TranslationBackPanel } from "@/components/layout/dashboard/TranslationWidget";
import { StickyNoteWidget, StickyNoteBackPanel } from "@/components/layout/dashboard/StickyNoteWidget";
import { DictionaryWidget, DictionaryBackPanel } from "@/components/layout/dashboard/DictionaryWidget";
import { DashboardMenuBar } from "./DashboardMenuBar";
import { useAppStore } from "@/stores/useAppStore";
import { useTranslation } from "react-i18next";
import { Plus } from "@phosphor-icons/react";
import { useDashboardStore, type WidgetType } from "@/stores/useDashboardStore";

function WidgetContent({ type, widgetId }: { type: string; widgetId: string }) {
  switch (type) {
    case "clock":
      return <ClockWidget widgetId={widgetId} />;
    case "calendar":
      return <CalendarWidget widgetId={widgetId} />;
    case "weather":
      return <WeatherWidget widgetId={widgetId} />;
    case "stocks":
      return <StocksWidget widgetId={widgetId} />;
    case "ipod":
      return <IpodWidget widgetId={widgetId} />;
    case "translation":
      return <TranslationWidget widgetId={widgetId} />;
    case "stickynote":
      return <StickyNoteWidget widgetId={widgetId} />;
    case "dictionary":
      return <DictionaryWidget widgetId={widgetId} />;
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
    case "stocks":
      return <StocksBackPanel widgetId={widgetId} onDone={onDone} />;
    case "ipod":
      return <IpodBackPanel widgetId={widgetId} onDone={onDone} />;
    case "translation":
      return <TranslationBackPanel widgetId={widgetId} onDone={onDone} />;
    case "stickynote":
      return <StickyNoteBackPanel widgetId={widgetId} onDone={onDone} />;
    case "dictionary":
      return <DictionaryBackPanel widgetId={widgetId} onDone={onDone} />;
    default:
      return null;
  }
}

function WidgetOverflow({ type, widgetId }: { type: string; widgetId: string }) {
  if (type === "weather") return <WeatherEmojiOverflow widgetId={widgetId} />;
  return null;
}

const WIDGET_ICONS: Record<WidgetType, string> = {
  clock: "🕐",
  calendar: "📅",
  weather: "🌤️",
  stocks: "📈",
  ipod: "🎵",
  translation: "🌐",
  stickynote: "📝",
  dictionary: "📖",
};

function WidgetStrip({
  onAdd,
  isXpTheme,
}: {
  onAdd: (type: WidgetType) => void;
  isXpTheme: boolean;
}) {
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);

  const widgets: { type: WidgetType; label: string }[] = [
    { type: "clock", label: t("apps.dashboard.widgets.clock") },
    { type: "calendar", label: t("apps.dashboard.widgets.calendar") },
    { type: "weather", label: t("apps.dashboard.widgets.weather") },
    { type: "stocks", label: t("apps.dashboard.widgets.stocks") },
    { type: "ipod", label: t("apps.dashboard.widgets.ipod", "iPod") },
    { type: "translation", label: t("apps.dashboard.widgets.translation", "Translation") },
    { type: "stickynote", label: t("apps.dashboard.widgets.stickyNote", "Sticky Note") },
    { type: "dictionary", label: t("apps.dashboard.widgets.dictionary", "Dictionary") },
  ];

  return (
    <motion.div
      initial={{ y: "100%", opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: "100%", opacity: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="absolute bottom-0 left-0 right-0"
      style={{ zIndex: 11 }}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        style={{
          background: isXpTheme
            ? "linear-gradient(to bottom, rgba(200,200,200,0.95), rgba(180,180,180,0.98))"
            : "linear-gradient(to bottom, rgba(60,60,60,0.75), rgba(20,20,20,0.92))",
          borderTop: isXpTheme
            ? "1px solid rgba(255,255,255,0.8)"
            : "1px solid rgba(255,255,255,0.12)",
          backdropFilter: "blur(24px) saturate(1.5)",
          WebkitBackdropFilter: "blur(24px) saturate(1.5)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        <div
          ref={scrollRef}
          className="widget-strip-scroll flex items-start gap-5 overflow-x-auto px-6 py-4"
          style={{
            justifyContent: "center",
          }}
        >
          {widgets.map((w) => (
            <button
              key={w.type}
              type="button"
              onClick={() => onAdd(w.type)}
              className="flex flex-col items-center gap-1.5 shrink-0 group"
              style={{ minWidth: 72 }}
            >
              <motion.div
                whileHover={{ scale: 1.12, y: -4 }}
                whileTap={{ scale: 0.95 }}
                transition={{ type: "spring", stiffness: 400, damping: 20 }}
                className="flex items-center justify-center"
                style={{
                  filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.4))",
                }}
              >
                <span className="text-4xl">{WIDGET_ICONS[w.type]}</span>
              </motion.div>
              <span
                className="text-[10px] font-medium text-center leading-tight max-w-[72px] truncate"
                style={{
                  color: isXpTheme ? "rgba(0,0,0,0.75)" : "rgba(255,255,255,0.7)",
                  textShadow: isXpTheme ? "none" : "0 1px 3px rgba(0,0,0,0.5)",
                }}
              >
                {w.label}
              </span>
            </button>
          ))}
        </div>
      </div>
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
      onAddStocks={() => handleAddWidget("stocks")}
      onAddIpod={() => handleAddWidget("ipod")}
      onAddTranslation={() => handleAddWidget("translation")}
      onAddStickyNote={() => handleAddWidget("stickynote")}
      onAddDictionary={() => handleAddWidget("dictionary")}
      onResetWidgets={resetToDefaults}
    />
  );

  const showOverlay = isWindowOpen && !isClosing;

  useEffect(() => {
    if (!showOverlay) return;
    const reposition = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const store = useDashboardStore.getState();
      for (const w of store.widgets) {
        const { x, y } = w.position;
        const { width, height } = w.size;
        const fullyOut =
          x + width < 0 || x > vw || y + height < 0 || y > vh;
        if (fullyOut) {
          const margin = 20;
          const newX = Math.max(margin, Math.min(vw - width - margin, margin + Math.random() * 100));
          const newY = Math.max(margin, Math.min(vh - height - 120, margin + Math.random() * 100));
          store.moveWidget(w.id, { x: newX, y: newY });
        }
      }
    };
    reposition();
    window.addEventListener("resize", reposition);
    return () => window.removeEventListener("resize", reposition);
  }, [showOverlay]);

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
              {widgets.map((widget) => {
                const z = widget.zIndex ?? 1;
                return (
                <motion.div
                  key={widget.id}
                  initial={{ opacity: 0, scale: 0.8, y: 30, zIndex: z }}
                  animate={{ opacity: 1, scale: 1, y: 0, zIndex: z }}
                  exit={{ opacity: 0, scale: 0.8, y: 30 }}
                  transition={{
                    duration: 0.35,
                    type: "spring",
                    stiffness: 300,
                    damping: 25,
                  }}
                  style={{ zIndex: z }}
                >
                  <WidgetChrome
                    width={widget.size.width}
                    height={widget.size.height}
                    x={widget.position.x}
                    y={widget.position.y}
                    zIndex={widget.zIndex ?? 1}
                    borderRadius={widget.type === "ipod" ? "9999px" : undefined}
                    onRemove={() => removeWidget(widget.id)}
                    onMove={(pos) => moveWidget(widget.id, pos)}
                    onBringToFront={() => bringToFront(widget.id)}
                    overflowContent={<WidgetOverflow type={widget.type} widgetId={widget.id} />}
                    backContent={(onFlipBack) => <WidgetBackContent type={widget.type} widgetId={widget.id} onDone={onFlipBack} />}
                  >
                    <WidgetContent type={widget.type} widgetId={widget.id} />
                  </WidgetChrome>
                </motion.div>
                );
              })}

              {/* Widget strip */}
              <AnimatePresence>
                {isPickerOpen && (
                  <WidgetStrip
                    onAdd={handleAddWidget}
                    isXpTheme={isXpTheme}
                  />
                )}
              </AnimatePresence>

              {/* + / × toggle button */}
              <motion.button
                type="button"
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1, rotate: isPickerOpen ? 45 : 0 }}
                exit={{ opacity: 0, scale: 0 }}
                whileHover={{ filter: "brightness(1.25)" }}
                whileTap={{ scale: 0.95 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                onClick={(e) => {
                  e.stopPropagation();
                  setIsPickerOpen((prev) => !prev);
                }}
                className="absolute flex items-center justify-center"
                style={{
                  bottom: isPickerOpen
                    ? "calc(110px + env(safe-area-inset-bottom, 0px))"
                    : "calc(16px + env(safe-area-inset-bottom, 0px))",
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
                  zIndex: 12,
                  transition: "bottom 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
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
