import { AppProps } from "../../base/types";
import { WindowFrame } from "@/components/layout/WindowFrame";
import { CalendarMenuBar } from "./CalendarMenuBar";
import { EventDialog } from "./EventDialog";
import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { appMetadata } from "../metadata";
import { useCalendarLogic, type CalendarDayCell } from "../hooks/useCalendarLogic";
import { getTranslatedAppName } from "@/utils/i18n";
import { CaretLeft, CaretRight, Plus } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import type { CalendarEvent } from "@/stores/useCalendarStore";

const EVENT_COLOR_MAP: Record<string, string> = {
  blue: "#3B82F6",
  red: "#EF4444",
  green: "#22C55E",
  orange: "#F97316",
  purple: "#A855F7",
};

const DAY_HEADERS = ["S", "M", "T", "W", "T", "F", "S"];

function DayCell({
  cell,
  onClick,
  onDoubleClick,
  isXpTheme,
}: {
  cell: CalendarDayCell;
  onClick: () => void;
  onDoubleClick: () => void;
  isXpTheme: boolean;
}) {
  const maxDots = 3;
  const eventDots = cell.events.slice(0, maxDots);

  return (
    <button
      type="button"
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      className="flex flex-col items-center justify-start p-0.5 h-[44px] relative transition-colors select-none"
      style={{
        opacity: cell.isCurrentMonth ? 1 : 0.35,
        backgroundColor: cell.isSelected
          ? isXpTheme
            ? "#316AC5"
            : "#D4E6FC"
          : "transparent",
        borderRadius: isXpTheme ? "0px" : "4px",
      }}
    >
      <span
        className="text-xs font-medium leading-none"
        style={{
          width: "22px",
          height: "22px",
          lineHeight: "22px",
          textAlign: "center",
          borderRadius: "50%",
          backgroundColor: cell.isToday
            ? isXpTheme
              ? "#CC0000"
              : "#007AFF"
            : "transparent",
          color: cell.isToday
            ? "#FFFFFF"
            : cell.isSelected && isXpTheme
              ? "#FFFFFF"
              : undefined,
        }}
      >
        {cell.day}
      </span>
      {eventDots.length > 0 && (
        <div className="flex gap-0.5 mt-0.5">
          {eventDots.map((ev, i) => (
            <span
              key={i}
              className="w-1 h-1 rounded-full"
              style={{ backgroundColor: EVENT_COLOR_MAP[ev.color] || "#3B82F6" }}
            />
          ))}
        </div>
      )}
    </button>
  );
}

function EventRow({
  event,
  isSelected,
  onClick,
  onDoubleClick,
  isXpTheme,
}: {
  event: CalendarEvent;
  isSelected: boolean;
  onClick: () => void;
  onDoubleClick: () => void;
  isXpTheme: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      className="w-full flex items-center gap-2 px-2 py-1.5 text-left text-sm transition-colors rounded"
      style={{
        backgroundColor: isSelected
          ? isXpTheme
            ? "#316AC5"
            : "#D4E6FC"
          : "transparent",
        color: isSelected && isXpTheme ? "#FFFFFF" : undefined,
      }}
    >
      <span
        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
        style={{ backgroundColor: EVENT_COLOR_MAP[event.color] || "#3B82F6" }}
      />
      <div className="flex-1 min-w-0">
        <div className="truncate font-medium">{event.title}</div>
        {event.startTime && (
          <div className="text-xs opacity-60">
            {event.startTime}
            {event.endTime ? ` – ${event.endTime}` : ""}
          </div>
        )}
      </div>
    </button>
  );
}

