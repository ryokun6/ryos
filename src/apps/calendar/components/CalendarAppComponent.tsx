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
import { CaretLeft, CaretRight, Plus, ListChecks, Check, Trash } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CalendarEvent, CalendarGroup, TodoItem } from "@/stores/useCalendarStore";
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
  blue: "rgba(74, 144, 217, 0.15)",
  red: "rgba(217, 74, 74, 0.15)",
  green: "rgba(90, 181, 90, 0.15)",
  orange: "rgba(232, 155, 62, 0.15)",
  purple: "rgba(155, 89, 182, 0.15)",
};

const HOUR_START = 0;
const HOUR_END = 24;
const HOUR_HEIGHT = 40;
const TODAY_RED = "#E25B4F";
const TODAY_RED_XP = "#B53325";

// ============================================================================
// AQUA CHECKBOX
// ============================================================================

function AquaCheckbox({ checked, color }: { checked: boolean; color: string }) {
  return (
    <div
      className="w-[14px] h-[14px] rounded-[3.5px] flex items-center justify-center shrink-0 relative overflow-hidden"
      style={checked ? {
        background: `linear-gradient(${color}, ${color}dd)`,
        boxShadow: `0 1px 2px rgba(0,0,0,0.3), 0 0.5px 0.5px rgba(0,0,0,0.2), inset 0 1px 2px rgba(0,0,0,0.2), inset 0 1.5px 2px 0.5px ${color}`,
        border: "none",
      } : {
        background: "linear-gradient(rgba(160,160,160,0.625), rgba(255,255,255,0.625))",
        boxShadow: "0 1px 2px rgba(0,0,0,0.2), 0 0.5px 0.5px rgba(0,0,0,0.15), inset 0 1px 1.5px rgba(0,0,0,0.3), inset 0 1.5px 2px 0.5px #bbb",
        border: "none",
      }}
    >
      {checked && (
        <Check size={10} weight="bold" className="relative z-[3]" style={{ color: "#fff", filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.4))" }} />
      )}
      {/* Top shine */}
      <div
        className="absolute left-[1px] right-[1px] top-[1px] rounded-t-[2.5px] pointer-events-none z-[2]"
        style={{
          height: "40%",
          background: "linear-gradient(rgba(255,255,255,0.85), rgba(255,255,255,0.2))",
          filter: "blur(0.3px)",
        }}
      />
      {/* Bottom glow */}
      <div
        className="absolute left-[1px] right-[1px] bottom-[0px] rounded-b-[2.5px] pointer-events-none z-[1]"
        style={{
          height: "35%",
          background: "linear-gradient(transparent, rgba(255,255,255,0.4))",
          filter: "blur(0.5px)",
        }}
      />
    </div>
  );
}

// ============================================================================
// CALENDAR LIST (left sidebar, top)
// ============================================================================

function CalendarList({
  calendars,
  onToggle,
  isMacOSTheme,
  isSystem7Theme,
}: {
  calendars: CalendarGroup[];
  onToggle: (id: string) => void;
  isMacOSTheme: boolean;
  isSystem7Theme: boolean;
}) {
  const useGeneva = isMacOSTheme || isSystem7Theme;
  return (
    <div className="px-2 py-1.5 select-none calendar-sidebar">
      <div
        className={cn("text-[9px] font-bold uppercase tracking-wide opacity-50 mb-1 px-0.5", useGeneva && "font-geneva-12")}
      >
        Calendars
      </div>
      {calendars.map((cal) => (
        <button
          key={cal.id}
          type="button"
          onClick={() => onToggle(cal.id)}
          className="flex items-center gap-1.5 w-full px-0.5 py-1 rounded hover:bg-black/5 transition-colors"
        >
          <AquaCheckbox checked={cal.visible} color={EVENT_COLOR_MAP[cal.color] || EVENT_COLOR_MAP.blue} />
          <span className={cn("text-[11px] truncate", useGeneva && "font-geneva-12")}>{cal.name}</span>
        </button>
      ))}
    </div>
  );
}

// ============================================================================
// TODO SIDEBAR (right)
// ============================================================================

