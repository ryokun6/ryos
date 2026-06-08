import type {
  CalendarEventDto,
  CalendarGroupDto,
  CalendarSnapshotData,
  TodoItemDto,
} from "../domains/calendar";

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
  location?: string;
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
  location?: string;
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

export type CalendarToolError =
  | "missing_fields"
  | "missing_id"
  | "not_found"
  | "unknown_action";

export type CalendarToolResult =
  | {
      ok: true;
      state: CalendarSnapshotData;
      kind: "list";
      events: CalendarEventToolRecord[];
    }
  | {
      ok: true;
      state: CalendarSnapshotData;
      kind: "create";
      event: CalendarEventDto;
    }
  | {
      ok: true;
      state: CalendarSnapshotData;
      kind: "update" | "delete";
      event: CalendarEventDto;
    }
  | {
      ok: true;
      state: CalendarSnapshotData;
      kind: "listTodos";
      todos: CalendarTodoToolRecord[];
    }
  | {
      ok: true;
      state: CalendarSnapshotData;
      kind: "createTodo" | "toggleTodo";
      todo: TodoItemDto;
    }
  | {
      ok: true;
      state: CalendarSnapshotData;
      kind: "deleteTodo";
      todo: TodoItemDto;
    }
  | {
      ok: false;
      error: CalendarToolError;
      id?: string;
    };

export function serializeCalendarEvent(
  event: CalendarEventDto
): CalendarEventToolRecord {
  return {
    id: event.id,
    title: event.title,
    date: event.date,
    startTime: event.startTime,
    endTime: event.endTime,
    color: event.color,
    notes: event.notes,
    location: event.location,
  };
}

export function serializeCalendarTodo(
  todo: TodoItemDto
): CalendarTodoToolRecord {
  return {
    id: todo.id,
    title: todo.title,
    completed: todo.completed,
    dueDate: todo.dueDate,
    calendarId: todo.calendarId,
  };
}

function resolveCalendarColor(
  input: CalendarControlInput,
  calendars: CalendarGroupDto[]
): CalendarColor {
  if (input.color) return input.color;
  const calendar = calendars.find((item) => item.id === input.calendarId);
  return calendar?.color || "blue";
}

export function applyCalendarToolAction(
  state: CalendarSnapshotData,
  input: CalendarControlInput,
  deps: {
    generateId: () => string;
    now: () => number;
    deletedAt: () => string;
  }
): CalendarToolResult {
  switch (input.action) {
    case "list": {
      const events = input.date
        ? state.events.filter((event) => event.date === input.date)
        : state.events;
      return {
        ok: true,
        state,
        kind: "list",
        events: events.map(serializeCalendarEvent),
      };
    }

    case "create": {
      if (!input.title || !input.date) {
        return { ok: false, error: "missing_fields" };
      }
      const now = deps.now();
      const newEvent: CalendarEventDto = {
        id: deps.generateId(),
        title: input.title,
        date: input.date,
        startTime: input.startTime,
        endTime: input.endTime,
        color: resolveCalendarColor(input, state.calendars),
        calendarId: input.calendarId,
        notes: input.notes,
        location: input.location,
        createdAt: now,
        updatedAt: now,
      };
      return {
        ok: true,
        state: { ...state, events: [...state.events, newEvent] },
        kind: "create",
        event: newEvent,
      };
    }

    case "update": {
      if (!input.id) return { ok: false, error: "missing_id" };
      const index = state.events.findIndex((event) => event.id === input.id);
      if (index === -1) return { ok: false, error: "not_found", id: input.id };
      const event = {
        ...state.events[index],
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.date !== undefined ? { date: input.date } : {}),
        ...(input.startTime !== undefined ? { startTime: input.startTime } : {}),
        ...(input.endTime !== undefined ? { endTime: input.endTime } : {}),
        ...(input.color !== undefined ? { color: input.color } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.location !== undefined ? { location: input.location } : {}),
        updatedAt: deps.now(),
      };
      const events = [...state.events];
      events[index] = event;
      return { ok: true, state: { ...state, events }, kind: "update", event };
    }

    case "delete": {
      if (!input.id) return { ok: false, error: "missing_id" };
      const event = state.events.find((item) => item.id === input.id);
      if (!event) return { ok: false, error: "not_found", id: input.id };
      return {
        ok: true,
        state: {
          ...state,
          events: state.events.filter((item) => item.id !== input.id),
          deletedEventIds: {
            ...(state.deletedEventIds || {}),
            [event.id]: deps.deletedAt(),
          },
        },
        kind: "delete",
        event,
      };
    }

    case "listTodos": {
      const todos =
        input.completed === true
          ? state.todos.filter((todo) => todo.completed)
          : state.todos;
      return {
        ok: true,
        state,
        kind: "listTodos",
        todos: todos.map(serializeCalendarTodo),
      };
    }

    case "createTodo": {
      if (!input.title) return { ok: false, error: "missing_fields" };
      const calendarId = input.calendarId || state.calendars[0]?.id || "home";
      const todo: TodoItemDto = {
        id: deps.generateId(),
        title: input.title,
        completed: false,
        dueDate: input.date || null,
        calendarId,
        createdAt: deps.now(),
      };
      return {
        ok: true,
        state: { ...state, todos: [...state.todos, todo] },
        kind: "createTodo",
        todo,
      };
    }

    case "toggleTodo": {
      if (!input.id) return { ok: false, error: "missing_id" };
      const index = state.todos.findIndex((todo) => todo.id === input.id);
      if (index === -1) return { ok: false, error: "not_found", id: input.id };
      const todo = {
        ...state.todos[index],
        completed: !state.todos[index].completed,
      };
      const todos = [...state.todos];
      todos[index] = todo;
      return { ok: true, state: { ...state, todos }, kind: "toggleTodo", todo };
    }

    case "deleteTodo": {
      if (!input.id) return { ok: false, error: "missing_id" };
      const todo = state.todos.find((item) => item.id === input.id);
      if (!todo) return { ok: false, error: "not_found", id: input.id };
      return {
        ok: true,
        state: {
          ...state,
          todos: state.todos.filter((item) => item.id !== input.id),
          deletedTodoIds: {
            ...(state.deletedTodoIds || {}),
            [todo.id]: deps.deletedAt(),
          },
        },
        kind: "deleteTodo",
        todo,
      };
    }

    default:
      return { ok: false, error: "unknown_action" };
  }
}
