import { useMemo, useCallback } from "react";
import { useCalendarStore, type CalendarEvent, type EventColor } from "@/stores/useCalendarStore";
import { useThemeStore } from "@/stores/useThemeStore";
import { requestAppLaunch } from "@/utils/appEventBus";
import { useTranslation } from "react-i18next";
import { useDashboardStore, type CalendarWidgetConfig } from "@/stores/useDashboardStore";
import { isWindowsTheme } from "@/themes";

function getLocalizedDayHeaders(locale: string): string[] {
  const fmt = new Intl.DateTimeFormat(locale, { weekday: "narrow" });
  // Dec 31, 2023 is a Sunday — iterate from there for Sun–Sat
  return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2023, 11, 31 + i)));
}

function getLocalizedDayName(date: Date, locale: string, style: "long" | "short" = "short"): string {
  return new Intl.DateTimeFormat(locale, { weekday: style }).format(date);
}

function getLocalizedMonthName(date: Date, locale: string, style: "long" | "short" = "short"): string {
  return new Intl.DateTimeFormat(locale, { month: style }).format(date);
}

const EVENT_COLOR_MAP: Record<string, string> = {
  blue: "#3B82F6",
  red: "#EF4444",
  green: "#22C55E",
  orange: "#F97316",
  purple: "#A855F7",
};

interface CalendarWidgetProps {
  widgetId?: string;
}

