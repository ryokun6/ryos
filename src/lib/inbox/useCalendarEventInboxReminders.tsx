import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useInboxStore } from "@/stores/useInboxStore";
import type { CalendarEvent } from "@/stores/useCalendarStore";
import { useCalendarStore } from "@/stores/useCalendarStore";

function parseTimeToTodayMs(dateStr: string, timeStr: string): number {
  const [hh, mm] = timeStr.split(":").map((x) => parseInt(x, 10));
  const [y, m, d] = dateStr.split("-").map((x) => parseInt(x, 10));
  if (!y || !m || !d || Number.isNaN(hh) || Number.isNaN(mm)) return NaN;
  return new Date(y, m - 1, d, hh, mm, 0, 0).getTime();
}

function eventReminderWindowStartMs(ev: CalendarEvent): number | null {
  if (!ev.startTime) return null;
  return parseTimeToTodayMs(ev.date, ev.startTime);
}

/**
 * At event start time (±1 min): one inbox row per event per day.
 */
export function useCalendarEventInboxReminders() {
  const { t, i18n } = useTranslation();
  const upsertItem = useInboxStore((s) => s.upsertItem);
  const firedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      const events = useCalendarStore.getState().events;

      for (const ev of events) {
        if (ev.date !== today) continue;
        const startMs = eventReminderWindowStartMs(ev);
        if (startMs === null || Number.isNaN(startMs)) continue;

        const delta = now.getTime() - startMs;
        if (delta < 0 || delta > 120_000) continue;

        const key = `cal-fired:${ev.id}:${today}`;
        if (firedRef.current.has(key)) continue;
        firedRef.current.add(key);

        const timeLabel = ev.startTime ?? "";
        const loc = ev.location?.trim();
        const preview = loc
          ? t("apps.inbox.calendarReminder.previewWithLocation", {
              time: timeLabel,
              location: loc,
            })
          : t("apps.inbox.calendarReminder.preview", { time: timeLabel });

        upsertItem({
          dedupeKey: `calendar_reminder:${ev.id}:${today}`,
          category: "calendar",
          title: ev.title,
          preview,
          body: ev.notes?.trim()
            ? `${ev.notes.trim()}\n\n${ev.date}${timeLabel ? ` · ${timeLabel}` : ""}`
            : `${ev.date}${timeLabel ? ` · ${timeLabel}` : ""}${loc ? `\n${loc}` : ""}`,
          action: { kind: "launch_app", appId: "calendar" },
          source: {
            producer: "calendar",
            extras: {
              eventId: ev.id,
              date: today,
              locale: i18n.language,
              stackGroupKey: "app:calendar",
              appLabel: "Calendar",
            },
          },
        });
      }
    };

    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, [i18n.language, t, upsertItem]);
}
