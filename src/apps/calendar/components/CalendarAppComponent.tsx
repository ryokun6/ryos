import { useRef, useEffect, useLayoutEffect, useState, useMemo, useCallback } from "react";
import { AppProps } from "../../base/types";
import { WindowFrame } from "@/components/layout/WindowFrame";
import { CalendarMenuBar } from "./CalendarMenuBar";
import { requestCloudSyncDomainCheck } from "@/utils/cloudSyncEvents";
import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { appMetadata } from "../metadata";
import {
  useCalendarLogic,
  type CalendarDayCell,
  type WeekDay,
} from "../hooks/useCalendarLogic";
import {
  DEFAULT_TIME_GRID_HOUR_HEIGHT,
  useTimeScaleGestures,
} from "../hooks/useTimeScaleGestures";
import { useRegisterUndoRedo } from "@/hooks/useUndoRedo";
import { CaretLeft, CaretRight, Plus, ListChecks, Trash, SidebarSimple, CalendarBlank } from "@phosphor-icons/react";
import { SearchInput } from "@/components/ui/search-input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCalendarStore } from "@/stores/useCalendarStore";
import type { CalendarEvent, CalendarGroup, TodoItem } from "@/stores/useCalendarStore";
import { useChatsStore } from "@/stores/useChatsStore";
import { useCloudSyncStore } from "@/stores/useCloudSyncStore";
import { useResizeObserverWithRef } from "@/hooks/useResizeObserver";
import { useTranslation } from "react-i18next";
import { AquaCheckbox } from "@/components/ui/aqua-checkbox";
import { AppDrawer } from "@/components/shared/AppDrawer";
import { useSound, Sounds } from "@/hooks/useSound";
import { TrayDetails } from "./TrayDetails";
import { TimedEventBlock } from "./TimedEventBlock";

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
const TODAY_RED = "#E25B4F";
const TODAY_RED_XP = "#B53325";
const SEARCH_DIM_OPACITY = 0.28;

function matchesSearchQuery(value: string | undefined, normalizedQuery: string) {
  if (!normalizedQuery) return true;
  return (value || "").toLocaleLowerCase().includes(normalizedQuery);
}

function getEventSearchText(event: CalendarEvent) {
  return [event.title, event.notes, event.date, event.startTime, event.endTime].filter(Boolean).join(" ");
}

