import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { AquaCheckbox } from "@/components/ui/aqua-checkbox";
import type { CalendarGroup } from "@/stores/useCalendarStore";
import { getCalendarColorVisuals } from "./calendarAppConstants";

export function CalendarList({
  calendars,
  onToggle,
  isMacOSTheme,
  isSystem7Theme,
  isDarkMode = false,
}: {
  calendars: CalendarGroup[];
  onToggle: (id: string) => void;
  isMacOSTheme: boolean;
  isSystem7Theme: boolean;
  isDarkMode?: boolean;
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
      {calendars.map((cal) => {
        const swatch = getCalendarColorVisuals(cal.color, isDarkMode).swatch;
        return (
          <button
            key={cal.id}
            type="button"
            onClick={() => onToggle(cal.id)}
            className="flex items-center gap-1.5 w-full px-2 py-1 rounded hover:bg-black/5 transition-colors"
            title={cal.name}
          >
            <AquaCheckbox checked={cal.visible} color={swatch} />
            <span className={cn("text-[11px] truncate", useGeneva && "font-geneva-12")}>{cal.name}</span>
          </button>
        );
      })}
    </div>
  );
}
