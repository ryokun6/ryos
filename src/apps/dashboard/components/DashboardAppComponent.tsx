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
import type { WidgetType } from "@/stores/useDashboardStore";

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

function ClockThumbnail({ isXp }: { isXp: boolean }) {
  const cx = 30, cy = 30, r = 22;
  return (
    <svg width={60} height={60} viewBox="0 0 60 60">
      <circle cx={cx} cy={cy} r={r + 4} fill={isXp ? "#fff" : "rgba(50,50,50,0.8)"} stroke={isXp ? "#808080" : "rgba(255,255,255,0.15)"} strokeWidth={1} />
      <circle cx={cx} cy={cy} r={r} fill={isXp ? "#fff" : "rgba(30,30,30,0.9)"} stroke={isXp ? "#999" : "rgba(255,255,255,0.1)"} strokeWidth={0.5} />
      {[12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((n) => {
        const a = ((n * 30 - 90) * Math.PI) / 180;
        return <text key={n} x={cx + (r - 6) * Math.cos(a)} y={cy + (r - 6) * Math.sin(a)} textAnchor="middle" dominantBaseline="central" fontSize={6} fontWeight="700" fill={isXp ? "#333" : "rgba(255,255,255,0.8)"} style={{ fontFamily: "Helvetica Neue, sans-serif" }}>{n}</text>;
      })}
      <line x1={cx} y1={cy} x2={cx} y2={cy - 12} stroke={isXp ? "#222" : "#ddd"} strokeWidth={2} strokeLinecap="round" />
      <line x1={cx} y1={cy} x2={cx + 10} y2={cy + 4} stroke={isXp ? "#222" : "#ddd"} strokeWidth={1.5} strokeLinecap="round" />
      <line x1={cx} y1={cy} x2={cx - 3} y2={cy + 14} stroke="#D95030" strokeWidth={0.8} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={2} fill="#D95030" />
    </svg>
  );
}

function CalendarThumbnail({ isXp }: { isXp: boolean }) {
  const now = new Date();
  const day = now.getDate();
  const dayName = new Intl.DateTimeFormat("en", { weekday: "short" }).format(now).toUpperCase();
  const monthName = new Intl.DateTimeFormat("en", { month: "short" }).format(now).toUpperCase();
  return (
    <svg width={60} height={70} viewBox="0 0 60 70">
      <rect x={4} y={4} width={52} height={62} rx={isXp ? 2 : 6} fill={isXp ? "#fff" : "rgba(40,40,40,0.85)"} stroke={isXp ? "#999" : "rgba(255,255,255,0.12)"} strokeWidth={0.5} />
      <rect x={4} y={4} width={52} height={16} rx={isXp ? 2 : 6} fill="#e74c3c" />
      <rect x={4} y={14} width={52} height={6} fill="#e74c3c" />
      <text x={30} y={15} textAnchor="middle" fontSize={8} fontWeight="700" fill="#fff" style={{ fontFamily: "Helvetica Neue, sans-serif" }}>{dayName}</text>
      <text x={30} y={48} textAnchor="middle" fontSize={24} fontWeight="300" fill={isXp ? "#000" : "#fff"} style={{ fontFamily: "Helvetica Neue, sans-serif" }}>{day}</text>
      <text x={30} y={61} textAnchor="middle" fontSize={7} fontWeight="600" fill={isXp ? "#666" : "rgba(255,255,255,0.5)"} style={{ fontFamily: "Helvetica Neue, sans-serif" }}>{monthName}</text>
    </svg>
  );
}

function WeatherThumbnail({ isXp }: { isXp: boolean }) {
  return (
    <svg width={70} height={50} viewBox="0 0 70 50">
      <rect x={2} y={2} width={66} height={46} rx={isXp ? 2 : 8} fill={isXp ? "#fff" : "rgba(40,40,40,0.85)"} stroke={isXp ? "#999" : "rgba(255,255,255,0.12)"} strokeWidth={0.5} />
      <text x={18} y={28} fontSize={20} style={{ fontFamily: "Apple Color Emoji, Segoe UI Emoji" }}>☀️</text>
      <text x={42} y={24} textAnchor="start" fontSize={16} fontWeight="200" fill={isXp ? "#000" : "#fff"} style={{ fontFamily: "Helvetica Neue, sans-serif" }}>72°</text>
      <text x={42} y={36} fontSize={6} fill={isXp ? "#666" : "rgba(255,255,255,0.5)"} style={{ fontFamily: "Helvetica Neue, sans-serif" }}>Sunny</text>
    </svg>
  );
}

function StocksThumbnail({ isXp }: { isXp: boolean }) {
  return (
    <svg width={60} height={60} viewBox="0 0 60 60">
      <rect x={3} y={3} width={54} height={54} rx={isXp ? 2 : 6} fill={isXp ? "#fff" : "rgba(40,40,40,0.85)"} stroke={isXp ? "#999" : "rgba(255,255,255,0.12)"} strokeWidth={0.5} />
      <text x={10} y={16} fontSize={6} fontWeight="700" fill={isXp ? "#000" : "rgba(255,255,255,0.8)"} style={{ fontFamily: "Helvetica Neue, sans-serif" }}>AAPL</text>
      <text x={42} y={16} fontSize={6} fontWeight="600" fill="#22c55e" style={{ fontFamily: "Helvetica Neue, sans-serif" }}>+1.2%</text>
      <polyline points="8,40 16,36 24,38 32,30 40,32 48,26 54,28" fill="none" stroke="#22c55e" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <line x1={8} y1={22} x2={8} y2={48} stroke={isXp ? "#ccc" : "rgba(255,255,255,0.1)"} strokeWidth={0.5} />
      <line x1={8} y1={48} x2={54} y2={48} stroke={isXp ? "#ccc" : "rgba(255,255,255,0.1)"} strokeWidth={0.5} />
    </svg>
  );
}

function IpodThumbnail({ isXp }: { isXp: boolean }) {
  return (
    <svg width={70} height={36} viewBox="0 0 70 36">
      <rect x={2} y={2} width={66} height={32} rx={16} fill={isXp ? "#fff" : "rgba(40,40,40,0.85)"} stroke={isXp ? "#999" : "rgba(255,255,255,0.12)"} strokeWidth={0.5} />
      <rect x={8} y={10} width={28} height={16} rx={3} fill={isXp ? "#e8e8e8" : "rgba(60,60,60,0.6)"} />
      <text x={22} y={21} textAnchor="middle" fontSize={6} fill={isXp ? "#333" : "rgba(255,255,255,0.7)"} style={{ fontFamily: "Helvetica Neue, sans-serif" }}>♫ Now Playing</text>
      <polygon points="46,12 46,24 54,18" fill={isXp ? "#333" : "rgba(255,255,255,0.6)"} />
      <line x1={58} y1={12} x2={58} y2={24} stroke={isXp ? "#333" : "rgba(255,255,255,0.4)"} strokeWidth={1.5} />
      <line x1={62} y1={12} x2={62} y2={24} stroke={isXp ? "#333" : "rgba(255,255,255,0.4)"} strokeWidth={1.5} />
    </svg>
  );
}

function TranslationThumbnail({ isXp }: { isXp: boolean }) {
  return (
    <svg width={66} height={50} viewBox="0 0 66 50">
      <rect x={2} y={2} width={62} height={46} rx={isXp ? 2 : 8} fill={isXp ? "#fff" : "rgba(40,40,40,0.85)"} stroke={isXp ? "#999" : "rgba(255,255,255,0.12)"} strokeWidth={0.5} />
      <text x={12} y={17} fontSize={7} fontWeight="600" fill={isXp ? "#000" : "rgba(255,255,255,0.8)"} style={{ fontFamily: "Helvetica Neue, sans-serif" }}>English</text>
      <rect x={8} y={20} width={50} height={10} rx={2} fill={isXp ? "#f0f0f0" : "rgba(60,60,60,0.5)"} stroke={isXp ? "#ccc" : "rgba(255,255,255,0.08)"} strokeWidth={0.5} />
      <text x={12} y={28} fontSize={6} fill={isXp ? "#333" : "rgba(255,255,255,0.5)"} style={{ fontFamily: "Helvetica Neue, sans-serif" }}>Hello</text>
      <text x={33} y={42} textAnchor="middle" fontSize={8} style={{ fontFamily: "Apple Color Emoji, Segoe UI Emoji" }}>🌐</text>
    </svg>
  );
}

function StickyNoteThumbnail() {
  return (
    <svg width={56} height={56} viewBox="0 0 56 56">
      <rect x={4} y={4} width={48} height={48} rx={2} fill="#FFFFA5" stroke="rgba(0,0,0,0.1)" strokeWidth={0.5} />
      <rect x={4} y={4} width={48} height={10} fill="rgba(0,0,0,0.05)" />
      <text x={10} y={28} fontSize={6} fill="rgba(0,0,0,0.35)" style={{ fontFamily: "'Marker Felt', cursive" }}>Notes...</text>
      <line x1={10} y1={32} x2={44} y2={32} stroke="rgba(0,0,0,0.06)" strokeWidth={0.5} />
      <line x1={10} y1={38} x2={38} y2={38} stroke="rgba(0,0,0,0.06)" strokeWidth={0.5} />
      <line x1={10} y1={44} x2={30} y2={44} stroke="rgba(0,0,0,0.06)" strokeWidth={0.5} />
    </svg>
  );
}

function DictionaryThumbnail({ isXp }: { isXp: boolean }) {
  return (
    <svg width={60} height={60} viewBox="0 0 60 60">
      <rect x={4} y={4} width={52} height={52} rx={isXp ? 2 : 6} fill={isXp ? "#fff" : "rgba(40,40,40,0.85)"} stroke={isXp ? "#999" : "rgba(255,255,255,0.12)"} strokeWidth={0.5} />
      <text x={30} y={18} textAnchor="middle" fontSize={7} fontWeight="700" fill={isXp ? "#000" : "rgba(255,255,255,0.8)"} style={{ fontFamily: "Helvetica Neue, sans-serif" }}>Dictionary</text>
      <rect x={10} y={22} width={40} height={8} rx={2} fill={isXp ? "#f0f0f0" : "rgba(60,60,60,0.5)"} stroke={isXp ? "#ccc" : "rgba(255,255,255,0.08)"} strokeWidth={0.5} />
      <text x={14} y={28.5} fontSize={5} fill={isXp ? "#999" : "rgba(255,255,255,0.3)"} style={{ fontFamily: "Helvetica Neue, sans-serif" }}>🔍 Search...</text>
      <text x={12} y={40} fontSize={6} fontWeight="700" fill={isXp ? "#000" : "rgba(255,255,255,0.7)"} style={{ fontFamily: "Georgia, serif" }}>hel·lo</text>
      <text x={12} y={48} fontSize={5} fill={isXp ? "#666" : "rgba(255,255,255,0.4)"} style={{ fontFamily: "Helvetica Neue, sans-serif" }}>exclamation</text>
    </svg>
  );
}

function WidgetThumbnail({ type, isXp }: { type: WidgetType; isXp: boolean }) {
  switch (type) {
    case "clock": return <ClockThumbnail isXp={isXp} />;
    case "calendar": return <CalendarThumbnail isXp={isXp} />;
    case "weather": return <WeatherThumbnail isXp={isXp} />;
    case "stocks": return <StocksThumbnail isXp={isXp} />;
    case "ipod": return <IpodThumbnail isXp={isXp} />;
    case "translation": return <TranslationThumbnail isXp={isXp} />;
    case "stickynote": return <StickyNoteThumbnail />;
    case "dictionary": return <DictionaryThumbnail isXp={isXp} />;
    default: return null;
  }
}

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
                whileHover={{ scale: 1.08, y: -4 }}
                whileTap={{ scale: 0.95 }}
                transition={{ type: "spring", stiffness: 400, damping: 20 }}
                className="flex items-center justify-center"
                style={{
                  filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.4))",
                }}
              >
                <WidgetThumbnail type={w.type} isXp={isXpTheme} />
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
              {widgets.map((widget) => (
                <motion.div
                  key={widget.id}
                  initial={{ opacity: 0, scale: 0.8, y: 30 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.8, y: 30 }}
                  transition={{
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
              ))}

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
