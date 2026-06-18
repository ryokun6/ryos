import { useRef, useCallback } from "react";
import type { CalendarEvent } from "@/stores/useCalendarStore";
import type { CalendarDayCell } from "../../hooks/useCalendarLogic";
import { osSeparatorBorderClassName } from "@/components/shared/osThemePrimitives";
import {
  EVENT_COLOR_LIGHT,
  EVENT_COLOR_MAP,
  getEventOpacity,
  TODAY_RED,
  TODAY_RED_XP,
  WEEKDAY_KEYS,
} from "./calendarAppConstants";

export function MonthGrid({
  calendarGrid, selectedEventId, onDateClick, onDateDoubleClick, onEventClick, onEventDoubleClick, isWindowsTheme, searchQuery, narrowDayNames,
}: {
  calendarGrid: CalendarDayCell[][]; selectedEventId: string | null; onDateClick: (date: string) => void; onDateDoubleClick: (date: string) => void;
  onEventClick: (event: CalendarEvent) => void; onEventDoubleClick: (event: CalendarEvent) => void; isWindowsTheme: boolean; searchQuery: string; narrowDayNames: string[];
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
      <div className={`grid grid-cols-7 border-b ${osSeparatorBorderClassName()}`}>
        {WEEKDAY_KEYS.map((dayKey) => {
          const dayLabel = narrowDayNames[WEEKDAY_KEYS.indexOf(dayKey)] ?? "";
          return (
            <div
              key={dayKey}
              className="text-center text-[10px] font-medium py-1 select-none"
              style={{ opacity: 0.5 }}
            >
              {dayLabel}
            </div>
          );
        })}
      </div>
      <div className="flex-1 grid grid-rows-6">
        {calendarGrid.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 border-b" style={{ borderColor: "rgba(0,0,0,0.04)" }}>
            {week.map((cell) => (
              <button key={cell.date} type="button" onClick={() => handleDateTap(cell.date)}
                className="flex flex-col items-start p-0.5 min-h-[40px] relative transition-colors select-none overflow-hidden"
                style={{ opacity: cell.isCurrentMonth ? 1 : 0.3, backgroundColor: cell.isSelected ? (isWindowsTheme ? "rgba(0,0,0,0.08)" : "rgba(0,0,0,0.06)") : "transparent" }}
              >
                <span className="text-[10px] font-medium self-end mr-0.5"
                  style={{ width: 18, height: 18, lineHeight: "18px", textAlign: "center", borderRadius: "50%", display: "inline-block",
                    backgroundColor: cell.isToday ? (isWindowsTheme ? TODAY_RED_XP : TODAY_RED) : "transparent", color: cell.isToday ? "#FFF" : undefined }}
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
