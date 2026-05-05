import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useCloudSyncStore } from "@/stores/useCloudSyncStore";

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
  startTime?: string; // HH:MM (optional — all-day if omitted)
  endTime?: string; // HH:MM
  color: EventColor;
  calendarId?: string;
  /** Optional location line (shown under the title in the tray editor). */
  location?: string;
  notes?: string;
  createdAt: number;
  updatedAt: number;
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

/** Get today as YYYY-MM-DD */
const getTodayStr = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Format a Date as YYYY-MM-DD */
const formatDate = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const useCalendarStore = create<CalendarStoreState>()(
  persist(
    (set, get) => {
      const now = new Date();
      return {
        events: [],
        calendars: DEFAULT_CALENDARS,
        todos: [],
        showTodoSidebar: false,
        selectedDate: getTodayStr(),
        currentMonth: now.getMonth(),
        currentYear: now.getFullYear(),
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
          const deletedEventIds = state.events
            .filter((event) => event.calendarId === id)
            .map((event) => event.id);
          const deletedTodoIds = state.todos
            .filter((todo) => todo.calendarId === id)
            .map((todo) => todo.id);

          set((state) => ({
            calendars: state.calendars.filter((c) => c.id !== id),
            events: state.events.filter((e) => e.calendarId !== id),
            todos: state.todos.filter((t) => t.calendarId !== id),
          }));

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
          const newEvent: CalendarEvent = {
            ...eventData,
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
            events: state.events.map((ev) =>
              ev.id === id
                ? { ...ev, ...updates, updatedAt: Date.now() }
                : ev
            ),
          }));
        },

        deleteEvent: (id) => {
          set((state) => ({
            events: state.events.filter((ev) => ev.id !== id),
          }));
          useCloudSyncStore.getState().markDeletedKeys("calendarEventIds", [id]);
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
          set({
            selectedDate: getTodayStr(),
            currentMonth: now.getMonth(),
            currentYear: now.getFullYear(),
          });
        },

        getEventsForDate: (date) => {
          const state = get();
          const visibleCalendarIds = new Set(
            state.calendars.filter((c) => c.visible).map((c) => c.id)
          );
          return state.events.filter(
            (ev) => ev.date === date && visibleCalendarIds.has(ev.calendarId || "home")
          );
        },

        getEventsForMonth: (year, month) => {
          const state = get();
          const prefix = `${year}-${String(month + 1).padStart(2, "0")}`;
          const visibleCalendarIds = new Set(
            state.calendars.filter((c) => c.visible).map((c) => c.id)
          );
          return state.events.filter(
            (ev) => ev.date.startsWith(prefix) && visibleCalendarIds.has(ev.calendarId || "home")
          );
        },
      };
    },
    {
      name: "calendar-storage",
      // Do not persist viewport — opening Calendar should show today, not last session.
      partialize: (state) => ({
        events: state.events,
        calendars: state.calendars,
        todos: state.todos,
        showTodoSidebar: state.showTodoSidebar,
        view: state.view,
      }),
      merge: (persistedState, currentState) => {
        const now = new Date();
        const p = persistedState as Partial<CalendarStoreState>;
        return {
          ...currentState,
          ...p,
          selectedDate: getTodayStr(),
          currentMonth: now.getMonth(),
          currentYear: now.getFullYear(),
        };
      },
    }
  )
);
