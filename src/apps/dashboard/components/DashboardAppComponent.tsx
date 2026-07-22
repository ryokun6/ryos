import {
  lazy,
  Suspense,
  useEffect,
  useCallback,
  useState,
  useRef,
  type ComponentType,
  type LazyExoticComponent,
} from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { AppProps } from "@/apps/base/types";
import { AppWindowShell } from "@/components/shared/AppWindowShell";
import { AppHelpAboutDialogs } from "@/components/shared/AppHelpAboutDialogs";
import { appMetadata } from "../metadata";
import { useDashboardLogic } from "../hooks/useDashboardLogic";
import { WidgetChrome } from "@/components/layout/dashboard/WidgetChrome";
import { DashboardMenuBar } from "./DashboardMenuBar";
import { useAppStore } from "@/stores/useAppStore";
import { useTranslation } from "react-i18next";
import { Plus } from "@phosphor-icons/react";
import { useDashboardStore, type WidgetType } from "@/stores/useDashboardStore";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { WIDGET_ICONS } from "@/components/layout/dashboard/dashboardWidgetConstants";
import { WidgetBarIcon } from "@/components/layout/dashboard/WidgetBarIcon";

type WidgetFrontProps = {
  widgetId: string;
  isFlipped?: boolean;
};

type WidgetBackProps = {
  widgetId: string;
  onDone?: () => void;
};

type WidgetOverflowProps = {
  widgetId: string;
};

type LazyWidgetComponent<Props> = LazyExoticComponent<ComponentType<Props>>;

type WidgetRegistryEntry = {
  front: LazyWidgetComponent<WidgetFrontProps>;
  back?: LazyWidgetComponent<WidgetBackProps>;
  overflow?: LazyWidgetComponent<WidgetOverflowProps>;
};

function lazyWidget<Props>(
  loader: () => Promise<{ default: ComponentType<Props> }>
): LazyWidgetComponent<Props> {
  return lazy(loader);
}

