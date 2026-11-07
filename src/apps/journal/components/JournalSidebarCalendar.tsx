import { useMemo, useState } from "react";
import { MiniCalendar } from "@/apps/calendar/components/calendar-app/MiniCalendar";
import type { CalendarDayCell } from "@/apps/calendar/hooks/useCalendarLogic";

interface VisibleMonth {
  year: number;
  month: number;
}

function visibleMonth(dayId: string): VisibleMonth {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(dayId);
  if (!match) {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  }
  return { year: Number(match[1]), month: Number(match[2]) - 1 };
}

function shiftMonth(current: VisibleMonth, delta: number): VisibleMonth {
  const date = new Date(current.year, current.month + delta, 1);
  return { year: date.getFullYear(), month: date.getMonth() };
}

/** Same six-week grid the Calendar mini calendar draws, without its events. */
export function journalMonthGrid(
  year: number,
  month: number,
  today: string,
  selectedDate: string
): CalendarDayCell[][] {
  const startDayOfWeek = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();
  const weeks: CalendarDayCell[][] = [];
  let dayCounter = 1;
  let nextMonthCounter = 1;

  for (let week = 0; week < 6; week += 1) {
    const row: CalendarDayCell[] = [];
    for (let dow = 0; dow < 7; dow += 1) {
      const cellIndex = week * 7 + dow;
      let cellYear = year;
      let cellMonth = month;
      let day = dayCounter;
      let isCurrentMonth = true;

      if (cellIndex < startDayOfWeek) {
        day = daysInPrevMonth - startDayOfWeek + cellIndex + 1;
        cellMonth = month === 0 ? 11 : month - 1;
        cellYear = month === 0 ? year - 1 : year;
        isCurrentMonth = false;
      } else if (dayCounter <= daysInMonth) {
        day = dayCounter;
        dayCounter += 1;
      } else {
        day = nextMonthCounter;
        nextMonthCounter += 1;
        cellMonth = month === 11 ? 0 : month + 1;
        cellYear = month === 11 ? year + 1 : year;
        isCurrentMonth = false;
      }

      const date = `${cellYear}-${String(cellMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      row.push({
        date,
        day,
        isCurrentMonth,
        isToday: date === today,
        isSelected: date === selectedDate,
        events: [],
      });
    }
    weeks.push(row);
  }

  return weeks;
}

export function JournalSidebarCalendar({
  selectedDate,
  today,
  language,
  isWindowsTheme,
  isMacOSTheme,
  isSystem7Theme,
  onSelectDay,
}: {
  selectedDate: string;
  today: string;
  language: string;
  isWindowsTheme: boolean;
  isMacOSTheme: boolean;
  isSystem7Theme: boolean;
  onSelectDay: (dayId: string) => void;
}) {
  const anchor = selectedDate || today;
  const [followedDay, setFollowedDay] = useState(anchor);
  const [month, setMonth] = useState(() => visibleMonth(anchor));
  if (anchor !== followedDay) {
    setFollowedDay(anchor);
    setMonth(visibleMonth(anchor));
  }

  const calendarGrid = useMemo(
    () => journalMonthGrid(month.year, month.month, today, selectedDate),
    [month.year, month.month, today, selectedDate]
  );
  const monthYearLabel = useMemo(
    () =>
      new Date(month.year, month.month, 1).toLocaleDateString(language, {
        month: "long",
        year: "numeric",
      }),
    [month.year, month.month, language]
  );
  const narrowDayNames = useMemo(() => {
    const format = new Intl.DateTimeFormat(language, { weekday: "narrow" });
    return Array.from({ length: 7 }, (_, index) =>
      format.format(new Date(2024, 0, 7 + index))
    );
  }, [language]);

  return (
    <MiniCalendar
      calendarGrid={calendarGrid}
      selectedDate={selectedDate}
      todayStr={today}
      onDateClick={onSelectDay}
      isWindowsTheme={isWindowsTheme}
      isMacOSTheme={isMacOSTheme}
      isSystem7Theme={isSystem7Theme}
      monthYearLabel={monthYearLabel}
      narrowDayNames={narrowDayNames}
      onPrevMonth={() => setMonth((current) => shiftMonth(current, -1))}
      onNextMonth={() => setMonth((current) => shiftMonth(current, 1))}
    />
  );
}
