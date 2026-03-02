import { useMemo } from "react";
import { useCalendarStore, type CalendarEvent } from "@/stores/useCalendarStore";
import { useThemeStore } from "@/stores/useThemeStore";
import { useShallow } from "zustand/react/shallow";
import { requestAppLaunch } from "@/utils/appEventBus";

const DAY_HEADERS = ["S", "M", "T", "W", "T", "F", "S"];
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

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

  const now = new Date();
  const todayStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  // Build mini calendar grid
  const weeks = useMemo(() => {
    const month = now.getMonth();
    const year = now.getFullYear();
    const firstDay = new Date(year, month, 1);
    const startDow = firstDay.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrev = new Date(year, month, 0).getDate();

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

    return weeks;
  }, [events, currentMonth, currentYear, todayStr, now]);

  const handleClick = () => {
    requestAppLaunch({ appId: "calendar" });
  };

  if (isXpTheme) {
    // Simple XP-style calendar
    return (
      <div className="p-2 cursor-pointer" onClick={handleClick} style={{ color: "#000" }}>
        <div className="text-center text-xs font-semibold mb-1">
          {MONTH_NAMES[now.getMonth()]} {now.getFullYear()}
        </div>
        <div className="grid grid-cols-7 mb-0.5">
          {DAY_HEADERS.map((d, i) => (
            <div key={i} className="text-center text-[9px] font-medium" style={{ color: i === 0 || i === 6 ? "#CC0000" : "#666" }}>
              {d}
            </div>
          ))}
        </div>
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7">
            {week.map((cell) => (
              <div key={cell.dateStr} className="flex items-center justify-center h-[16px]" style={{ opacity: cell.isCurrentMonth ? 1 : 0.25 }}>
                <span className="text-[10px]" style={{
                  width: 16, height: 16, lineHeight: "16px", textAlign: "center", display: "inline-block",
                  borderRadius: "50%",
                  backgroundColor: cell.isToday ? "#316AC5" : "transparent",
                  color: cell.isToday ? "#FFF" : undefined,
                  fontWeight: cell.isToday ? "bold" : "normal",
                }}>
                  {cell.day}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  }

  // Tiger iCal-style: Red header with day name, large date, month mini grid below
  const dayOfWeek = DAY_NAMES[now.getDay()];
  const dayAbbrev = dayOfWeek.substring(0, 3);
  const monthAbbrev = MONTH_NAMES[now.getMonth()].substring(0, 3);

  return (
    <div className="cursor-pointer overflow-hidden" onClick={handleClick} style={{ borderRadius: "inherit" }}>
      {/* Red header — Tiger iCal torn-calendar style */}
      <div
        className="text-center py-1 px-2"
        style={{
          background: "linear-gradient(180deg, #E84040 0%, #CC2020 100%)",
          borderBottom: "1px solid #A01010",
        }}
      >
        <div className="text-[10px] font-bold tracking-widest uppercase" style={{ color: "rgba(255,255,255,0.85)" }}>
          {dayAbbrev}
        </div>
      </div>

      {/* Large date number + month */}
      <div
        className="flex flex-col items-center py-1"
        style={{
          background: "linear-gradient(180deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.04) 100%)",
        }}
      >
        <div
          className="text-[10px] font-semibold tracking-wide uppercase"
          style={{ color: "rgba(255,255,255,0.5)" }}
        >
          {monthAbbrev}
        </div>
        <div
          className="text-3xl font-bold leading-none"
          style={{ color: "rgba(255,255,255,0.95)" }}
        >
          {now.getDate()}
        </div>
      </div>

      {/* Mini month grid */}
      <div className="px-2 pb-2 pt-1">
        <div className="grid grid-cols-7 mb-0.5">
          {DAY_HEADERS.map((d, i) => (
            <div
              key={i}
              className="text-center text-[8px] font-medium"
              style={{ color: i === 0 || i === 6 ? "#FF6B6B" : "rgba(255,255,255,0.35)" }}
            >
              {d}
            </div>
          ))}
        </div>
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7">
            {week.map((cell) => (
              <div
                key={cell.dateStr}
                className="flex flex-col items-center py-px"
                style={{ opacity: cell.isCurrentMonth ? 1 : 0.2 }}
              >
                <span
                  className="text-[9px] leading-none flex items-center justify-center"
                  style={{
                    width: 15,
                    height: 15,
                    borderRadius: "50%",
                    backgroundColor: cell.isToday ? "#CC3333" : "transparent",
                    color: cell.isToday ? "#FFF" : "rgba(255,255,255,0.7)",
                    fontWeight: cell.isToday ? "bold" : "normal",
                  }}
                >
                  {cell.day}
                </span>
                {cell.events.length > 0 && (
                  <div className="flex gap-px">
                    {cell.events.slice(0, 2).map((ev, i) => (
                      <span
                        key={i}
                        className="w-1 h-1 rounded-full"
                        style={{ backgroundColor: EVENT_COLOR_MAP[ev.color] || "#3B82F6" }}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
