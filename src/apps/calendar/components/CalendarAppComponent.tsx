import { useRef, useEffect, useState, useMemo, useCallback } from "react";
import { AppProps } from "../../base/types";
import { WindowFrame } from "@/components/layout/WindowFrame";
import { CalendarMenuBar } from "./CalendarMenuBar";
import { EventDialog } from "./EventDialog";
import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { appMetadata } from "../metadata";
import {
  useCalendarLogic,
  type CalendarDayCell,
  type WeekDay,
} from "../hooks/useCalendarLogic";
import { getTranslatedAppName } from "@/utils/i18n";
import { CaretLeft, CaretRight, Plus } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import type { CalendarEvent } from "@/stores/useCalendarStore";
import { useResizeObserverWithRef } from "@/hooks/useResizeObserver";

// ============================================================================
// CONSTANTS
// ============================================================================

const EVENT_COLOR_MAP: Record<string, string> = {
  blue: "#4A90D9",
  red: "#D94A4A",
  green: "#5AB55A",
  orange: "#E89B3E",
  purple: "#9B59B6",
};

const EVENT_COLOR_LIGHT: Record<string, string> = {
  blue: "#D4E6FC",
  red: "#FCDADA",
  green: "#DAFCDA",
  orange: "#FCECD4",
  purple: "#ECDAFC",
};

const HOUR_START = 7; // 7 AM
const HOUR_END = 21; // 9 PM
const HOUR_HEIGHT = 40; // px per hour row
const DAY_HEADERS_MONTH = ["S", "M", "T", "W", "T", "F", "S"];

// ============================================================================
// MINI CALENDAR (sidebar)
// ============================================================================

