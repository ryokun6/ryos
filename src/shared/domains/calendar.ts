import {
  filterDeletedIds,
  mergeDeletionMarkerMaps,
  normalizeDeletionMarkerMap,
  type DeletionMarkerMap,
} from "../../utils/cloudSyncDeletionMarkers";
import {
  mergeItemsById,
  mergeItemsByIdPreferNewer,
} from "../sync/itemMerge";

export type CalendarColor = "blue" | "red" | "green" | "orange" | "purple";

export interface CalendarEventDto {
  id: string;
  title: string;
  date: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  color: CalendarColor;
  calendarId?: string;
  location?: string;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface CalendarGroupDto {
  id: string;
  name: string;
  color: CalendarColor;
  visible: boolean;
}

export interface TodoItemDto {
  id: string;
  title: string;
  completed: boolean;
  dueDate: string | null;
  calendarId: string;
  createdAt: number;
}

export interface CalendarSnapshotData {
  events: CalendarEventDto[];
  calendars: CalendarGroupDto[];
  todos: TodoItemDto[];
  deletedEventIds?: DeletionMarkerMap;
  deletedCalendarIds?: DeletionMarkerMap;
  deletedTodoIds?: DeletionMarkerMap;
}

const CALENDAR_COLORS = ["blue", "red", "green", "orange", "purple"] as const;

function isCalendarColor(value: unknown): value is CalendarColor {
  return typeof value === "string" && CALENDAR_COLORS.includes(value as CalendarColor);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function isCalendarEventDto(value: unknown): value is CalendarEventDto {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<CalendarEventDto>;
  return (
    typeof event.id === "string" &&
    typeof event.title === "string" &&
    typeof event.date === "string" &&
    (event.endDate === undefined || typeof event.endDate === "string") &&
    isCalendarColor(event.color) &&
    isFiniteNumber(event.createdAt) &&
    isFiniteNumber(event.updatedAt)
  );
}

export function isCalendarGroupDto(value: unknown): value is CalendarGroupDto {
  if (!value || typeof value !== "object") return false;
  const calendar = value as Partial<CalendarGroupDto>;
  return (
    typeof calendar.id === "string" &&
    typeof calendar.name === "string" &&
    isCalendarColor(calendar.color) &&
    typeof calendar.visible === "boolean"
  );
}

export function isTodoItemDto(value: unknown): value is TodoItemDto {
  if (!value || typeof value !== "object") return false;
  const todo = value as Partial<TodoItemDto>;
  return (
    typeof todo.id === "string" &&
    typeof todo.title === "string" &&
    typeof todo.completed === "boolean" &&
    (todo.dueDate === null || typeof todo.dueDate === "string") &&
    typeof todo.calendarId === "string" &&
    isFiniteNumber(todo.createdAt)
  );
}

export function normalizeCalendarSnapshotData(
  data: unknown
): CalendarSnapshotData {
  if (!data || typeof data !== "object") {
    return {
      events: [],
      calendars: [],
      todos: [],
      deletedEventIds: {},
      deletedCalendarIds: {},
      deletedTodoIds: {},
    };
  }

  const snapshot = data as Partial<CalendarSnapshotData>;
  return {
    events: Array.isArray(snapshot.events)
      ? snapshot.events.filter(isCalendarEventDto)
      : [],
    calendars: Array.isArray(snapshot.calendars)
      ? snapshot.calendars.filter(isCalendarGroupDto)
      : [],
    todos: Array.isArray(snapshot.todos)
      ? snapshot.todos.filter(isTodoItemDto)
      : [],
    deletedEventIds: normalizeDeletionMarkerMap(snapshot.deletedEventIds),
    deletedCalendarIds: normalizeDeletionMarkerMap(snapshot.deletedCalendarIds),
    deletedTodoIds: normalizeDeletionMarkerMap(snapshot.deletedTodoIds),
  };
}

export function isCalendarSnapshotData(
  value: unknown
): value is CalendarSnapshotData {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as {
    events?: unknown;
    calendars?: unknown;
    todos?: unknown;
  };
  return (
    Array.isArray(snapshot.events) &&
    snapshot.events.every(isCalendarEventDto) &&
    Array.isArray(snapshot.calendars) &&
    snapshot.calendars.every(isCalendarGroupDto) &&
    Array.isArray(snapshot.todos) &&
    snapshot.todos.every(isTodoItemDto)
  );
}

export function mergeCalendarSnapshots(
  local: CalendarSnapshotData,
  remote: CalendarSnapshotData
): CalendarSnapshotData {
  const localSnapshot = normalizeCalendarSnapshotData(local);
  const remoteSnapshot = normalizeCalendarSnapshotData(remote);
  const mergedDeletedEvents = mergeDeletionMarkerMaps(
    localSnapshot.deletedEventIds,
    remoteSnapshot.deletedEventIds
  );
  const mergedDeletedCalendars = mergeDeletionMarkerMaps(
    localSnapshot.deletedCalendarIds,
    remoteSnapshot.deletedCalendarIds
  );
  const mergedDeletedTodos = mergeDeletionMarkerMaps(
    localSnapshot.deletedTodoIds,
    remoteSnapshot.deletedTodoIds
  );

  return {
    events: mergeItemsByIdPreferNewer(
      localSnapshot.events,
      remoteSnapshot.events,
      mergedDeletedEvents
    ),
    calendars: mergeItemsByIdPreferNewer(
      localSnapshot.calendars as (CalendarGroupDto & { updatedAt?: number })[],
      remoteSnapshot.calendars as (CalendarGroupDto & { updatedAt?: number })[],
      mergedDeletedCalendars
    ) as CalendarGroupDto[],
    todos: mergeItemsById(
      filterDeletedIds(localSnapshot.todos, mergedDeletedTodos, (todo) => todo.id),
      filterDeletedIds(remoteSnapshot.todos, mergedDeletedTodos, (todo) => todo.id)
    ),
    deletedEventIds: mergedDeletedEvents,
    deletedCalendarIds: mergedDeletedCalendars,
    deletedTodoIds: mergedDeletedTodos,
  };
}
