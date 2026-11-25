import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useCloudSyncStore } from "@/stores/useCloudSyncStore";
import { createIndexedDBPersistStorage } from "@/utils/indexedDBPersistStorage";
import {
  calendarEventOccursOnDate,
  calendarEventOverlapsDateRange,
  normalizeAllDayEndDate,
} from "@/shared/calendarEventDates";
import type {
  GoogleCalendarDeletionInput,
  GoogleCalendarSyncResponse,
} from "@/shared/contracts/google";
import {
  formatZonedDateString,
  getEffectiveTimezone,
  getZonedDateTimeParts,
} from "@/lib/timezoneConfig";
import { LEGACY_STORAGE_KEYS, STORAGE_KEYS } from "@/utils/storageKeys";

export type EventColor = "blue" | "red" | "green" | "orange" | "purple";

export interface CalendarGroup {
  id: string;
  name: string;
  color: EventColor;
  visible: boolean;
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
  googleEtag?: string;
  googleRecurringEventId?: string;
  googleSyncedUpdatedAt?: number;
}

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
  addEvent: (
    event: Omit<CalendarEvent, "id" | "createdAt" | "updatedAt">
  ) => string;
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
    updates: Partial<Pick<TodoItem, "title" | "calendarId" | "dueDate" | "completed">>
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
      x.googleEtag !== y.googleEtag ||
      x.googleRecurringEventId !== y.googleRecurringEventId ||
      x.googleSyncedUpdatedAt !== y.googleSyncedUpdatedAt
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
  const byGoogleId = new Map<string, CalendarEvent>();
  const removedDuplicateIds: string[] = [];
  const passthrough: CalendarEvent[] = [];

  for (const ev of events) {
    if (!ev.googleEventId) {
      passthrough.push(ev);
      continue;
    }
    const existing = byGoogleId.get(ev.googleEventId);
    if (!existing) {
      byGoogleId.set(ev.googleEventId, ev);
      continue;
    }
    const keepIncoming = ev.updatedAt > existing.updatedAt;
    if (keepIncoming) {
      removedDuplicateIds.push(existing.id);
      byGoogleId.set(ev.googleEventId, ev);
    } else {
      removedDuplicateIds.push(ev.id);
    }
  }

  return {
    events: [...passthrough, ...byGoogleId.values()],
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
            const seenGoogleIds = new Set(
              prev.pendingGoogleDeletions.map((d) => d.googleEventId)
            );
            const mergedPending = [...prev.pendingGoogleDeletions];
            for (const item of googleDeletionsToAdd) {
              if (!seenGoogleIds.has(item.googleEventId)) {
                seenGoogleIds.add(item.googleEventId);
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
          const calendarId = eventData.calendarId || get().calendars[0]?.id || "home";
          const calendar = get().calendars.find((c) => c.id === calendarId);
          const endDate = eventData.startTime
            ? undefined
            : normalizeAllDayEndDate(eventData.date, eventData.endDate);
          const newEvent: CalendarEvent = {
            ...eventData,
            endDate,
            id,
            calendarId,
            color: calendar?.color || eventData.color,
            createdAt: timestamp,
            updatedAt: timestamp,
          };
          set((state) => ({
            events: [...state.events, newEvent],
          }));
          return id;
        },

        updateEvent: (id, updates) => {
          set((state) => ({
            events: state.events.map((ev) => {
              if (ev.id !== id) return ev;
              const next = { ...ev, ...updates, updatedAt: Date.now() };
              next.endDate = next.startTime
                ? undefined
                : normalizeAllDayEndDate(next.date, next.endDate);
              return next;
            }),
          }));
        },

        deleteEvent: (id) => {
          const existing = get().events.find((ev) => ev.id === id);
          set((state) => {
            const nextPending =
              existing?.googleEventId &&
              !state.pendingGoogleDeletions.some(
                (d) => d.googleEventId === existing.googleEventId
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
          const deletedIds = get().events.map((ev) => ev.id);
          set({
            events: [],
            pendingGoogleDeletions: [],
          });
          if (deletedIds.length > 0) {
            useCloudSyncStore
              .getState()
              .markDeletedKeys("calendarEventIds", deletedIds);
          }
          return deletedIds;
        },

        applyGoogleCalendarSyncResult: (response) => {
          const removedLocalIds: string[] = [];
          const upsertedLocalIds: string[] = [];

          set((state) => {
            const ackedDeleteLocalIds = new Set(response.deletedLocalIds);
            const remoteDeletedSet = new Set(response.remoteDeletedGoogleIds);
            const nextPendingDeletions = state.pendingGoogleDeletions.filter(
              (d) =>
                !ackedDeleteLocalIds.has(d.localId) &&
                !remoteDeletedSet.has(d.googleEventId)
            );
            const pendingGoogleIds = new Set(
              nextPendingDeletions.map((d) => d.googleEventId)
            );

            const pushedById = new Map(
              response.pushed.map((item) => [item.localId, item.event])
            );
            const remoteUpsertsFiltered = response.remoteUpserts.filter(
              (ev) => !ev.googleEventId || !pendingGoogleIds.has(ev.googleEventId)
            );
            const remoteGoogleIds = new Set(
              remoteUpsertsFiltered
                .map((ev) => ev.googleEventId)
                .filter((id): id is string => Boolean(id))
            );

            const defaultCalendarId = state.calendars[0]?.id || "home";
            const validCalendarIds = new Set(state.calendars.map((c) => c.id));

            const surviving: CalendarEvent[] = [];
            for (const ev of state.events) {
              if (ev.googleEventId && remoteDeletedSet.has(ev.googleEventId)) {
                removedLocalIds.push(ev.id);
                continue;
              }
              if (
                response.fullSync &&
                ev.googleEventId &&
                !remoteGoogleIds.has(ev.googleEventId) &&
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
                if (ev.updatedAt > pushed.updatedAt) {
                  // Edited locally while sync request was in flight; preserve local edits + adopt Google IDs.
                  surviving.push({
                    ...ev,
                    googleEventId: pushed.googleEventId,
                    googleCalendarId: pushed.googleCalendarId,
                    googleEtag: pushed.googleEtag,
                    googleSyncedUpdatedAt: pushed.googleSyncedUpdatedAt,
                  });
                } else {
                  surviving.push({
                    ...pushed,
                    calendarId: ev.calendarId || pushed.calendarId || defaultCalendarId,
                    color: ev.color || pushed.color,
                  });
                }
              } else {
                surviving.push(ev);
              }
            }

            const byId = new Map<string, CalendarEvent>();
            const idByGoogleId = new Map<string, string>();
            for (const ev of surviving) {
              byId.set(ev.id, ev);
              if (ev.googleEventId) {
                idByGoogleId.set(ev.googleEventId, ev.id);
              }
            }

            for (const remote of remoteUpsertsFiltered) {
              const existingId =
                (byId.has(remote.id) ? remote.id : undefined) ??
                (remote.googleEventId
                  ? idByGoogleId.get(remote.googleEventId)
                  : undefined);
              const existing = existingId ? byId.get(existingId) : undefined;

              if (existing) {
                const hasUnsyncedLocalEdit =
                  existing.googleSyncedUpdatedAt !== undefined
                    ? existing.updatedAt > existing.googleSyncedUpdatedAt
                    : false;
                if (hasUnsyncedLocalEdit && existing.updatedAt > remote.updatedAt) {
                  byId.set(existing.id, {
                    ...existing,
                    googleEventId: remote.googleEventId ?? existing.googleEventId,
                    googleCalendarId:
                      remote.googleCalendarId ?? existing.googleCalendarId,
                    googleEtag: remote.googleEtag ?? existing.googleEtag,
                  });
                } else {
                  const calendarId =
                    existing.calendarId && validCalendarIds.has(existing.calendarId)
                      ? existing.calendarId
                      : validCalendarIds.has(remote.calendarId || "")
                        ? remote.calendarId
                        : defaultCalendarId;
                  byId.set(existing.id, {
                    ...remote,
                    id: existing.id,
                    calendarId,
                    color: existing.color || remote.color,
                    googleSyncedUpdatedAt: remote.updatedAt,
                  });
                }
              } else {
                const calendarId = validCalendarIds.has(remote.calendarId || "")
                  ? remote.calendarId!
                  : defaultCalendarId;
                const calendarColor =
                  state.calendars.find((c) => c.id === calendarId)?.color ||
                  remote.color;
                const inserted: CalendarEvent = {
                  ...remote,
                  calendarId,
                  color: remote.color || calendarColor,
                  googleSyncedUpdatedAt: remote.updatedAt,
                };
                byId.set(inserted.id, inserted);
                if (inserted.googleEventId) {
                  idByGoogleId.set(inserted.googleEventId, inserted.id);
                }
                upsertedLocalIds.push(inserted.id);
              }
            }

            const nextEvents = Array.from(byId.values());
            const eventsChanged = !areEventListsEqual(state.events, nextEvents);
            const deletionsChanged =
              state.pendingGoogleDeletions.length !== nextPendingDeletions.length ||
              state.pendingGoogleDeletions.some(
                (d, idx) =>
                  d.localId !== nextPendingDeletions[idx]?.localId ||
                  d.googleEventId !== nextPendingDeletions[idx]?.googleEventId
              );

            if (!eventsChanged && !deletionsChanged) {
              return state;
            }

            return {
              ...(eventsChanged ? { events: nextEvents } : {}),
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
        },

        detachGoogleCalendarMetadata: () => {
          set((state) => ({
            pendingGoogleDeletions: [],
            events: state.events.map((ev) => {
              if (
                !ev.googleEventId &&
                !ev.googleCalendarId &&
                !ev.googleEtag &&
                !ev.googleRecurringEventId &&
                ev.googleSyncedUpdatedAt === undefined
              ) {
                return ev;
              }
              const {
                googleEventId: _gid,
                googleCalendarId: _gcid,
                googleEtag: _getag,
                googleRecurringEventId: _grid,
                googleSyncedUpdatedAt: _gsync,
                ...rest
              } = ev;
              return rest;
            }),
          }));
        },

        addTodo: (title, calendarId, dueDate) => {
          const id = crypto.randomUUID();
          set((state) => ({
            todos: [...state.todos, {
              id,
              title,
              completed: false,
              dueDate: dueDate || null,
              calendarId,
              createdAt: Date.now(),
            }],
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
          const visibleCalendarIds = new Set(
            state.calendars.reduce<string[]>((acc, calendar) => {
              if (calendar.visible) {
                acc.push(calendar.id);
              }
              return acc;
            }, [])
          );
          return state.events.filter(
            (ev) =>
              calendarEventOccursOnDate(ev, date) &&
              visibleCalendarIds.has(ev.calendarId || "home")
          );
        },

        getEventsForMonth: (year, month) => {
          const state = get();
          const startDate = `${year}-${String(month + 1).padStart(2, "0")}-01`;
          const endDate = formatDate(new Date(year, month + 1, 0));
          const visibleCalendarIds = new Set(
            state.calendars.reduce<string[]>((acc, calendar) => {
              if (calendar.visible) {
                acc.push(calendar.id);
              }
              return acc;
            }, [])
          );
          return state.events.filter(
            (ev) =>
              calendarEventOverlapsDateRange(ev, startDate, endDate) &&
              visibleCalendarIds.has(ev.calendarId || "home")
          );
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
