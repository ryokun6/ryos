import { useState } from "react";
import { useInterval } from "@/hooks/useInterval";
import { useEventListener } from "@/hooks/useEventListener";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { useTranslation } from "react-i18next";
import { requestAppLaunch, toggleExposeView } from "@/utils/appEventBus";
import type { ClockProps } from "./menuBarTypes";

export function Clock({ enableExposeToggle = false, enableCalendarOpen = false }: ClockProps) {
  const [time, setTime] = useState(() => new Date());
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
  const { isWindowsTheme: isXpTheme, isMacOSTheme } = useThemeFlags();
  const { t, i18n: i18nInstance } = useTranslation();
  
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

  // Helper function to format time without leading zeros for 24h format
  const formatTime24h = (date: Date): string => {
    const hour = date.getHours();
    const minute = date.getMinutes().toString().padStart(2, "0");
    return `${hour}:${minute}`;
  };

  // Format the display based on theme and viewport width
  // Use "numeric" for hour to avoid leading zeros (e.g., "0:08" instead of "00:08")
  // "2-digit" would force leading zeros which Chinese/Japanese don't typically use
  const hourFormat = "numeric";
  
  let displayTime: string;

  if (isXpTheme) {
    // For XP/98 themes: use 24h for locales that prefer it, otherwise 12h
    if (prefers24Hour) {
      displayTime = formatTime24h(time);
    } else {
      displayTime = time.toLocaleTimeString(currentLocale, {
        hour: hourFormat,
        minute: "2-digit",
        hour12: true,
      });
    }
  } else if (viewportWidth < 420) {
    // For small screens: just time (24h for locales that prefer it)
    if (prefers24Hour) {
      displayTime = formatTime24h(time);
    } else {
      displayTime = time.toLocaleTimeString(currentLocale, {
        hour: hourFormat,
        minute: "2-digit",
        hour12: true,
      });
    }
  } else if (viewportWidth >= 420 && viewportWidth <= 768) {
    // For medium screens: time (24h for locales that prefer it)
    if (prefers24Hour) {
      displayTime = formatTime24h(time);
    } else {
      displayTime = time.toLocaleTimeString(currentLocale, {
        hour: hourFormat,
        minute: "2-digit",
        hour12: true,
      });
    }
  } else {
    // For larger screens (> 768px): full date and time
    const timeString = prefers24Hour 
      ? formatTime24h(time)
      : time.toLocaleTimeString(currentLocale, {
          hour: hourFormat,
          minute: "2-digit",
          hour12: true,
        });
    
    // Custom formatting for Chinese, Japanese, and Korean
    if (currentLocale === "zh-TW") {
      // Chinese format: "12月2日 週二 12:03"
      const month = time.getMonth() + 1; // getMonth() returns 0-11, so add 1
      const day = time.getDate();
      const weekday = time.toLocaleDateString(currentLocale, { weekday: "short" });
      displayTime = `${month}月${day}日 ${weekday} ${timeString}`;
    } else if (currentLocale === "ja") {
      // Japanese format: "12月2日 (火) 12:06"
      const month = time.getMonth() + 1; // getMonth() returns 0-11, so add 1
      const day = time.getDate();
      const weekday = time.toLocaleDateString(currentLocale, { weekday: "short" });
      displayTime = `${month}月${day}日 (${weekday}) ${timeString}`;
    } else if (currentLocale === "ko") {
      // Korean format: "12월2일 (화) 12:06" (similar to Japanese)
      const month = time.getMonth() + 1; // getMonth() returns 0-11, so add 1
      const day = time.getDate();
      const weekday = time.toLocaleDateString(currentLocale, { weekday: "short" });
      displayTime = `${month}월${day}일 (${weekday}) ${timeString}`;
    } else {
      // Default format for other locales: "Wed May 7 1:34 AM" or "Wed May 7 13:34"
      const shortWeekday = time.toLocaleDateString(currentLocale, { weekday: "short" });
      const month = time.toLocaleDateString(currentLocale, { month: "short" });
      const day = time.getDate();
      displayTime = `${shortWeekday} ${month} ${day} ${timeString}`;
    }
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: Window drag handle for desktop shell
    <div
      role="presentation"
      className={`menubar-clock ${isXpTheme ? "" : "ml-auto mr-1 sm:mr-2"} whitespace-nowrap`}
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