const WIDGET_REGISTRY: Record<WidgetType, WidgetRegistryEntry> = {
  clock: {
    front: lazyWidget<WidgetFrontProps>(() =>
      import("@/components/layout/dashboard/ClockWidget").then((module) => ({
        default: module.ClockWidget,
      }))
    ),
    back: lazyWidget<WidgetBackProps>(() =>
      import("@/components/layout/dashboard/ClockWidget").then((module) => ({
        default: module.ClockBackPanel,
      }))
    ),
  },
  calendar: {
    front: lazyWidget<WidgetFrontProps>(() =>
      import("@/components/layout/dashboard/CalendarWidget").then((module) => ({
        default: module.CalendarWidget,
      }))
    ),
    back: lazyWidget<WidgetBackProps>(() =>
      import("@/components/layout/dashboard/CalendarWidget").then((module) => ({
        default: module.CalendarBackPanel,
      }))
    ),
  },
  weather: {
    front: lazyWidget<WidgetFrontProps>(() =>
      import("@/components/layout/dashboard/WeatherWidget").then((module) => ({
        default: module.WeatherWidget,
      }))
    ),
    back: lazyWidget<WidgetBackProps>(() =>
      import("@/components/layout/dashboard/WeatherWidget").then((module) => ({
        default: module.WeatherBackPanel,
      }))
    ),
    overflow: lazyWidget<WidgetOverflowProps>(() =>
      import("@/components/layout/dashboard/WeatherWidget").then((module) => ({
        default: module.WeatherEmojiOverflow,
      }))
    ),
  },
  stocks: {
    front: lazyWidget<WidgetFrontProps>(() =>
      import("@/components/layout/dashboard/StocksWidget").then((module) => ({
        default: module.StocksWidget,
      }))
    ),
    back: lazyWidget<WidgetBackProps>(() =>
      import("@/components/layout/dashboard/StocksWidget").then((module) => ({
        default: module.StocksBackPanel,
      }))
    ),
  },
  ipod: {
    front: lazyWidget<WidgetFrontProps>(() =>
      import("@/components/layout/dashboard/IpodWidget").then((module) => ({
        default: module.IpodWidget,
      }))
    ),
    back: lazyWidget<WidgetBackProps>(() =>
      import("@/components/layout/dashboard/IpodWidget").then((module) => ({
        default: module.IpodBackPanel,
      }))
    ),
  },
  translation: {
    front: lazyWidget<WidgetFrontProps>(() =>
      import("@/components/layout/dashboard/TranslationWidget").then((module) => ({
        default: module.TranslationWidget,
      }))
    ),
    back: lazyWidget<WidgetBackProps>(() =>
      import("@/components/layout/dashboard/TranslationWidget").then((module) => ({
        default: module.TranslationBackPanel,
      }))
    ),
  },
  currency: {
    front: lazyWidget<WidgetFrontProps>(() =>
      import("@/components/layout/dashboard/CurrencyWidget").then((module) => ({
        default: module.CurrencyWidget,
      }))
    ),
    back: lazyWidget<WidgetBackProps>(() =>
      import("@/components/layout/dashboard/CurrencyWidget").then((module) => ({
        default: module.CurrencyBackPanel,
      }))
    ),
  },
  stickynote: {
    front: lazyWidget<WidgetFrontProps>(() =>
      import("@/components/layout/dashboard/StickyNoteWidget").then((module) => ({
        default: module.StickyNoteWidget,
      }))
    ),
    back: lazyWidget<WidgetBackProps>(() =>
      import("@/components/layout/dashboard/StickyNoteWidget").then((module) => ({
        default: module.StickyNoteBackPanel,
      }))
    ),
  },
  dictionary: {
    front: lazyWidget<WidgetFrontProps>(() =>
      import("@/components/layout/dashboard/DictionaryWidget").then((module) => ({
        default: module.DictionaryWidget,
      }))
    ),
    back: lazyWidget<WidgetBackProps>(() =>
      import("@/components/layout/dashboard/DictionaryWidget").then((module) => ({
        default: module.DictionaryBackPanel,
      }))
    ),
  },
  aquarium: {
    front: lazyWidget<WidgetFrontProps>(() =>
      import("@/components/layout/dashboard/AquariumWidget").then((module) => ({
        default: module.AquariumWidget,
      }))
    ),
    overflow: lazyWidget<WidgetOverflowProps>(() =>
      import("@/components/layout/dashboard/AquariumWidget").then((module) => ({
        default: module.AquariumBubbleOverflow,
      }))
    ),
  },
  terrarium: {
    front: lazyWidget<WidgetFrontProps>(() =>
      import("@/components/layout/dashboard/TerrariumWidget").then((module) => ({
        default: module.TerrariumWidget,
      }))
    ),
    overflow: lazyWidget<WidgetOverflowProps>(() =>
      import("@/components/layout/dashboard/TerrariumWidget").then((module) => ({
        default: module.TerrariumFireflyOverflow,
      }))
    ),
  },
};

function WidgetContent({
  type,
  widgetId,
  isFlipped,
}: {
  type: WidgetType;
  widgetId: string;
  isFlipped?: boolean;
}) {
  const Front = WIDGET_REGISTRY[type].front;

  return (
    <Suspense fallback={null}>
      <Front widgetId={widgetId} isFlipped={isFlipped} />
    </Suspense>
  );
}

function WidgetBackContent({
  type,
  widgetId,
  onDone,
}: {
  type: WidgetType;
  widgetId: string;
  onDone: () => void;
}) {
  const Back = WIDGET_REGISTRY[type].back;
  if (!Back) return null;

  return (
    <Suspense fallback={null}>
      <Back widgetId={widgetId} onDone={onDone} />
    </Suspense>
  );
}

function WidgetOverflow({ type, widgetId }: { type: WidgetType; widgetId: string }) {
  const Overflow = WIDGET_REGISTRY[type].overflow;
  if (!Overflow) return null;

  return (
    <Suspense fallback={null}>
      <Overflow widgetId={widgetId} />
    </Suspense>
  );
}

