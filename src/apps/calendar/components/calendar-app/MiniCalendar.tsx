import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import type { CalendarDayCell } from "../../hooks/useCalendarLogic";
import { TODAY_RED, TODAY_RED_XP, WEEKDAY_KEYS } from "./calendarAppConstants";

export function MiniCalendar({
  calendarGrid,
  selectedDate,
  todayStr,
  onDateClick,
  isWindowsTheme,
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
  isWindowsTheme: boolean;
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
        {WEEKDAY_KEYS.map((dayKey) => {
          const dayLabel = narrowDayNames[WEEKDAY_KEYS.indexOf(dayKey)] ?? "";
          return (
            <div
              key={dayKey}
              className={cn("text-center font-medium", useGeneva && "font-geneva-12")}
              style={{ opacity: 0.5, fontSize: 9 }}
            >
              {dayLabel}
            </div>
          );
        })}
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
                      ? isWindowsTheme ? TODAY_RED_XP : TODAY_RED
                      : cell.date === selectedDate
                        ? isWindowsTheme ? "rgba(0,0,0,0.15)" : "rgba(0,0,0,0.08)"
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
