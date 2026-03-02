import { useMemo } from "react";
import { useCalendarStore, type CalendarEvent } from "@/stores/useCalendarStore";
import { useThemeStore } from "@/stores/useThemeStore";
import { useShallow } from "zustand/react/shallow";
import { requestAppLaunch } from "@/utils/appEventBus";

const DAY_HEADERS = ["S", "M", "T", "W", "T", "F", "S"];

const EVENT_COLOR_MAP: Record<string, string> = {
  blue: "#3B82F6",
  red: "#EF4444",
  green: "#22C55E",
  orange: "#F97316",
  purple: "#A855F7",
};

export function CalendarWidget() {
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";

  const { events, currentMonth, currentYear } = useCalendarStore(
    useShallow((state) => ({
      events: state.events,
      currentMonth: state.currentMonth,
      currentYear: state.currentYear,
    }))
  );

  const todayStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  // Build mini calendar grid
  const { weeks, monthLabel } = useMemo(() => {
    const now = new Date();
    const month = now.getMonth();
    const year = now.getFullYear();
    const firstDay = new Date(year, month, 1);
    const startDow = firstDay.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrev = new Date(year, month, 0).getDate();

    // Build event lookup
    const eventsByDate = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
      const existing = eventsByDate.get(ev.date);
      if (existing) existing.push(ev);
      else eventsByDate.set(ev.date, [ev]);
    }

    const weeks: Array<
      Array<{
        day: number;
        dateStr: string;
        isCurrentMonth: boolean;
        isToday: boolean;
        events: CalendarEvent[];
      }>
    > = [];

    let dayCounter = 1;
    let nextCounter = 1;

    for (let w = 0; w < 6; w++) {
      const row: typeof weeks[number] = [];
      for (let d = 0; d < 7; d++) {
        const idx = w * 7 + d;
        if (idx < startDow) {
          const prevDay = daysInPrev - startDow + idx + 1;
          const pm = month === 0 ? 11 : month - 1;
          const py = month === 0 ? year - 1 : year;
          const ds = `${py}-${String(pm + 1).padStart(2, "0")}-${String(prevDay).padStart(2, "0")}`;
          row.push({ day: prevDay, dateStr: ds, isCurrentMonth: false, isToday: ds === todayStr, events: eventsByDate.get(ds) || [] });
        } else if (dayCounter <= daysInMonth) {
          const ds = `${year}-${String(month + 1).padStart(2, "0")}-${String(dayCounter).padStart(2, "0")}`;
          row.push({ day: dayCounter, dateStr: ds, isCurrentMonth: true, isToday: ds === todayStr, events: eventsByDate.get(ds) || [] });
          dayCounter++;
        } else {
          const nm = month === 11 ? 0 : month + 1;
          const ny = month === 11 ? year + 1 : year;
          const ds = `${ny}-${String(nm + 1).padStart(2, "0")}-${String(nextCounter).padStart(2, "0")}`;
          row.push({ day: nextCounter, dateStr: ds, isCurrentMonth: false, isToday: ds === todayStr, events: eventsByDate.get(ds) || [] });
          nextCounter++;
        }
      }
      weeks.push(row);
    }

    const monthLabel = new Date(year, month, 1).toLocaleDateString(undefined, {
      month: "long",
      year: "numeric",
    });

    return { weeks, monthLabel };
  }, [events, currentMonth, currentYear, todayStr]);

  const textColor = isXpTheme ? "#000" : "rgba(255,255,255,0.9)";
  const dimColor = isXpTheme ? "#999" : "rgba(255,255,255,0.35)";

  const handleDateClick = (dateStr: string) => {
    // Open calendar app to this date
    useCalendarStore.getState().setSelectedDate(dateStr);
    requestAppLaunch({ appId: "calendar" });
  };

  return (
    <div className="p-2" style={{ color: textColor }}>
      {/* Month header */}
      <div className="text-center text-xs font-semibold mb-1" style={{ color: textColor }}>
        {monthLabel}
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-0.5">
        {DAY_HEADERS.map((d, i) => (
          <div
            key={i}
            className="text-center text-[9px] font-medium"
            style={{
              color: i === 0 || i === 6
                ? (isXpTheme ? "#CC0000" : "#FF6B6B")
                : dimColor,
            }}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Grid */}
      {weeks.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7">
          {week.map((cell) => (
            <button
              key={cell.dateStr}
              type="button"
              onClick={() => handleDateClick(cell.dateStr)}
              className="flex flex-col items-center py-0.5 hover:opacity-80 transition-opacity"
              style={{ opacity: cell.isCurrentMonth ? 1 : 0.3 }}
            >
              <span
                className="text-[10px] leading-none flex items-center justify-center"
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  backgroundColor: cell.isToday
                    ? (isXpTheme ? "#CC0000" : "#007AFF")
                    : "transparent",
                  color: cell.isToday ? "#FFF" : textColor,
                  fontWeight: cell.isToday ? "bold" : "normal",
                }}
              >
                {cell.day}
              </span>
              {cell.events.length > 0 && (
                <div className="flex gap-px mt-px">
                  {cell.events.slice(0, 2).map((ev, i) => (
                    <span
                      key={i}
                      className="w-1 h-1 rounded-full"
                      style={{ backgroundColor: EVENT_COLOR_MAP[ev.color] || "#3B82F6" }}
                    />
                  ))}
                </div>
              )}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
