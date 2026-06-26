import { useState } from "react";
import { useInterval } from "@/hooks/useInterval";
import { useEventListener } from "@/hooks/useEventListener";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { useTranslation } from "react-i18next";
import { requestAppLaunch, toggleExposeView } from "@/utils/appEventBus";
import { useEffectiveTimezone } from "@/hooks/useEffectiveTimezone";
import {
  formatInTimeZone,
  getZonedDateTimeParts,
} from "@/lib/timezoneConfig";
import type { ClockProps } from "./menuBarTypes";

export function Clock({ enableExposeToggle = false, enableCalendarOpen = false }: ClockProps) {
  const [time, setTime] = useState(() => new Date());
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
  const { isWindowsTheme, isMacOSTheme } = useThemeFlags();
  const { t, i18n: i18nInstance } = useTranslation();
  const timeZone = useEffectiveTimezone();

  // Get current locale from i18n (reactive to language changes)
  const currentLocale = i18nInstance.language || "en";

  // Determine if locale prefers 24-hour format
  const prefers24Hour = ["zh-TW", "ja", "de", "fr", "ko"].includes(currentLocale);

  // Handle click on clock
  const handleClick = () => {
    if (enableCalendarOpen) {
      // Open Calendar app when clicking the clock/date
      requestAppLaunch({ appId: "calendar" });
    } else if (enableExposeToggle) {
      toggleExposeView();
    }
  };

  // Update time every second using useInterval
  useInterval(() => setTime(new Date()), 1000);

  // Handle viewport resize using useEventListener
  useEventListener("resize", () => setViewportWidth(window.innerWidth));

  const zoned = getZonedDateTimeParts(time, timeZone);

  // Helper function to format time without leading zeros for 24h format
  const formatTime24h = (): string => {
    const minute = zoned.minute.toString().padStart(2, "0");
    return `${zoned.hour}:${minute}`;
  };

  // Format the display based on theme and viewport width
  // Use "numeric" for hour to avoid leading zeros (e.g., "0:08" instead of "00:08")
  // "2-digit" would force leading zeros which Chinese/Japanese don't typically use
  const hourFormat = "numeric" as const;

  const formatTime12h = () =>
    formatInTimeZone(time, timeZone, currentLocale, {
      hour: hourFormat,
      minute: "2-digit",
      hour12: true,
    });

  let displayTime: string;

  if (isWindowsTheme) {
    // For XP/98 themes: use 24h for locales that prefer it, otherwise 12h
    displayTime = prefers24Hour ? formatTime24h() : formatTime12h();
  } else if (viewportWidth < 420) {
    // For small screens: just time (24h for locales that prefer it)
    displayTime = prefers24Hour ? formatTime24h() : formatTime12h();
  } else if (viewportWidth >= 420 && viewportWidth <= 768) {
    // For medium screens: time (24h for locales that prefer it)
    displayTime = prefers24Hour ? formatTime24h() : formatTime12h();
  } else {
    // For larger screens (> 768px): full date and time
    const timeString = prefers24Hour ? formatTime24h() : formatTime12h();

    // Custom formatting for Chinese, Japanese, and Korean
    if (currentLocale === "zh-TW") {
      // Chinese format: "12月2日 週二 12:03"
      const weekday = formatInTimeZone(time, timeZone, currentLocale, {
        weekday: "short",
      });
      displayTime = `${zoned.month}月${zoned.day}日 ${weekday} ${timeString}`;
    } else if (currentLocale === "ja") {
      // Japanese format: "12月2日 (火) 12:06"
      const weekday = formatInTimeZone(time, timeZone, currentLocale, {
        weekday: "short",
      });
      displayTime = `${zoned.month}月${zoned.day}日 (${weekday}) ${timeString}`;
    } else if (currentLocale === "ko") {
      // Korean format: "12월2일 (화) 12:06" (similar to Japanese)
      const weekday = formatInTimeZone(time, timeZone, currentLocale, {
        weekday: "short",
      });
      displayTime = `${zoned.month}월${zoned.day}일 (${weekday}) ${timeString}`;
    } else {
      // Default format for other locales: "Wed May 7 1:34 AM" or "Wed May 7 13:34"
      const shortWeekday = formatInTimeZone(time, timeZone, currentLocale, {
        weekday: "short",
      });
      const month = formatInTimeZone(time, timeZone, currentLocale, {
        month: "short",
      });
      displayTime = `${shortWeekday} ${month} ${zoned.day} ${timeString}`;
    }
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: Window drag handle for desktop shell
    <div
      role="presentation"
      className={`${isWindowsTheme ? "" : "ml-auto mr-1 sm:mr-2"} whitespace-nowrap`}
      style={{
        textShadow: isMacOSTheme
          ? "0 2px 3px rgba(0, 0, 0, 0.25)"
          : undefined,
      }}
      onClick={handleClick}
      title={enableCalendarOpen ? t("apps.calendar.title") : enableExposeToggle ? t("common.menuBar.showAllWindows") : undefined}
    >
      {displayTime}
    </div>
  );
}
