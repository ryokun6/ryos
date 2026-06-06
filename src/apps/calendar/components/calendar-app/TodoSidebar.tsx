import { useState, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Trash } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { AquaCheckbox } from "@/components/ui/aqua-checkbox";
import type { CalendarGroup, TodoItem } from "@/stores/useCalendarStore";
import { EVENT_COLOR_MAP } from "./calendarAppConstants";

export function TodoSidebar({
  todos,
  calendars,
  onToggle,
  onAdd,
  onUpdate,
  onDelete,
  isMacOSTheme,
  isSystem7Theme,
  fullWidth,
  noHeader,
  selectedTodoId,
  onSelectTodo,
}: {
  todos: TodoItem[];
  calendars: CalendarGroup[];
  onToggle: (id: string) => void;
  onAdd: (title: string, calendarId: string) => void;
  onUpdate: (
    id: string,
    updates: Partial<Pick<TodoItem, "title" | "dueDate">>
  ) => void;
  onDelete: (id: string) => void;
  isMacOSTheme: boolean;
  isSystem7Theme: boolean;
  fullWidth?: boolean;
  noHeader?: boolean;
  selectedTodoId?: string | null;
  onSelectTodo?: (id: string) => void;
}) {
  const { t } = useTranslation();
  const useGeneva = isMacOSTheme || isSystem7Theme;
  const [newTitle, setNewTitle] = useState("");
  const [editingTodoId, setEditingTodoId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const defaultCalId = calendars[0]?.id || "home";
  const calendarById = useMemo(
    () => new Map(calendars.map((calendar) => [calendar.id, calendar])),
    [calendars]
  );

  const handleAdd = () => {
    if (!newTitle.trim()) return;
    onAdd(newTitle.trim(), defaultCalId);
    setNewTitle("");
  };

  const startEditingTodo = useCallback((todo: TodoItem) => {
    setEditingTodoId(todo.id);
    setEditingTitle(todo.title);
  }, []);

  const stopEditingTodo = useCallback(() => {
    setEditingTodoId(null);
    setEditingTitle("");
  }, []);

  const commitTodoEdit = useCallback((todo: TodoItem) => {
    const nextTitle = editingTitle.trim();
    if (nextTitle && nextTitle !== todo.title) {
      onUpdate(todo.id, { title: nextTitle });
    }
    stopEditingTodo();
  }, [editingTitle, onUpdate, stopEditingTodo]);

  const actionButtonVisibilityClass = fullWidth
    ? "opacity-60"
    : "pointer-events-none translate-x-1 opacity-0 group-hover:pointer-events-auto group-hover:translate-x-0 group-hover:opacity-40";
  const todoTitleFieldClass = cn(
    "text-[11px] leading-tight flex-1 min-w-0 rounded border px-1 py-0.5 min-h-[22px]",
    useGeneva ? "font-geneva-12 border-black/20" : "border-black/10"
  );

  return (
    <div className="flex flex-col h-full select-none os-sidebar" style={fullWidth ? undefined : { width: 180, minWidth: 180 }}>
      {!noHeader && (isMacOSTheme ? (
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
          {t("apps.calendar.sidebar.toDoItems")}
        </div>
      ) : (
        <div
          className={cn("text-[9px] font-bold uppercase tracking-wide opacity-50 px-2 pt-2 pb-1", useGeneva && "font-geneva-12")}
        >
          {t("apps.calendar.sidebar.toDoItems")}
        </div>
      ))}
      <div className="flex-1 overflow-y-auto">
        {todos.length === 0 && (
          <div className={cn("text-[10px] opacity-30 px-2 py-2", useGeneva && "font-geneva-12")}>{t("apps.calendar.sidebar.noTodoItems")}</div>
        )}
        {todos.map((todo) => {
          const cal = calendarById.get(todo.calendarId);
          const isEditing = editingTodoId === todo.id;
          const isSelected = selectedTodoId === todo.id;
          return (
            <div
              key={todo.id}
              className={cn(
                "group relative flex w-full items-start gap-1.5 px-2 py-1 min-h-[30px]",
                isSelected && (isMacOSTheme ? "bg-black/[0.06]" : "bg-black/[0.05]")
              )}
            >
              <button type="button" onClick={() => onToggle(todo.id)} className="shrink-0 mt-[3px]">
                <AquaCheckbox checked={todo.completed} color={EVENT_COLOR_MAP[cal?.color || "blue"]} />
              </button>
              {isEditing ? (
                <input
                  type="text"
                  value={editingTitle}
                  autoFocus
                  onFocus={(event) => event.currentTarget.select()}
                  onChange={(event) => setEditingTitle(event.target.value)}
                  onBlur={() => commitTodoEdit(todo)}
                  onKeyDown={(event) => {
                    event.stopPropagation();
                    if (event.key === "Enter") commitTodoEdit(todo);
                    if (event.key === "Escape") stopEditingTodo();
                  }}
                  className={cn(
                    todoTitleFieldClass,
                    "bg-white/90 outline-none transition-[padding]",
                    !fullWidth && "group-hover:pr-7"
                  )}
                />
              ) : (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isSelected) {
                      startEditingTodo(todo);
                    } else if (onSelectTodo) {
                      onSelectTodo(todo.id);
                    } else {
                      startEditingTodo(todo);
                    }
                  }}
                  className={cn(
                    todoTitleFieldClass,
                    "text-left border-transparent bg-transparent",
                    todo.completed && "line-through opacity-40",
                    "hover:bg-black/[0.02] transition-[padding]",
                    !fullWidth && "group-hover:pr-7"
                  )}
                >
                  <span className="block truncate">{todo.title}</span>
                </button>
              )}
              <div
                className={cn(
                  "flex items-center justify-end gap-1",
                  fullWidth ? "shrink-0 mt-[3px]" : "absolute right-2 top-[7px]"
                )}
              >
                <button
                  type="button"
                  onClick={() => onDelete(todo.id)}
                  className={cn(
                    "shrink-0 transition-[opacity,transform] hover:!opacity-100",
                    actionButtonVisibilityClass
                  )}
                >
                  <Trash size={10} weight="bold" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <div className="px-2 pb-1.5 pt-1">
        <input
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") handleAdd(); }}
          placeholder={t("apps.calendar.sidebar.newTodoPlaceholder")}
          className={cn(
            "w-full text-[10px] px-1.5 py-0.5 rounded border bg-white/80 outline-none",
            useGeneva ? "border-black/20 font-geneva-12" : "border-black/10"
          )}
        />
      </div>
    </div>
  );
}
