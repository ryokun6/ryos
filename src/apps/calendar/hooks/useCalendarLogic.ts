import { useState, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useTranslatedHelpItems } from "@/hooks/useTranslatedHelpItems";
import { useThemeStore } from "@/stores/useThemeStore";
import {
  useCalendarStore,
  type CalendarEvent,
  type EventColor,
} from "@/stores/useCalendarStore";
import { helpItems } from "../metadata";
import { useShallow } from "zustand/react/shallow";

export interface CalendarDayCell {
  date: string; // YYYY-MM-DD
  day: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  events: CalendarEvent[];
}

export function useCalendarLogic() {
  const { t } = useTranslation();
  const translatedHelpItems = useTranslatedHelpItems("calendar", helpItems);

  // Theme
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  const isMacTheme = currentTheme === "macosx" || currentTheme === "system7";

  // Dialog states
  const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false);
  const [isAboutDialogOpen, setIsAboutDialogOpen] = useState(false);
  const [isEventDialogOpen, setIsEventDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  // Store
  const {
    events,
    selectedDate,
    currentMonth,
    currentYear,
    view,
    addEvent,
    updateEvent,
    deleteEvent,
    setSelectedDate,
    setView,
    navigateMonth,
    goToToday,
  } = useCalendarStore(
    useShallow((state) => ({
      events: state.events,
      selectedDate: state.selectedDate,
      currentMonth: state.currentMonth,
      currentYear: state.currentYear,
      view: state.view,
      addEvent: state.addEvent,
      updateEvent: state.updateEvent,
      deleteEvent: state.deleteEvent,
      setSelectedDate: state.setSelectedDate,
      setView: state.setView,
      navigateMonth: state.navigateMonth,
      goToToday: state.goToToday,
    }))
  );

  // Today string
  const todayStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  // Build the 6×7 calendar grid for the current month
  const calendarGrid = useMemo((): CalendarDayCell[][] => {
    const firstDay = new Date(currentYear, currentMonth, 1);
    const startDayOfWeek = firstDay.getDay(); // 0=Sun

    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate();

    // Build event lookup
    const eventsByDate = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
      const existing = eventsByDate.get(ev.date);
      if (existing) {
        existing.push(ev);
      } else {
        eventsByDate.set(ev.date, [ev]);
      }
    }

    const weeks: CalendarDayCell[][] = [];
    let dayCounter = 1;
    let nextMonthCounter = 1;

    for (let week = 0; week < 6; week++) {
      const row: CalendarDayCell[] = [];
      for (let dow = 0; dow < 7; dow++) {
        const cellIndex = week * 7 + dow;

        if (cellIndex < startDayOfWeek) {
          // Previous month
          const prevDay = daysInPrevMonth - startDayOfWeek + cellIndex + 1;
          const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
          const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;
          const dateStr = `${prevYear}-${String(prevMonth + 1).padStart(2, "0")}-${String(prevDay).padStart(2, "0")}`;
          row.push({
            date: dateStr,
            day: prevDay,
            isCurrentMonth: false,
            isToday: dateStr === todayStr,
            isSelected: dateStr === selectedDate,
            events: eventsByDate.get(dateStr) || [],
          });
        } else if (dayCounter <= daysInMonth) {
          // Current month
          const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(dayCounter).padStart(2, "0")}`;
          row.push({
            date: dateStr,
            day: dayCounter,
            isCurrentMonth: true,
            isToday: dateStr === todayStr,
            isSelected: dateStr === selectedDate,
            events: eventsByDate.get(dateStr) || [],
          });
          dayCounter++;
        } else {
          // Next month
          const nextMonth = currentMonth === 11 ? 0 : currentMonth + 1;
          const nextYear = currentMonth === 11 ? currentYear + 1 : currentYear;
          const dateStr = `${nextYear}-${String(nextMonth + 1).padStart(2, "0")}-${String(nextMonthCounter).padStart(2, "0")}`;
          row.push({
            date: dateStr,
            day: nextMonthCounter,
            isCurrentMonth: false,
            isToday: dateStr === todayStr,
            isSelected: dateStr === selectedDate,
            events: eventsByDate.get(dateStr) || [],
          });
          nextMonthCounter++;
        }
      }
      weeks.push(row);
    }

    return weeks;
  }, [currentYear, currentMonth, events, todayStr, selectedDate]);

  // Events for the selected date
  const selectedDateEvents = useMemo(() => {
    return events
      .filter((ev) => ev.date === selectedDate)
      .sort((a, b) => {
        // All-day events first, then by start time
        if (!a.startTime && b.startTime) return -1;
        if (a.startTime && !b.startTime) return 1;
        if (a.startTime && b.startTime) return a.startTime.localeCompare(b.startTime);
        return a.createdAt - b.createdAt;
      });
  }, [events, selectedDate]);

  // Month/Year display label
  const monthYearLabel = useMemo(() => {
    const date = new Date(currentYear, currentMonth, 1);
    return date.toLocaleDateString(undefined, {
      month: "long",
      year: "numeric",
    });
  }, [currentYear, currentMonth]);

  // Selected date display label
  const selectedDateLabel = useMemo(() => {
    const [year, month, day] = selectedDate.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }, [selectedDate]);

  // Handlers
  const handleDateClick = useCallback(
    (date: string) => {
      setSelectedDate(date);
    },
    [setSelectedDate]
  );

  const handleDateDoubleClick = useCallback(
    (date: string) => {
      setSelectedDate(date);
      setEditingEvent(null);
      setIsEventDialogOpen(true);
    },
    [setSelectedDate]
  );

  const handleNewEvent = useCallback(() => {
    setEditingEvent(null);
    setIsEventDialogOpen(true);
  }, []);

  const handleEditEvent = useCallback((event: CalendarEvent) => {
    setEditingEvent(event);
    setIsEventDialogOpen(true);
  }, []);

  const handleSaveEvent = useCallback(
    (eventData: {
      title: string;
      date: string;
      startTime?: string;
      endTime?: string;
      color: EventColor;
      notes?: string;
    }) => {
      if (editingEvent) {
        updateEvent(editingEvent.id, eventData);
      } else {
        addEvent(eventData);
      }
      setIsEventDialogOpen(false);
      setEditingEvent(null);
    },
    [editingEvent, addEvent, updateEvent]
  );

  const handleDeleteSelectedEvent = useCallback(() => {
    if (selectedEventId) {
      deleteEvent(selectedEventId);
      setSelectedEventId(null);
    }
  }, [selectedEventId, deleteEvent]);

  return {
    // i18n
    t,
    translatedHelpItems,

    // Theme
    currentTheme,
    isXpTheme,
    isMacTheme,

    // Dialogs
    isHelpDialogOpen,
    setIsHelpDialogOpen,
    isAboutDialogOpen,
    setIsAboutDialogOpen,
    isEventDialogOpen,
    setIsEventDialogOpen,

    // Calendar state
    selectedDate,
    currentMonth,
    currentYear,
    view,
    monthYearLabel,
    selectedDateLabel,
    calendarGrid,
    selectedDateEvents,
    todayStr,

    // Event selection
    editingEvent,
    setEditingEvent,
    selectedEventId,
    setSelectedEventId,

    // Actions
    setSelectedDate,
    setView,
    navigateMonth,
    goToToday,
    handleDateClick,
    handleDateDoubleClick,
    handleNewEvent,
    handleEditEvent,
    handleSaveEvent,
    handleDeleteSelectedEvent,
  };
}
