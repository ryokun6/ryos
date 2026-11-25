import type { DeletionMarkerMap } from "../../utils/cloudSyncDeletionMarkers";
import type { EventColor, PresetEventColor } from "../calendarColors";
import type { GoogleCalendarAccessRole } from "../contracts/google";

export type CalendarColor = PresetEventColor;

export interface CalendarEventDto {
  id: string;
  title: string;
  date: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  color: EventColor;
  calendarId?: string;
  location?: string;
  notes?: string;
  createdAt: number;
  updatedAt: number;
  googleEventId?: string;
  googleCalendarId?: string;
  googleColorId?: string | null;
  googleEtag?: string;
  googleRecurringEventId?: string;
  googleSyncedUpdatedAt?: number;
}

export interface CalendarGroupDto {
  id: string;
  name: string;
  color: EventColor;
  visible: boolean;
  googleCalendarId?: string;
  googleAccountCalendarId?: string;
  googleColorId?: string;
  googlePrimary?: boolean;
  googleAccessRole?: GoogleCalendarAccessRole;
  readOnly?: boolean;
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
