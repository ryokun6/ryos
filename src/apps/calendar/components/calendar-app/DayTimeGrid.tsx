import { useRef, useLayoutEffect, useEffect, useState, useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";
import { osSeparatorBorderClassName } from "@/components/shared/osThemePrimitives";
import type { CalendarEvent } from "@/stores/useCalendarStore";
import {
  DEFAULT_TIME_GRID_HOUR_HEIGHT,
  useTimeScaleGestures,
} from "../../hooks/useTimeScaleGestures";
import { TimedEventBlock } from "../TimedEventBlock";
import {
  EVENT_COLOR_LIGHT,
  EVENT_COLOR_MAP,
  getEventOpacity,
  HOUR_END,
  HOUR_START,
  TODAY_RED,
  TODAY_RED_XP,
} from "./calendarAppConstants";

export function DayTimeGrid({
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

  const { allDayEvents, timedEvents } = useMemo(() => {
    const nextAllDayEvents: CalendarEvent[] = [];
    const nextTimedEvents: CalendarEvent[] = [];

    for (const ev of events) {
      if (ev.startTime) {
        nextTimedEvents.push(ev);
      } else {
        nextAllDayEvents.push(ev);
      }
    }

    nextTimedEvents.sort((a, b) =>
      (a.startTime || "").localeCompare(b.startTime || "")
    );

    return {
      allDayEvents: nextAllDayEvents,
      timedEvents: nextTimedEvents,
    };
  }, [events]);

  const d = new Date();
  const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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
        <div className={cn("px-2 py-1 border-b flex flex-col gap-0.5", osSeparatorBorderClassName())}>
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
            {Array.from({ length: totalHours }, (_, hourOffset) => HOUR_START + hourOffset).map((hour) => (
              <button
                key={hour}
                type="button"
                onClick={() => onTimeSlotClick(date, hour)}
                className="absolute left-0 right-0 border-t hover:bg-black/[0.02] transition-colors"
                style={{
                  top: (hour - HOUR_START) * hourHeight,
                  height: hourHeight,
                  borderColor: isXpTheme ? "rgba(0,0,0,0.08)" : "rgba(0,0,0,0.06)",
                }}
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
                    <div className="size-2 rounded-full -ml-1 shrink-0" style={{ backgroundColor: isXpTheme ? TODAY_RED_XP : TODAY_RED }} />
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
