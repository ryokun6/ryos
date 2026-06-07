/**
 * Shared calendar tool action contracts (client handlers + server executors).
 */

export const CALENDAR_ACTIONS = [
  "list",
  "create",
  "update",
  "delete",
  "listTodos",
  "createTodo",
  "toggleTodo",
  "deleteTodo",
] as const;
export type CalendarAction = (typeof CALENDAR_ACTIONS)[number];

export const CALENDAR_COLORS = ["blue", "red", "green", "orange", "purple"] as const;
export type CalendarColor = (typeof CALENDAR_COLORS)[number];

export interface CalendarControlInput {
  action: CalendarAction;
  id?: string;
  title?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  color?: CalendarColor;
  notes?: string;
  completed?: boolean;
  calendarId?: string;
}

export interface CalendarEventToolRecord {
  id: string;
  title: string;
  date: string;
  startTime?: string;
  endTime?: string;
  color: string;
  notes?: string;
}

export interface CalendarTodoToolRecord {
  id: string;
  title: string;
  completed: boolean;
  dueDate: string | null;
  calendarId: string;
}

export interface CalendarControlOutput {
  success: boolean;
  message: string;
  events?: CalendarEventToolRecord[];
  event?: CalendarEventToolRecord;
  todos?: CalendarTodoToolRecord[];
  todo?: CalendarTodoToolRecord;
}
