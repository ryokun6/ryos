import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useCloudSyncStore } from "@/stores/useCloudSyncStore";
import { createIndexedDBPersistStorage } from "@/utils/indexedDBPersistStorage";
import {
  areEventColorsEquivalent,
  mapColorToClosestGoogleEventColorId,
  type EventColor,
} from "@/shared/calendarColors";
import {
  calendarEventOccursOnDate,
  calendarEventOverlapsDateRange,
  normalizeAllDayEndDate,
} from "@/shared/calendarEventDates";
import type {
  GoogleCalendarAccessRole,
  GoogleCalendarDeletionInput,
  GoogleCalendarSyncResponse,
} from "@/shared/contracts/google";
import { pickDefaultWritableCalendar } from "@/shared/tools/calendar";
import {
  formatZonedDateString,
  getEffectiveTimezone,
  getZonedDateTimeParts,
} from "@/lib/timezoneConfig";
import { LEGACY_STORAGE_KEYS, STORAGE_KEYS } from "@/utils/storageKeys";

export type { EventColor } from "@/shared/calendarColors";

export interface CalendarGroup {
  id: string;
  name: string;
  color: EventColor;
  visible: boolean;
  /** Google Calendar list sync metadata */
  googleCalendarId?: string;
  googleAccountCalendarId?: string;
  googleColorId?: string;
  googlePrimary?: boolean;
  googleAccessRole?: GoogleCalendarAccessRole;
  readOnly?: boolean;
}

export interface CalendarEvent {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD, inclusive for all-day multi-day events
  startTime?: string; // HH:MM (optional — all-day if omitted)
  endTime?: string; // HH:MM
  color: EventColor;
  calendarId?: string;
  /** Optional location line (shown under the title in the tray editor). */
  location?: string;
  notes?: string;
  createdAt: number;
  updatedAt: number;
  /** Google Calendar two-way sync metadata */
  googleEventId?: string;
  googleCalendarId?: string;
  /**
   * Explicit Google per-event `colorId` ("1"–"11") when overridden on the event;
   * `null` when clearing a previously synced override back to calendar default;
   * `undefined` when inheriting the calendar's color.
   */
  googleColorId?: string | null;
  googleEtag?: string;
  googleRecurringEventId?: string;
  googleSyncedUpdatedAt?: number;
}

export type NewCalendarEventInput = Omit<
  CalendarEvent,
  "id" | "createdAt" | "updatedAt" | "color"
> & {
  color?: EventColor;
};

export interface TodoItem {
  id: string;
  title: string;
  completed: boolean;
  dueDate: string | null; // YYYY-MM-DD or null
  calendarId: string;
  createdAt: number;
}

export type CalendarView = "month" | "week" | "day";

const DEFAULT_CALENDARS: CalendarGroup[] = [
  { id: "home", name: "Home", color: "blue", visible: true },
  { id: "work", name: "Work", color: "green", visible: true },
];

const BUILTIN_DEFAULT_CALENDAR_IDS = new Set(["home", "work"]);

export function getDefaultWritableCalendar(
  calendars: readonly CalendarGroup[]
): CalendarGroup | undefined {
  return pickDefaultWritableCalendar(calendars);
}

interface CalendarStoreState {
  events: CalendarEvent[];
  calendars: CalendarGroup[];
  todos: TodoItem[];
  pendingGoogleDeletions: GoogleCalendarDeletionInput[];
  showTodoSidebar: boolean;
  selectedDate: string; // YYYY-MM-DD
  currentMonth: number; // 0-11
  currentYear: number;
  view: CalendarView;

  // Calendar group actions
  addCalendar: (name: string, color: EventColor) => string;
  toggleCalendarVisibility: (id: string) => void;
  removeCalendar: (id: string) => void;

  // Event actions
  addEvent: (event: NewCalendarEventInput) => string;
  updateEvent: (id: string, updates: Partial<CalendarEvent>) => void;
  deleteEvent: (id: string) => void;

  // Google Calendar sync actions
  discardAllLocalEventsForGoogleSync: () => string[];
  applyGoogleCalendarSyncResult: (response: GoogleCalendarSyncResponse) => void;
  detachGoogleCalendarMetadata: () => void;

  // Todo actions
  addTodo: (title: string, calendarId: string, dueDate?: string) => string;
  toggleTodo: (id: string) => void;
  updateTodo: (
    id: string,
    updates: Partial<
      Pick<TodoItem, "title" | "calendarId" | "dueDate" | "completed">
    >
  ) => void;
  deleteTodo: (id: string) => void;
  setShowTodoSidebar: (show: boolean) => void;

  // Navigation
  setSelectedDate: (date: string) => void;
  setView: (view: CalendarView) => void;
  navigateMonth: (delta: number) => void;
  navigateWeek: (delta: number) => void;
  goToToday: () => void;
  getEventsForDate: (date: string) => CalendarEvent[];
  getEventsForMonth: (year: number, month: number) => CalendarEvent[];
}

/** Get today as YYYY-MM-DD in the user's effective timezone preference. */
const getTodayStr = (): string =>
  formatZonedDateString(new Date(), getEffectiveTimezone());