export function CalendarWidget({ widgetId }: CalendarWidgetProps) {
  const { i18n } = useTranslation();
  const locale = i18n.language || "en";
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = isWindowsTheme(currentTheme);

  const widget = useDashboardStore((s) => widgetId ? s.widgets.find((w) => w.id === widgetId) : undefined);
  const calConfig = widget?.config as CalendarWidgetConfig | undefined;
  const hiddenColors = useMemo(() => calConfig?.hiddenColors ?? [], [calConfig?.hiddenColors]);

  const allEvents = useCalendarStore((state) => state.events);

  const events = useMemo(() => {
    if (hiddenColors.length === 0) return allEvents;
    return allEvents.filter((ev) => !hiddenColors.includes(ev.color));
  }, [allEvents, hiddenColors]);

  const now = useMemo(() => new Date(), []);
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
  }, [events, todayStr, now]);

  const dayHeaders = useMemo(() => getLocalizedDayHeaders(locale), [locale]);

  const handleClick = () => {
    requestAppLaunch({ appId: "calendar" });
  };

  if (isXpTheme) {
    // Simple XP-style calendar
    return (
      <div className="p-2 cursor-pointer" onClick={handleClick} style={{ color: "#000" }}>
        <div className="text-center text-xs font-semibold mb-1">
          {getLocalizedMonthName(now, locale, "long")} {now.getFullYear()}
        </div>
        <div className="grid grid-cols-7 mb-0.5">
          {dayHeaders.map((d, i) => (
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

  const dayAbbrev = getLocalizedDayName(now, locale, "short");
  const monthAbbrev = getLocalizedMonthName(now, locale, "short");

  const brown = "#A33A2A";
  const brownDark = "#7C2418";
  const brownLight = "#C4503A";

  return (
    <div
      className="cursor-pointer overflow-hidden flex flex-col"
      onClick={handleClick}
      style={{
        borderRadius: "inherit",
        background: `linear-gradient(180deg, ${brownLight} 0%, ${brown} 30%, ${brownDark} 100%)`,
        height: "100%",
      }}
    >
      {/* Top torn-calendar cards */}
      <div className="flex gap-2 px-3 pt-3 pb-2">
        {/* Day + Month card */}
        <div
          className="flex-1 relative flex flex-col items-center justify-center"
          style={{
            aspectRatio: "1",
            borderRadius: 8,
            background: "linear-gradient(180deg, #FFFFFF 0%, #F0EDE8 100%)",
            boxShadow: "0 2px 6px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.8)",
          }}
        >
          <div className="font-bold" style={{ fontSize: 16, color: brown, fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}>{dayAbbrev}</div>
          <div className="font-bold leading-tight" style={{ fontSize: 24, color: brown, fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}>{monthAbbrev}</div>
        </div>

        {/* Date number card */}
        <div
          className="flex-1 relative flex items-center justify-center"
          style={{
            aspectRatio: "1",
            borderRadius: 8,
            background: "linear-gradient(180deg, #FFFFFF 0%, #F0EDE8 100%)",
            boxShadow: "0 2px 6px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.8)",
          }}
        >
          <div className="font-bold leading-none" style={{ fontSize: 56, color: brown, fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}>{now.getDate()}</div>
        </div>
      </div>

      {/* Mini month grid */}
      <div className="px-3 pb-2 flex-1">
        {/* Day headers */}
        <div className="grid grid-cols-7 pb-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.15)" }}>
          {dayHeaders.map((d, i) => (
            <div
              key={i}
              className="text-center font-bold"
              style={{ fontSize: 14, color: "rgba(255,255,255,0.6)", fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}
            >
              {d}
            </div>
          ))}
        </div>

        {/* Week rows */}
        {weeks.map((week, wi) => (
          <div
            key={wi}
            className="grid grid-cols-7"
            style={{ borderBottom: wi < weeks.length - 1 ? "1px solid rgba(255,255,255,0.08)" : "none" }}
          >
            {week.map((cell) => (
              <div
                key={cell.dateStr}
                className="relative flex items-center justify-center py-[6px]"
                style={{ opacity: cell.isCurrentMonth ? 1 : 0 }}
              >
                <span
                  className="leading-none flex items-center justify-center"
                  style={{
                    fontSize: 15,
                    fontWeight: cell.isToday ? 800 : 700,
                    width: 26,
                    height: 26,
                    borderRadius: 6,
                    backgroundColor: cell.isToday ? "rgba(255,255,255,0.25)" : "transparent",
                    color: cell.isToday ? "#FFF" : "rgba(255,255,255,0.55)",
                    fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
                  }}
                >
                  {cell.day}
                </span>
                {cell.events.length > 0 && (
                  <div className="absolute flex gap-0.5" style={{ bottom: 1, left: "50%", transform: "translateX(-50%)" }}>
                    {cell.events.slice(0, 2).map((ev, i) => (
                      <span
                        key={i}
                        className="w-1 h-1 rounded-full"
                        style={{ backgroundColor: EVENT_COLOR_MAP[ev.color] || "#F0A060" }}
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

const ALL_COLORS: { id: EventColor; hex: string }[] = [
  { id: "blue", hex: "#3B82F6" },
  { id: "red", hex: "#EF4444" },
  { id: "green", hex: "#22C55E" },
  { id: "orange", hex: "#F97316" },
  { id: "purple", hex: "#A855F7" },
];

export function CalendarBackPanel({ widgetId }: { widgetId: string }) {
  const { t } = useTranslation();
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = isWindowsTheme(currentTheme);
  const widget = useDashboardStore((s) => s.widgets.find((w) => w.id === widgetId));
  const updateWidgetConfig = useDashboardStore((s) => s.updateWidgetConfig);
  const calConfig = widget?.config as CalendarWidgetConfig | undefined;
  const hiddenColors = useMemo(() => calConfig?.hiddenColors ?? [], [calConfig?.hiddenColors]);

  const toggleColor = useCallback(
    (color: EventColor) => {
      const next = hiddenColors.includes(color)
        ? hiddenColors.filter((c) => c !== color)
        : [...hiddenColors, color];
      updateWidgetConfig(widgetId, { hiddenColors: next.length > 0 ? next : undefined } as CalendarWidgetConfig);
    },
    [hiddenColors, widgetId, updateWidgetConfig]
  );

  const textColor = isXpTheme ? "#000" : "rgba(255,255,255,0.8)";

  return (
    <div className="px-3 pb-3" onPointerDown={(e) => e.stopPropagation()}>
      <div
        className="font-bold mb-2"
        style={{
          fontSize: 11,
          color: isXpTheme ? "#333" : "rgba(255,255,255,0.5)",
          fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
        }}
      >
        {t("apps.dashboard.calendar.showColors", "Show Colors")}
      </div>
      <div className="flex flex-col gap-1">
        {ALL_COLORS.map((c) => {
          const visible = !hiddenColors.includes(c.id);
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => toggleColor(c.id)}
              className="flex items-center gap-2 px-2 py-1.5 rounded transition-colors"
              style={{
                opacity: visible ? 1 : 0.4,
                background: visible
                  ? isXpTheme ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.06)"
                  : "transparent",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = isXpTheme ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.1)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = visible
                ? isXpTheme ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.06)"
                : "transparent"
              )}
            >
              <span
                className="rounded-full"
                style={{
                  width: 10,
                  height: 10,
                  backgroundColor: c.hex,
                  flexShrink: 0,
                }}
              />
              <span className="text-[11px]" style={{ color: textColor, fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}>
                {t(`apps.dashboard.calendar.colors.${c.id}`, c.id)}
              </span>
              <span className="ml-auto text-[11px]" style={{ color: isXpTheme ? "#888" : "rgba(255,255,255,0.4)" }}>
                {visible ? "✓" : ""}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
