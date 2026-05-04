import { useEffect, useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Trash, PencilSimple } from "@phosphor-icons/react";
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
  onEditEvent: (event: CalendarEvent) => void;
  onUpdateTodo: (
    id: string,
    updates: Partial<Pick<TodoItem, "title" | "calendarId" | "dueDate" | "completed">>
  ) => void;
  onToggleTodo: (id: string) => void;
  onDeleteTodo: (id: string) => void;
}

/**
 * Format YYYY-MM-DD into a localized "long" date label.
 */
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
  onEditEvent,
  onUpdateTodo,
  onToggleTodo,
  onDeleteTodo,
}: TrayDetailsProps) {
  const { t, i18n } = useTranslation();
  const useGeneva = isMacOSTheme || isSystem7Theme;

  if (selectedEvent) {
    return (
      <EventDetails
        event={selectedEvent}
        calendars={calendars}
        useGeneva={useGeneva}
        isMacOSTheme={isMacOSTheme}
        isXpTheme={isXpTheme}
        locale={i18n.language}
        t={t}
        onUpdate={onUpdateEvent}
        onDelete={onDeleteEvent}
        onEditFull={onEditEvent}
      />
    );
  }

  if (selectedTodo) {
    return (
      <TodoDetails
        todo={selectedTodo}
        calendars={calendars}
        useGeneva={useGeneva}
        isMacOSTheme={isMacOSTheme}
        isXpTheme={isXpTheme}
        locale={i18n.language}
        t={t}
        onToggle={onToggleTodo}
        onUpdate={onUpdateTodo}
        onDelete={onDeleteTodo}
      />
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

// ============================================================================
// EVENT DETAILS
// ============================================================================

function EventDetails({
  event,
  calendars,
  useGeneva,
  isMacOSTheme,
  isXpTheme,
  locale,
  t,
  onUpdate,
  onDelete,
  onEditFull,
}: {
  event: CalendarEvent;
  calendars: CalendarGroup[];
  useGeneva: boolean;
  isMacOSTheme: boolean;
  isXpTheme: boolean;
  locale: string;
  t: (key: string) => string;
  onUpdate: (id: string, updates: Partial<CalendarEvent>) => void;
  onDelete: (id: string) => void;
  onEditFull: (event: CalendarEvent) => void;
}) {
  const [title, setTitle] = useState(event.title);
  const [notes, setNotes] = useState(event.notes || "");
  const lastEventIdRef = useRef(event.id);

  useEffect(() => {
    if (lastEventIdRef.current !== event.id) {
      lastEventIdRef.current = event.id;
      setTitle(event.title);
      setNotes(event.notes || "");
    }
  }, [event.id, event.title, event.notes]);

  const calendar = calendars.find((c) => c.id === event.calendarId) || calendars[0];
  const color = EVENT_COLOR_MAP[event.color] || EVENT_COLOR_MAP.blue;

  const commitTitle = () => {
    const next = title.trim();
    if (next && next !== event.title) {
      onUpdate(event.id, { title: next });
    } else if (!next) {
      setTitle(event.title);
    }
  };

  const commitNotes = () => {
    if ((notes || "") !== (event.notes || "")) {
      onUpdate(event.id, { notes: notes.trim() || undefined });
    }
  };

  const inputBase = cn(
    "w-full rounded border bg-white/90 outline-none px-1.5 py-0.5 text-[12px]",
    useGeneva ? "border-black/20 font-geneva-12" : "border-black/15"
  );

  const labelClass = cn(
    "block text-[9px] uppercase tracking-wide opacity-60 mb-0.5",
    useGeneva && "font-geneva-12"
  );

  return (
    <div className={cn("flex-1 flex flex-col min-h-0 overflow-y-auto px-1 pt-1.5 pb-1.5 gap-2.5")}>
      {/* Color stripe + calendar name */}
      <div className="flex items-center gap-1.5 px-0.5">
        <span
          className="inline-block w-2.5 h-2.5 rounded-sm shrink-0 border border-black/20"
          style={{ backgroundColor: color }}
        />
        <span className={cn("text-[10px] opacity-70 truncate", useGeneva && "font-geneva-12")}>
          {calendar?.name || t("apps.calendar.event.calendar")}
        </span>
      </div>

      {/* Title */}
      <div className="px-0.5">
        <label className={labelClass}>{t("apps.calendar.event.title")}</label>
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
          className={inputBase}
        />
      </div>

      {/* Date */}
      <div className="px-0.5">
        <label className={labelClass}>{t("apps.calendar.event.date")}</label>
        <div
          className={cn(
            "text-[12px] px-1.5 py-0.5",
            useGeneva && "font-geneva-12"
          )}
        >
          {formatDateLabel(event.date, locale)}
        </div>
      </div>

      {/* Time */}
      {event.startTime ? (
        <div className="px-0.5">
          <label className={labelClass}>{t("apps.calendar.event.startTime")}</label>
          <div className={cn("text-[12px] px-1.5 py-0.5", useGeneva && "font-geneva-12")}>
            {event.startTime}
            {event.endTime ? ` – ${event.endTime}` : ""}
          </div>
        </div>
      ) : (
        <div className="px-0.5">
          <span className={cn("text-[10px] opacity-60", useGeneva && "font-geneva-12")}>
            {t("apps.calendar.event.allDay")}
          </span>
        </div>
      )}

      {/* Notes */}
      <div className="px-0.5 flex-1 min-h-0 flex flex-col">
        <label className={labelClass}>{t("apps.calendar.event.notes")}</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={commitNotes}
          onKeyDown={(e) => e.stopPropagation()}
          placeholder={t("apps.calendar.event.notes")}
          rows={3}
          className={cn(
            inputBase,
            "flex-1 min-h-[60px] resize-none"
          )}
        />
      </div>

      {/* Actions */}
      <div className="px-0.5 pt-0.5 flex items-center gap-1">
        <Button
          variant={isMacOSTheme ? "default" : "retro"}
          onClick={() => onEditFull(event)}
          className={cn(
            "h-7 flex-1 text-[11px] gap-1.5",
            useGeneva && "font-geneva-12",
            isXpTheme && "text-black"
          )}
        >
          <PencilSimple size={11} weight="bold" />
          {t("apps.calendar.event.editEvent")}
        </Button>
        <Button
          variant="retro"
          onClick={() => onDelete(event.id)}
          className={cn(
            "h-7 text-[11px] text-red-600 hover:text-red-700 px-2 gap-1",
            useGeneva && "font-geneva-12"
          )}
          title={t("apps.calendar.event.delete")}
          aria-label={t("apps.calendar.event.delete")}
        >
          <Trash size={11} weight="bold" />
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// TODO DETAILS
// ============================================================================

function TodoDetails({
  todo,
  calendars,
  useGeneva,
  isMacOSTheme,
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

  const inputBase = cn(
    "w-full rounded border bg-white/90 outline-none px-1.5 py-0.5 text-[12px]",
    useGeneva ? "border-black/20 font-geneva-12" : "border-black/15"
  );

  const labelClass = cn(
    "block text-[9px] uppercase tracking-wide opacity-60 mb-0.5",
    useGeneva && "font-geneva-12"
  );

  // Calendar select
  const calendarOptions = calendars.map((c) => (
    <option key={c.id} value={c.id}>
      {c.name}
    </option>
  ));

  return (
    <div className={cn("flex-1 flex flex-col min-h-0 overflow-y-auto px-1 pt-1.5 pb-1.5 gap-2.5")}>
      {/* Color stripe + calendar name */}
      <div className="flex items-center gap-1.5 px-0.5">
        <button type="button" onClick={() => onToggle(todo.id)} className="shrink-0">
          <AquaCheckbox checked={todo.completed} color={color} />
        </button>
        <span className={cn("text-[10px] opacity-70 truncate", useGeneva && "font-geneva-12")}>
          {calendar?.name || t("apps.calendar.event.calendar")}
        </span>
      </div>

      {/* Title */}
      <div className="px-0.5">
        <label className={labelClass}>{t("apps.calendar.event.title")}</label>
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
          className={cn(
            inputBase,
            todo.completed && "line-through opacity-60"
          )}
        />
      </div>

      {/* Due date */}
      <div className="px-0.5">
        <label className={labelClass}>{t("apps.calendar.event.date")}</label>
        <input
          type="date"
          value={todo.dueDate || ""}
          onChange={(e) =>
            onUpdate(todo.id, { dueDate: e.target.value || null })
          }
          onKeyDown={(e) => e.stopPropagation()}
          className={inputBase}
        />
        {todo.dueDate && (
          <div className={cn("text-[10px] opacity-60 mt-0.5 px-0.5", useGeneva && "font-geneva-12")}>
            {formatDateLabel(todo.dueDate, locale)}
          </div>
        )}
      </div>

      {/* Calendar */}
      {calendars.length > 1 && (
        <div className="px-0.5">
          <label className={labelClass}>{t("apps.calendar.event.calendar")}</label>
          <select
            value={todo.calendarId}
            onChange={(e) => onUpdate(todo.id, { calendarId: e.target.value })}
            onKeyDown={(e) => e.stopPropagation()}
            className={inputBase}
          >
            {calendarOptions}
          </select>
        </div>
      )}

      <div className="flex-1" />

      {/* Actions */}
      <div className="px-0.5 pt-0.5 flex items-center gap-1">
        <Button
          variant={isMacOSTheme ? "default" : "retro"}
          onClick={() => onToggle(todo.id)}
          className={cn(
            "h-7 flex-1 text-[11px]",
            useGeneva && "font-geneva-12",
            isXpTheme && "text-black"
          )}
        >
          {todo.completed
            ? t("apps.calendar.tray.markIncomplete")
            : t("apps.calendar.tray.markComplete")}
        </Button>
        <Button
          variant="retro"
          onClick={() => onDelete(todo.id)}
          className={cn(
            "h-7 text-[11px] text-red-600 hover:text-red-700 px-2 gap-1",
            useGeneva && "font-geneva-12"
          )}
          title={t("apps.calendar.event.delete")}
          aria-label={t("apps.calendar.event.delete")}
        >
          <Trash size={11} weight="bold" />
        </Button>
      </div>
    </div>
  );
}
