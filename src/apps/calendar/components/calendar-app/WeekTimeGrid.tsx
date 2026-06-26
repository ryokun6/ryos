import { useRef, useLayoutEffect, useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { osSeparatorBorderClassName } from "@/components/shared/osThemePrimitives";
import type { CalendarEvent } from "@/stores/useCalendarStore";
import {
  calendarEventOccursOnDate,
  getCalendarEventEndDate,
} from "@/shared/calendarEventDates";
import type { WeekDay } from "../../hooks/useCalendarLogic";
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

export function WeekTimeGrid({
  weekDates,
  selectedEventId,
  onDateClick,
  onTimeSlotClick,
  onEventClick,
  onEventDoubleClick,
  isWindowsTheme,
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
  isWindowsTheme: boolean;
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
          className={cn("flex border-b shrink-0", osSeparatorBorderClassName())}
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
                  ...(day.isToday ? { backgroundColor: isWindowsTheme ? TODAY_RED_XP : TODAY_RED } : {}),
                }}
              >
                {day.dayOfMonth}
              </div>
            </button>
          ))}
        </div>

        {hasAllDayEvents && (
          <div
            className={cn("flex border-b shrink-0", osSeparatorBorderClassName())}
            style={{ minHeight: 24 }}
          >
            <div
              className={cn("flex items-center justify-end px-1 text-[9px] opacity-40", useGeneva && "font-geneva-12")}
              style={{ width: 48, minWidth: 48, flexShrink: 0 }}
            >
              {t("apps.calendar.views.allDay")}
            </div>
            {weekDates.map((day) => (
              <div key={day.date} className="flex-1 flex flex-col gap-px py-px px-px min-w-0">
                {day.allDayEvents.map((ev) => {
                  const rangeEndDate = getCalendarEventEndDate(ev);
                  const continuesFromPreviousDay = ev.date < day.date;
                  const continuesToNextDay = rangeEndDate > day.date;
                  const firstVisibleDateInWeek =
                    weekDates.find((weekDay) =>
                      calendarEventOccursOnDate(ev, weekDay.date)
                    )?.date;
                  const showTitle = day.date === firstVisibleDateInWeek;

                  return (
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
                        borderRadius: `${continuesFromPreviousDay ? 0 : 4}px ${continuesToNextDay ? 0 : 4}px ${continuesToNextDay ? 0 : 4}px ${continuesFromPreviousDay ? 0 : 4}px`,
                        marginLeft: continuesFromPreviousDay ? "-1px" : undefined,
                        marginRight: continuesToNextDay ? "-1px" : undefined,
                        opacity: getEventOpacity(ev, searchQuery),
                      }}
                    >
                      {showTitle ? ev.title : "\u00a0"}
                    </button>
                  );
                })}
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
                style={{ borderLeft: isWindowsTheme ? "1px solid rgba(0,0,0,0.06)" : "1px solid rgba(0,0,0,0.04)" }}
              >
                {Array.from({ length: totalHours }, (_, hourOffset) => HOUR_START + hourOffset).map((hour) => (
                  <button
                    key={hour}
                    type="button"
                    onClick={() => onTimeSlotClick(day.date, hour)}
                    className="absolute left-0 right-0 border-t hover:bg-black/[0.02] transition-colors"
                    style={{
                      top: (hour - HOUR_START) * hourHeight,
                      height: hourHeight,
                      borderColor: isWindowsTheme ? "rgba(0,0,0,0.08)" : "rgba(0,0,0,0.06)",
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
                        <div className="size-2 rounded-full -ml-1" style={{ backgroundColor: isWindowsTheme ? TODAY_RED_XP : TODAY_RED }} />
                        <div className="flex-1 h-px" style={{ backgroundColor: isWindowsTheme ? TODAY_RED_XP : TODAY_RED }} />
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