/** Format a Date as YYYY-MM-DD (civil date in host local — used for nav only). */
const formatDate = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function compositeGoogleEventKey(
  googleEventId: string,
  googleCalendarId?: string | null
): string {
  return `${googleCalendarId || "primary"}::${googleEventId}`;
}

function areEventListsEqual(a: CalendarEvent[], b: CalendarEvent[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i];
    const y = b[i];
    if (
      x.id !== y.id ||
      x.title !== y.title ||
      x.date !== y.date ||
      x.endDate !== y.endDate ||
      x.startTime !== y.startTime ||
      x.endTime !== y.endTime ||
      x.color !== y.color ||
      x.calendarId !== y.calendarId ||
      x.location !== y.location ||
      x.notes !== y.notes ||
      x.createdAt !== y.createdAt ||
      x.updatedAt !== y.updatedAt ||
      x.googleEventId !== y.googleEventId ||
      x.googleCalendarId !== y.googleCalendarId ||
      (x.googleColorId ?? undefined) !== (y.googleColorId ?? undefined) ||
      x.googleEtag !== y.googleEtag ||
      x.googleRecurringEventId !== y.googleRecurringEventId ||
      x.googleSyncedUpdatedAt !== y.googleSyncedUpdatedAt
    ) {
      return false;
    }
  }
  return true;
}

function areCalendarListsEqual(a: CalendarGroup[], b: CalendarGroup[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i];
    const y = b[i];
    if (
      x.id !== y.id ||
      x.name !== y.name ||
      x.color !== y.color ||
      x.visible !== y.visible ||
      x.googleCalendarId !== y.googleCalendarId ||
      x.googleAccountCalendarId !== y.googleAccountCalendarId ||
      x.googleColorId !== y.googleColorId ||
      Boolean(x.googlePrimary) !== Boolean(y.googlePrimary) ||
      x.googleAccessRole !== y.googleAccessRole ||
      Boolean(x.readOnly) !== Boolean(y.readOnly)
    ) {
      return false;
    }
  }
  return true;
}

function areTodoListsEqual(a: TodoItem[], b: TodoItem[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i];
    const y = b[i];
    if (
      x.id !== y.id ||
      x.title !== y.title ||
      x.completed !== y.completed ||
      x.dueDate !== y.dueDate ||
      x.calendarId !== y.calendarId ||
      x.createdAt !== y.createdAt
    ) {
      return false;
    }
  }
  return true;
}

export function dedupeCalendarEventsByGoogleId(events: CalendarEvent[]): {
  events: CalendarEvent[];
  removedDuplicateIds: string[];
} {
  const byGoogleKey = new Map<string, CalendarEvent>();
  const removedDuplicateIds: string[] = [];
  const passthrough: CalendarEvent[] = [];

  for (const ev of events) {
    if (!ev.googleEventId) {
      passthrough.push(ev);
      continue;
    }
    const key = compositeGoogleEventKey(ev.googleEventId, ev.googleCalendarId);
    const existing = byGoogleKey.get(key);
    if (!existing) {
      byGoogleKey.set(key, ev);
      continue;
    }
    const keepIncoming = ev.updatedAt > existing.updatedAt;
    if (keepIncoming) {
      removedDuplicateIds.push(existing.id);
      byGoogleKey.set(key, ev);
    } else {
      removedDuplicateIds.push(ev.id);
    }
  }

  return {
    events: [...passthrough, ...byGoogleKey.values()],
    removedDuplicateIds,
  };
}