function getEventOpacity(event: CalendarEvent, normalizedQuery: string) {
  return matchesSearchQuery(getEventSearchText(event), normalizedQuery) ? 1 : SEARCH_DIM_OPACITY;
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
  const { t } = useTranslation();
  const useGeneva = isMacOSTheme || isSystem7Theme;
  return (
    <div className={cn("select-none os-sidebar", !isMacOSTheme && "py-1.5")}>
      {isMacOSTheme ? (
        <div
          className={cn("text-[11px] font-regular text-center", useGeneva && "font-geneva-12")}
          style={{
            background: "linear-gradient(to bottom, #e6e5e5, #aeadad)",
            color: "#222",
            textShadow: "0 1px 0 #e1e1e1",
            borderTop: "1px solid rgba(255,255,255,0.5)",
            borderBottom: "1px solid #787878",
          }}
        >
          {t("apps.calendar.sidebar.calendars")}
        </div>
      ) : (
        <div
          className={cn("text-[9px] font-bold uppercase tracking-wide opacity-50 mb-1 px-2.5", useGeneva && "font-geneva-12")}
        >
          {t("apps.calendar.sidebar.calendars")}
        </div>
      )}
      {calendars.map((cal) => (
        <button
          key={cal.id}
          type="button"
          onClick={() => onToggle(cal.id)}
          className="flex items-center gap-1.5 w-full px-2 py-1 rounded hover:bg-black/5 transition-colors"
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
  onUpdate,
  onDelete,
  isMacOSTheme,
  isSystem7Theme,
  fullWidth,
  noHeader,
  selectedTodoId,
  onSelectTodo,
}: {
  todos: TodoItem[];
  calendars: CalendarGroup[];
  onToggle: (id: string) => void;
  onAdd: (title: string, calendarId: string) => void;
  onUpdate: (
    id: string,
    updates: Partial<Pick<TodoItem, "title" | "dueDate">>
  ) => void;
  onDelete: (id: string) => void;
  isMacOSTheme: boolean;
  isSystem7Theme: boolean;
  fullWidth?: boolean;
  noHeader?: boolean;
  selectedTodoId?: string | null;
  onSelectTodo?: (id: string) => void;
}) {
  const { t } = useTranslation();
  const useGeneva = isMacOSTheme || isSystem7Theme;
  const [newTitle, setNewTitle] = useState("");
  const [editingTodoId, setEditingTodoId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const defaultCalId = calendars[0]?.id || "home";

  const handleAdd = () => {
    if (!newTitle.trim()) return;
    onAdd(newTitle.trim(), defaultCalId);
    setNewTitle("");
  };

  const startEditingTodo = useCallback((todo: TodoItem) => {
    setEditingTodoId(todo.id);
    setEditingTitle(todo.title);
  }, []);

  const stopEditingTodo = useCallback(() => {
    setEditingTodoId(null);
    setEditingTitle("");
  }, []);

  const commitTodoEdit = useCallback((todo: TodoItem) => {
    const nextTitle = editingTitle.trim();
    if (nextTitle && nextTitle !== todo.title) {
      onUpdate(todo.id, { title: nextTitle });
    }
    stopEditingTodo();
  }, [editingTitle, onUpdate, stopEditingTodo]);

  const actionButtonVisibilityClass = fullWidth
    ? "opacity-60"
    : "pointer-events-none translate-x-1 opacity-0 group-hover:pointer-events-auto group-hover:translate-x-0 group-hover:opacity-40";
  const todoTitleFieldClass = cn(
    "text-[11px] leading-tight flex-1 min-w-0 rounded border px-1 py-0.5 min-h-[22px]",
    useGeneva ? "font-geneva-12 border-black/20" : "border-black/10"
  );

  return (
    <div className="flex flex-col h-full select-none os-sidebar" style={fullWidth ? undefined : { width: 180, minWidth: 180 }}>
      {!noHeader && (isMacOSTheme ? (
        <div
          className={cn("text-[11px] font-regular text-center", useGeneva && "font-geneva-12")}
          style={{
            background: "linear-gradient(to bottom, #e6e5e5, #aeadad)",
            color: "#222",
            textShadow: "0 1px 0 #e1e1e1",
            borderTop: "1px solid rgba(255,255,255,0.5)",
            borderBottom: "1px solid #787878",
          }}
        >
          {t("apps.calendar.sidebar.toDoItems")}
        </div>
      ) : (
        <div
          className={cn("text-[9px] font-bold uppercase tracking-wide opacity-50 px-2 pt-2 pb-1", useGeneva && "font-geneva-12")}
        >
          {t("apps.calendar.sidebar.toDoItems")}
        </div>
      ))}
      <div className="flex-1 overflow-y-auto">
        {todos.length === 0 && (
          <div className={cn("text-[10px] opacity-30 px-2 py-2", useGeneva && "font-geneva-12")}>{t("apps.calendar.sidebar.noTodoItems")}</div>
        )}
        {todos.map((todo) => {
          const cal = calendars.find((c) => c.id === todo.calendarId);
          const isEditing = editingTodoId === todo.id;
          const isSelected = selectedTodoId === todo.id;
          return (
            <div
              key={todo.id}
              className={cn(
                "group relative flex w-full items-start gap-1.5 px-2 py-1 min-h-[30px]",
                isSelected && (isMacOSTheme ? "bg-black/[0.06]" : "bg-black/[0.05]")
              )}
            >
              <button type="button" onClick={() => onToggle(todo.id)} className="shrink-0 mt-[3px]">
                <AquaCheckbox checked={todo.completed} color={EVENT_COLOR_MAP[cal?.color || "blue"]} />
              </button>
              {isEditing ? (
                <input
                  type="text"
                  value={editingTitle}
                  autoFocus
                  onFocus={(event) => event.currentTarget.select()}
                  onChange={(event) => setEditingTitle(event.target.value)}
                  onBlur={() => commitTodoEdit(todo)}
                  onKeyDown={(event) => {
                    event.stopPropagation();
                    if (event.key === "Enter") commitTodoEdit(todo);
                    if (event.key === "Escape") stopEditingTodo();
                  }}
                  className={cn(
                    todoTitleFieldClass,
                    "bg-white/90 outline-none transition-[padding]",
                    !fullWidth && "group-hover:pr-7"
                  )}
                />
              ) : (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isSelected) {
                      startEditingTodo(todo);
                    } else if (onSelectTodo) {
                      onSelectTodo(todo.id);
                    } else {
                      startEditingTodo(todo);
                    }
                  }}
                  className={cn(
                    todoTitleFieldClass,
                    "text-left border-transparent bg-transparent",
                    todo.completed && "line-through opacity-40",
                    "hover:bg-black/[0.02] transition-[padding]",
                    !fullWidth && "group-hover:pr-7"
                  )}
                >
                  <span className="block truncate">{todo.title}</span>
                </button>
              )}
              <div
                className={cn(
                  "flex items-center justify-end gap-1",
                  fullWidth ? "shrink-0 mt-[3px]" : "absolute right-2 top-[7px]"
                )}
              >
                <button
                  type="button"
                  onClick={() => onDelete(todo.id)}
                  className={cn(
                    "shrink-0 transition-[opacity,transform] hover:!opacity-100",
                    actionButtonVisibilityClass
                  )}
                >
                  <Trash size={10} weight="bold" />
                </button>
              </div>
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
          placeholder={t("apps.calendar.sidebar.newTodoPlaceholder")}
          className={cn(
            "w-full text-[10px] px-1.5 py-0.5 rounded border bg-white/80 outline-none",
            useGeneva ? "border-black/20 font-geneva-12" : "border-black/10"
          )}
        />
      </div>
    </div>
  );
}

function isKeyboardDeleteTargetEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  if (target.closest("[contenteditable='true']")) return true;
  return false;
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
    <div className="flex flex-col select-none py-1 px-1.5 os-sidebar" style={{ minWidth: 150, flexShrink: 0 }}>
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
            className={cn("text-center font-medium", useGeneva && "font-geneva-12")}
            style={{ opacity: 0.5, fontSize: 9 }}
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
  searchQuery,
  hourLabels,
  hourHeight,
  setHourHeight,
  onUpdateEvent,
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
  searchQuery: string;
  hourLabels: string[];
  hourHeight: number;
  setHourHeight: (h: number) => void;
  onUpdateEvent: (id: string, updates: Partial<CalendarEvent>) => void;
}) {
  const { t } = useTranslation();
  const useGeneva = isMacOSTheme || isSystem7Theme;
  const scrollRef = useRef<HTMLDivElement>(null);
  const horizontalScrollRef = useRef<HTMLDivElement>(null);
  useTimeScaleGestures(scrollRef, hourHeight, setHourHeight, {
    horizontalScrollParentRef: horizontalScrollRef,
  });
  const lastTapRef = useRef<{ id: string; time: number } | null>(null);

  const dayColRefs = useRef<(HTMLDivElement | null)[]>([]);
  const resolveDateAtClientX = useCallback(
    (clientX: number) => {
      for (let i = 0; i < weekDates.length; i++) {
        const el = dayColRefs.current[i];
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (clientX >= r.left && clientX <= r.right) return weekDates[i]?.date ?? null;
      }
      return null;
    },
    [weekDates]
  );

  const handleEventTap = useCallback((ev: CalendarEvent, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const now = Date.now();
    const last = lastTapRef.current;
    if (last && last.id === ev.id && now - last.time < 400) {
      lastTapRef.current = null;
      onEventDoubleClick(ev);
    } else {
      lastTapRef.current = { id: ev.id, time: now };
      onEventClick(ev);
    }
  }, [onEventClick, onEventDoubleClick]);

  const [currentMinute, setCurrentMinute] = useState(() => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  });

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const scrollTo = (8 - HOUR_START) * DEFAULT_TIME_GRID_HOUR_HEIGHT;
    el.scrollTop = Math.max(0, scrollTo - 20);
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
    <div ref={horizontalScrollRef} className="flex-1 overflow-x-auto overflow-y-hidden">
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
              {t("apps.calendar.views.allDay")}
            </div>
            {weekDates.map((day) => (
              <div key={day.date} className="flex-1 flex flex-col gap-px py-px px-px min-w-0">
                {day.allDayEvents.map((ev) => (
                  <button
                    key={ev.id}
                    type="button"
                    onClick={() => handleEventTap(ev)}
                    className="text-[9px] truncate rounded px-1 leading-snug text-left"
                    style={{
                      backgroundColor: EVENT_COLOR_LIGHT[ev.color] || EVENT_COLOR_LIGHT.blue,
                      color: EVENT_COLOR_MAP[ev.color] || EVENT_COLOR_MAP.blue,
                      border: selectedEventId === ev.id
                        ? `1px solid ${EVENT_COLOR_MAP[ev.color] || EVENT_COLOR_MAP.blue}`
                        : "1px solid transparent",
                      opacity: getEventOpacity(ev, searchQuery),
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
          <div className="flex relative" style={{ height: totalHours * hourHeight }}>
            <div style={{ width: 48, minWidth: 48, flexShrink: 0 }} className="relative">
              {Array.from({ length: totalHours }, (_, i) => {
                const hour = HOUR_START + i;
                return (
                  <div
                    key={hour}
                    className={cn("absolute right-1 text-[10px] opacity-40 text-right", useGeneva && "font-geneva-12")}
                    style={{ top: i * hourHeight - 6, width: 40 }}
                  >
                    {hourLabels[hour]}
                  </div>
                );
              })}
            </div>

            {weekDates.map((day, di) => (
              <div
                key={day.date}
                ref={(el) => {
                  dayColRefs.current[di] = el;
                }}
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
                      top: i * hourHeight, height: hourHeight,
                      borderColor: isXpTheme ? "rgba(0,0,0,0.08)" : "rgba(0,0,0,0.06)",
                    }}
                  />
                ))}

                {day.timedEvents.map((ev) => (
                  <TimedEventBlock
                    key={ev.id}
                    event={ev}
                    hourHeight={hourHeight}
                    hourStart={HOUR_START}
                    hourEnd={HOUR_END}
                    selectedEventId={selectedEventId}
                    isMacOSTheme={isMacOSTheme}
                    useGeneva={useGeneva}
                    washColor={EVENT_COLOR_LIGHT[ev.color] || EVENT_COLOR_LIGHT.blue}
                    accentColor={EVENT_COLOR_MAP[ev.color] || EVENT_COLOR_MAP.blue}
                    blockOpacity={getEventOpacity(ev, searchQuery)}
                    minHeightPx={18}
                    onUpdateEvent={onUpdateEvent}
                    onEventClick={handleEventTap}
                    resolveDateAtClientX={resolveDateAtClientX}
                    timeLabelMode="week"
                  />
                ))}

                {day.isToday && (() => {
                  const topPos = ((currentMinute - HOUR_START * 60) / 60) * hourHeight;
                  if (topPos < 0 || topPos > totalHours * hourHeight) return null;
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
  searchQuery,
  hourLabels,
  hourHeight,
  setHourHeight,
  onUpdateEvent,
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
  searchQuery: string;
  hourLabels: string[];
  hourHeight: number;
  setHourHeight: (h: number) => void;
  onUpdateEvent: (id: string, updates: Partial<CalendarEvent>) => void;
}) {
  const useGeneva = isMacOSTheme || isSystem7Theme;
  const scrollRef = useRef<HTMLDivElement>(null);
  useTimeScaleGestures(scrollRef, hourHeight, setHourHeight);
  const lastTapRef = useRef<{ id: string; time: number } | null>(null);

  const handleEventTap = useCallback((ev: CalendarEvent, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const now = Date.now();
    const last = lastTapRef.current;
    if (last && last.id === ev.id && now - last.time < 400) {
      lastTapRef.current = null;
      onEventDoubleClick(ev);
    } else {
      lastTapRef.current = { id: ev.id, time: now };
      onEventClick(ev);
    }
  }, [onEventClick, onEventDoubleClick]);

  const [currentMinute, setCurrentMinute] = useState(() => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  });

  const allDayEvents = events.filter((ev) => !ev.startTime);
  const timedEvents = events.filter((ev) => !!ev.startTime).sort((a, b) => (a.startTime || "").localeCompare(b.startTime || ""));

  const todayStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, [currentMinute]);
  const isToday = date === todayStr;

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const scrollTo = (8 - HOUR_START) * DEFAULT_TIME_GRID_HOUR_HEIGHT;
    el.scrollTop = Math.max(0, scrollTo - 20);
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
              onClick={() => handleEventTap(ev)}
              className="text-xs truncate rounded px-2 py-0.5 text-left"
              style={{
                backgroundColor: EVENT_COLOR_LIGHT[ev.color] || EVENT_COLOR_LIGHT.blue,
                color: EVENT_COLOR_MAP[ev.color] || EVENT_COLOR_MAP.blue,
                border: selectedEventId === ev.id ? `1px solid ${EVENT_COLOR_MAP[ev.color]}` : "1px solid transparent",
                opacity: getEventOpacity(ev, searchQuery),
              }}
            >
              {ev.title}
            </button>
          ))}
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="flex relative w-full" style={{ height: totalHours * hourHeight }}>
          <div style={{ width: 52, minWidth: 52, flexShrink: 0 }} className="relative">
            {Array.from({ length: totalHours }, (_, i) => {
              const hour = HOUR_START + i;
              return (
                <div key={hour} className={cn("absolute right-1 text-[10px] opacity-40 text-right", useGeneva && "font-geneva-12")} style={{ top: i * hourHeight - 6, width: 44 }}>
                  {hourLabels[hour]}
                </div>
              );
            })}
          </div>

          <div className="flex-1 relative min-w-0">
            {Array.from({ length: totalHours }, (_, i) => (
              <button key={i} type="button" onClick={() => onTimeSlotClick(date, HOUR_START + i)}
                className="absolute left-0 right-0 border-t hover:bg-black/[0.02] transition-colors"
                style={{ top: i * hourHeight, height: hourHeight, borderColor: isXpTheme ? "rgba(0,0,0,0.08)" : "rgba(0,0,0,0.06)" }}
              />
            ))}

            {timedEvents.map((ev) => (
              <TimedEventBlock
                key={ev.id}
                event={ev}
                hourHeight={hourHeight}
                hourStart={HOUR_START}
                hourEnd={HOUR_END}
                selectedEventId={selectedEventId}
                isMacOSTheme={isMacOSTheme}
                useGeneva={useGeneva}
                washColor={EVENT_COLOR_LIGHT[ev.color] || EVENT_COLOR_LIGHT.blue}
                accentColor={EVENT_COLOR_MAP[ev.color] || EVENT_COLOR_MAP.blue}
                blockOpacity={getEventOpacity(ev, searchQuery)}
                minHeightPx={22}
                onUpdateEvent={onUpdateEvent}
                onEventClick={handleEventTap}
                timeLabelMode="day"
              />
            ))}

            {isToday && (() => {
              const topPos = ((currentMinute - HOUR_START * 60) / 60) * hourHeight;
              if (topPos < 0 || topPos > totalHours * hourHeight) return null;
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
  calendarGrid, selectedEventId, onDateClick, onDateDoubleClick, onEventClick, onEventDoubleClick, isXpTheme, searchQuery, narrowDayNames,
}: {
  calendarGrid: CalendarDayCell[][]; selectedEventId: string | null; onDateClick: (date: string) => void; onDateDoubleClick: (date: string) => void;
  onEventClick: (event: CalendarEvent) => void; onEventDoubleClick: (event: CalendarEvent) => void; isXpTheme: boolean; searchQuery: string; narrowDayNames: string[];
}) {
  const lastEventTapRef = useRef<{ id: string; time: number } | null>(null);
  const lastDateTapRef = useRef<{ id: string; time: number } | null>(null);

  const handleEventTap = useCallback((ev: CalendarEvent, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const now = Date.now();
    const last = lastEventTapRef.current;
    if (last && last.id === ev.id && now - last.time < 400) {
      lastEventTapRef.current = null;
      onEventDoubleClick(ev);
    } else {
      lastEventTapRef.current = { id: ev.id, time: now };
      onEventClick(ev);
    }
  }, [onEventClick, onEventDoubleClick]);

  const handleDateTap = useCallback((date: string) => {
    const now = Date.now();
    const last = lastDateTapRef.current;
    if (last && last.id === date && now - last.time < 400) {
      lastDateTapRef.current = null;
      onDateDoubleClick(date);
    } else {
      lastDateTapRef.current = { id: date, time: now };
      onDateClick(date);
    }
  }, [onDateClick, onDateDoubleClick]);

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
              <button key={cell.date} type="button" onClick={() => handleDateTap(cell.date)}
                className="flex flex-col items-start p-0.5 min-h-[40px] relative transition-colors select-none overflow-hidden"
                style={{ opacity: cell.isCurrentMonth ? 1 : 0.3, backgroundColor: cell.isSelected ? (isXpTheme ? "rgba(0,0,0,0.08)" : "rgba(0,0,0,0.06)") : "transparent" }}
              >
                <span className="text-[10px] font-medium self-end mr-0.5"
                  style={{ width: 18, height: 18, lineHeight: "18px", textAlign: "center", borderRadius: "50%", display: "inline-block",
                    backgroundColor: cell.isToday ? (isXpTheme ? TODAY_RED_XP : TODAY_RED) : "transparent", color: cell.isToday ? "#FFF" : undefined }}
                >{cell.day}</span>
                <div className="flex flex-col gap-px mt-px w-full">
                  {cell.events.slice(0, 2).map((ev) => (
                    <button key={ev.id} type="button" onClick={(e) => handleEventTap(ev, e)}
                      className="text-[8px] truncate rounded px-0.5 leading-snug w-full text-left"
                      style={{ backgroundColor: EVENT_COLOR_LIGHT[ev.color] || EVENT_COLOR_LIGHT.blue, color: EVENT_COLOR_MAP[ev.color] || EVENT_COLOR_MAP.blue,
                        border: selectedEventId === ev.id ? `1px solid ${EVENT_COLOR_MAP[ev.color]}` : "1px solid transparent",
                        opacity: getEventOpacity(ev, searchQuery) }}
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
  showCalendarSidebar, onToggleCalendarSidebar,
  showMiniCalendar, onToggleMiniCalendar,
  showTodoSidebar, onToggleTodoSidebar,
  searchQuery, onSearchQueryChange, showSearch,
  isNarrow,
  isXpTheme, isMacOSTheme, isSystem7Theme, t,
}: {
  view: string; onSetView: (v: "day" | "week" | "month") => void; onGoToToday: () => void; onNewEvent: () => void;
  onPrev: () => void; onNext: () => void;
  showCalendarSidebar: boolean; onToggleCalendarSidebar: () => void;
  showMiniCalendar: boolean; onToggleMiniCalendar: () => void;
  showTodoSidebar: boolean; onToggleTodoSidebar: () => void;
  searchQuery: string; onSearchQueryChange: (value: string) => void; showSearch: boolean;
  isNarrow: boolean;
  isXpTheme: boolean; isMacOSTheme: boolean; isSystem7Theme: boolean; t: (key: string) => string;
}) {
  const views: { id: "day" | "week" | "month"; label: string }[] = [
    { id: "day", label: t("apps.calendar.views.day") },
    { id: "week", label: t("apps.calendar.views.week") },
    { id: "month", label: t("apps.calendar.views.month") },
  ];

  const searchField = showSearch ? (
    <div className="flex items-center justify-center min-w-0">
      <SearchInput
        value={searchQuery}
        onChange={onSearchQueryChange}
        width={isMacOSTheme ? "150px" : "170px"}
        ariaLabel={t("common.search")}
        onKeyDown={(e) => e.stopPropagation()}
      />
    </div>
  ) : null;

  return (
    <div
      className={cn(
        "py-1.5 border-t flex items-center gap-2",
        isMacOSTheme ? "px-1" : "px-2"
      )}
      style={{
        borderColor: isXpTheme ? "#ACA899" : isMacOSTheme ? "rgba(0,0,0,0.25)" : "rgba(0,0,0,0.1)",
        background: isXpTheme ? "#ECE9D8" : isMacOSTheme ? "transparent" : "#e0e0e0",
      }}
    >
      {isMacOSTheme ? (
        <>
          {!isNarrow && (
            <div className="shrink-0">
              <div className="metal-inset-btn-group">
                <button
                  type="button"
                  className="metal-inset-btn metal-inset-icon"
                  onClick={onToggleCalendarSidebar}
                  data-state={showCalendarSidebar ? "on" : "off"}
                  title={t("apps.calendar.sidebar.calendars")}
                >
                  <SidebarSimple size={14} />
                </button>
                <button
                  type="button"
                  className="metal-inset-btn metal-inset-icon"
                  onClick={onToggleMiniCalendar}
                  data-state={showMiniCalendar ? "on" : "off"}
                >
                  <CalendarBlank size={14} />
                </button>
              </div>
            </div>
          )}
          <div className="shrink-0">
            <div className="metal-inset-btn-group">
              <button
                type="button"
                className="metal-inset-btn font-geneva-12 !text-[11px] w-[48px] justify-center px-0"
                onClick={onGoToToday}
              >
                {t("apps.calendar.today")}
              </button>
            </div>
          </div>
          <div className="shrink-0">
            <div className="metal-inset-btn-group">
              <button type="button" className="metal-inset-btn metal-inset-icon" onClick={onPrev}>
                <span className="inline-block w-0 h-0 border-t-[4px] border-t-transparent border-b-[4px] border-b-transparent border-r-[5px] border-r-current" />
              </button>
              {views.map((v) => (
                <button key={v.id} type="button" className="metal-inset-btn font-geneva-12 !text-[11px] w-[48px] justify-center px-0"
                  data-state={view === v.id ? "on" : "off"} onClick={() => onSetView(v.id)}>
                  {v.label}
                </button>
              ))}
              <button type="button" className="metal-inset-btn metal-inset-icon" onClick={onNext}>
                <span className="inline-block w-0 h-0 border-t-[4px] border-t-transparent border-b-[4px] border-b-transparent border-l-[5px] border-l-current" />
              </button>
            </div>
          </div>
          {showSearch ? (
            <div className="flex-1 min-w-0 flex items-center justify-center">
              {searchField}
            </div>
          ) : (
            <div className="flex-1" />
          )}
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="metal-inset-btn-group">
              <button type="button" className="metal-inset-btn metal-inset-icon" onClick={onNewEvent} title={t("apps.calendar.menu.newEvent")}>
                <Plus size={12} weight="bold" />
              </button>
              <button
                type="button"
                className="metal-inset-btn metal-inset-icon"
                onClick={onToggleTodoSidebar}
                data-state={showTodoSidebar ? "on" : "off"}
                title={t("apps.calendar.sidebar.toDoItems")}
              >
                <ListChecks size={12} weight="bold" />
              </button>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center gap-1.5 shrink-0">
            {!isNarrow && (
              <div className="flex items-center gap-0">
                <Button
                  variant={isSystem7Theme ? "player" : "ghost"}
                  onClick={onToggleCalendarSidebar}
                  data-state={showCalendarSidebar ? "on" : "off"}
                  className={cn("h-6 w-6", isXpTheme && "text-black")}
                  title={t("apps.calendar.sidebar.calendars")}
                >
                  <SidebarSimple size={14} />
                </Button>
                <Button
                  variant={isSystem7Theme ? "player" : "ghost"}
                  onClick={onToggleMiniCalendar}
                  data-state={showMiniCalendar ? "on" : "off"}
                  className={cn("h-6 w-6", isXpTheme && "text-black")}
                >
                  <CalendarBlank size={14} />
                </Button>
              </div>
            )}
            <Button variant={isSystem7Theme ? "player" : "ghost"} onClick={onGoToToday}
              className={cn("h-6 w-[48px] text-[11px] px-0", isSystem7Theme && "font-geneva-12", isXpTheme && "text-black")}>
              {t("apps.calendar.today")}
            </Button>
            <div className="flex items-center gap-0">
              <Button variant={isSystem7Theme ? "player" : "default"} size="icon"
                className={cn("h-[22px] w-6", isXpTheme && "text-black")} onClick={onPrev}>
                <CaretLeft size={12} weight="bold" />
              </Button>
              {views.map((v) => (
                <Button key={v.id} variant={isSystem7Theme ? "player" : "default"}
                  data-state={view === v.id ? "on" : "off"} onClick={() => onSetView(v.id)}
                  className={cn("h-[22px] w-[48px] px-0 text-[11px]", isSystem7Theme && "font-geneva-12", isXpTheme && "text-black")}>
                  {v.label}
                </Button>
              ))}
              <Button variant={isSystem7Theme ? "player" : "default"} size="icon"
                className={cn("h-[22px] w-6", isXpTheme && "text-black")} onClick={onNext}>
                <CaretRight size={12} weight="bold" />
              </Button>
            </div>
          </div>
          {showSearch ? (
            <div className="flex-1 min-w-0 flex items-center justify-center">
              {searchField}
            </div>
          ) : (
            <div className="flex-1" />
          )}
          <div className="flex items-center gap-0 shrink-0">
            <Button variant={isSystem7Theme ? "player" : "ghost"} onClick={onNewEvent}
              className={cn("h-6 w-6", isXpTheme && "text-black")} title={t("apps.calendar.menu.newEvent")}>
              <Plus size={12} weight="bold" />
            </Button>
            <Button variant={isSystem7Theme ? "player" : "ghost"}
              onClick={onToggleTodoSidebar} data-state={showTodoSidebar ? "on" : "off"}
              className={cn("h-6 w-6", isXpTheme && "text-black")} title={t("apps.calendar.sidebar.toDoItems")}>
              <ListChecks size={12} weight="bold" />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function CalendarAppComponent({
  isWindowOpen, onClose, isForeground, skipInitialSound, instanceId, onNavigateNext, onNavigatePrevious,
}: AppProps) {
  const username = useChatsStore((s) => s.username);
  const isAuthenticated = useChatsStore((s) => s.isAuthenticated);
  const calendarSyncReady = useCloudSyncStore(
    (s) => s.autoSyncEnabled && s.syncCalendar
  );
  const canSyncCalendar = Boolean(
    username && isAuthenticated && calendarSyncReady
  );
  useEffect(() => {
    if (canSyncCalendar) {
      requestCloudSyncDomainCheck("calendar");
    }
  }, [canSyncCalendar]);

  const logic = useCalendarLogic();
  const {
    t, translatedHelpItems,
    isHelpDialogOpen, setIsHelpDialogOpen, isAboutDialogOpen, setIsAboutDialogOpen,
    isXpTheme, isMacOSTheme, isSystem7Theme,
    searchQuery, setSearchQuery,
    selectedDate, view, monthYearLabel, selectedDateLabel, calendarGrid, selectedDateEvents,
    narrowDayNames, hourLabels, weekDates, weekLabel,
    selectedEventId, setSelectedEventId,
    calendars, toggleCalendarVisibility,
    todos, addTodo, toggleTodo, updateTodo, deleteTodo, showTodoSidebar, setShowTodoSidebar,
    navigateMonth, navigateWeek, goToToday, setView, setSelectedDate,
    handleDateClick, handleDateDoubleClick, handleNewEvent, handleNewEventAtTime, handleEditSelectedEvent, handleDeleteSelectedEvent, handleUpdateEvent,
    fileInputRef, handleImport, handleFileSelected, handleExport,
    undoCalendar, redoCalendar, canUndo, canRedo,
  } = logic;

  const events = useCalendarStore((s) => s.events);

  useRegisterUndoRedo(instanceId!, {
    undo: undoCalendar,
    redo: redoCalendar,
    canUndo,
    canRedo,
  });

  // Selected todo (mirrors selectedEventId — drives the details tray).
  const [selectedTodoId, setSelectedTodoId] = useState<string | null>(null);

  // Resolve currently-selected event/todo for the tray.
  const selectedEvent = useMemo(
    () => (selectedEventId ? events.find((e) => e.id === selectedEventId) || null : null),
    [selectedEventId, events]
  );
  const selectedTodo = useMemo(
    () => (selectedTodoId ? todos.find((t) => t.id === selectedTodoId) || null : null),
    [selectedTodoId, todos]
  );

  // Open the details tray whenever something is selected; close otherwise.
  const showTrayDrawer = !!(selectedEvent || selectedTodo);

  // Selecting an event clears any selected todo and vice versa so only one
  // detail panel shows at a time.
  const handleSelectEvent = useCallback(
    (id: string, options?: { toggle?: boolean }) => {
      setSelectedTodoId(null);
      if (options?.toggle === false) {
        setSelectedEventId(id);
        return;
      }
      setSelectedEventId((prev) => (prev === id ? null : id));
    },
    [setSelectedEventId]
  );

  const handleSelectTodo = useCallback((id: string) => {
    setSelectedEventId(null);
    setSelectedTodoId(id);
  }, [setSelectedEventId]);

  const handleDeleteEventFromTray = useCallback((id: string) => {
    if (id === selectedEventId) {
      handleDeleteSelectedEvent();
    }
  }, [selectedEventId, handleDeleteSelectedEvent]);

  const handleDeleteTodoFromTray = useCallback((id: string) => {
    deleteTodo(id);
    if (id === selectedTodoId) setSelectedTodoId(null);
  }, [deleteTodo, selectedTodoId]);

  /** New events open in the tray; clear to-do selection so the drawer targets the event. */
  const onNewEvent = useCallback(() => {
    setSelectedTodoId(null);
    handleNewEvent();
  }, [handleNewEvent]);

  const onNewEventAtTime = useCallback(
    (date: string, hour: number) => {
      setSelectedTodoId(null);
      handleNewEventAtTime(date, hour);
    },
    [handleNewEventAtTime]
  );

  const onDateDoubleClick = useCallback(
    (date: string) => {
      setSelectedTodoId(null);
      handleDateDoubleClick(date);
    },
    [handleDateDoubleClick]
  );

  // Drawer open/close sounds — same SFX as the TV drawer for consistency.
  const { play: playDrawerOpen } = useSound(Sounds.WINDOW_ZOOM_MAXIMIZE);
  const { play: playDrawerClose } = useSound(Sounds.WINDOW_ZOOM_MINIMIZE);
  const drawerSoundMountedRef = useRef(false);
  useEffect(() => {
    if (!drawerSoundMountedRef.current) {
      drawerSoundMountedRef.current = true;
      return;
    }
    if (showTrayDrawer) void playDrawerOpen();
    else void playDrawerClose();
  }, [showTrayDrawer, playDrawerOpen, playDrawerClose]);

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(700);
  const [showCalendarSidebar, setShowCalendarSidebar] = useState(true);
  const [showMiniCalendar, setShowMiniCalendar] = useState(true);
  const [weekTimeGridHourHeight, setWeekTimeGridHourHeight] = useState(
    DEFAULT_TIME_GRID_HOUR_HEIGHT,
  );
  const [dayTimeGridHourHeight, setDayTimeGridHourHeight] = useState(
    DEFAULT_TIME_GRID_HOUR_HEIGHT,
  );
  useResizeObserverWithRef(containerRef, (entry) => {
    setContainerWidth(entry.contentRect.width);
  });

  const isNarrow = containerWidth < 600;
  const showSidebar = containerWidth >= 540 && showCalendarSidebar;
  const showTodo = showTodoSidebar && !isNarrow;
  const showTodoFullWidth = showTodoSidebar && isNarrow;
  const effectiveView = view;
  const safeSearchQuery = searchQuery ?? "";
  const normalizedSearchQuery = useMemo(() => safeSearchQuery.trim().toLocaleLowerCase(), [safeSearchQuery]);

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

  const headerLabel = showTodoFullWidth
    ? t("apps.calendar.sidebar.toDoItems")
    : effectiveView === "week" ? weekLabel : effectiveView === "day" ? selectedDateLabel : monthYearLabel;

  const menuBar = (
    <CalendarMenuBar
      onClose={onClose}
      onShowHelp={() => setIsHelpDialogOpen(true)}
      onShowAbout={() => setIsAboutDialogOpen(true)}
      onNewEvent={onNewEvent}
      onImport={handleImport}
      onExport={handleExport}
      onEditEvent={handleEditSelectedEvent}
      onDeleteEvent={handleDeleteSelectedEvent}
      hasSelectedEvent={!!selectedEventId}
      view={view}
      onSetView={setView}
      onGoToToday={goToToday}
      showTodoSidebar={showTodoSidebar}
      onToggleTodoSidebar={() => setShowTodoSidebar(!showTodoSidebar)}
      instanceId={instanceId}
    />
  );

  useEffect(() => {
    if (!isWindowOpen || !isForeground) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isKeyboardDeleteTargetEditable(e.target)) return;
      if (!selectedEventId && !selectedTodoId) return;
      e.preventDefault();
      if (selectedEventId) {
        handleDeleteSelectedEvent();
      } else if (selectedTodoId) {
        handleDeleteTodoFromTray(selectedTodoId);
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [
    isWindowOpen,
    isForeground,
    selectedEventId,
    selectedTodoId,
    handleDeleteSelectedEvent,
    handleDeleteTodoFromTray,
  ]);

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
        drawer={
          <AppDrawer isOpen={showTrayDrawer}>
            <TrayDetails
              selectedEvent={selectedEvent}
              selectedTodo={selectedTodo}
              calendars={calendars}
              isMacOSTheme={isMacOSTheme}
              isSystem7Theme={isSystem7Theme}
              isXpTheme={isXpTheme}
              onUpdateEvent={handleUpdateEvent}
              onDeleteEvent={handleDeleteEventFromTray}
              onUpdateTodo={updateTodo}
              onToggleTodo={toggleTodo}
              onDeleteTodo={handleDeleteTodoFromTray}
            />
          </AppDrawer>
        }
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
                  {showMiniCalendar && (
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
                  )}
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
                  {showMiniCalendar && (
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
                  )}
                </div>
              )
            )}

            {/* Main view area — hidden when todo is full-width on narrow screens */}
            {!showTodoFullWidth && (
              <div
                className={cn("flex-1 flex overflow-hidden calendar-grid bg-white")}
                style={isMacOSTheme ? {
                  border: "1px solid rgba(0, 0, 0, 0.55)",
                  boxShadow: "inset 0 1px 2px rgba(0, 0, 0, 0.25), 0 1px 0 rgba(255, 255, 255, 0.4)",
                } : undefined}
              >
                {effectiveView === "week" && (
                  <WeekTimeGrid weekDates={weekDates} selectedEventId={selectedEventId}
                    onDateClick={handleDateClick} onTimeSlotClick={onNewEventAtTime}
                    onEventClick={(ev) => handleSelectEvent(ev.id)}
                    onEventDoubleClick={(ev) => handleSelectEvent(ev.id, { toggle: false })}
                    isXpTheme={isXpTheme} isMacOSTheme={isMacOSTheme} isSystem7Theme={isSystem7Theme} searchQuery={normalizedSearchQuery} hourLabels={hourLabels}
                    hourHeight={weekTimeGridHourHeight} setHourHeight={setWeekTimeGridHourHeight}
                    onUpdateEvent={handleUpdateEvent} />
                )}
                {effectiveView === "day" && (
                  <DayTimeGrid date={selectedDate} events={selectedDateEvents} selectedEventId={selectedEventId}
                    onTimeSlotClick={onNewEventAtTime}
                    onEventClick={(ev) => handleSelectEvent(ev.id)}
                    onEventDoubleClick={(ev) => handleSelectEvent(ev.id, { toggle: false })}
                    isXpTheme={isXpTheme} isMacOSTheme={isMacOSTheme} isSystem7Theme={isSystem7Theme} searchQuery={normalizedSearchQuery} hourLabels={hourLabels}
                    hourHeight={dayTimeGridHourHeight} setHourHeight={setDayTimeGridHourHeight}
                    onUpdateEvent={handleUpdateEvent} />
                )}
                {effectiveView === "month" && (
                  <MonthGrid calendarGrid={calendarGrid} selectedEventId={selectedEventId}
                    onDateClick={handleDateClick} onDateDoubleClick={onDateDoubleClick}
                    onEventClick={(ev) => handleSelectEvent(ev.id)}
                    onEventDoubleClick={(ev) => handleSelectEvent(ev.id, { toggle: false })}
                    isXpTheme={isXpTheme} searchQuery={normalizedSearchQuery} narrowDayNames={narrowDayNames} />
                )}
              </div>
            )}

            {/* Todo: full-width on narrow screens, sidebar on wide */}
            {showTodoFullWidth && (
              <div
                className="flex-1 overflow-y-auto bg-white"
                style={isMacOSTheme ? {
                  border: "1px solid rgba(0, 0, 0, 0.55)",
                  boxShadow: "inset 0 1px 2px rgba(0, 0, 0, 0.25), 0 1px 0 rgba(255, 255, 255, 0.4)",
                } : undefined}
              >
                <TodoSidebar
                  todos={todos}
                  calendars={calendars}
                  onToggle={toggleTodo}
                  onAdd={addTodo}
                  onUpdate={updateTodo}
                  onDelete={deleteTodo}
                  isMacOSTheme={isMacOSTheme}
                  isSystem7Theme={isSystem7Theme}
                  fullWidth
                  selectedTodoId={selectedTodoId}
                  onSelectTodo={handleSelectTodo}
                />
              </div>
            )}
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
                  onUpdate={updateTodo}
                  onDelete={deleteTodo}
                  isMacOSTheme={isMacOSTheme}
                  isSystem7Theme={isSystem7Theme}
                  selectedTodoId={selectedTodoId}
                  onSelectTodo={handleSelectTodo}
                />
              </div>
            )}
          </div>

          {/* Bottom toolbar */}
          <BottomToolbar
            view={effectiveView} onSetView={setView} onGoToToday={goToToday} onNewEvent={onNewEvent}
            onPrev={handlePrev} onNext={handleNext}
            showCalendarSidebar={showCalendarSidebar} onToggleCalendarSidebar={() => setShowCalendarSidebar((current) => !current)}
            showMiniCalendar={showMiniCalendar} onToggleMiniCalendar={() => setShowMiniCalendar((current) => !current)}
            showTodoSidebar={showTodoSidebar} onToggleTodoSidebar={() => setShowTodoSidebar(!showTodoSidebar)}
            searchQuery={safeSearchQuery} onSearchQueryChange={setSearchQuery} showSearch={!isNarrow}
            isNarrow={isNarrow}
            isXpTheme={isXpTheme} isMacOSTheme={isMacOSTheme} isSystem7Theme={isSystem7Theme} t={t}
          />
        </div>

        <HelpDialog isOpen={isHelpDialogOpen} onOpenChange={setIsHelpDialogOpen} appId="calendar" helpItems={translatedHelpItems} />
        <AboutDialog isOpen={isAboutDialogOpen} onOpenChange={setIsAboutDialogOpen} metadata={appMetadata} appId="calendar" />

        {/* Hidden file input for iCal import */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".ics,.ical,.ifb,.icalendar"
          className="hidden"
          onChange={handleFileSelected}
        />
      </WindowFrame>
    </>
  );
}