export function CalendarAppComponent({
  isWindowOpen,
  onClose,
  isForeground,
  skipInitialSound,
  instanceId,
  onNavigateNext,
  onNavigatePrevious,
}: AppProps) {
  const {
    t,
    translatedHelpItems,
    isHelpDialogOpen,
    setIsHelpDialogOpen,
    isAboutDialogOpen,
    setIsAboutDialogOpen,
    isEventDialogOpen,
    setIsEventDialogOpen,
    isXpTheme,
    selectedDate,
    view,
    monthYearLabel,
    selectedDateLabel,
    calendarGrid,
    selectedDateEvents,
    editingEvent,
    selectedEventId,
    setSelectedEventId,
    navigateMonth,
    goToToday,
    setView,
    handleDateClick,
    handleDateDoubleClick,
    handleNewEvent,
    handleEditEvent,
    handleSaveEvent,
    handleDeleteSelectedEvent,
  } = useCalendarLogic();

  const menuBar = (
    <CalendarMenuBar
      onClose={onClose}
      onShowHelp={() => setIsHelpDialogOpen(true)}
      onShowAbout={() => setIsAboutDialogOpen(true)}
      onNewEvent={handleNewEvent}
      onDeleteEvent={handleDeleteSelectedEvent}
      hasSelectedEvent={!!selectedEventId}
      view={view}
      onSetView={setView}
      onGoToToday={goToToday}
    />
  );

  if (!isWindowOpen) return null;

  return (
    <>
      {!isXpTheme && isForeground && menuBar}
      <WindowFrame
        title={getTranslatedAppName("calendar")}
        onClose={onClose}
        isForeground={isForeground}
        appId="calendar"
        skipInitialSound={skipInitialSound}
        instanceId={instanceId}
        onNavigateNext={onNavigateNext}
        onNavigatePrevious={onNavigatePrevious}
        menuBar={isXpTheme ? menuBar : undefined}
        windowConstraints={{
          minWidth: 300,
          minHeight: 380,
        }}
      >
        <div className="flex flex-col h-full bg-[var(--os-color-window-bg)] font-os-ui overflow-hidden">
          {/* Header bar */}
          <div
            className="flex items-center justify-between px-3 py-2 border-b"
            style={{
              borderColor: isXpTheme ? "#ACA899" : "rgba(0,0,0,0.1)",
              background: isXpTheme
                ? "#ECE9D8"
                : "linear-gradient(180deg, rgba(255,255,255,0.9) 0%, rgba(240,240,240,0.9) 100%)",
            }}
          >
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => navigateMonth(-1)}
              >
                <CaretLeft size={14} weight="bold" />
              </Button>
              <span className="text-sm font-semibold min-w-[120px] text-center">
                {monthYearLabel}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => navigateMonth(1)}
              >
                <CaretRight size={14} weight="bold" />
              </Button>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs px-2"
                onClick={goToToday}
              >
                {t("apps.calendar.today")}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={handleNewEvent}
                title={t("apps.calendar.menu.newEvent")}
              >
                <Plus size={14} weight="bold" />
              </Button>
            </div>
          </div>

          {view === "month" ? (
            /* Month View */
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Day headers */}
              <div className="grid grid-cols-7 border-b" style={{ borderColor: isXpTheme ? "#ACA899" : "rgba(0,0,0,0.08)" }}>
                {DAY_HEADERS.map((d, i) => (
                  <div
                    key={i}
                    className="text-center text-xs font-medium py-1 select-none"
                    style={{
                      color: i === 0 || i === 6 ? (isXpTheme ? "#CC0000" : "#FF3B30") : undefined,
                      opacity: 0.6,
                    }}
                  >
                    {d}
                  </div>
                ))}
              </div>

              {/* Calendar grid */}
              <div className="flex-1 grid grid-rows-6">
                {calendarGrid.map((week, wi) => (
                  <div key={wi} className="grid grid-cols-7">
                    {week.map((cell) => (
                      <DayCell
                        key={cell.date}
                        cell={cell}
                        onClick={() => handleDateClick(cell.date)}
                        onDoubleClick={() => handleDateDoubleClick(cell.date)}
                        isXpTheme={isXpTheme}
                      />
                    ))}
                  </div>
                ))}
              </div>

              {/* Event list for selected date (compact, below grid) */}
              {selectedDateEvents.length > 0 && (
                <div
                  className="border-t px-2 py-1 max-h-[80px] overflow-y-auto"
                  style={{ borderColor: isXpTheme ? "#ACA899" : "rgba(0,0,0,0.08)" }}
                >
                  {selectedDateEvents.map((ev) => (
                    <EventRow
                      key={ev.id}
                      event={ev}
                      isSelected={selectedEventId === ev.id}
                      onClick={() => setSelectedEventId(ev.id)}
                      onDoubleClick={() => handleEditEvent(ev)}
                      isXpTheme={isXpTheme}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Day View */
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Day header */}
              <div
                className="px-3 py-2 border-b"
                style={{ borderColor: isXpTheme ? "#ACA899" : "rgba(0,0,0,0.08)" }}
              >
                <div className="text-sm font-semibold">{selectedDateLabel}</div>
              </div>

              {/* Event list */}
              <div className="flex-1 overflow-y-auto px-2 py-1">
                {selectedDateEvents.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-sm opacity-40">
                    {t("apps.calendar.event.noEvents")}
                  </div>
                ) : (
                  selectedDateEvents.map((ev) => (
                    <EventRow
                      key={ev.id}
                      event={ev}
                      isSelected={selectedEventId === ev.id}
                      onClick={() => setSelectedEventId(ev.id)}
                      onDoubleClick={() => handleEditEvent(ev)}
                      isXpTheme={isXpTheme}
                    />
                  ))
                )}
              </div>

              {/* Quick view toggle back to month */}
              <div
                className="border-t px-3 py-1.5 flex justify-between items-center"
                style={{ borderColor: isXpTheme ? "#ACA899" : "rgba(0,0,0,0.08)" }}
              >
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs px-2"
                  onClick={() => setView("month")}
                >
                  ← {t("apps.calendar.views.month")}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={handleNewEvent}
                  title={t("apps.calendar.menu.newEvent")}
                >
                  <Plus size={14} weight="bold" />
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Dialogs */}
        <EventDialog
          isOpen={isEventDialogOpen}
          onOpenChange={setIsEventDialogOpen}
          onSave={handleSaveEvent}
          editingEvent={editingEvent}
          selectedDate={selectedDate}
        />
        <HelpDialog
          isOpen={isHelpDialogOpen}
          onOpenChange={setIsHelpDialogOpen}
          appId="calendar"
          helpItems={translatedHelpItems}
        />
        <AboutDialog
          isOpen={isAboutDialogOpen}
          onOpenChange={setIsAboutDialogOpen}
          metadata={appMetadata}
          appId="calendar"
        />
      </WindowFrame>
    </>
  );
}