function TodoSidebar({
  todos,
  calendars,
  onToggle,
  onAdd,
  onDelete,
  isMacOSTheme,
  isSystem7Theme,
}: {
  todos: TodoItem[];
  calendars: CalendarGroup[];
  onToggle: (id: string) => void;
  onAdd: (title: string, calendarId: string) => void;
  onDelete: (id: string) => void;
  isMacOSTheme: boolean;
  isSystem7Theme: boolean;
}) {
  const useGeneva = isMacOSTheme || isSystem7Theme;
  const [newTitle, setNewTitle] = useState("");
  const defaultCalId = calendars[0]?.id || "home";

  const handleAdd = () => {
    if (!newTitle.trim()) return;
    onAdd(newTitle.trim(), defaultCalId);
    setNewTitle("");
  };

  return (
    <div className="flex flex-col h-full select-none calendar-sidebar" style={{ width: 180, minWidth: 180 }}>
      <div
        className={cn("text-[9px] font-bold uppercase tracking-wide opacity-50 px-2 pt-2 pb-1", useGeneva && "font-geneva-12")}
      >
        To Do Items
      </div>
      <div className="flex-1 overflow-y-auto px-2">
        {todos.length === 0 && (
          <div className={cn("text-[10px] opacity-30 px-0.5 py-2", useGeneva && "font-geneva-12")}>No to-do items</div>
        )}
        {todos.map((todo) => {
          const cal = calendars.find((c) => c.id === todo.calendarId);
          return (
            <div key={todo.id} className="flex items-center gap-1.5 px-0.5 py-1 group">
              <button type="button" onClick={() => onToggle(todo.id)} className="shrink-0">
                <AquaCheckbox checked={todo.completed} color={EVENT_COLOR_MAP[cal?.color || "blue"]} />
              </button>
              <span
                className={cn(
                  "text-[11px] leading-tight flex-1 min-w-0",
                  todo.completed && "line-through opacity-40",
                  useGeneva && "font-geneva-12"
                )}
              >
                {todo.title}
              </span>
              <button
                type="button"
                onClick={() => onDelete(todo.id)}
                className="opacity-0 group-hover:opacity-40 hover:!opacity-100 transition-opacity shrink-0"
              >
                <Trash size={10} weight="bold" />
              </button>
            </div>
          );
        })}
      </div>
      <div className="px-2 pb-1.5 pt-1">
        <input
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") handleAdd(); }}
          placeholder="New To Do..."
          className={cn(
            "w-full text-[10px] px-1.5 py-0.5 rounded border bg-white/80 outline-none",
            useGeneva ? "border-black/20 font-geneva-12" : "border-black/10"
          )}
        />
      </div>
    </div>
  );
}

// ============================================================================
// MINI CALENDAR (sidebar)
// ============================================================================

