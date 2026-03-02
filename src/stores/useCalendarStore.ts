import { create } from "zustand";
import { persist } from "zustand/middleware";

export type EventColor = "blue" | "red" | "green" | "orange" | "purple";

export interface CalendarEvent {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  startTime?: string; // HH:MM (optional — all-day if omitted)
  endTime?: string; // HH:MM
  color: EventColor;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export type CalendarView = "month" | "week" | "day";

interface CalendarStoreState {
  events: CalendarEvent[];
  selectedDate: string; // YYYY-MM-DD
  currentMonth: number; // 0-11
  currentYear: number;
  view: CalendarView;

  // Actions
  addEvent: (
    event: Omit<CalendarEvent, "id" | "createdAt" | "updatedAt">
  ) => string;
  updateEvent: (id: string, updates: Partial<CalendarEvent>) => void;
  deleteEvent: (id: string) => void;
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
        selectedDate: getTodayStr(),
        currentMonth: now.getMonth(),
        currentYear: now.getFullYear(),
        view: "week" as CalendarView,

        addEvent: (eventData) => {
          const id = crypto.randomUUID();
          const timestamp = Date.now();
          const newEvent: CalendarEvent = {
            ...eventData,
            id,
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
        },

        setSelectedDate: (date) => {
          // Also navigate to the month of the selected date
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
          return get().events.filter((ev) => ev.date === date);
        },

        getEventsForMonth: (year, month) => {
          const prefix = `${year}-${String(month + 1).padStart(2, "0")}`;
          return get().events.filter((ev) => ev.date.startsWith(prefix));
        },
      };
    },
    {
      name: "calendar-storage",
    }
  )
);
