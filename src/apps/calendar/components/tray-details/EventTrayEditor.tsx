import { useEffect, useReducer } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { AquaCheckbox } from "@/components/ui/aqua-checkbox";
import type { CalendarEvent, CalendarGroup } from "@/stores/useCalendarStore";
import { EVENT_COLOR_MAP } from "./constants";
import {
  eventEditorReducer,
  getEventEditorState,
} from "./eventEditorReducer";
import { TrayFieldRow } from "./TrayFieldRow";
import type { TrayThemeProps } from "./types";
import { formatDateLabel } from "./utils";

export function EventTrayEditor({
  event,
  calendars,
  useGeneva,
  isMacOSTheme,
  isSystem7Theme,
  isWindowsTheme,
  locale,
  t,
  onUpdate,
  onDelete,
}: TrayThemeProps & {
  event: CalendarEvent;
  calendars: CalendarGroup[];
  locale: string;
  t: (key: string) => string;
  onUpdate: (id: string, updates: Partial<CalendarEvent>) => void;
  onDelete: (id: string) => void;
}) {
  const [state, dispatch] = useReducer(eventEditorReducer, event, getEventEditorState);
  const { title, location, notes, date, startTime, endTime } = state;
  const setTitle = (value: string) => dispatch({ type: "setTitle", value });
  const setLocation = (value: string) => dispatch({ type: "setLocation", value });
  const setNotes = (value: string) => dispatch({ type: "setNotes", value });
  const setDate = (value: string) => dispatch({ type: "setDate", value });
  const allDay = !event.startTime;
  useEffect(() => {
    dispatch({ type: "resetFromEvent", event });
  }, [
    event.id,
    event.updatedAt,
    event.title,
    event.location,
    event.notes,
    event.date,
    event.startTime,
    event.endTime,
  ]);

  const commitTitle = () => {
    const next = title.trim();
    if (!next) {
      setTitle(event.title);
      return;
    }
    if (next !== event.title) onUpdate(event.id, { title: next });
  };

  const commitLocation = () => {
    const next = location.trim() || undefined;
    if (next !== (event.location || undefined)) {
      onUpdate(event.id, { location: next });
    }
  };

  const commitNotes = () => {
    const next = notes.trim() || undefined;
    if (next !== (event.notes || undefined)) {
      onUpdate(event.id, { notes: next });
    }
  };

  const commitDate = (nextDate: string) => {
    setDate(nextDate);
    if (nextDate !== event.date) onUpdate(event.id, { date: nextDate });
  };

  const setAllDay = (next: boolean) => {
    if (next) {
      onUpdate(event.id, { startTime: undefined, endTime: undefined });
    } else {
      onUpdate(event.id, {
        startTime: startTime || "09:00",
        endTime: endTime || "10:00",
      });
    }
  };

  const commitTimes = (st: string, et: string) => {
    dispatch({ type: "setTimes", startTime: st, endTime: et });
    if (!allDay && (st !== event.startTime || et !== (event.endTime || ""))) {
      onUpdate(event.id, { startTime: st, endTime: et });
    }
  };

  const onCalendarChange = (calendarId: string) => {
    const cal = calendars.find((c) => c.id === calendarId);
    if (!cal) return;
    onUpdate(event.id, { calendarId: cal.id, color: cal.color });
  };

  const titleInputClass = cn(
    "calendar-tray-event-title w-full bg-transparent border-0 outline-none focus:ring-0 p-0",
    "font-bold text-[#222] tracking-tight",
    isMacOSTheme &&
      "font-geneva-12 text-lg leading-snug min-h-[1.35rem]",
    isSystem7Theme &&
      !isMacOSTheme &&
      "font-geneva-12 text-[16px] leading-snug",
    !isMacOSTheme && !isSystem7Theme && "text-base font-semibold leading-snug"
  );

  const subInputClass = cn(
    "w-full bg-transparent border-0 outline-none focus:ring-0 p-0 mt-0.5",
    "text-[11px] text-black/45 placeholder:text-black/35",
    useGeneva && "font-geneva-12"
  );

  const fieldInputClass = cn(
    "w-full rounded-sm border bg-white px-1 py-0.5 text-[11px] outline-none",
    useGeneva ? "font-geneva-12 border-black/25" : "border-black/20",
    isWindowsTheme && "text-black"
  );

  const smallTimeClass = cn(
    "rounded-sm border bg-white px-1 py-0.5 text-[11px] outline-none min-w-0 flex-1",
    useGeneva ? "font-geneva-12 border-black/25" : "border-black/20"
  );

  // NOTE: keep the scroller's own `pb-*` modest — Mobile Safari clips
  // padding-bottom on overflow:auto containers when scrolled to the end.
  // Real bottom breathing room is added below as a sibling spacer that
  // lives inside the scroll content (reliably honored across browsers).
  const panelShell = cn(
    "flex-1 flex flex-col min-h-0 overflow-y-auto",
    "bg-white pl-2.5 pr-2.5 pt-2 pb-2",
    !isMacOSTheme && "rounded-sm border border-black/10"
  );

  const deleteButtonClass = cn(
    "w-full min-w-0 justify-center px-3 py-2 h-auto text-[12px] leading-normal",
    "text-red-600 hover:text-red-700",
    useGeneva && "font-geneva-12"
  );

  return (
    <div className={panelShell}>
      {/* Title + location (iCal header block) */}
      <div
        className={cn(
          "shrink-0 border-b border-black/20 pb-2 mb-2",
          isMacOSTheme && "border-black/15"
        )}
      >
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") {
              setTitle(event.title);
              (e.target as HTMLInputElement).blur();
            }
          }}
          className={titleInputClass}
          placeholder={t("apps.calendar.event.title")}
          aria-label={t("apps.calendar.event.title")}
        />
        <input
          type="text"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          onBlur={commitLocation}
          onKeyDown={(e) => e.stopPropagation()}
          className={subInputClass}
          placeholder={t("apps.calendar.tray.locationPlaceholder")}
          aria-label={t("apps.calendar.tray.locationPlaceholder")}
        />
      </div>

      <div className="flex flex-col gap-2 min-h-0">
        <TrayFieldRow
          label={t("apps.calendar.views.allDay")}
          useGeneva={useGeneva}
        >
          <button
            type="button"
            onClick={() => setAllDay(!allDay)}
            className="flex shrink-0"
          >
            <AquaCheckbox checked={allDay} color="#4A90D9" />
          </button>
        </TrayFieldRow>

        {!allDay ? (
          <>
            <TrayFieldRow label={t("apps.calendar.tray.from")} useGeneva={useGeneva}>
              <div className="flex gap-1 items-center min-w-0">
                <input
                  type="date"
                  value={date}
                  onChange={(e) => commitDate(e.target.value)}
                  onKeyDown={(e) => e.stopPropagation()}
                  className={cn(fieldInputClass, "min-w-0 flex-1")}
                />
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => commitTimes(e.target.value, endTime)}
                  onKeyDown={(e) => e.stopPropagation()}
                  className={smallTimeClass}
                />
              </div>
            </TrayFieldRow>
            <TrayFieldRow label={t("apps.calendar.tray.to")} useGeneva={useGeneva}>
              <div className="flex gap-1 items-center min-w-0">
                <input
                  type="date"
                  value={date}
                  onChange={(e) => commitDate(e.target.value)}
                  onKeyDown={(e) => e.stopPropagation()}
                  className={cn(fieldInputClass, "min-w-0 flex-1")}
                />
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => commitTimes(startTime, e.target.value)}
                  onKeyDown={(e) => e.stopPropagation()}
                  className={smallTimeClass}
                />
              </div>
            </TrayFieldRow>
          </>
        ) : (
          <TrayFieldRow label={t("apps.calendar.tray.from")} useGeneva={useGeneva}>
            <input
              type="date"
              value={date}
              onChange={(e) => commitDate(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              className={fieldInputClass}
            />
            <p
              className={cn(
                "text-[10px] text-black/45 mt-0.5 truncate",
                useGeneva && "font-geneva-12"
              )}
            >
              {formatDateLabel(date, locale)}
            </p>
          </TrayFieldRow>
        )}

        <TrayFieldRow label={t("apps.calendar.event.calendar")} useGeneva={useGeneva}>
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className="inline-block size-2.5 shrink-0 rounded-sm border border-black/20"
              style={{
                backgroundColor:
                  EVENT_COLOR_MAP[
                    calendars.find((c) => c.id === (event.calendarId || calendars[0]?.id))
                      ?.color || "blue"
                  ],
              }}
            />
            <select
              value={event.calendarId || calendars[0]?.id || "home"}
              onChange={(e) => onCalendarChange(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              className={cn(fieldInputClass, "calendar-tray-compact-select flex-1 min-w-0")}
            >
              {calendars.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </TrayFieldRow>

        {/* Notes — section label + scrollable area */}
        <div
          className={cn(
            "mt-1 pt-1.5 border-t border-black/15 flex flex-col",
            isMacOSTheme && "border-black/12"
          )}
        >
          <span
            className={cn(
              "text-[11px] font-bold text-[#222] mb-1",
              useGeneva && "font-geneva-12"
            )}
          >
            {t("apps.calendar.event.notes")}
          </span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={commitNotes}
            onKeyDown={(e) => e.stopPropagation()}
            placeholder={t("apps.calendar.event.notes")}
            className={cn(
              "min-h-[88px] w-full resize-none rounded-sm border bg-white px-1.5 py-1 text-[11px] outline-none",
              useGeneva ? "font-geneva-12 border-black/25" : "border-black/20"
            )}
          />
        </div>

        <div
          className={cn(
            "shrink-0 w-full min-w-0 mt-1 pt-2 border-t border-black/15",
            isMacOSTheme && "border-black/12"
          )}
        >
          <Button
            type="button"
            variant={isMacOSTheme ? "aqua" : "retro"}
            size="sm"
            onClick={() => onDelete(event.id)}
            className={deleteButtonClass}
            title={t("apps.calendar.event.delete")}
            aria-label={t("apps.calendar.event.delete")}
          >
            {t("apps.calendar.event.delete")}
          </Button>
        </div>

        {/* Trailing spacer: ensures the delete button keeps breathing room
            above the scroller's bottom edge in browsers (Mobile Safari)
            that don't honor `padding-bottom` on overflow containers. */}
        <div aria-hidden className="shrink-0 h-4" />
      </div>
    </div>
  );
}