function MiniCalendar({
  calendarGrid,
  selectedDate,
  todayStr,
  onDateClick,
  isXpTheme,
  isMacOSTheme,
  isSystem7Theme,
  monthYearLabel,
  narrowDayNames,
  onPrevMonth,
  onNextMonth,
}: {
  calendarGrid: CalendarDayCell[][];
  selectedDate: string;
  todayStr: string;
  onDateClick: (date: string) => void;
  isXpTheme: boolean;
  isMacOSTheme: boolean;
  isSystem7Theme: boolean;
  monthYearLabel: string;
  narrowDayNames: string[];
  onPrevMonth: () => void;
  onNextMonth: () => void;
}) {
  const useGeneva = isMacOSTheme || isSystem7Theme;
  return (
    <div className="flex flex-col select-none py-1 px-1.5" style={{ minWidth: 150, flexShrink: 0 }}>
      <div className="flex items-center justify-between px-0.5 py-1">
        <button type="button" onClick={onPrevMonth} className="p-0.5 hover:opacity-70 rounded">
          <CaretLeft size={10} weight="bold" />
        </button>
        <span className={cn("text-[10px] font-semibold", useGeneva && "font-geneva-12")}>{monthYearLabel}</span>
        <button type="button" onClick={onNextMonth} className="p-0.5 hover:opacity-70 rounded">
          <CaretRight size={10} weight="bold" />
        </button>
      </div>

      <div className="grid grid-cols-7 mb-0.5">
        {narrowDayNames.map((d, i) => (
          <div
            key={i}
            className={cn("text-center text-[9px] font-medium", useGeneva && "font-geneva-12")}
            style={{ opacity: 0.5 }}
          >
            {d}
          </div>
        ))}
      </div>

      {calendarGrid.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7">
          {week.map((cell) => (
            <button
              key={cell.date}
              type="button"
              onClick={() => onDateClick(cell.date)}
              className="flex items-center justify-center h-[18px] transition-colors rounded-sm"
              style={{ opacity: cell.isCurrentMonth ? 1 : 0.25 }}
            >
              <span
                className={cn("text-[10px] leading-none flex items-center justify-center", useGeneva && "font-geneva-12")}
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  backgroundColor:
                    cell.date === todayStr
                      ? isXpTheme ? TODAY_RED_XP : TODAY_RED
                      : cell.date === selectedDate
                        ? isXpTheme ? "rgba(0,0,0,0.15)" : "rgba(0,0,0,0.08)"
                        : "transparent",
                  color:
                    cell.date === todayStr
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
  isMacOSTheme,
  isSystem7Theme,
  hourLabels,
}: {
  weekDates: WeekDay[];
  selectedEventId: string | null;
  onDateClick: (date: string) => void;
  onTimeSlotClick: (date: string, hour: number) => void;
  onEventClick: (event: CalendarEvent) => void;
  onEventDoubleClick: (event: CalendarEvent) => void;
  isXpTheme: boolean;
  isMacOSTheme: boolean;
  isSystem7Theme: boolean;
  hourLabels: string[];
}) {
  const useGeneva = isMacOSTheme || isSystem7Theme;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [currentMinute, setCurrentMinute] = useState(() => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  });

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
  const hasAllDayEvents = weekDates.some((d) => d.allDayEvents.length > 0);

  const MIN_DAY_COL = 52;
  const MIN_WEEK_WIDTH = 48 + 7 * MIN_DAY_COL;

  return (
    <div className="flex-1 overflow-x-auto overflow-y-hidden">
      <div className="flex flex-col h-full" style={{ minWidth: MIN_WEEK_WIDTH }}>
        <div
          className="flex border-b shrink-0"
          style={{ borderColor: isXpTheme ? "#ACA899" : "rgba(0,0,0,0.1)" }}
        >
          <div style={{ width: 48, minWidth: 48, flexShrink: 0 }} />
          {weekDates.map((day) => (
            <button
              key={day.date}
              type="button"
              onClick={() => onDateClick(day.date)}
              className="flex-1 text-center py-1.5 min-w-0 transition-colors"
              style={{ borderBottom: "2px solid transparent" }}
            >
              <div className={cn("text-[10px] opacity-50 leading-none", useGeneva && "font-geneva-12")}>{day.dayName}</div>
              <div
                className={cn(
                  "text-sm font-semibold mt-0.5 mx-auto flex items-center justify-center",
                  day.isToday && "rounded-full text-white"
                )}
                style={{
                  width: 22, height: 22, lineHeight: "22px",
                  ...(day.isToday ? { backgroundColor: isXpTheme ? TODAY_RED_XP : TODAY_RED } : {}),
                }}
              >
                {day.dayOfMonth}
              </div>
            </button>
          ))}
        </div>

        {hasAllDayEvents && (
          <div
            className="flex border-b shrink-0"
            style={{ borderColor: isXpTheme ? "#ACA899" : "rgba(0,0,0,0.08)", minHeight: 24 }}
          >
            <div
              className={cn("flex items-center justify-end px-1 text-[9px] opacity-40", useGeneva && "font-geneva-12")}
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

        <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0">
          <div className="flex relative" style={{ height: totalHours * HOUR_HEIGHT }}>
            <div style={{ width: 48, minWidth: 48, flexShrink: 0 }} className="relative">
              {Array.from({ length: totalHours }, (_, i) => {
                const hour = HOUR_START + i;
                return (
                  <div
                    key={hour}
                    className={cn("absolute right-1 text-[10px] opacity-40 text-right", useGeneva && "font-geneva-12")}
                    style={{ top: i * HOUR_HEIGHT - 6, width: 40 }}
                  >
                    {hourLabels[hour]}
                  </div>
                );
              })}
            </div>

            {weekDates.map((day) => (
              <div
                key={day.date}
                className="flex-1 relative min-w-0"
                style={{ borderLeft: isXpTheme ? "1px solid rgba(0,0,0,0.06)" : "1px solid rgba(0,0,0,0.04)" }}
              >
                {Array.from({ length: totalHours }, (_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => onTimeSlotClick(day.date, HOUR_START + i)}
                    className="absolute left-0 right-0 border-t hover:bg-black/[0.02] transition-colors"
                    style={{
                      top: i * HOUR_HEIGHT, height: HOUR_HEIGHT,
                      borderColor: isXpTheme ? "rgba(0,0,0,0.08)" : "rgba(0,0,0,0.06)",
                    }}
                  />
                ))}

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
                      className="absolute left-0.5 right-0.5 rounded text-left overflow-hidden transition-shadow flex items-start"
                      style={{
                        top: Math.max(top, 0), height,
                        backgroundColor: EVENT_COLOR_LIGHT[ev.color] || EVENT_COLOR_LIGHT.blue,
                        borderLeft: `3px solid ${EVENT_COLOR_MAP[ev.color] || EVENT_COLOR_MAP.blue}`,
                        boxShadow: selectedEventId === ev.id
                          ? `0 0 0 1px ${EVENT_COLOR_MAP[ev.color] || EVENT_COLOR_MAP.blue}`
                          : isMacOSTheme ? "0 1px 3px rgba(0,0,0,0.1)" : "0 1px 2px rgba(0,0,0,0.08)",
                        zIndex: 2,
                      }}
                    >
                      <div className="px-1 py-0.5 flex flex-wrap items-baseline gap-x-1 min-w-0">
                        <span
                          className={cn("text-[10px] font-semibold shrink-0 whitespace-nowrap", useGeneva && "font-geneva-12")}
                          style={{ color: EVENT_COLOR_MAP[ev.color] || EVENT_COLOR_MAP.blue }}
                        >
                          {ev.startTime}
                        </span>
                        <span className="text-[10px] truncate leading-tight">{ev.title}</span>
                      </div>
                    </button>
                  );
                })}

                {day.isToday && (() => {
                  const topPos = ((currentMinute - HOUR_START * 60) / 60) * HOUR_HEIGHT;
                  if (topPos < 0 || topPos > totalHours * HOUR_HEIGHT) return null;
                  return (
                    <div className="absolute left-0 right-0 pointer-events-none" style={{ top: topPos, zIndex: 5 }}>
                      <div className="flex items-center">
                        <div className="w-2 h-2 rounded-full -ml-1" style={{ backgroundColor: isXpTheme ? TODAY_RED_XP : TODAY_RED }} />
                        <div className="flex-1 h-px" style={{ backgroundColor: isXpTheme ? TODAY_RED_XP : TODAY_RED }} />
                      </div>
                    </div>
                  );
                })()}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// DAY VIEW
// ============================================================================

function DayTimeGrid({
  date,
  events,
  selectedEventId,
  onTimeSlotClick,
  onEventClick,
  onEventDoubleClick,
  isXpTheme,
  isMacOSTheme,
  isSystem7Theme,
  hourLabels,
}: {
  date: string;
  events: CalendarEvent[];
  selectedEventId: string | null;
  onTimeSlotClick: (date: string, hour: number) => void;
  onEventClick: (event: CalendarEvent) => void;
  onEventDoubleClick: (event: CalendarEvent) => void;
  isXpTheme: boolean;
  isMacOSTheme: boolean;
  isSystem7Theme: boolean;
  hourLabels: string[];
}) {
  const useGeneva = isMacOSTheme || isSystem7Theme;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [currentMinute, setCurrentMinute] = useState(() => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  });

  const allDayEvents = events.filter((ev) => !ev.startTime);
  const timedEvents = events.filter((ev) => !!ev.startTime).sort((a, b) => (a.startTime || "").localeCompare(b.startTime || ""));

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
    <div className="flex-1 flex flex-col overflow-hidden min-w-0">
      {allDayEvents.length > 0 && (
        <div className="px-2 py-1 border-b flex flex-col gap-0.5" style={{ borderColor: isXpTheme ? "#ACA899" : "rgba(0,0,0,0.08)" }}>
          {allDayEvents.map((ev) => (
            <button
              key={ev.id} type="button"
              onClick={() => onEventClick(ev)} onDoubleClick={() => onEventDoubleClick(ev)}
              className="text-xs truncate rounded px-2 py-0.5 text-left"
              style={{
                backgroundColor: EVENT_COLOR_LIGHT[ev.color] || EVENT_COLOR_LIGHT.blue,
                color: EVENT_COLOR_MAP[ev.color] || EVENT_COLOR_MAP.blue,
                border: selectedEventId === ev.id ? `1px solid ${EVENT_COLOR_MAP[ev.color]}` : "1px solid transparent",
              }}
            >
              {ev.title}
            </button>
          ))}
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="flex relative w-full" style={{ height: totalHours * HOUR_HEIGHT }}>
          <div style={{ width: 52, minWidth: 52, flexShrink: 0 }} className="relative">
            {Array.from({ length: totalHours }, (_, i) => {
              const hour = HOUR_START + i;
              return (
                <div key={hour} className={cn("absolute right-1 text-[10px] opacity-40 text-right", useGeneva && "font-geneva-12")} style={{ top: i * HOUR_HEIGHT - 6, width: 44 }}>
                  {hourLabels[hour]}
                </div>
              );
            })}
          </div>

          <div className="flex-1 relative min-w-0">
            {Array.from({ length: totalHours }, (_, i) => (
              <button key={i} type="button" onClick={() => onTimeSlotClick(date, HOUR_START + i)}
                className="absolute left-0 right-0 border-t hover:bg-black/[0.02] transition-colors"
                style={{ top: i * HOUR_HEIGHT, height: HOUR_HEIGHT, borderColor: isXpTheme ? "rgba(0,0,0,0.08)" : "rgba(0,0,0,0.06)" }}
              />
            ))}

            {timedEvents.map((ev) => {
              const [sh, sm] = (ev.startTime || "9:00").split(":").map(Number);
              const [eh, em] = (ev.endTime || `${sh + 1}:00`).split(":").map(Number);
              const startMin = sh * 60 + sm;
              const endMin = eh * 60 + em;
              const top = ((startMin - HOUR_START * 60) / 60) * HOUR_HEIGHT;
              const height = Math.max(((endMin - startMin) / 60) * HOUR_HEIGHT, 22);

              return (
                <button key={ev.id} type="button"
                  onClick={(e) => { e.stopPropagation(); onEventClick(ev); }}
                  onDoubleClick={(e) => { e.stopPropagation(); onEventDoubleClick(ev); }}
                  className="absolute left-1 right-1 rounded text-left overflow-hidden transition-shadow flex items-start"
                  style={{
                    top: Math.max(top, 0), height,
                    backgroundColor: EVENT_COLOR_LIGHT[ev.color] || EVENT_COLOR_LIGHT.blue,
                    borderLeft: `3px solid ${EVENT_COLOR_MAP[ev.color] || EVENT_COLOR_MAP.blue}`,
                    boxShadow: selectedEventId === ev.id ? `0 0 0 1px ${EVENT_COLOR_MAP[ev.color]}` : isMacOSTheme ? "0 1px 3px rgba(0,0,0,0.1)" : "0 1px 2px rgba(0,0,0,0.08)",
                    zIndex: 2,
                  }}
                >
                  <div className="px-1.5 py-0.5 flex flex-wrap items-baseline gap-x-1.5 min-w-0">
                    <span className={cn("text-[11px] font-semibold shrink-0 whitespace-nowrap", useGeneva && "font-geneva-12")} style={{ color: EVENT_COLOR_MAP[ev.color] }}>
                      {ev.startTime}{ev.endTime ? ` – ${ev.endTime}` : ""}
                    </span>
                    <span className="text-xs truncate leading-tight">{ev.title}</span>
                  </div>
                </button>
              );
            })}

            {isToday && (() => {
              const topPos = ((currentMinute - HOUR_START * 60) / 60) * HOUR_HEIGHT;
              if (topPos < 0 || topPos > totalHours * HOUR_HEIGHT) return null;
              return (
                <div className="absolute left-0 right-0 pointer-events-none" style={{ top: topPos, zIndex: 5 }}>
                  <div className="flex items-center">
                    <div className="w-2 h-2 rounded-full -ml-1 shrink-0" style={{ backgroundColor: isXpTheme ? TODAY_RED_XP : TODAY_RED }} />
                    <div className="flex-1 h-px min-w-0" style={{ backgroundColor: isXpTheme ? TODAY_RED_XP : TODAY_RED }} />
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
  calendarGrid, selectedEventId, onDateClick, onDateDoubleClick, onEventClick, onEventDoubleClick, isXpTheme, narrowDayNames,
}: {
  calendarGrid: CalendarDayCell[][]; selectedEventId: string | null; onDateClick: (date: string) => void; onDateDoubleClick: (date: string) => void;
  onEventClick: (event: CalendarEvent) => void; onEventDoubleClick: (event: CalendarEvent) => void; isXpTheme: boolean; narrowDayNames: string[];
}) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="grid grid-cols-7 border-b" style={{ borderColor: isXpTheme ? "#ACA899" : "rgba(0,0,0,0.08)" }}>
        {narrowDayNames.map((d, i) => (
          <div key={i} className="text-center text-[10px] font-medium py-1 select-none" style={{ opacity: 0.5 }}>{d}</div>
        ))}
      </div>
      <div className="flex-1 grid grid-rows-6">
        {calendarGrid.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 border-b" style={{ borderColor: "rgba(0,0,0,0.04)" }}>
            {week.map((cell) => (
              <button key={cell.date} type="button" onClick={() => onDateClick(cell.date)} onDoubleClick={() => onDateDoubleClick(cell.date)}
                className="flex flex-col items-start p-0.5 min-h-[40px] relative transition-colors select-none overflow-hidden"
                style={{ opacity: cell.isCurrentMonth ? 1 : 0.3, backgroundColor: cell.isSelected ? (isXpTheme ? "rgba(0,0,0,0.08)" : "rgba(0,0,0,0.06)") : "transparent" }}
              >
                <span className="text-[10px] font-medium self-end mr-0.5"
                  style={{ width: 18, height: 18, lineHeight: "18px", textAlign: "center", borderRadius: "50%", display: "inline-block",
                    backgroundColor: cell.isToday ? (isXpTheme ? TODAY_RED_XP : TODAY_RED) : "transparent", color: cell.isToday ? "#FFF" : undefined }}
                >{cell.day}</span>
                <div className="flex flex-col gap-px mt-px w-full">
                  {cell.events.slice(0, 2).map((ev) => (
                    <button key={ev.id} type="button" onClick={(e) => { e.stopPropagation(); onEventClick(ev); }} onDoubleClick={(e) => { e.stopPropagation(); onEventDoubleClick(ev); }}
                      className="text-[8px] truncate rounded px-0.5 leading-snug w-full text-left"
                      style={{ backgroundColor: EVENT_COLOR_LIGHT[ev.color] || EVENT_COLOR_LIGHT.blue, color: EVENT_COLOR_MAP[ev.color] || EVENT_COLOR_MAP.blue,
                        border: selectedEventId === ev.id ? `1px solid ${EVENT_COLOR_MAP[ev.color]}` : "1px solid transparent" }}
                    >{ev.title}</button>
                  ))}
                  {cell.events.length > 2 && <span className="text-[8px] opacity-40 px-0.5">+{cell.events.length - 2}</span>}
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
// BOTTOM TOOLBAR
// ============================================================================

function BottomToolbar({
  view, onSetView, onGoToToday, onNewEvent, onPrev, onNext,
  showTodoSidebar, onToggleTodoSidebar,
  isXpTheme, isMacOSTheme, isSystem7Theme, t,
}: {
  view: string; onSetView: (v: "day" | "week" | "month") => void; onGoToToday: () => void; onNewEvent: () => void;
  onPrev: () => void; onNext: () => void;
  showTodoSidebar: boolean; onToggleTodoSidebar: () => void;
  isXpTheme: boolean; isMacOSTheme: boolean; isSystem7Theme: boolean; t: (key: string) => string;
}) {
  const views: { id: "day" | "week" | "month"; label: string }[] = [
    { id: "day", label: t("apps.calendar.views.day") },
    { id: "week", label: t("apps.calendar.views.week") },
    { id: "month", label: t("apps.calendar.views.month") },
  ];

  return (
    <div
      className={cn("flex items-center justify-between py-1.5 border-t", isMacOSTheme ? "px-1" : "px-2")}
      style={{
        borderColor: isXpTheme ? "#ACA899" : isMacOSTheme ? "rgba(0,0,0,0.25)" : "rgba(0,0,0,0.1)",
        background: isXpTheme ? "#ECE9D8" : isMacOSTheme ? "transparent" : "#e0e0e0",
      }}
    >
      <div className={cn("flex items-center gap-0", isMacOSTheme && "aqua-select-group")}>
        <Button variant={isMacOSTheme ? "aqua_select" : isSystem7Theme ? "player" : "default"} size="icon"
          className={cn(isMacOSTheme ? "aqua-compact" : "h-[22px] w-6", isXpTheme && "text-black")} onClick={onPrev}>
          <CaretLeft size={12} weight="bold" />
        </Button>
        {views.map((v) => (
          <Button key={v.id} variant={isMacOSTheme ? "aqua_select" : isSystem7Theme ? "player" : "default"}
            data-state={view === v.id ? "on" : "off"} onClick={() => onSetView(v.id)}
            className={cn(isMacOSTheme ? "aqua-compact font-geneva-12 !text-[11px]" : "h-[22px] px-2.5 text-[11px]", isSystem7Theme && "font-geneva-12", isXpTheme && "text-black")}>
            {v.label}
          </Button>
        ))}
        <Button variant={isMacOSTheme ? "aqua_select" : isSystem7Theme ? "player" : "default"} size="icon"
          className={cn(isMacOSTheme ? "aqua-compact" : "h-[22px] w-6", isXpTheme && "text-black")} onClick={onNext}>
          <CaretRight size={12} weight="bold" />
        </Button>
      </div>

      <div className={cn("flex items-center gap-0", isMacOSTheme && "aqua-select-group")}>
        <Button variant={isMacOSTheme ? "aqua_select" : isSystem7Theme ? "player" : "ghost"} onClick={onGoToToday}
          className={cn(isMacOSTheme ? "aqua-compact font-geneva-12 !text-[11px]" : "h-6 text-[11px] px-2", isSystem7Theme && "font-geneva-12", isXpTheme && "text-black")}>
          {t("apps.calendar.today")}
        </Button>
        <Button variant={isMacOSTheme ? "aqua_select" : isSystem7Theme ? "player" : "ghost"} onClick={onNewEvent}
          className={cn(isMacOSTheme ? "aqua-compact" : "h-6 w-6", isXpTheme && "text-black")} title={t("apps.calendar.menu.newEvent")}>
          <Plus size={12} weight="bold" />
        </Button>
        <Button variant={isMacOSTheme ? "aqua_select" : isSystem7Theme ? "player" : "ghost"}
          onClick={onToggleTodoSidebar} data-state={showTodoSidebar ? "on" : "off"}
          className={cn(isMacOSTheme ? "aqua-compact" : "h-6 w-6", isXpTheme && "text-black")} title="To Do Items">
          <ListChecks size={12} weight="bold" />
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function CalendarAppComponent({
  isWindowOpen, onClose, isForeground, skipInitialSound, instanceId, onNavigateNext, onNavigatePrevious,
}: AppProps) {
  const logic = useCalendarLogic();
  const {
    t, translatedHelpItems,
    isHelpDialogOpen, setIsHelpDialogOpen, isAboutDialogOpen, setIsAboutDialogOpen,
    isEventDialogOpen, setIsEventDialogOpen,
    isXpTheme, isMacOSTheme, isSystem7Theme,
    selectedDate, view, monthYearLabel, selectedDateLabel, calendarGrid, selectedDateEvents,
    narrowDayNames, hourLabels, weekDates, weekLabel,
    editingEvent, selectedEventId, setSelectedEventId, prefillTime,
    calendars, toggleCalendarVisibility,
    todos, addTodo, toggleTodo, deleteTodo, showTodoSidebar, setShowTodoSidebar,
    navigateMonth, navigateWeek, goToToday, setView, setSelectedDate,
    handleDateClick, handleDateDoubleClick, handleNewEvent, handleNewEventAtTime, handleEditEvent, handleSaveEvent, handleDeleteSelectedEvent,
  } = logic;

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(700);
  useResizeObserverWithRef(containerRef, (entry) => {
    setContainerWidth(entry.contentRect.width);
  });

  const showSidebar = containerWidth >= 540;
  const showTodo = showTodoSidebar && containerWidth >= 600;
  const effectiveView = view;

  const handlePrev = useCallback(() => {
    if (effectiveView === "week") navigateWeek(-1);
    else if (effectiveView === "month") navigateMonth(-1);
    else {
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
      showTodoSidebar={showTodoSidebar}
      onToggleTodoSidebar={() => setShowTodoSidebar(!showTodoSidebar)}
    />
  );

  if (!isWindowOpen) return null;

  return (
    <>
      {!isXpTheme && isForeground && menuBar}
      <WindowFrame
        title={headerLabel}
        onClose={onClose}
        isForeground={isForeground}
        appId="calendar"
        material={isMacOSTheme ? "brushedmetal" : "default"}
        skipInitialSound={skipInitialSound}
        instanceId={instanceId}
        onNavigateNext={onNavigateNext}
        onNavigatePrevious={onNavigatePrevious}
        menuBar={isXpTheme ? menuBar : undefined}
        windowConstraints={{ minWidth: 300, minHeight: 380 }}
      >
        <div
          ref={containerRef}
          className={cn("flex flex-col h-full w-full font-os-ui overflow-hidden", isMacOSTheme ? "bg-transparent" : "bg-white")}
        >
          {/* Main content area */}
          <div className={cn("flex-1 flex overflow-hidden", isMacOSTheme && "gap-[5px]")}>
            {/* Left sidebar: Calendar list + Mini calendar */}
            {showSidebar && (
              isMacOSTheme ? (
                <div className="flex flex-col shrink-0 gap-[5px]" style={{ width: 160 }}>
                  <div
                    className="flex-1 overflow-y-auto bg-white"
                    style={{
                      border: "1px solid rgba(0, 0, 0, 0.55)",
                      boxShadow: "inset 0 1px 2px rgba(0, 0, 0, 0.25), 0 1px 0 rgba(255, 255, 255, 0.4)",
                    }}
                  >
                    <CalendarList
                      calendars={calendars}
                      onToggle={toggleCalendarVisibility}
                      isMacOSTheme={isMacOSTheme}
                      isSystem7Theme={isSystem7Theme}
                    />
                  </div>
                  <div
                    className="shrink-0 bg-white"
                    style={{
                      border: "1px solid rgba(0, 0, 0, 0.55)",
                      boxShadow: "inset 0 1px 2px rgba(0, 0, 0, 0.25), 0 1px 0 rgba(255, 255, 255, 0.4)",
                    }}
                  >
                    <MiniCalendar
                      calendarGrid={calendarGrid}
                      selectedDate={selectedDate}
                      todayStr={logic.todayStr}
                      onDateClick={handleDateClick}
                      isXpTheme={isXpTheme}
                      isMacOSTheme={isMacOSTheme}
                      isSystem7Theme={isSystem7Theme}
                      monthYearLabel={monthYearLabel}
                      narrowDayNames={narrowDayNames}
                      onPrevMonth={() => navigateMonth(-1)}
                      onNextMonth={() => navigateMonth(1)}
                    />
                  </div>
                </div>
              ) : (
                <div
                  className="flex flex-col overflow-y-auto shrink-0 bg-white"
                  style={{ width: 160, borderRight: "1px solid rgba(0,0,0,0.08)" }}
                >
                  <CalendarList
                    calendars={calendars}
                    onToggle={toggleCalendarVisibility}
                    isMacOSTheme={isMacOSTheme}
                    isSystem7Theme={isSystem7Theme}
                  />
                  <div className="flex-1" />
                  <MiniCalendar
                    calendarGrid={calendarGrid}
                    selectedDate={selectedDate}
                    todayStr={logic.todayStr}
                    onDateClick={handleDateClick}
                    isXpTheme={isXpTheme}
                    isMacOSTheme={isMacOSTheme}
                    isSystem7Theme={isSystem7Theme}
                    monthYearLabel={monthYearLabel}
                    narrowDayNames={narrowDayNames}
                    onPrevMonth={() => navigateMonth(-1)}
                    onNextMonth={() => navigateMonth(1)}
                  />
                </div>
              )
            )}

            {/* Main view area */}
            <div
              className={cn("flex-1 flex overflow-hidden calendar-grid bg-white")}
              style={isMacOSTheme ? {
                border: "1px solid rgba(0, 0, 0, 0.55)",
                boxShadow: "inset 0 1px 2px rgba(0, 0, 0, 0.25), 0 1px 0 rgba(255, 255, 255, 0.4)",
              } : undefined}
            >
              {effectiveView === "week" && (
                <WeekTimeGrid weekDates={weekDates} selectedEventId={selectedEventId}
                  onDateClick={handleDateClick} onTimeSlotClick={handleNewEventAtTime}
                  onEventClick={(ev) => setSelectedEventId(ev.id)} onEventDoubleClick={handleEditEvent}
                  isXpTheme={isXpTheme} isMacOSTheme={isMacOSTheme} isSystem7Theme={isSystem7Theme} hourLabels={hourLabels} />
              )}
              {effectiveView === "day" && (
                <DayTimeGrid date={selectedDate} events={selectedDateEvents} selectedEventId={selectedEventId}
                  onTimeSlotClick={handleNewEventAtTime}
                  onEventClick={(ev) => setSelectedEventId(ev.id)} onEventDoubleClick={handleEditEvent}
                  isXpTheme={isXpTheme} isMacOSTheme={isMacOSTheme} isSystem7Theme={isSystem7Theme} hourLabels={hourLabels} />
              )}
              {effectiveView === "month" && (
                <MonthGrid calendarGrid={calendarGrid} selectedEventId={selectedEventId}
                  onDateClick={handleDateClick} onDateDoubleClick={handleDateDoubleClick}
                  onEventClick={(ev) => setSelectedEventId(ev.id)} onEventDoubleClick={handleEditEvent}
                  isXpTheme={isXpTheme} narrowDayNames={narrowDayNames} />
              )}
            </div>

            {/* Right sidebar: Todo list */}
            {showTodo && (
              <div
                className="shrink-0 overflow-y-auto bg-white"
                style={isMacOSTheme ? {
                  border: "1px solid rgba(0, 0, 0, 0.55)",
                  boxShadow: "inset 0 1px 2px rgba(0, 0, 0, 0.25), 0 1px 0 rgba(255, 255, 255, 0.4)",
                } : { borderLeft: "1px solid rgba(0,0,0,0.08)" }}
              >
                <TodoSidebar
                  todos={todos}
                  calendars={calendars}
                  onToggle={toggleTodo}
                  onAdd={addTodo}
                  onDelete={deleteTodo}
                  isMacOSTheme={isMacOSTheme}
                  isSystem7Theme={isSystem7Theme}
                />
              </div>
            )}
          </div>

          {/* Bottom toolbar */}
          <BottomToolbar
            view={effectiveView} onSetView={setView} onGoToToday={goToToday} onNewEvent={handleNewEvent}
            onPrev={handlePrev} onNext={handleNext}
            showTodoSidebar={showTodoSidebar} onToggleTodoSidebar={() => setShowTodoSidebar(!showTodoSidebar)}
            isXpTheme={isXpTheme} isMacOSTheme={isMacOSTheme} isSystem7Theme={isSystem7Theme} t={t}
          />
        </div>

        <EventDialog
          isOpen={isEventDialogOpen} onOpenChange={setIsEventDialogOpen}
          onSave={handleSaveEvent} editingEvent={editingEvent}
          selectedDate={selectedDate} prefillTime={prefillTime}
          calendars={calendars}
        />
        <HelpDialog isOpen={isHelpDialogOpen} onOpenChange={setIsHelpDialogOpen} appId="calendar" helpItems={translatedHelpItems} />
        <AboutDialog isOpen={isAboutDialogOpen} onOpenChange={setIsAboutDialogOpen} metadata={appMetadata} appId="calendar" />
      </WindowFrame>
    </>
  );
}
