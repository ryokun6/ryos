import { useEffect, useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import {
  AQUA_ICON_BUTTON_PADDING_CLASS,
  AQUA_ICON_BUTTON_PHOSPHOR_SIZE,
} from "@/lib/aquaIconButton";
import { Check, Trash, X } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { AquaCheckbox } from "@/components/ui/aqua-checkbox";
import type {
  CalendarEvent,
  CalendarGroup,
  TodoItem,
} from "@/stores/useCalendarStore";

const EVENT_COLOR_MAP: Record<string, string> = {
  blue: "#4A90D9",
  red: "#D94A4A",
  green: "#5AB55A",
  orange: "#E89B3E",
  purple: "#9B59B6",
};

interface TrayDetailsProps {
  selectedEvent: CalendarEvent | null;
  selectedTodo: TodoItem | null;
  calendars: CalendarGroup[];
  isMacOSTheme: boolean;
  isSystem7Theme: boolean;
  isXpTheme: boolean;
  onUpdateEvent: (id: string, updates: Partial<CalendarEvent>) => void;
  onDeleteEvent: (id: string) => void;
  onUpdateTodo: (
    id: string,
    updates: Partial<Pick<TodoItem, "title" | "calendarId" | "dueDate" | "completed">>
  ) => void;
  onToggleTodo: (id: string) => void;
  onDeleteTodo: (id: string) => void;
}

function formatDateLabel(dateStr: string, locale: string): string {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return dateStr;
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(locale, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function TrayDetails({
  selectedEvent,
  selectedTodo,
  calendars,
  isMacOSTheme,
  isSystem7Theme,
  isXpTheme,
  onUpdateEvent,
  onDeleteEvent,
  onUpdateTodo,
  onToggleTodo,
  onDeleteTodo,
}: TrayDetailsProps) {
  const { t, i18n } = useTranslation();
  const useGeneva = isMacOSTheme || isSystem7Theme;

  if (selectedEvent) {
    return (
      <div className="flex flex-1 min-h-0 flex-col">
        <EventTrayEditor
          key={selectedEvent.id}
          event={selectedEvent}
          calendars={calendars}
          useGeneva={useGeneva}
          isMacOSTheme={isMacOSTheme}
          isSystem7Theme={isSystem7Theme}
          isXpTheme={isXpTheme}
          locale={i18n.language}
          t={t}
          onUpdate={onUpdateEvent}
          onDelete={onDeleteEvent}
        />
      </div>
    );
  }

  if (selectedTodo) {
    return (
      <div className="flex flex-1 min-h-0 flex-col">
        <TodoDetails
          todo={selectedTodo}
          calendars={calendars}
          useGeneva={useGeneva}
          isMacOSTheme={isMacOSTheme}
          isSystem7Theme={isSystem7Theme}
          isXpTheme={isXpTheme}
          locale={i18n.language}
          t={t}
          onToggle={onToggleTodo}
          onUpdate={onUpdateTodo}
          onDelete={onDeleteTodo}
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex-1 flex items-center justify-center text-center px-3 opacity-40 text-[11px]",
        useGeneva && "font-geneva-12"
      )}
    >
      {t("apps.calendar.tray.empty")}
    </div>
  );
}

/** iCal-style label / value row (bold right-aligned label). */
function TrayFieldRow({
  label,
  children,
  useGeneva,
}: {
  label: string;
  children: React.ReactNode;
  useGeneva: boolean;
}) {
  return (
    <div className="flex gap-2 items-start min-h-[22px]">
      <span
        className={cn(
          "w-[52px] shrink-0 text-right font-bold text-[11px] leading-tight text-[#222] pt-0.5",
          useGeneva && "font-geneva-12"
        )}
      >
        {label}
      </span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

// ============================================================================
// EVENT TRAY (iCal-inspired: title block, fields, notes)
// ============================================================================

function EventTrayEditor({
  event,
  calendars,
  useGeneva,
  isMacOSTheme,
  isSystem7Theme,
  isXpTheme,
  locale,
  t,
  onUpdate,
  onDelete,
}: {
  event: CalendarEvent;
  calendars: CalendarGroup[];
  useGeneva: boolean;
  isMacOSTheme: boolean;
  isSystem7Theme: boolean;
  isXpTheme: boolean;
  locale: string;
  t: (key: string) => string;
  onUpdate: (id: string, updates: Partial<CalendarEvent>) => void;
  onDelete: (id: string) => void;
}) {
  const [title, setTitle] = useState(event.title);
  const [location, setLocation] = useState(event.location || "");
  const [notes, setNotes] = useState(event.notes || "");
  const [date, setDate] = useState(event.date);
  const [startTime, setStartTime] = useState(event.startTime || "09:00");
  const [endTime, setEndTime] = useState(event.endTime || "10:00");
  const allDay = !event.startTime;
  useEffect(() => {
    setTitle(event.title);
    setLocation(event.location || "");
    setNotes(event.notes || "");
    setDate(event.date);
    setStartTime(event.startTime || "09:00");
    setEndTime(event.endTime || "10:00");
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
    setStartTime(st);
    setEndTime(et);
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
    isXpTheme && "text-black"
  );

  const smallTimeClass = cn(
    "rounded-sm border bg-white px-1 py-0.5 text-[11px] outline-none min-w-0 flex-1",
    useGeneva ? "font-geneva-12 border-black/25" : "border-black/20"
  );

  const panelShell = cn(
    "flex-1 flex flex-col min-h-0 overflow-y-auto",
    "bg-white pl-2.5 pr-2.5 pt-2 pb-2",
    !isMacOSTheme && "rounded-sm border border-black/10"
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
            "mt-1 pt-1.5 border-t border-black/15 flex flex-col flex-1 min-h-[120px]",
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
              "flex-1 min-h-[88px] w-full resize-none rounded-sm border bg-white px-1.5 py-1 text-[11px] outline-none",
              useGeneva ? "font-geneva-12 border-black/25" : "border-black/20"
            )}
          />
        </div>

        <div className="shrink-0 pt-1 flex justify-end">
          <Button
            type="button"
            variant={isMacOSTheme ? "aqua" : "retro"}
            size="sm"
            onClick={() => onDelete(event.id)}
            className={cn(
              AQUA_ICON_BUTTON_PADDING_CLASS,
              "text-[12px] leading-none text-red-600 hover:text-red-700",
              useGeneva && "font-geneva-12"
            )}
            title={t("apps.calendar.event.delete")}
            aria-label={t("apps.calendar.event.delete")}
          >
            <Trash size={AQUA_ICON_BUTTON_PHOSPHOR_SIZE} weight="bold" />
            {t("apps.calendar.event.delete")}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// TODO TRAY (layout mirrors EventTrayEditor / iCal-style rows)
// ============================================================================

function TodoDetails({
  todo,
  calendars,
  useGeneva,
  isMacOSTheme,
  isSystem7Theme,
  isXpTheme,
  locale,
  t,
  onToggle,
  onUpdate,
  onDelete,
}: {
  todo: TodoItem;
  calendars: CalendarGroup[];
  useGeneva: boolean;
  isMacOSTheme: boolean;
  isSystem7Theme: boolean;
  isXpTheme: boolean;
  locale: string;
  t: (key: string) => string;
  onToggle: (id: string) => void;
  onUpdate: (
    id: string,
    updates: Partial<Pick<TodoItem, "title" | "calendarId" | "dueDate" | "completed">>
  ) => void;
  onDelete: (id: string) => void;
}) {
  const [title, setTitle] = useState(todo.title);
  const lastTodoIdRef = useRef(todo.id);

  useEffect(() => {
    if (lastTodoIdRef.current !== todo.id) {
      lastTodoIdRef.current = todo.id;
      setTitle(todo.title);
    }
  }, [todo.id, todo.title]);

  const calendar = calendars.find((c) => c.id === todo.calendarId) || calendars[0];
  const color = EVENT_COLOR_MAP[calendar?.color || "blue"];

  const commitTitle = () => {
    const next = title.trim();
    if (next && next !== todo.title) {
      onUpdate(todo.id, { title: next });
    } else if (!next) {
      setTitle(todo.title);
    }
  };

  const titleInputClass = cn(
    "calendar-tray-event-title w-full bg-transparent border-0 outline-none focus:ring-0 p-0",
    "font-bold text-[#222] tracking-tight",
    todo.completed && "line-through opacity-60",
    isMacOSTheme && "font-geneva-12 text-lg leading-snug min-h-[1.35rem]",
    isSystem7Theme &&
      !isMacOSTheme &&
      "font-geneva-12 text-[16px] leading-snug",
    !isMacOSTheme && !isSystem7Theme && "text-base font-semibold leading-snug"
  );

  const fieldInputClass = cn(
    "w-full rounded-sm border bg-white px-1 py-0.5 text-[11px] outline-none",
    useGeneva ? "font-geneva-12 border-black/25" : "border-black/20",
    isXpTheme && "text-black"
  );

  const panelShell = cn(
    "flex-1 flex flex-col min-h-0 overflow-y-auto",
    "bg-white pl-2.5 pr-2.5 pt-2 pb-2",
    !isMacOSTheme && "rounded-sm border border-black/10"
  );

  const calendarOptions = calendars.map((c) => (
    <option key={c.id} value={c.id}>
      {c.name}
    </option>
  ));

  return (
    <div className={panelShell}>
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
              setTitle(todo.title);
              (e.target as HTMLInputElement).blur();
            }
          }}
          className={titleInputClass}
          placeholder={t("apps.calendar.event.title")}
          aria-label={t("apps.calendar.event.title")}
        />
      </div>

      <div className="flex flex-col gap-2 min-h-0">
        <TrayFieldRow label={t("apps.calendar.tray.done")} useGeneva={useGeneva}>
          <button
            type="button"
            onClick={() => onToggle(todo.id)}
            className="flex shrink-0"
          >
            <AquaCheckbox checked={todo.completed} color={color} />
          </button>
        </TrayFieldRow>

        <TrayFieldRow label={t("apps.calendar.tray.due")} useGeneva={useGeneva}>
          <input
            type="date"
            value={todo.dueDate || ""}
            onChange={(e) =>
              onUpdate(todo.id, { dueDate: e.target.value || null })
            }
            onKeyDown={(e) => e.stopPropagation()}
            className={fieldInputClass}
          />
          {todo.dueDate && (
            <p
              className={cn(
                "text-[10px] text-black/45 mt-0.5 truncate",
                useGeneva && "font-geneva-12"
              )}
            >
              {formatDateLabel(todo.dueDate, locale)}
            </p>
          )}
        </TrayFieldRow>

        <TrayFieldRow label={t("apps.calendar.event.calendar")} useGeneva={useGeneva}>
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className="inline-block size-2.5 shrink-0 rounded-sm border border-black/20"
              style={{ backgroundColor: color }}
            />
            <select
              value={todo.calendarId}
              onChange={(e) => onUpdate(todo.id, { calendarId: e.target.value })}
              onKeyDown={(e) => e.stopPropagation()}
              className={cn(fieldInputClass, "calendar-tray-compact-select flex-1 min-w-0")}
            >
              {calendarOptions}
            </select>
          </div>
        </TrayFieldRow>

        <div className="flex-1 min-h-0" />

        <div className="shrink-0 pt-1 flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant={isMacOSTheme ? "aqua" : "retro"}
            size="sm"
            onClick={() => onToggle(todo.id)}
            className={cn(
              AQUA_ICON_BUTTON_PADDING_CLASS,
              "text-[12px] leading-none",
              useGeneva && "font-geneva-12",
              isXpTheme && "text-black"
            )}
          >
            {todo.completed ? (
              <X size={AQUA_ICON_BUTTON_PHOSPHOR_SIZE} weight="bold" />
            ) : (
              <Check size={AQUA_ICON_BUTTON_PHOSPHOR_SIZE} weight="bold" />
            )}
            {todo.completed
              ? t("apps.calendar.tray.markIncomplete")
              : t("apps.calendar.tray.markComplete")}
          </Button>
          <Button
            type="button"
            variant={isMacOSTheme ? "aqua" : "retro"}
            size="sm"
            onClick={() => onDelete(todo.id)}
            className={cn(
              AQUA_ICON_BUTTON_PADDING_CLASS,
              "text-[12px] leading-none text-red-600 hover:text-red-700",
              useGeneva && "font-geneva-12"
            )}
            title={t("apps.calendar.event.delete")}
            aria-label={t("apps.calendar.event.delete")}
          >
            <Trash size={AQUA_ICON_BUTTON_PHOSPHOR_SIZE} weight="bold" />
            {t("apps.calendar.event.delete")}
          </Button>
        </div>
      </div>
    </div>
  );
}