export const useCalendarStore = create<CalendarStoreState>()(
  persist(
    (set, get) => {
      const now = new Date();
      const zoned = getZonedDateTimeParts(now, getEffectiveTimezone());
      return {
        events: [],
        calendars: DEFAULT_CALENDARS,
        todos: [],
        pendingGoogleDeletions: [],
        showTodoSidebar: false,
        selectedDate: getTodayStr(),
        currentMonth: zoned.month - 1,
        currentYear: zoned.year,
        view: "week" as CalendarView,

        addCalendar: (name, color) => {
          const id = crypto.randomUUID();
          set((state) => ({
            calendars: [...state.calendars, { id, name, color, visible: true }],
          }));
          return id;
        },

        toggleCalendarVisibility: (id) => {
          set((state) => ({
            calendars: state.calendars.map((c) =>
              c.id === id ? { ...c, visible: !c.visible } : c
            ),
          }));
        },

        removeCalendar: (id) => {
          const state = get();
          const deletedEventIds: string[] = [];
          const googleDeletionsToAdd: GoogleCalendarDeletionInput[] = [];

          for (const event of state.events) {
            if (event.calendarId === id) {
              deletedEventIds.push(event.id);
              if (event.googleEventId) {
                googleDeletionsToAdd.push({
                  localId: event.id,
                  googleEventId: event.googleEventId,
                  googleCalendarId: event.googleCalendarId,
                });
              }
            }
          }

          const deletedTodoIds = state.todos.reduce<string[]>((acc, todo) => {
            if (todo.calendarId === id) {
              acc.push(todo.id);
            }
            return acc;
          }, []);

          set((prev) => {
            const seenGoogleKeys = new Set(
              prev.pendingGoogleDeletions.map((d) =>
                compositeGoogleEventKey(d.googleEventId, d.googleCalendarId)
              )
            );
            const mergedPending = [...prev.pendingGoogleDeletions];
            for (const item of googleDeletionsToAdd) {
              const key = compositeGoogleEventKey(
                item.googleEventId,
                item.googleCalendarId
              );
              if (!seenGoogleKeys.has(key)) {
                seenGoogleKeys.add(key);
                mergedPending.push(item);
              }
            }
            return {
              calendars: prev.calendars.filter((c) => c.id !== id),
              events: prev.events.filter((e) => e.calendarId !== id),
              todos: prev.todos.filter((t) => t.calendarId !== id),
              pendingGoogleDeletions: mergedPending,
            };
          });

          useCloudSyncStore.getState().markDeletedKeys("calendarIds", [id]);
          useCloudSyncStore
            .getState()
            .markDeletedKeys("calendarEventIds", deletedEventIds);
          useCloudSyncStore
            .getState()
            .markDeletedKeys("calendarTodoIds", deletedTodoIds);
        },

        addEvent: (eventData) => {
          const id = crypto.randomUUID();
          const timestamp = Date.now();
          const state = get();
          const defaultCalendar = getDefaultWritableCalendar(state.calendars);
          const calendarId =
            eventData.calendarId || defaultCalendar?.id || "home";
          const calendar = state.calendars.find((c) => c.id === calendarId);
          const calendarColor: EventColor = calendar?.color || "blue";

          const hasExplicitDistinctColor =
            eventData.color !== undefined &&
            !areEventColorsEquivalent(eventData.color, calendarColor);
          const color: EventColor = hasExplicitDistinctColor
            ? eventData.color!
            : calendarColor;
          const googleColorId =
            eventData.googleColorId !== undefined
              ? eventData.googleColorId
              : hasExplicitDistinctColor
                ? mapColorToClosestGoogleEventColorId(color)
                : undefined;
          const googleCalendarId =
            eventData.googleCalendarId ??
            (calendar?.googleCalendarId && !calendar.readOnly
              ? calendar.googleCalendarId
              : undefined);

          const endDate = eventData.startTime
            ? undefined
            : normalizeAllDayEndDate(eventData.date, eventData.endDate);
          const newEvent: CalendarEvent = {
            ...eventData,
            endDate,
            id,
            calendarId,
            color,
            ...(googleCalendarId ? { googleCalendarId } : {}),
            ...(googleColorId !== undefined ? { googleColorId } : {}),
            createdAt: timestamp,
            updatedAt: timestamp,
          };
          set((prev) => ({
            events: [...prev.events, newEvent],
            pendingGoogleDeletions: newEvent.googleEventId
              ? prev.pendingGoogleDeletions.filter(
                  (d) =>
                    !(
                      d.googleEventId === newEvent.googleEventId &&
                      (d.googleCalendarId || "primary") ===
                        (newEvent.googleCalendarId || "primary")
                    )
                )
              : prev.pendingGoogleDeletions,
          }));
          return id;
        },

        updateEvent: (id, updates) => {
          set((state) => {
            let nextPendingDeletions = state.pendingGoogleDeletions;
            const events = state.events.map((ev) => {
              if (ev.id !== id) return ev;

              const nextCalendarId = updates.calendarId ?? ev.calendarId;
              const targetCal = state.calendars.find(
                (c) => c.id === nextCalendarId
              );
              const calendarChanged =
                updates.calendarId !== undefined &&
                updates.calendarId !== ev.calendarId;

              let nextColor = updates.color ?? ev.color;
              let nextGoogleColorId =
                "googleColorId" in updates
                  ? updates.googleColorId
                  : ev.googleColorId;

              if (calendarChanged && targetCal) {
                const hadExplicitOverride = Boolean(ev.googleColorId);
                if (!hadExplicitOverride && updates.color === undefined) {
                  nextColor = targetCal.color;
                  nextGoogleColorId = undefined;
                }
              }

              if (updates.color !== undefined && !("googleColorId" in updates)) {
                if (
                  targetCal &&
                  areEventColorsEquivalent(updates.color, targetCal.color)
                ) {
                  nextColor = targetCal.color;
                  nextGoogleColorId =
                    ev.googleEventId && ev.googleColorId ? null : undefined;
                } else {
                  nextColor = updates.color;
                  nextGoogleColorId = mapColorToClosestGoogleEventColorId(
                    updates.color
                  );
                }
              }

              let googleIdentityPatch: Partial<CalendarEvent> = {};
              if (calendarChanged) {
                const oldGoogleCalId = ev.googleCalendarId || "primary";
                const newGoogleCalId = targetCal?.googleCalendarId;
                if (
                  ev.googleEventId &&
                  newGoogleCalId !== oldGoogleCalId
                ) {
                  const delKey = compositeGoogleEventKey(
                    ev.googleEventId,
                    oldGoogleCalId
                  );
                  if (
                    !nextPendingDeletions.some(
                      (d) =>
                        compositeGoogleEventKey(
                          d.googleEventId,
                          d.googleCalendarId
                        ) === delKey
                    )
                  ) {
                    nextPendingDeletions = [
                      ...nextPendingDeletions,
                      {
                        localId: ev.id,
                        googleEventId: ev.googleEventId,
                        googleCalendarId: oldGoogleCalId,
                      },
                    ];
                  }
                  googleIdentityPatch = {
                    googleEventId: undefined,
                    googleCalendarId:
                      targetCal && !targetCal.readOnly
                        ? newGoogleCalId
                        : undefined,
                    googleEtag: undefined,
                    googleRecurringEventId: undefined,
                    googleSyncedUpdatedAt: undefined,
                    // Moving to a new calendar means POST on destination; null override isn't needed on POST
                    ...(nextGoogleColorId === null
                      ? { googleColorId: undefined }
                      : {}),
                  };
                } else if (newGoogleCalId && !targetCal?.readOnly) {
                  googleIdentityPatch = { googleCalendarId: newGoogleCalId };
                }
              }

              const next: CalendarEvent = {
                ...ev,
                ...updates,
                ...googleIdentityPatch,
                calendarId: nextCalendarId,
                color: nextColor,
                googleColorId:
                  "googleColorId" in googleIdentityPatch
                    ? googleIdentityPatch.googleColorId
                    : nextGoogleColorId,
                updatedAt: Date.now(),
              };
              if (next.googleColorId === undefined) {
                delete next.googleColorId;
              }
              next.endDate = next.startTime
                ? undefined
                : normalizeAllDayEndDate(next.date, next.endDate);
              return next;
            });

            return {
              events,
              ...(nextPendingDeletions !== state.pendingGoogleDeletions
                ? { pendingGoogleDeletions: nextPendingDeletions }
                : {}),
            };
          });
        },

        deleteEvent: (id) => {
          const existing = get().events.find((ev) => id === ev.id);
          set((state) => {
            const existingKey = existing?.googleEventId
              ? compositeGoogleEventKey(
                  existing.googleEventId,
                  existing.googleCalendarId
                )
              : null;
            const nextPending =
              existing?.googleEventId &&
              existingKey &&
              !state.pendingGoogleDeletions.some(
                (d) =>
                  compositeGoogleEventKey(
                    d.googleEventId,
                    d.googleCalendarId
                  ) === existingKey
              )
                ? [
                    ...state.pendingGoogleDeletions,
                    {
                      localId: existing.id,
                      googleEventId: existing.googleEventId,
                      googleCalendarId: existing.googleCalendarId,
                    },
                  ]
                : state.pendingGoogleDeletions;
            return {
              events: state.events.filter((ev) => ev.id !== id),
              pendingGoogleDeletions: nextPending,
            };
          });
          useCloudSyncStore.getState().markDeletedKeys("calendarEventIds", [id]);
        },

        discardAllLocalEventsForGoogleSync: () => {
          const current = get();
          const deletedIds = current.events.map((ev) => ev.id);
          const removedCalendarIds = current.calendars
            .filter((c) => !c.googleCalendarId)
            .map((c) => c.id);
          const remainingCalendars = current.calendars.filter((c) =>
            Boolean(c.googleCalendarId)
          );

          set({
            events: [],
            calendars: remainingCalendars,
            pendingGoogleDeletions: [],
          });
          if (deletedIds.length > 0) {
            useCloudSyncStore
              .getState()
              .markDeletedKeys("calendarEventIds", deletedIds);
          }
          if (removedCalendarIds.length > 0) {
            useCloudSyncStore
              .getState()
              .markDeletedKeys("calendarIds", removedCalendarIds);
          }
          return deletedIds;
        },

        applyGoogleCalendarSyncResult: (response) => {
          const removedLocalIds: string[] = [];
          const upsertedLocalIds: string[] = [];
          const removedCalendarIds: string[] = [];
          const upsertedCalendarIds: string[] = [];

          set((state) => {
            // 1. Reconcile synced Google calendars (if provided by API response).
            let candidateCalendars: CalendarGroup[] = state.calendars;
            const removedGoogleCalGroupIds = new Set<string>();

            if (Array.isArray(response.remoteCalendars)) {
              const existingByGoogleCalId = new Map<string, CalendarGroup>();
              const existingById = new Map<string, CalendarGroup>();
              for (const cal of state.calendars) {
                existingById.set(cal.id, cal);
                if (cal.googleCalendarId) {
                  existingByGoogleCalId.set(cal.googleCalendarId, cal);
                }
              }

              const syncedGoogleCalendars: CalendarGroup[] = [];
              const activeSyncedGroupIds = new Set<string>();

              for (const rc of response.remoteCalendars) {
                const prev =
                  existingByGoogleCalId.get(rc.googleCalendarId) ??
                  existingById.get(rc.id);
                const nextGroup: CalendarGroup = {
                  id: rc.id,
                  name: rc.name,
                  color: rc.color,
                  visible: prev ? prev.visible : rc.selected !== false,
                  googleCalendarId: rc.googleCalendarId,
                  ...(rc.googleAccountCalendarId
                    ? { googleAccountCalendarId: rc.googleAccountCalendarId }
                    : {}),
                  ...(rc.googleColorId
                    ? { googleColorId: rc.googleColorId }
                    : {}),
                  ...(rc.googlePrimary ? { googlePrimary: true } : {}),
                  ...(rc.googleAccessRole
                    ? { googleAccessRole: rc.googleAccessRole }
                    : {}),
                  ...(rc.readOnly !== undefined
                    ? { readOnly: rc.readOnly }
                    : {}),
                };
                syncedGoogleCalendars.push(nextGroup);
                activeSyncedGroupIds.add(nextGroup.id);
                upsertedCalendarIds.push(nextGroup.id);
              }

              for (const prevCal of state.calendars) {
                if (
                  prevCal.googleCalendarId &&
                  !activeSyncedGroupIds.has(prevCal.id)
                ) {
                  removedGoogleCalGroupIds.add(prevCal.id);
                  removedCalendarIds.push(prevCal.id);
                }
              }

              const nonGoogleCalendars = state.calendars.filter(
                (c) => !c.googleCalendarId
              );
              candidateCalendars = [
                ...syncedGoogleCalendars,
                ...nonGoogleCalendars,
              ];
            }

            // 2. Build deletion & full-sync lookup sets.
            const ackedDeleteLocalIds = new Set(response.deletedLocalIds);
            const hasCompositeDeletes = Array.isArray(
              response.remoteDeletedEvents
            );
            const remoteDeletedCompositeSet = new Set(
              (response.remoteDeletedEvents || []).map((d) =>
                compositeGoogleEventKey(d.googleEventId, d.googleCalendarId)
              )
            );
            const remoteDeletedLegacySet = new Set(
              response.remoteDeletedGoogleIds
            );

            const isRemoteDeleted = (
              googleEventId: string,
              googleCalendarId?: string
            ): boolean => {
              if (hasCompositeDeletes) {
                return remoteDeletedCompositeSet.has(
                  compositeGoogleEventKey(googleEventId, googleCalendarId)
                );
              }
              return remoteDeletedLegacySet.has(googleEventId);
            };

            const hasPerCalFullSync = Array.isArray(
              response.fullSyncGoogleCalendarIds
            );
            const fullSyncCalSet = new Set(
              response.fullSyncGoogleCalendarIds || []
            );
            const isFullSyncForCal = (googleCalendarId?: string): boolean => {
              if (hasPerCalFullSync) {
                return fullSyncCalSet.has(googleCalendarId || "primary");
              }
              return Boolean(response.fullSync);
            };

            const nextPendingDeletions = state.pendingGoogleDeletions.filter(
              (d) =>
                !ackedDeleteLocalIds.has(d.localId) &&
                !isRemoteDeleted(d.googleEventId, d.googleCalendarId)
            );
            const pendingCompositeKeys = new Set(
              nextPendingDeletions.map((d) =>
                compositeGoogleEventKey(d.googleEventId, d.googleCalendarId)
              )
            );

            const pushedById = new Map(
              response.pushed.map((item) => [item.localId, item.event])
            );
            const remoteUpsertsFiltered = response.remoteUpserts.filter(
              (ev) =>
                !ev.googleEventId ||
                !pendingCompositeKeys.has(
                  compositeGoogleEventKey(ev.googleEventId, ev.googleCalendarId)
                )
            );
            const remoteCompositeKeys = new Set(
              remoteUpsertsFiltered
                .filter((ev) => Boolean(ev.googleEventId))
                .map((ev) =>
                  compositeGoogleEventKey(
                    ev.googleEventId!,
                    ev.googleCalendarId
                  )
                )
            );

            const calendarById = new Map(
              candidateCalendars.map((c) => [c.id, c])
            );
            const calendarByGoogleId = new Map<string, CalendarGroup>();
            for (const c of candidateCalendars) {
              if (c.googleCalendarId) {
                calendarByGoogleId.set(c.googleCalendarId, c);
              }
              if (c.googleAccountCalendarId) {
                calendarByGoogleId.set(c.googleAccountCalendarId, c);
              }
            }
            const defaultCal =
              getDefaultWritableCalendar(candidateCalendars) ??
              candidateCalendars[0];
            const defaultCalendarId = defaultCal?.id || "home";

            const resolveValidCalendarId = (
              preferredId?: string,
              googleCalId?: string
            ): string => {
              if (googleCalId) {
                const matchedGoogleCal = calendarByGoogleId.get(googleCalId);
                if (matchedGoogleCal) return matchedGoogleCal.id;
              }
              if (preferredId && calendarById.has(preferredId)) {
                return preferredId;
              }
              return defaultCalendarId;
            };

            // 3. Reconcile existing local events.
            const surviving: CalendarEvent[] = [];
            for (const ev of state.events) {
              if (
                ev.calendarId &&
                removedGoogleCalGroupIds.has(ev.calendarId)
              ) {
                removedLocalIds.push(ev.id);
                continue;
              }
              if (
                ev.googleEventId &&
                isRemoteDeleted(ev.googleEventId, ev.googleCalendarId)
              ) {
                removedLocalIds.push(ev.id);
                continue;
              }
              if (
                ev.googleEventId &&
                isFullSyncForCal(ev.googleCalendarId) &&
                !remoteCompositeKeys.has(
                  compositeGoogleEventKey(ev.googleEventId, ev.googleCalendarId)
                ) &&
                !pushedById.has(ev.id)
              ) {
                const hasUnsyncedLocalEdit =
                  ev.googleSyncedUpdatedAt !== undefined
                    ? ev.updatedAt > ev.googleSyncedUpdatedAt
                    : false;
                if (!hasUnsyncedLocalEdit) {
                  removedLocalIds.push(ev.id);
                  continue;
                }
              }

              const pushed = pushedById.get(ev.id);
              if (pushed) {
                const resolvedCalId = resolveValidCalendarId(
                  pushed.calendarId || ev.calendarId,
                  pushed.googleCalendarId
                );
                if (ev.updatedAt > pushed.updatedAt) {
                  // Edited locally while sync request was in flight; preserve local edits + adopt Google IDs.
                  surviving.push({
                    ...ev,
                    calendarId: resolvedCalId,
                    googleEventId: pushed.googleEventId,
                    googleCalendarId: pushed.googleCalendarId,
                    googleEtag: pushed.googleEtag,
                    googleSyncedUpdatedAt: pushed.googleSyncedUpdatedAt,
                  });
                } else {
                  const targetCal = calendarById.get(resolvedCalId);
                  const nextColor =
                    pushed.googleColorId
                      ? pushed.color
                      : targetCal?.color || pushed.color;
                  const cleanPushed: CalendarEvent = {
                    ...pushed,
                    calendarId: resolvedCalId,
                    color: nextColor,
                  };
                  if (!cleanPushed.googleColorId) {
                    delete cleanPushed.googleColorId;
                  }
                  surviving.push(cleanPushed);
                }
              } else {
                surviving.push(ev);
              }
            }

            // 4. Merge remote upserts (matching by id or composite (googleCalendarId, googleEventId)).
            const byId = new Map<string, CalendarEvent>();
            const idByCompositeKey = new Map<string, string>();
            for (const ev of surviving) {
              byId.set(ev.id, ev);
              if (ev.googleEventId) {
                idByCompositeKey.set(
                  compositeGoogleEventKey(ev.googleEventId, ev.googleCalendarId),
                  ev.id
                );
              }
            }

            for (const remote of remoteUpsertsFiltered) {
              const remoteComposite = remote.googleEventId
                ? compositeGoogleEventKey(
                    remote.googleEventId,
                    remote.googleCalendarId
                  )
                : null;
              const existingId =
                (byId.has(remote.id) ? remote.id : undefined) ??
                (remoteComposite
                  ? idByCompositeKey.get(remoteComposite)
                  : undefined);
              const existing = existingId ? byId.get(existingId) : undefined;

              const resolvedCalId = resolveValidCalendarId(
                remote.calendarId,
                remote.googleCalendarId
              );
              const resolvedCal = calendarById.get(resolvedCalId);

              if (existing) {
                const hasUnsyncedLocalEdit =
                  existing.googleSyncedUpdatedAt !== undefined
                    ? existing.updatedAt > existing.googleSyncedUpdatedAt
                    : false;
                if (hasUnsyncedLocalEdit && existing.updatedAt > remote.updatedAt) {
                  const localTargetCalId =
                    existing.calendarId &&
                    calendarById.has(existing.calendarId) &&
                    !BUILTIN_DEFAULT_CALENDAR_IDS.has(existing.calendarId)
                      ? existing.calendarId
                      : resolvedCalId;
                  byId.set(existing.id, {
                    ...existing,
                    calendarId: localTargetCalId,
                    googleEventId: remote.googleEventId ?? existing.googleEventId,
                    googleCalendarId:
                      remote.googleCalendarId ?? existing.googleCalendarId,
                    googleEtag: remote.googleEtag ?? existing.googleEtag,
                  });
                } else {
                  const effectiveColor = remote.googleColorId
                    ? remote.color
                    : resolvedCal?.color || remote.color;
                  const updatedExisting: CalendarEvent = {
                    ...remote,
                    id: existing.id,
                    calendarId: resolvedCalId,
                    color: effectiveColor,
                    googleSyncedUpdatedAt: remote.updatedAt,
                  };
                  if (!remote.googleColorId) {
                    delete updatedExisting.googleColorId;
                  }
                  byId.set(existing.id, updatedExisting);
                }
              } else {
                const effectiveColor = remote.googleColorId
                  ? remote.color
                  : resolvedCal?.color || remote.color;
                const inserted: CalendarEvent = {
                  ...remote,
                  calendarId: resolvedCalId,
                  color: effectiveColor,
                  googleSyncedUpdatedAt: remote.updatedAt,
                };
                if (!remote.googleColorId) {
                  delete inserted.googleColorId;
                }
                byId.set(inserted.id, inserted);
                if (inserted.googleEventId) {
                  idByCompositeKey.set(
                    compositeGoogleEventKey(
                      inserted.googleEventId,
                      inserted.googleCalendarId
                    ),
                    inserted.id
                  );
                }
                upsertedLocalIds.push(inserted.id);
              }
            }

            // 5. Propagate calendar color updates (and group migrations) to clean synced events
            // that inherit their Google calendar's color (without bumping `updatedAt`).
            const nextEvents: CalendarEvent[] = [];
            for (const ev of byId.values()) {
              if (ev.googleEventId && !ev.googleColorId) {
                const matchedGoogleCal = calendarByGoogleId.get(
                  ev.googleCalendarId || "primary"
                );
                if (matchedGoogleCal) {
                  const desiredCalId = matchedGoogleCal.id;
                  const desiredColor = matchedGoogleCal.color;
                  if (
                    ev.calendarId !== desiredCalId ||
                    ev.color !== desiredColor
                  ) {
                    nextEvents.push({
                      ...ev,
                      calendarId: desiredCalId,
                      color: desiredColor,
                    });
                    continue;
                  }
                }
              }
              nextEvents.push(ev);
            }

            // 6. Prune unused built-in default `Home`/`Work` calendars once Google calendars
            // are active, and re-home any todos referencing removed/pruned calendars.
            const hasGoogleCalendars = candidateCalendars.some((c) =>
              Boolean(c.googleCalendarId)
            );
            let nextCalendars = candidateCalendars;
            const prunedDefaultCalIds = new Set<string>();
            if (hasGoogleCalendars) {
              const eventCalIds = new Set(
                nextEvents.map((e) => e.calendarId || "home")
              );
              nextCalendars = candidateCalendars.filter((c) => {
                if (
                  !c.googleCalendarId &&
                  BUILTIN_DEFAULT_CALENDAR_IDS.has(c.id) &&
                  !eventCalIds.has(c.id)
                ) {
                  prunedDefaultCalIds.add(c.id);
                  removedCalendarIds.push(c.id);
                  return false;
                }
                return true;
              });
            }

            const finalValidCalIds = new Set(nextCalendars.map((c) => c.id));
            const fallbackTodoCalId =
              (getDefaultWritableCalendar(nextCalendars) ?? nextCalendars[0])
                ?.id || "home";
            const nextTodos = state.todos.map((todo) =>
              finalValidCalIds.has(todo.calendarId)
                ? todo
                : { ...todo, calendarId: fallbackTodoCalId }
            );

            const eventsChanged = !areEventListsEqual(state.events, nextEvents);
            const calendarsChanged = !areCalendarListsEqual(
              state.calendars,
              nextCalendars
            );
            const todosChanged = !areTodoListsEqual(state.todos, nextTodos);
            const deletionsChanged =
              state.pendingGoogleDeletions.length !==
                nextPendingDeletions.length ||
              state.pendingGoogleDeletions.some(
                (d, idx) =>
                  d.localId !== nextPendingDeletions[idx]?.localId ||
                  d.googleEventId !== nextPendingDeletions[idx]?.googleEventId ||
                  (d.googleCalendarId || "primary") !==
                    (nextPendingDeletions[idx]?.googleCalendarId || "primary")
              );

            if (
              !eventsChanged &&
              !calendarsChanged &&
              !todosChanged &&
              !deletionsChanged
            ) {
              return state;
            }

            return {
              ...(eventsChanged ? { events: nextEvents } : {}),
              ...(calendarsChanged ? { calendars: nextCalendars } : {}),
              ...(todosChanged ? { todos: nextTodos } : {}),
              ...(deletionsChanged
                ? { pendingGoogleDeletions: nextPendingDeletions }
                : {}),
            };
          });

          if (removedLocalIds.length > 0) {
            useCloudSyncStore
              .getState()
              .markDeletedKeys("calendarEventIds", removedLocalIds);
          }
          if (upsertedLocalIds.length > 0) {
            useCloudSyncStore
              .getState()
              .clearDeletedKeys("calendarEventIds", upsertedLocalIds);
          }
          if (removedCalendarIds.length > 0) {
            useCloudSyncStore
              .getState()
              .markDeletedKeys("calendarIds", removedCalendarIds);
          }
          if (upsertedCalendarIds.length > 0) {
            useCloudSyncStore
              .getState()
              .clearDeletedKeys("calendarIds", upsertedCalendarIds);
          }
        },

        detachGoogleCalendarMetadata: () => {
          set((state) => {
            const nextCalendars = state.calendars.map((cal) => {
              if (
                !cal.googleCalendarId &&
                !cal.googleAccountCalendarId &&
                !cal.googleColorId &&
                !cal.googlePrimary &&
                !cal.googleAccessRole &&
                cal.readOnly === undefined
              ) {
                return cal;
              }
              const {
                googleCalendarId: _gcid,
                googleAccountCalendarId: _gacid,
                googleColorId: _gcol,
                googlePrimary: _gprim,
                googleAccessRole: _grole,
                readOnly: _gro,
                ...rest
              } = cal;
              return rest;
            });

            return {
              pendingGoogleDeletions: [],
              calendars:
                nextCalendars.length > 0 ? nextCalendars : DEFAULT_CALENDARS,
              events: state.events.map((ev) => {
                if (
                  !ev.googleEventId &&
                  !ev.googleCalendarId &&
                  ev.googleColorId === undefined &&
                  !ev.googleEtag &&
                  !ev.googleRecurringEventId &&
                  ev.googleSyncedUpdatedAt === undefined
                ) {
                  return ev;
                }
                const {
                  googleEventId: _gid,
                  googleCalendarId: _gcid,
                  googleColorId: _gcol,
                  googleEtag: _getag,
                  googleRecurringEventId: _grid,
                  googleSyncedUpdatedAt: _gsync,
                  ...rest
                } = ev;
                return rest;
              }),
            };
          });
        },

        addTodo: (title, calendarId, dueDate) => {
          const id = crypto.randomUUID();
          const fallbackCalId =
            calendarId ||
            getDefaultWritableCalendar(get().calendars)?.id ||
            get().calendars[0]?.id ||
            "home";
          set((state) => ({
            todos: [
              ...state.todos,
              {
                id,
                title,
                completed: false,
                dueDate: dueDate || null,
                calendarId: fallbackCalId,
                createdAt: Date.now(),
              },
            ],
          }));
          return id;
        },

        toggleTodo: (id) => {
          set((state) => ({
            todos: state.todos.map((t) =>
              t.id === id ? { ...t, completed: !t.completed } : t
            ),
          }));
        },

        updateTodo: (id, updates) => {
          set((state) => ({
            todos: state.todos.map((todo) =>
              todo.id === id ? { ...todo, ...updates } : todo
            ),
          }));
        },

        deleteTodo: (id) => {
          set((state) => ({
            todos: state.todos.filter((t) => t.id !== id),
          }));
          useCloudSyncStore.getState().markDeletedKeys("calendarTodoIds", [id]);
        },

        setShowTodoSidebar: (show) => set({ showTodoSidebar: show }),

        setSelectedDate: (date) => {
          const [year, month] = date.split("-").map(Number);
          set({
            selectedDate: date,
            currentYear: year,
            currentMonth: month - 1,
          });
        },

        setView: (view) => set({ view }),

        navigateMonth: (delta) => {
          set((state) => {
            let newMonth = state.currentMonth + delta;
            let newYear = state.currentYear;
            if (newMonth > 11) {
              newMonth = 0;
              newYear += 1;
            } else if (newMonth < 0) {
              newMonth = 11;
              newYear -= 1;
            }
            return { currentMonth: newMonth, currentYear: newYear };
          });
        },

        navigateWeek: (delta) => {
          set((state) => {
            const [y, m, d] = state.selectedDate.split("-").map(Number);
            const current = new Date(y, m - 1, d);
            current.setDate(current.getDate() + delta * 7);
            const newDate = formatDate(current);
            return {
              selectedDate: newDate,
              currentYear: current.getFullYear(),
              currentMonth: current.getMonth(),
            };
          });
        },

        goToToday: () => {
          const now = new Date();
          const zoned = getZonedDateTimeParts(now, getEffectiveTimezone());
          set({
            selectedDate: formatZonedDateString(now, getEffectiveTimezone()),
            currentMonth: zoned.month - 1,
            currentYear: zoned.year,
          });
        },

        getEventsForDate: (date) => {
          const state = get();
          const fallbackCalId = state.calendars[0]?.id || "home";
          const allCalendarIds = new Set(state.calendars.map((c) => c.id));
          const visibleCalendarIds = new Set(
            state.calendars.reduce<string[]>((acc, calendar) => {
              if (calendar.visible) {
                acc.push(calendar.id);
              }
              return acc;
            }, [])
          );
          return state.events.filter((ev) => {
            if (!calendarEventOccursOnDate(ev, date)) return false;
            const calId =
              ev.calendarId && allCalendarIds.has(ev.calendarId)
                ? ev.calendarId
                : fallbackCalId;
            return visibleCalendarIds.has(calId);
          });
        },

        getEventsForMonth: (year, month) => {
          const state = get();
          const startDate = `${year}-${String(month + 1).padStart(2, "0")}-01`;
          const endDate = formatDate(new Date(year, month + 1, 0));
          const fallbackCalId = state.calendars[0]?.id || "home";
          const allCalendarIds = new Set(state.calendars.map((c) => c.id));
          const visibleCalendarIds = new Set(
            state.calendars.reduce<string[]>((acc, calendar) => {
              if (calendar.visible) {
                acc.push(calendar.id);
              }
              return acc;
            }, [])
          );
          return state.events.filter((ev) => {
            if (!calendarEventOverlapsDateRange(ev, startDate, endDate)) {
              return false;
            }
            const calId =
              ev.calendarId && allCalendarIds.has(ev.calendarId)
                ? ev.calendarId
                : fallbackCalId;
            return visibleCalendarIds.has(calId);
          });
        },
      };
    },
    {
      name: STORAGE_KEYS.calendar,
      storage: createIndexedDBPersistStorage({
        legacyNames: [LEGACY_STORAGE_KEYS.calendar],
      }),
      // Do not persist viewport — opening Calendar should show today, not last session.
      partialize: (state) => ({
        events: state.events,
        calendars: state.calendars,
        todos: state.todos,
        pendingGoogleDeletions: state.pendingGoogleDeletions,
        showTodoSidebar: state.showTodoSidebar,
        view: state.view,
      }),
      merge: (persistedState, currentState) => {
        const now = new Date();
        const tz = getEffectiveTimezone();
        const zoned = getZonedDateTimeParts(now, tz);
        const p = persistedState as Partial<CalendarStoreState>;
        return {
          ...currentState,
          ...p,
          pendingGoogleDeletions: Array.isArray(p?.pendingGoogleDeletions)
            ? p.pendingGoogleDeletions
            : [],
          // Always land on "today" in the user's effective timezone on rehydrate.
          selectedDate: formatZonedDateString(now, tz),
          currentMonth: zoned.month - 1,
          currentYear: zoned.year,
        };
      },
    }
  )
);
