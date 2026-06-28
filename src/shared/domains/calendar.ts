import type { DeletionMarkerMap } from "../../utils/cloudSyncDeletionMarkers";

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
