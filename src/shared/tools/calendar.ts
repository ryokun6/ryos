import type {
  CalendarEventDto,
  CalendarGroupDto,
  CalendarSnapshotData,
  TodoItemDto,
} from "../domains/calendar";
import {
  areEventColorsEquivalent,
  mapColorToClosestGoogleEventColorId,
  PRESET_CALENDAR_COLORS,
  type EventColor,
} from "../calendarColors";
import {
  calendarEventOccursOnDate,
  normalizeAllDayEndDate,
} from "../calendarEventDates";

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

export const CALENDAR_COLORS = PRESET_CALENDAR_COLORS;
export type CalendarColor = (typeof CALENDAR_COLORS)[number];

export interface CalendarControlInput {
  action: CalendarAction;
  id?: string;
  title?: string;
  date?: string;
  endDate?: string;
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
  endDate?: string;
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
    endDate: event.endDate,
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

export function pickDefaultWritableCalendar<
  T extends Pick<CalendarGroupDto, "id" | "visible" | "googlePrimary" | "readOnly">
>(calendars: readonly T[]): T | undefined {
  return (
    calendars.find((c) => c.googlePrimary && !c.readOnly && c.visible) ??
    calendars.find((c) => c.googlePrimary && !c.readOnly) ??
    calendars.find((c) => !c.readOnly && c.visible) ??
    calendars.find((c) => !c.readOnly) ??
    calendars[0]
  );
}

function resolveTargetCalendar(
  requestedCalendarId: string | undefined,
  calendars: CalendarGroupDto[]
): CalendarGroupDto | undefined {
  if (requestedCalendarId) {
    const found = calendars.find((item) => item.id === requestedCalendarId);
    if (found) return found;
  }
  return pickDefaultWritableCalendar(calendars);
}

function resolveCalendarColorForCreate(
  inputColor: CalendarColor | undefined,
  calendar: CalendarGroupDto | undefined
): { color: EventColor; googleColorId?: string } {
  const calendarColor: EventColor = calendar?.color || "blue";
  if (!inputColor) {
    return { color: calendarColor };
  }
  if (areEventColorsEquivalent(inputColor, calendarColor)) {
    return { color: calendarColor };
  }
  return {
    color: inputColor,
    googleColorId: mapColorToClosestGoogleEventColorId(inputColor),
  };
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
        ? state.events.filter((event) =>
            calendarEventOccursOnDate(event, input.date!)
          )
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
      const requestedCalendarId = input.calendarId?.trim() || undefined;
      const targetCalendar = resolveTargetCalendar(
        requestedCalendarId,
        state.calendars
      );
      const resolvedColor = resolveCalendarColorForCreate(
        input.color,
        targetCalendar
      );
      const effectiveCalendarId = requestedCalendarId ?? targetCalendar?.id;
      const newEvent: CalendarEventDto = {
        id: deps.generateId(),
        title: input.title,
        date: input.date,
        endDate: input.startTime
          ? undefined
          : normalizeAllDayEndDate(input.date, input.endDate),
        startTime: input.startTime,
        endTime: input.endTime,
        color: resolvedColor.color,
        ...(resolvedColor.googleColorId
          ? { googleColorId: resolvedColor.googleColorId }
          : {}),
        ...(effectiveCalendarId ? { calendarId: effectiveCalendarId } : {}),
        ...(targetCalendar?.googleCalendarId && !targetCalendar.readOnly
          ? { googleCalendarId: targetCalendar.googleCalendarId }
          : {}),
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
      const existing = state.events[index];
      const nextDate = input.date ?? existing.date;
      const nextStartTime =
        input.startTime !== undefined ? input.startTime : existing.startTime;
      const nextEndDate =
        input.endDate !== undefined ? input.endDate : existing.endDate;
      const eventCalendar = state.calendars.find(
        (c) => c.id === existing.calendarId
      );

      let colorPatch: Partial<Pick<CalendarEventDto, "color" | "googleColorId">> =
        {};
      if (input.color !== undefined) {
        if (
          eventCalendar &&
          areEventColorsEquivalent(input.color, eventCalendar.color)
        ) {
          colorPatch = {
            color: eventCalendar.color,
            googleColorId:
              existing.googleEventId && existing.googleColorId ? null : undefined,
          };
        } else {
          colorPatch = {
            color: input.color,
            googleColorId: mapColorToClosestGoogleEventColorId(input.color),
          };
        }
      }

      const event: CalendarEventDto = {
        ...existing,
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.date !== undefined ? { date: nextDate } : {}),
        endDate: nextStartTime
          ? undefined
          : normalizeAllDayEndDate(nextDate, nextEndDate),
        ...(input.startTime !== undefined ? { startTime: input.startTime } : {}),
        ...(input.endTime !== undefined ? { endTime: input.endTime } : {}),
        ...colorPatch,
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
      const requestedCalId = input.calendarId?.trim() || undefined;
      const defaultCal = pickDefaultWritableCalendar(state.calendars);
      const calendarId = requestedCalId || defaultCal?.id || "home";
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
