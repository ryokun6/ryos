import type {
  CalendarEvent,
  CalendarGroup,
  TodoItem,
} from "@/stores/useCalendarStore";

export interface TrayDetailsProps {
  selectedEvent: CalendarEvent | null;
  selectedTodo: TodoItem | null;
  calendars: CalendarGroup[];
  isMacOSTheme: boolean;
  isSystem7Theme: boolean;
  isWindowsTheme: boolean;
  onUpdateEvent: (id: string, updates: Partial<CalendarEvent>) => void;
  onDeleteEvent: (id: string) => void;
  onUpdateTodo: (
    id: string,
    updates: Partial<Pick<TodoItem, "title" | "calendarId" | "dueDate" | "completed">>
  ) => void;
  onToggleTodo: (id: string) => void;
  onDeleteTodo: (id: string) => void;
}

export interface TrayThemeProps {
  useGeneva: boolean;
  isMacOSTheme: boolean;
  isSystem7Theme: boolean;
  isWindowsTheme: boolean;
}