function WidgetStrip({
  onAdd,
  isWindowsTheme,
  onHeightMeasured,
}: {
  onAdd: (type: WidgetType) => void;
  isWindowsTheme: boolean;
  onHeightMeasured?: (height: number) => void;
}) {
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!stripRef.current || !onHeightMeasured) return;
    const el = stripRef.current;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const h = entry.contentRect.height;
        if (h > 0) onHeightMeasured(h);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [onHeightMeasured]);

  const widgets: { type: WidgetType; label: string }[] = [
    { type: "clock", label: t("apps.dashboard.widgets.clock") },
    { type: "calendar", label: t("apps.dashboard.widgets.calendar") },
    { type: "weather", label: t("apps.dashboard.widgets.weather") },
    { type: "stocks", label: t("apps.dashboard.widgets.stocks") },
    { type: "ipod", label: t("apps.dashboard.widgets.ipod", "iPod") },
    { type: "translation", label: t("apps.dashboard.widgets.translation", "Translation") },
    { type: "currency", label: t("apps.dashboard.widgets.currencyConverter", "Currency Converter") },
    { type: "stickynote", label: t("apps.dashboard.widgets.stickyNote", "Sticky Note") },
    { type: "dictionary", label: t("apps.dashboard.widgets.dictionary", "Dictionary") },
    { type: "aquarium", label: t("apps.dashboard.widgets.aquarium", "Aquarium") },
    { type: "terrarium", label: t("apps.dashboard.widgets.terrarium", "Terrarium") },
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
        ref={stripRef}
        style={{
          background: isWindowsTheme
            ? "linear-gradient(to bottom, rgba(200,200,200,0.95), rgba(180,180,180,0.98))"
            : "linear-gradient(180deg, #404040 0%, #353535 30%, #2a2a2a 100%)",
          borderTop: isWindowsTheme
            ? "1px solid rgba(255,255,255,0.8)"
            : "1px solid rgba(255,255,255,0.15)",
          borderBottom: isWindowsTheme ? undefined : "1px solid #000",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Perforated metal dot pattern */}
        {!isWindowsTheme && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              backgroundImage: `radial-gradient(circle, rgba(0,0,0,0.35) 1px, transparent 1px)`,
              backgroundSize: "6px 6px",
              backgroundPosition: "0 0",
              pointerEvents: "none",
              zIndex: 0,
            }}
          />
        )}
        {/* Top inner highlight */}
        {!isWindowsTheme && (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: 1,
              background: "rgba(255,255,255,0.08)",
              pointerEvents: "none",
              zIndex: 1,
            }}
          />
        )}
        <div
          ref={scrollRef}
          className="widget-strip-scroll flex items-start gap-5 overflow-x-auto px-6 py-4"
          style={{
            justifyContent: "center",
            position: "relative",
            zIndex: 2,
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
                whileTap={{ scale: 0.95 }}
                transition={{ type: "spring", stiffness: 400, damping: 20 }}
                className="flex items-center justify-center"
                style={{
                  filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.4))",
                }}
              >
                <WidgetBarIcon
                  icon={WIDGET_ICONS[w.type]}
                  size={36}
                  alt={w.label}
                />
              </motion.div>
              <span
                className="text-[10px] font-bold text-center leading-tight max-w-[72px] truncate"
                style={{
                  color: isWindowsTheme ? "rgba(0,0,0,0.75)" : "rgba(255,255,255,0.7)",
                  textShadow: isWindowsTheme ? "none" : "0 1px 3px rgba(0,0,0,0.5)",
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
  const [stripHeight, setStripHeight] = useState(0);
  const isMobile = useMediaQuery("(max-width: 767px)");
  const mobileScrollRef = useRef<HTMLDivElement>(null);
  const prevWidgetCountRef = useRef(0);

  const {
    translatedHelpItems,
    isHelpDialogOpen,
    setIsHelpDialogOpen,
    isAboutDialogOpen,
    setIsAboutDialogOpen,
    isWindowsTheme,
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
      onAddCurrency={() => handleAddWidget("currency")}
      onAddStickyNote={() => handleAddWidget("stickynote")}
      onAddDictionary={() => handleAddWidget("dictionary")}
      onAddAquarium={() => handleAddWidget("aquarium")}
      onAddTerrarium={() => handleAddWidget("terrarium")}
      onResetWidgets={resetToDefaults}
    />
  );

  const showOverlay = isWindowOpen && !isClosing;

  useEffect(() => {
    if (!isMobile) {
      prevWidgetCountRef.current = widgets.length;
      return;
    }
    const prev = prevWidgetCountRef.current;
    prevWidgetCountRef.current = widgets.length;
    if (widgets.length <= prev) return;
    const container = mobileScrollRef.current;
    if (!container) return;
    // Defer to next frame so the new widget has been laid out.
    const raf = requestAnimationFrame(() => {
      const target = container.scrollHeight - container.clientHeight;
      try {
        container.scrollTo({ top: target, behavior: "smooth" });
      } catch {
        container.scrollTop = target;
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [widgets.length, isMobile]);

  useEffect(() => {
    if (!showOverlay) return;
    if (isMobile) return;
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
  }, [showOverlay, isMobile]);

  return (
    <AppWindowShell
      frameless
      alwaysRenderWhenClosed
      isWindowOpen={isWindowOpen}
      isWindowsTheme={isWindowsTheme}
      isForeground={isForeground}
      menuBar={menuBar}
      trailing={
        <>
          <AppHelpAboutDialogs
            appId="dashboard"
            helpItems={translatedHelpItems}
            metadata={appMetadata}
            isHelpOpen={isHelpDialogOpen}
            onHelpOpenChange={setIsHelpDialogOpen}
            isAboutOpen={isAboutDialogOpen}
            onAboutOpenChange={setIsAboutDialogOpen}
          />
        </>
      }
    >
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
              style={{ zIndex: 9998 }}
              onClick={(e) => {
                const target = e.target as HTMLElement;
                const isInteractive =
                  target.closest?.("[data-dashboard-widget]") ||
                  target.closest?.("[data-dashboard-strip]") ||
                  target.closest?.("[data-dashboard-add-btn]");
                if (!isInteractive) {
                  if (isPickerOpen) {
                    setIsPickerOpen(false);
                  } else {
                    handleClose();
                  }
                }
              }}
            >
              {/* Scrim - receives backdrop clicks (wrapper has pointer-events-none); overlay handles via delegation */}
              <div
                data-dashboard-scrim
                className="absolute inset-0"
                style={{
                  background: isWindowsTheme
                    ? "rgba(0,0,0,0.6)"
                    : "rgba(0,0,0,0.55)",
                }}
                onClick={() => {
                  if (isPickerOpen) setIsPickerOpen(false);
                  else handleClose();
                }}
              />
              {/* Widgets - pointer-events-none so scrim receives backdrop clicks */}
              {isMobile ? (
                <div
                  ref={mobileScrollRef}
                  className="absolute inset-0 overflow-y-auto overflow-x-hidden"
                  style={{
                    pointerEvents: "auto",
                    paddingTop: "calc(env(safe-area-inset-top, 0px) + 20px)",
                    paddingBottom: isPickerOpen
                      ? `calc(${stripHeight + 80}px + env(safe-area-inset-bottom, 0px))`
                      : "calc(80px + env(safe-area-inset-bottom, 0px))",
                    paddingLeft: 16,
                    paddingRight: 16,
                    WebkitOverflowScrolling: "touch",
                  }}
                >
                  <div
                    className="flex flex-col items-center"
                    style={{ gap: 16, width: "100%" }}
                  >
                    <AnimatePresence initial={false}>
                      {widgets.map((widget) => {
                        const maxAvailable = Math.max(0, window.innerWidth - 32);
                        const renderWidth = Math.min(widget.size.width, maxAvailable);
                        return (
                          <motion.div
                            key={widget.id}
                            data-dashboard-widget
                            layout
                            initial={{ opacity: 0, scale: 0.85 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.85, height: 0, marginTop: 0 }}
                            transition={{
                              duration: 0.3,
                              ease: [0.4, 0, 0.2, 1],
                            }}
                            style={{
                              position: "relative",
                              pointerEvents: "auto",
                            }}
                          >
                            <WidgetChrome
                              layout="stacked"
                              width={renderWidth}
                              height={widget.size.height}
                              x={0}
                              y={0}
                              zIndex={widget.zIndex ?? 1}
                              borderRadius={widget.type === "ipod" ? "9999px" : undefined}
                              hideDoneButton={widget.type === "ipod"}
                              onRemove={() => removeWidget(widget.id)}
                              overflowContent={<WidgetOverflow type={widget.type} widgetId={widget.id} />}
                              backContent={(onFlipBack) => <WidgetBackContent type={widget.type} widgetId={widget.id} onDone={onFlipBack} />}
                            >
                              {(isFlipped) => <WidgetContent type={widget.type} widgetId={widget.id} isFlipped={isFlipped} />}
                            </WidgetChrome>
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  </div>
                </div>
              ) : (
                <motion.div
                  data-dashboard-widget
                  className="absolute inset-0"
                  style={{ pointerEvents: "none" }}
                  animate={{ y: isPickerOpen ? -stripHeight : 0 }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                >
                  <AnimatePresence>
                    {widgets.map((widget) => (
                      <motion.div
                        key={widget.id}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        transition={{
                          duration: 0.3,
                          ease: [0.4, 0, 0.2, 1],
                        }}
                        style={{
                          position: "relative",
                          pointerEvents: "auto",
                          zIndex: widget.zIndex ?? 1,
                          transformOrigin: `${widget.position.x + widget.size.width / 2}px ${widget.position.y + widget.size.height / 2}px`,
                        }}
                      >
                        <WidgetChrome
                          width={widget.size.width}
                          height={widget.size.height}
                          x={widget.position.x}
                          y={widget.position.y}
                          zIndex={widget.zIndex ?? 1}
                          borderRadius={widget.type === "ipod" ? "9999px" : undefined}
                          hideDoneButton={widget.type === "ipod"}
                          onRemove={() => removeWidget(widget.id)}
                          onMove={(pos) => moveWidget(widget.id, pos)}
                          onBringToFront={() => bringToFront(widget.id)}
                          overflowContent={<WidgetOverflow type={widget.type} widgetId={widget.id} />}
                          backContent={(onFlipBack) => <WidgetBackContent type={widget.type} widgetId={widget.id} onDone={onFlipBack} />}
                        >
                          {(isFlipped) => <WidgetContent type={widget.type} widgetId={widget.id} isFlipped={isFlipped} />}
                        </WidgetChrome>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </motion.div>
              )}

              {/* Widget strip */}
              <AnimatePresence>
                {isPickerOpen && (
                  <div data-dashboard-strip>
                    <WidgetStrip
                      onAdd={handleAddWidget}
                      isWindowsTheme={isWindowsTheme}
                      onHeightMeasured={setStripHeight}
                    />
                  </div>
                )}
              </AnimatePresence>

              {/* + / × toggle button */}
              <motion.button
                data-dashboard-add-btn
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
                  background: isWindowsTheme
                    ? "rgba(255,255,255,0.85)"
                    : "linear-gradient(to bottom, rgba(60,60,60,0.7), rgba(30,30,30,0.6))",
                  border: isWindowsTheme
                    ? "1px solid #ACA899"
                    : "1px solid rgba(255,255,255,0.12)",
                  boxShadow: isWindowsTheme
                    ? "1px 1px 4px rgba(0,0,0,0.3)"
                    : "0 2px 8px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)",
                  color: isWindowsTheme ? "#000" : "rgba(255,255,255,0.7)",
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
    </AppWindowShell>
  );
}
