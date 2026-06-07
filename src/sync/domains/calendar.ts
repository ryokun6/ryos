import {
  useCalendarStore,
  type CalendarEvent,
  type CalendarGroup,
  type TodoItem,
} from "@/stores/useCalendarStore";
import { useCloudSyncStore } from "@/stores/useCloudSyncStore";
import type { CalendarSnapshotData } from "@ryos/shared/contracts/sync-snapshots";
import {
  filterDeletedIds,
  mergeDeletionMarkerMaps,
  normalizeDeletionMarkerMap,
} from "@/utils/cloudSyncDeletionMarkers";
import {
  mergeItemsById,
  mergeItemsByIdPreferNewer,
  type AnySnapshotData,
} from "./_shared";

export function serializeCalendarSnapshot(): CalendarSnapshotData {
  const calendarState = useCalendarStore.getState();
  const deletionMarkers = useCloudSyncStore.getState().deletionMarkers;

  return {
    events: calendarState.events,
    calendars: calendarState.calendars,
    todos: calendarState.todos,
    deletedEventIds: deletionMarkers.calendarEventIds,
    deletedCalendarIds: deletionMarkers.calendarIds,
    deletedTodoIds: deletionMarkers.calendarTodoIds,
  };
}

export function applyCalendarSnapshot(data: CalendarSnapshotData): void {
  const remoteDeletedTodoIds = normalizeDeletionMarkerMap(data.deletedTodoIds);
  const remoteDeletedEventIds = normalizeDeletionMarkerMap(data.deletedEventIds);
  const remoteDeletedCalendarIds = normalizeDeletionMarkerMap(
    data.deletedCalendarIds
  );
  const cloudSyncState = useCloudSyncStore.getState();
  const effectiveDeletedTodoIds = mergeDeletionMarkerMaps(
    cloudSyncState.deletionMarkers.calendarTodoIds,
    remoteDeletedTodoIds
  );
  const effectiveDeletedEventIds = mergeDeletionMarkerMaps(
    cloudSyncState.deletionMarkers.calendarEventIds,
    remoteDeletedEventIds
  );
  const effectiveDeletedCalendarIds = mergeDeletionMarkerMaps(
    cloudSyncState.deletionMarkers.calendarIds,
    remoteDeletedCalendarIds
  );

  cloudSyncState.mergeDeletedKeys("calendarTodoIds", remoteDeletedTodoIds);
  cloudSyncState.mergeDeletedKeys("calendarEventIds", remoteDeletedEventIds);
  cloudSyncState.mergeDeletedKeys("calendarIds", remoteDeletedCalendarIds);

  useCalendarStore.setState({
    events: filterDeletedIds(
      data.events as CalendarEvent[],
      effectiveDeletedEventIds,
      (event) => event.id
    ),
    calendars: filterDeletedIds(
      data.calendars as CalendarGroup[],
      effectiveDeletedCalendarIds,
      (calendar) => calendar.id
    ),
    todos: filterDeletedIds(
      data.todos as TodoItem[],
      effectiveDeletedTodoIds,
      (todo) => todo.id
    ),
  });
}

export function mergeCalendarSnapshots(
  local: CalendarSnapshotData,
  remote: CalendarSnapshotData
): CalendarSnapshotData {
  const mergedDeletedEvents = mergeDeletionMarkerMaps(
    normalizeDeletionMarkerMap(local.deletedEventIds),
    normalizeDeletionMarkerMap(remote.deletedEventIds)
  );
  const mergedDeletedCalendars = mergeDeletionMarkerMaps(
    normalizeDeletionMarkerMap(local.deletedCalendarIds),
    normalizeDeletionMarkerMap(remote.deletedCalendarIds)
  );
  const mergedDeletedTodos = mergeDeletionMarkerMaps(
    normalizeDeletionMarkerMap(local.deletedTodoIds),
    normalizeDeletionMarkerMap(remote.deletedTodoIds)
  );
  return {
    events: mergeItemsByIdPreferNewer(
      local.events as CalendarEvent[],
      remote.events as CalendarEvent[],
      mergedDeletedEvents
    ),
    calendars: mergeItemsByIdPreferNewer(
      local.calendars as (CalendarGroup & { updatedAt?: number })[],
      remote.calendars as (CalendarGroup & { updatedAt?: number })[],
      mergedDeletedCalendars
    ) as CalendarGroup[],
    todos: mergeItemsById(
      filterDeletedIds(local.todos as TodoItem[], mergedDeletedTodos, (t) => t.id),
      filterDeletedIds(remote.todos as TodoItem[], mergedDeletedTodos, (t) => t.id)
    ),
    deletedEventIds: mergedDeletedEvents,
    deletedCalendarIds: mergedDeletedCalendars,
    deletedTodoIds: mergedDeletedTodos,
  };
}

export function mergeCalendarConflict(
  localData: AnySnapshotData,
  remoteData: AnySnapshotData
): CalendarSnapshotData {
  return mergeCalendarSnapshots(
    localData as CalendarSnapshotData,
    remoteData as CalendarSnapshotData
  );
}
