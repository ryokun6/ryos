import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  AQUA_ICON_BUTTON_PADDING_CLASS,
  AQUA_ICON_BUTTON_PHOSPHOR_SIZE,
} from "@/lib/aquaIconButton";
import { Check, X } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { AquaCheckbox } from "@/components/ui/aqua-checkbox";
import type { CalendarGroup, TodoItem } from "@/stores/useCalendarStore";
import { EVENT_COLOR_MAP } from "./constants";
import { TrayFieldRow } from "./TrayFieldRow";
import type { TrayThemeProps } from "./types";
import { formatDateLabel } from "./utils";

export function TodoDetails({
  todo,
  calendars,
  useGeneva,
  isMacOSTheme,
  isSystem7Theme,
  isWindowsTheme,
  locale,
  t,
  onToggle,
  onUpdate,
  onDelete,
}: TrayThemeProps & {
  todo: TodoItem;
  calendars: CalendarGroup[];
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
    isWindowsTheme && "text-black"
  );

  // See note on EventTrayEditor.panelShell: keep scroller `pb-*` minimal and
  // rely on a trailing spacer below for cross-browser bottom breathing room.
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

        <div
          className={cn(
            "shrink-0 w-full min-w-0 flex flex-col gap-2 mt-1 pt-2 border-t border-black/15",
            isMacOSTheme && "border-black/12"
          )}
        >
          <Button
            type="button"
            variant={isMacOSTheme ? "aqua" : "retro"}
            size="sm"
            onClick={() => onToggle(todo.id)}
            className={cn(
              AQUA_ICON_BUTTON_PADDING_CLASS,
              "w-full min-w-0 justify-center text-[12px] leading-normal h-auto py-2",
              useGeneva && "font-geneva-12",
              isWindowsTheme && "text-black"
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
