import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { EventTrayEditor } from "./EventTrayEditor";
import { TodoDetails } from "./TodoDetails";
import type { TrayDetailsProps } from "./types";

export function TrayDetails({
  selectedEvent,
  selectedTodo,
  calendars,
  isMacOSTheme,
  isSystem7Theme,
  isWindowsTheme,
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
          isWindowsTheme={isWindowsTheme}
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
          isWindowsTheme={isWindowsTheme}
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