function MiniCalendar({
  calendarGrid,
  selectedDate,
  todayStr,
  onDateClick,
  isXpTheme,
  monthYearLabel,
  onPrevMonth,
  onNextMonth,
}: {
  calendarGrid: CalendarDayCell[][];
  selectedDate: string;
  todayStr: string;
  onDateClick: (date: string) => void;
  isXpTheme: boolean;
  monthYearLabel: string;
  onPrevMonth: () => void;
  onNextMonth: () => void;
}) {
  return (
    <div className="flex flex-col select-none" style={{ width: 160, minWidth: 160, flexShrink: 0 }}>
      {/* Mini month header */}
      <div className="flex items-center justify-between px-1 py-1">
        <button type="button" onClick={onPrevMonth} className="p-0.5 hover:opacity-70">
          <CaretLeft size={10} weight="bold" />
        </button>
        <span className="text-[10px] font-semibold">{monthYearLabel}</span>
        <button type="button" onClick={onNextMonth} className="p-0.5 hover:opacity-70">
          <CaretRight size={10} weight="bold" />
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7">
        {DAY_HEADERS_MONTH.map((d, i) => (
          <div
            key={i}
            className="text-center text-[9px] font-medium"
            style={{
              color: i === 0 || i === 6 ? (isXpTheme ? "#CC0000" : "#FF3B30") : undefined,
              opacity: 0.5,
            }}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Grid */}
      {calendarGrid.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7">
          {week.map((cell) => (
            <button
              key={cell.date}
              type="button"
              onClick={() => onDateClick(cell.date)}
              className="flex items-center justify-center h-[18px]"
              style={{ opacity: cell.isCurrentMonth ? 1 : 0.25 }}
            >
              <span
                className="text-[10px] leading-none flex items-center justify-center"
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  backgroundColor:
                    cell.date === todayStr
                      ? isXpTheme ? "#CC0000" : "#007AFF"
                      : cell.date === selectedDate
                        ? isXpTheme ? "#316AC5" : "#D4E6FC"
                        : "transparent",
                  color:
                    cell.date === todayStr
                      ? "#FFF"
                      : cell.date === selectedDate && isXpTheme
                        ? "#FFF"
                        : undefined,
                  fontWeight: cell.date === todayStr ? "bold" : "normal",
                }}
              >
                {cell.day}
              </span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// WEEK VIEW
// ============================================================================

function WeekTimeGrid({
  weekDates,
  selectedEventId,
  onDateClick,
  onTimeSlotClick,
  onEventClick,
  onEventDoubleClick,
  isXpTheme,
}: {
  weekDates: WeekDay[];
  selectedEventId: string | null;
  onDateClick: (date: string) => void;
  onTimeSlotClick: (date: string, hour: number) => void;
  onEventClick: (event: CalendarEvent) => void;
  onEventDoubleClick: (event: CalendarEvent) => void;
  isXpTheme: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [currentMinute, setCurrentMinute] = useState(() => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  });

  // Scroll to ~8 AM on mount
  useEffect(() => {
    if (scrollRef.current) {
      const scrollTo = (8 - HOUR_START) * HOUR_HEIGHT;
      scrollRef.current.scrollTop = Math.max(0, scrollTo - 20);
    }
  }, []);

  // Update current time indicator every minute
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      setCurrentMinute(now.getHours() * 60 + now.getMinutes());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const totalHours = HOUR_END - HOUR_START;

  // Check if any day has all-day events
  const hasAllDayEvents = weekDates.some((d) => d.allDayEvents.length > 0);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Column headers */}
      <div className="flex border-b" style={{ borderColor: isXpTheme ? "#ACA899" : "rgba(0,0,0,0.1)" }}>
        {/* Time gutter header */}
        <div style={{ width: 48, minWidth: 48, flexShrink: 0 }} />
        {/* Day columns */}
        {weekDates.map((day) => (
          <button
            key={day.date}
            type="button"
            onClick={() => onDateClick(day.date)}
            className="flex-1 text-center py-1.5 min-w-0 transition-colors"
            style={{
              backgroundColor: day.isToday
                ? isXpTheme ? "rgba(49,106,197,0.12)" : "rgba(0,122,255,0.08)"
                : "transparent",
              borderBottom: day.isToday
                ? `2px solid ${isXpTheme ? "#316AC5" : "#007AFF"}`
                : "2px solid transparent",
            }}
          >
            <div className="text-[10px] opacity-50 leading-none">{day.dayName}</div>
            <div
              className="text-sm font-semibold leading-tight mt-0.5"
              style={{
                color: day.isToday
                  ? isXpTheme ? "#316AC5" : "#007AFF"
                  : undefined,
              }}
            >
              {day.dayOfMonth}
            </div>
          </button>
        ))}
      </div>

      {/* All-day events row */}
      {hasAllDayEvents && (
        <div
          className="flex border-b"
          style={{
            borderColor: isXpTheme ? "#ACA899" : "rgba(0,0,0,0.08)",
            minHeight: 24,
          }}
        >
          <div
            className="flex items-center justify-end px-1 text-[9px] opacity-40"
            style={{ width: 48, minWidth: 48, flexShrink: 0 }}
          >
            all-day
          </div>
          {weekDates.map((day) => (
            <div key={day.date} className="flex-1 flex flex-col gap-px py-px px-px min-w-0">
              {day.allDayEvents.map((ev) => (
                <button
                  key={ev.id}
                  type="button"
                  onClick={() => onEventClick(ev)}
                  onDoubleClick={() => onEventDoubleClick(ev)}
                  className="text-[9px] truncate rounded px-1 leading-snug text-left"
                  style={{
                    backgroundColor: EVENT_COLOR_LIGHT[ev.color] || EVENT_COLOR_LIGHT.blue,
                    color: EVENT_COLOR_MAP[ev.color] || EVENT_COLOR_MAP.blue,
                    border: selectedEventId === ev.id
                      ? `1px solid ${EVENT_COLOR_MAP[ev.color] || EVENT_COLOR_MAP.blue}`
                      : "1px solid transparent",
                  }}
                >
                  {ev.title}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Scrollable time grid */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="flex relative" style={{ height: totalHours * HOUR_HEIGHT }}>
          {/* Time gutter */}
          <div style={{ width: 48, minWidth: 48, flexShrink: 0 }} className="relative">
            {Array.from({ length: totalHours }, (_, i) => {
              const hour = HOUR_START + i;
              const label =
                hour === 0 ? "12 AM" :
                hour < 12 ? `${hour} AM` :
                hour === 12 ? "12 PM" :
                `${hour - 12} PM`;
              return (
                <div
                  key={hour}
                  className="absolute right-1 text-[10px] opacity-40 text-right"
                  style={{ top: i * HOUR_HEIGHT - 6, width: 40 }}
                >
                  {label}
                </div>
              );
            })}
          </div>

          {/* Day columns */}
          {weekDates.map((day) => (
            <div
              key={day.date}
              className="flex-1 relative min-w-0"
              style={{
                backgroundColor: day.isToday
                  ? isXpTheme ? "rgba(49,106,197,0.04)" : "rgba(0,122,255,0.03)"
                  : "transparent",
              }}
            >
              {/* Hour grid lines */}
              {Array.from({ length: totalHours }, (_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => onTimeSlotClick(day.date, HOUR_START + i)}
                  className="absolute left-0 right-0 border-t hover:bg-black/[0.02] transition-colors"
                  style={{
                    top: i * HOUR_HEIGHT,
                    height: HOUR_HEIGHT,
                    borderColor: isXpTheme ? "rgba(0,0,0,0.08)" : "rgba(0,0,0,0.06)",
                  }}
                />
              ))}

              {/* Timed events */}
              {day.timedEvents.map((ev) => {
                const [sh, sm] = (ev.startTime || "9:00").split(":").map(Number);
                const [eh, em] = (ev.endTime || `${sh + 1}:00`).split(":").map(Number);
                const startMin = sh * 60 + sm;
                const endMin = eh * 60 + em;
                const top = ((startMin - HOUR_START * 60) / 60) * HOUR_HEIGHT;
                const height = Math.max(((endMin - startMin) / 60) * HOUR_HEIGHT, 18);

                return (
                  <button
                    key={ev.id}
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onEventClick(ev); }}
                    onDoubleClick={(e) => { e.stopPropagation(); onEventDoubleClick(ev); }}
                    className="absolute left-0.5 right-0.5 rounded text-left overflow-hidden transition-shadow"
                    style={{
                      top: Math.max(top, 0),
                      height,
                      backgroundColor: EVENT_COLOR_LIGHT[ev.color] || EVENT_COLOR_LIGHT.blue,
                      borderLeft: `3px solid ${EVENT_COLOR_MAP[ev.color] || EVENT_COLOR_MAP.blue}`,
                      boxShadow: selectedEventId === ev.id
                        ? `0 0 0 1px ${EVENT_COLOR_MAP[ev.color] || EVENT_COLOR_MAP.blue}`
                        : "0 1px 2px rgba(0,0,0,0.08)",
                      zIndex: 2,
                    }}
                  >
                    <div className="px-1 py-0.5">
                      <div
                        className="text-[10px] font-semibold truncate"
                        style={{ color: EVENT_COLOR_MAP[ev.color] || EVENT_COLOR_MAP.blue }}
                      >
                        {ev.startTime}
                      </div>
                      <div className="text-[10px] truncate leading-tight">{ev.title}</div>
                    </div>
                  </button>
                );
              })}

              {/* Current time line */}
              {day.isToday && (() => {
                const topPos = ((currentMinute - HOUR_START * 60) / 60) * HOUR_HEIGHT;
                if (topPos < 0 || topPos > totalHours * HOUR_HEIGHT) return null;
                return (
                  <div
                    className="absolute left-0 right-0 pointer-events-none"
                    style={{ top: topPos, zIndex: 5 }}
                  >
                    <div className="flex items-center">
                      <div
                        className="w-2 h-2 rounded-full -ml-1"
                        style={{ backgroundColor: isXpTheme ? "#CC0000" : "#FF3B30" }}
                      />
                      <div
                        className="flex-1 h-px"
                        style={{ backgroundColor: isXpTheme ? "#CC0000" : "#FF3B30" }}
                      />
                    </div>
                  </div>
                );
              })()}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// DAY VIEW (with hour grid — used on mobile too)
// ============================================================================

function DayTimeGrid({
  date,
  dateLabel,
  events,
  selectedEventId,
  onTimeSlotClick,
  onEventClick,
  onEventDoubleClick,
  isXpTheme,
}: {
  date: string;
  dateLabel: string;
  events: CalendarEvent[];
  selectedEventId: string | null;
  onTimeSlotClick: (date: string, hour: number) => void;
  onEventClick: (event: CalendarEvent) => void;
  onEventDoubleClick: (event: CalendarEvent) => void;
  isXpTheme: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [currentMinute, setCurrentMinute] = useState(() => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  });

  const allDayEvents = events.filter((ev) => !ev.startTime);
  const timedEvents = events
    .filter((ev) => !!ev.startTime)
    .sort((a, b) => (a.startTime || "").localeCompare(b.startTime || ""));

  const todayStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);
  const isToday = date === todayStr;

  useEffect(() => {
    if (scrollRef.current) {
      const scrollTo = (8 - HOUR_START) * HOUR_HEIGHT;
      scrollRef.current.scrollTop = Math.max(0, scrollTo - 20);
    }
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      setCurrentMinute(now.getHours() * 60 + now.getMinutes());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const totalHours = HOUR_END - HOUR_START;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Day header */}
      <div
        className="px-3 py-2 border-b text-sm font-semibold"
        style={{ borderColor: isXpTheme ? "#ACA899" : "rgba(0,0,0,0.08)" }}
      >
        {dateLabel}
      </div>

      {/* All-day events */}
      {allDayEvents.length > 0 && (
        <div
          className="px-2 py-1 border-b flex flex-col gap-0.5"
          style={{ borderColor: isXpTheme ? "#ACA899" : "rgba(0,0,0,0.08)" }}
        >
          {allDayEvents.map((ev) => (
            <button
              key={ev.id}
              type="button"
              onClick={() => onEventClick(ev)}
              onDoubleClick={() => onEventDoubleClick(ev)}
              className="text-xs truncate rounded px-2 py-0.5 text-left"
              style={{
                backgroundColor: EVENT_COLOR_LIGHT[ev.color] || EVENT_COLOR_LIGHT.blue,
                color: EVENT_COLOR_MAP[ev.color] || EVENT_COLOR_MAP.blue,
                border: selectedEventId === ev.id
                  ? `1px solid ${EVENT_COLOR_MAP[ev.color]}`
                  : "1px solid transparent",
              }}
            >
              {ev.title}
            </button>
          ))}
        </div>
      )}

      {/* Scrollable hour grid */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="flex relative" style={{ height: totalHours * HOUR_HEIGHT }}>
          {/* Time gutter */}
          <div style={{ width: 52, minWidth: 52, flexShrink: 0 }} className="relative">
            {Array.from({ length: totalHours }, (_, i) => {
              const hour = HOUR_START + i;
              const label =
                hour === 0 ? "12 AM" :
                hour < 12 ? `${hour} AM` :
                hour === 12 ? "12 PM" :
                `${hour - 12} PM`;
              return (
                <div
                  key={hour}
                  className="absolute right-1 text-[10px] opacity-40 text-right"
                  style={{ top: i * HOUR_HEIGHT - 6, width: 44 }}
                >
                  {label}
                </div>
              );
            })}
          </div>

          {/* Main area */}
          <div className="flex-1 relative">
            {/* Hour lines */}
            {Array.from({ length: totalHours }, (_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onTimeSlotClick(date, HOUR_START + i)}
                className="absolute left-0 right-0 border-t hover:bg-black/[0.02] transition-colors"
                style={{
                  top: i * HOUR_HEIGHT,
                  height: HOUR_HEIGHT,
                  borderColor: isXpTheme ? "rgba(0,0,0,0.08)" : "rgba(0,0,0,0.06)",
                }}
              />
            ))}

            {/* Timed events */}
            {timedEvents.map((ev) => {
              const [sh, sm] = (ev.startTime || "9:00").split(":").map(Number);
              const [eh, em] = (ev.endTime || `${sh + 1}:00`).split(":").map(Number);
              const startMin = sh * 60 + sm;
              const endMin = eh * 60 + em;
              const top = ((startMin - HOUR_START * 60) / 60) * HOUR_HEIGHT;
              const height = Math.max(((endMin - startMin) / 60) * HOUR_HEIGHT, 22);

              return (
                <button
                  key={ev.id}
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onEventClick(ev); }}
                  onDoubleClick={(e) => { e.stopPropagation(); onEventDoubleClick(ev); }}
                  className="absolute left-1 right-1 rounded text-left overflow-hidden transition-shadow"
                  style={{
                    top: Math.max(top, 0),
                    height,
                    backgroundColor: EVENT_COLOR_LIGHT[ev.color] || EVENT_COLOR_LIGHT.blue,
                    borderLeft: `3px solid ${EVENT_COLOR_MAP[ev.color] || EVENT_COLOR_MAP.blue}`,
                    boxShadow: selectedEventId === ev.id
                      ? `0 0 0 1px ${EVENT_COLOR_MAP[ev.color]}`
                      : "0 1px 2px rgba(0,0,0,0.08)",
                    zIndex: 2,
                  }}
                >
                  <div className="px-1.5 py-0.5">
                    <div className="text-[11px] font-semibold truncate" style={{ color: EVENT_COLOR_MAP[ev.color] }}>
                      {ev.startTime}{ev.endTime ? ` – ${ev.endTime}` : ""}
                    </div>
                    <div className="text-xs truncate leading-tight">{ev.title}</div>
                  </div>
                </button>
              );
            })}

            {/* Current time line */}
            {isToday && (() => {
              const topPos = ((currentMinute - HOUR_START * 60) / 60) * HOUR_HEIGHT;
              if (topPos < 0 || topPos > totalHours * HOUR_HEIGHT) return null;
              return (
                <div
                  className="absolute left-0 right-0 pointer-events-none"
                  style={{ top: topPos, zIndex: 5 }}
                >
                  <div className="flex items-center">
                    <div
                      className="w-2 h-2 rounded-full -ml-1"
                      style={{ backgroundColor: isXpTheme ? "#CC0000" : "#FF3B30" }}
                    />
                    <div
                      className="flex-1 h-px"
                      style={{ backgroundColor: isXpTheme ? "#CC0000" : "#FF3B30" }}
                    />
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MONTH VIEW
// ============================================================================

function MonthGrid({
  calendarGrid,
  selectedEventId,
  onDateClick,
  onDateDoubleClick,
  onEventClick,
  onEventDoubleClick,
  isXpTheme,
}: {
  calendarGrid: CalendarDayCell[][];
  selectedEventId: string | null;
  onDateClick: (date: string) => void;
  onDateDoubleClick: (date: string) => void;
  onEventClick: (event: CalendarEvent) => void;
  onEventDoubleClick: (event: CalendarEvent) => void;
  isXpTheme: boolean;
}) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Day headers */}
      <div
        className="grid grid-cols-7 border-b"
        style={{ borderColor: isXpTheme ? "#ACA899" : "rgba(0,0,0,0.08)" }}
      >
        {DAY_HEADERS_MONTH.map((d, i) => (
          <div
            key={i}
            className="text-center text-[10px] font-medium py-1 select-none"
            style={{
              color: i === 0 || i === 6 ? (isXpTheme ? "#CC0000" : "#FF3B30") : undefined,
              opacity: 0.5,
            }}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="flex-1 grid grid-rows-6">
        {calendarGrid.map((week, wi) => (
          <div
            key={wi}
            className="grid grid-cols-7 border-b"
            style={{ borderColor: isXpTheme ? "rgba(0,0,0,0.04)" : "rgba(0,0,0,0.04)" }}
          >
            {week.map((cell) => (
              <button
                key={cell.date}
                type="button"
                onClick={() => onDateClick(cell.date)}
                onDoubleClick={() => onDateDoubleClick(cell.date)}
                className="flex flex-col items-start p-0.5 min-h-[40px] relative transition-colors select-none overflow-hidden"
                style={{
                  opacity: cell.isCurrentMonth ? 1 : 0.3,
                  backgroundColor: cell.isSelected
                    ? isXpTheme ? "rgba(49,106,197,0.1)" : "rgba(0,122,255,0.06)"
                    : "transparent",
                }}
              >
                <span
                  className="text-[10px] font-medium self-end mr-0.5"
                  style={{
                    width: 18,
                    height: 18,
                    lineHeight: "18px",
                    textAlign: "center",
                    borderRadius: "50%",
                    display: "inline-block",
                    backgroundColor: cell.isToday
                      ? isXpTheme ? "#CC0000" : "#007AFF"
                      : "transparent",
                    color: cell.isToday ? "#FFFFFF" : undefined,
                  }}
                >
                  {cell.day}
                </span>
                {/* Event dots/labels */}
                <div className="flex flex-col gap-px mt-px w-full">
                  {cell.events.slice(0, 2).map((ev) => (
                    <button
                      key={ev.id}
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onEventClick(ev); }}
                      onDoubleClick={(e) => { e.stopPropagation(); onEventDoubleClick(ev); }}
                      className="text-[8px] truncate rounded px-0.5 leading-snug w-full text-left"
                      style={{
                        backgroundColor: EVENT_COLOR_LIGHT[ev.color] || EVENT_COLOR_LIGHT.blue,
                        color: EVENT_COLOR_MAP[ev.color] || EVENT_COLOR_MAP.blue,
                        border: selectedEventId === ev.id
                          ? `1px solid ${EVENT_COLOR_MAP[ev.color]}`
                          : "1px solid transparent",
                      }}
                    >
                      {ev.title}
                    </button>
                  ))}
                  {cell.events.length > 2 && (
                    <span className="text-[8px] opacity-40 px-0.5">+{cell.events.length - 2}</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// BOTTOM TOOLBAR (Day | Week | Month)
// ============================================================================

function BottomToolbar({
  view,
  onSetView,
  onGoToToday,
  onNewEvent,
  isXpTheme,
  t,
}: {
  view: string;
  onSetView: (v: "day" | "week" | "month") => void;
  onGoToToday: () => void;
  onNewEvent: () => void;
  isXpTheme: boolean;
  t: (key: string) => string;
}) {
  const views: { id: "day" | "week" | "month"; label: string }[] = [
    { id: "day", label: t("apps.calendar.views.day") },
    { id: "week", label: t("apps.calendar.views.week") },
    { id: "month", label: t("apps.calendar.views.month") },
  ];

  return (
    <div
      className="flex items-center justify-between px-2 py-1.5 border-t"
      style={{
        borderColor: isXpTheme ? "#ACA899" : "rgba(0,0,0,0.1)",
        background: isXpTheme
          ? "#ECE9D8"
          : "linear-gradient(180deg, rgba(248,248,248,0.95) 0%, rgba(235,235,235,0.95) 100%)",
      }}
    >
      {/* View switcher */}
      <div
        className="flex rounded overflow-hidden"
        style={{
          border: isXpTheme ? "1px solid #ACA899" : "1px solid rgba(0,0,0,0.15)",
        }}
      >
        {views.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => onSetView(v.id)}
            className="px-2.5 py-0.5 text-[11px] font-medium transition-colors"
            style={{
              backgroundColor:
                view === v.id
                  ? isXpTheme ? "#316AC5" : "#007AFF"
                  : isXpTheme ? "#ECE9D8" : "rgba(255,255,255,0.8)",
              color: view === v.id ? "#FFF" : undefined,
              borderRight: v.id !== "month"
                ? isXpTheme ? "1px solid #ACA899" : "1px solid rgba(0,0,0,0.1)"
                : undefined,
            }}
          >
            {v.label}
          </button>
        ))}
      </div>

      {/* Right side buttons */}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-[11px] px-2"
          onClick={onGoToToday}
        >
          {t("apps.calendar.today")}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={onNewEvent}
          title={t("apps.calendar.menu.newEvent")}
        >
          <Plus size={12} weight="bold" />
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function CalendarAppComponent({
  isWindowOpen,
  onClose,
  isForeground,
  skipInitialSound,
  instanceId,
  onNavigateNext,
  onNavigatePrevious,
}: AppProps) {
  const logic = useCalendarLogic();
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
    weekDates,
    weekLabel,
    editingEvent,
    selectedEventId,
    setSelectedEventId,
    prefillTime,
    navigateMonth,
    navigateWeek,
    goToToday,
    setView,
    setSelectedDate,
    handleDateClick,
    handleDateDoubleClick,
    handleNewEvent,
    handleNewEventAtTime,
    handleEditEvent,
    handleSaveEvent,
    handleDeleteSelectedEvent,
  } = logic;

  // Responsive width detection
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(700);
  useResizeObserverWithRef(containerRef, (entry) => {
    setContainerWidth(entry.contentRect.width);
  });

  const showSidebar = containerWidth >= 540;
  const forceDay = containerWidth < 420;

  // Effective view (forced to day on very narrow widths)
  const effectiveView = forceDay && view === "week" ? "day" : view;

  // Header navigation depends on view
  const handlePrev = useCallback(() => {
    if (effectiveView === "week") navigateWeek(-1);
    else if (effectiveView === "month") navigateMonth(-1);
    else {
      // Day: move one day back
      const [y, m, d] = selectedDate.split("-").map(Number);
      const prev = new Date(y, m - 1, d - 1);
      setSelectedDate(`${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}-${String(prev.getDate()).padStart(2, "0")}`);
    }
  }, [effectiveView, navigateWeek, navigateMonth, selectedDate, setSelectedDate]);

  const handleNext = useCallback(() => {
    if (effectiveView === "week") navigateWeek(1);
    else if (effectiveView === "month") navigateMonth(1);
    else {
      const [y, m, d] = selectedDate.split("-").map(Number);
      const next = new Date(y, m - 1, d + 1);
      setSelectedDate(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`);
    }
  }, [effectiveView, navigateWeek, navigateMonth, selectedDate, setSelectedDate]);

  // Header label depends on view
  const headerLabel = effectiveView === "week" ? weekLabel : effectiveView === "day" ? selectedDateLabel : monthYearLabel;

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
        <div
          ref={containerRef}
          className="flex flex-col h-full bg-[var(--os-color-window-bg)] font-os-ui overflow-hidden"
        >
          {/* Header bar */}
          <div
            className="flex items-center justify-between px-2 py-1.5 border-b"
            style={{
              borderColor: isXpTheme ? "#ACA899" : "rgba(0,0,0,0.1)",
              background: isXpTheme
                ? "#ECE9D8"
                : "linear-gradient(180deg, rgba(248,248,248,0.95) 0%, rgba(238,238,238,0.95) 100%)",
            }}
          >
            <div className="flex items-center gap-0.5">
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handlePrev}>
                <CaretLeft size={12} weight="bold" />
              </Button>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleNext}>
                <CaretRight size={12} weight="bold" />
              </Button>
            </div>
            <span className="text-xs font-semibold truncate px-2 flex-1 text-center">
              {headerLabel}
            </span>
            <div style={{ width: 52 }} /> {/* Spacer for balance */}
          </div>

          {/* Main content area */}
          <div className="flex-1 flex overflow-hidden">
            {/* Mini calendar sidebar (desktop only) */}
            {showSidebar && effectiveView !== "month" && (
              <div
                className="border-r overflow-y-auto py-1 px-1"
                style={{ borderColor: isXpTheme ? "#ACA899" : "rgba(0,0,0,0.08)" }}
              >
                <MiniCalendar
                  calendarGrid={calendarGrid}
                  selectedDate={selectedDate}
                  todayStr={logic.todayStr}
                  onDateClick={handleDateClick}
                  isXpTheme={isXpTheme}
                  monthYearLabel={monthYearLabel}
                  onPrevMonth={() => navigateMonth(-1)}
                  onNextMonth={() => navigateMonth(1)}
                />
              </div>
            )}

            {/* View area */}
            {effectiveView === "week" && (
              <WeekTimeGrid
                weekDates={weekDates}
                selectedEventId={selectedEventId}
                onDateClick={handleDateClick}
                onTimeSlotClick={handleNewEventAtTime}
                onEventClick={(ev) => setSelectedEventId(ev.id)}
                onEventDoubleClick={handleEditEvent}
                isXpTheme={isXpTheme}
              />
            )}

            {effectiveView === "day" && (
              <DayTimeGrid
                date={selectedDate}
                dateLabel={selectedDateLabel}
                events={selectedDateEvents}
                selectedEventId={selectedEventId}
                onTimeSlotClick={handleNewEventAtTime}
                onEventClick={(ev) => setSelectedEventId(ev.id)}
                onEventDoubleClick={handleEditEvent}
                isXpTheme={isXpTheme}
              />
            )}

            {effectiveView === "month" && (
              <MonthGrid
                calendarGrid={calendarGrid}
                selectedEventId={selectedEventId}
                onDateClick={handleDateClick}
                onDateDoubleClick={handleDateDoubleClick}
                onEventClick={(ev) => setSelectedEventId(ev.id)}
                onEventDoubleClick={handleEditEvent}
                isXpTheme={isXpTheme}
              />
            )}
          </div>

          {/* Bottom toolbar */}
          <BottomToolbar
            view={effectiveView}
            onSetView={setView}
            onGoToToday={goToToday}
            onNewEvent={handleNewEvent}
            isXpTheme={isXpTheme}
            t={t}
          />
        </div>

        {/* Dialogs */}
        <EventDialog
          isOpen={isEventDialogOpen}
          onOpenChange={setIsEventDialogOpen}
          onSave={handleSaveEvent}
          editingEvent={editingEvent}
          selectedDate={selectedDate}
          prefillTime={prefillTime}
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
