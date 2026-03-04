import { useState, useMemo, useCallback, useRef } from "react";
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
import { parseIcalString, toIcalString } from "../utils/parseIcal";
import { toast } from "sonner";

export interface CalendarDayCell {
  date: string; // YYYY-MM-DD
  day: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  events: CalendarEvent[];
}

export interface WeekDay {
  date: string; // YYYY-MM-DD
  dayOfMonth: number;
  dayName: string; // "Sun", "Mon", ...
  isToday: boolean;
  isSelected: boolean;
  events: CalendarEvent[];
  allDayEvents: CalendarEvent[];
  timedEvents: CalendarEvent[];
}

/** Format Date as YYYY-MM-DD */
const formatDate = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function useCalendarLogic() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const translatedHelpItems = useTranslatedHelpItems("calendar", helpItems);

  // Theme
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  const isMacTheme = currentTheme === "macosx" || currentTheme === "system7";
  const isMacOSTheme = currentTheme === "macosx";
  const isSystem7Theme = currentTheme === "system7";
  const isClassicTheme = isXpTheme || isSystem7Theme; // non-Aqua themes

  // Dialog states
  const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false);
  const [isAboutDialogOpen, setIsAboutDialogOpen] = useState(false);
  const [isEventDialogOpen, setIsEventDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  // Store
  const {
    events,
    calendars,
    todos,
    showTodoSidebar,
    selectedDate,
    currentMonth,
    currentYear,
    view,
    addEvent,
    updateEvent,
    deleteEvent,
    addCalendar,
    toggleCalendarVisibility,
    addTodo,
    toggleTodo,
    deleteTodo,
    setShowTodoSidebar,
    setSelectedDate,
    setView,
    navigateMonth,
    navigateWeek,
    goToToday,
  } = useCalendarStore(
    useShallow((state) => ({
      events: state.events,
      calendars: state.calendars,
      todos: state.todos,
      showTodoSidebar: state.showTodoSidebar,
      selectedDate: state.selectedDate,
      currentMonth: state.currentMonth,
      currentYear: state.currentYear,
      view: state.view,
      addEvent: state.addEvent,
      updateEvent: state.updateEvent,
      deleteEvent: state.deleteEvent,
      addCalendar: state.addCalendar,
      toggleCalendarVisibility: state.toggleCalendarVisibility,
      addTodo: state.addTodo,
      toggleTodo: state.toggleTodo,
      deleteTodo: state.deleteTodo,
      setShowTodoSidebar: state.setShowTodoSidebar,
      setSelectedDate: state.setSelectedDate,
      setView: state.setView,
      navigateMonth: state.navigateMonth,
      navigateWeek: state.navigateWeek,
      goToToday: state.goToToday,
    }))
  );

  // Visible calendar IDs for filtering
  const visibleCalendarIds = useMemo(() => {
    return new Set(calendars.filter((c) => c.visible).map((c) => c.id));
  }, [calendars]);

  // Filtered events (only from visible calendars)
  const visibleEvents = useMemo(() => {
    return events.filter((ev) => visibleCalendarIds.has(ev.calendarId || "home"));
  }, [events, visibleCalendarIds]);

  // Today string
  const todayStr = useMemo(() => {
    const d = new Date();
    return formatDate(d);
  }, []);

  // Locale-aware day names (Sun=0 .. Sat=6)
  const shortDayNames = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(locale, { weekday: "short" });
    return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2024, 0, 7 + i)));
  }, [locale]);

  const narrowDayNames = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(locale, { weekday: "narrow" });
    return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2024, 0, 7 + i)));
  }, [locale]);

  // Locale-aware hour labels (0–23)
  const hourLabels = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(locale, { hour: "numeric", hour12: undefined });
    return Array.from({ length: 24 }, (_, h) => fmt.format(new Date(2024, 0, 1, h)));
  }, [locale]);

  // ==========================================================================
  // WEEK VIEW DATA
  // ==========================================================================

  const weekDates = useMemo((): WeekDay[] => {
    const [y, m, d] = selectedDate.split("-").map(Number);
    const sel = new Date(y, m - 1, d);
    const dayOfWeek = sel.getDay();
    const sunday = new Date(sel);
    sunday.setDate(sunday.getDate() - dayOfWeek);

    const eventsByDate = new Map<string, CalendarEvent[]>();
    for (const ev of visibleEvents) {
      const existing = eventsByDate.get(ev.date);
      if (existing) existing.push(ev);
      else eventsByDate.set(ev.date, [ev]);
    }

    const days: WeekDay[] = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(sunday);
      date.setDate(date.getDate() + i);
      const dateStr = formatDate(date);
      const dayEvents = eventsByDate.get(dateStr) || [];

      days.push({
        date: dateStr,
        dayOfMonth: date.getDate(),
        dayName: shortDayNames[date.getDay()],
        isToday: dateStr === todayStr,
        isSelected: dateStr === selectedDate,
        events: dayEvents,
        allDayEvents: dayEvents.filter((ev) => !ev.startTime),
        timedEvents: dayEvents
          .filter((ev) => !!ev.startTime)
          .sort((a, b) => (a.startTime || "").localeCompare(b.startTime || "")),
      });
    }
    return days;
  }, [selectedDate, visibleEvents, todayStr, shortDayNames]);

  const weekLabel = useMemo(() => {
    if (weekDates.length === 0) return "";
    const first = weekDates[0];
    const last = weekDates[6];
    const [fy, fm, fd] = first.date.split("-").map(Number);
    const [ly, lm, ld] = last.date.split("-").map(Number);
    const firstDate = new Date(fy, fm - 1, fd);
    const lastDate = new Date(ly, lm - 1, ld);

    const fMonth = firstDate.toLocaleDateString(locale, { month: "short" });
    const lMonth = lastDate.toLocaleDateString(locale, { month: "short" });

    if (fm === lm) {
      return `${fMonth} ${fd} – ${ld}, ${fy}`;
    }
    return `${fMonth} ${fd} – ${lMonth} ${ld}, ${ly}`;
  }, [weekDates, locale]);

  // ==========================================================================
  // MONTH VIEW DATA
  // ==========================================================================

  const calendarGrid = useMemo((): CalendarDayCell[][] => {
    const firstDay = new Date(currentYear, currentMonth, 1);
    const startDayOfWeek = firstDay.getDay();

    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate();

    const eventsByDate = new Map<string, CalendarEvent[]>();
    for (const ev of visibleEvents) {
      const existing = eventsByDate.get(ev.date);
      if (existing) existing.push(ev);
      else eventsByDate.set(ev.date, [ev]);
    }

    const weeks: CalendarDayCell[][] = [];
    let dayCounter = 1;
    let nextMonthCounter = 1;

    for (let week = 0; week < 6; week++) {
      const row: CalendarDayCell[] = [];
      for (let dow = 0; dow < 7; dow++) {
        const cellIndex = week * 7 + dow;

        if (cellIndex < startDayOfWeek) {
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
  }, [currentYear, currentMonth, visibleEvents, todayStr, selectedDate]);

  // Events for the selected date (filtered)
  const selectedDateEvents = useMemo(() => {
    return visibleEvents
      .filter((ev) => ev.date === selectedDate)
      .sort((a, b) => {
        if (!a.startTime && b.startTime) return -1;
        if (a.startTime && !b.startTime) return 1;
        if (a.startTime && b.startTime)
          return a.startTime.localeCompare(b.startTime);
        return a.createdAt - b.createdAt;
      });
  }, [visibleEvents, selectedDate]);

  // Month/Year display label
  const monthYearLabel = useMemo(() => {
    const date = new Date(currentYear, currentMonth, 1);
    return date.toLocaleDateString(locale, {
      month: "long",
      year: "numeric",
    });
  }, [currentYear, currentMonth, locale]);

  // Selected date display label
  const selectedDateLabel = useMemo(() => {
    const [year, month, day] = selectedDate.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString(locale, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }, [selectedDate, locale]);

  // ==========================================================================
  // HANDLERS
  // ==========================================================================

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

  const handleNewEventAtTime = useCallback(
    (date: string, hour: number) => {
      setSelectedDate(date);
      setEditingEvent(null);
      setIsEventDialogOpen(true);
      setPrefillTime({
        date,
        startTime: `${String(hour).padStart(2, "0")}:00`,
        endTime: `${String(hour + 1).padStart(2, "0")}:00`,
      });
    },
    [setSelectedDate]
  );

  const [prefillTime, setPrefillTime] = useState<{
    date: string;
    startTime: string;
    endTime: string;
  } | null>(null);

  const handleNewEvent = useCallback(() => {
    setEditingEvent(null);
    setPrefillTime(null);
    setIsEventDialogOpen(true);
  }, []);

  const handleEditEvent = useCallback((event: CalendarEvent) => {
    setEditingEvent(event);
    setPrefillTime(null);
    setIsEventDialogOpen(true);
  }, []);

  const handleSaveEvent = useCallback(
    (eventData: {
      title: string;
      date: string;
      startTime?: string;
      endTime?: string;
      color: EventColor;
      calendarId?: string;
      notes?: string;
    }) => {
      if (editingEvent) {
        updateEvent(editingEvent.id, eventData);
      } else {
        addEvent(eventData);
      }
      setIsEventDialogOpen(false);
      setEditingEvent(null);
      setPrefillTime(null);
    },
    [editingEvent, addEvent, updateEvent]
  );

  const handleEditSelectedEvent = useCallback(() => {
    if (selectedEventId) {
      const event = events.find((e) => e.id === selectedEventId);
      if (event) {
        setEditingEvent(event);
        setPrefillTime(null);
        setIsEventDialogOpen(true);
      }
    }
  }, [selectedEventId, events]);

  const handleDeleteSelectedEvent = useCallback(() => {
    if (selectedEventId) {
      deleteEvent(selectedEventId);
      setSelectedEventId(null);
    }
  }, [selectedEventId, deleteEvent]);

  const handleDeleteEditingEvent = useCallback(() => {
    if (editingEvent) {
      deleteEvent(editingEvent.id);
      setIsEventDialogOpen(false);
      setEditingEvent(null);
      setPrefillTime(null);
    }
  }, [editingEvent, deleteEvent]);

  // iCal import
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleImport = useCallback(() => {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  }, []);

  const handleFileSelected = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        const text = reader.result as string;
        const parsed = parseIcalString(text);
        for (const ev of parsed) {
          addEvent(ev);
        }
        if (parsed.length > 0) {
          setSelectedDate(parsed[0].date);
          toast.success(
            t("apps.calendar.import.success", { count: parsed.length })
          );
        }
      };
      reader.readAsText(file);
    },
    [addEvent, setSelectedDate, t]
  );

  const handleExport = useCallback(() => {
    if (events.length === 0) {
      toast(t("apps.calendar.export.noEvents"));
      return;
    }

    const icsContent = toIcalString(events);
    const blob = new Blob([icsContent], { type: "text/calendar" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "calendar-events.ics";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(t("apps.calendar.export.success", { count: events.length }));
  }, [events, t]);

  return {
    // i18n
    t,
    translatedHelpItems,

    // Theme
    currentTheme,
    isXpTheme,
    isMacTheme,
    isMacOSTheme,
    isSystem7Theme,
    isClassicTheme,

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

    // Calendar groups
    calendars,
    toggleCalendarVisibility,
    addCalendar,

    // Todos
    todos,
    addTodo,
    toggleTodo,
    deleteTodo,
    showTodoSidebar,
    setShowTodoSidebar,

    // Locale-aware labels
    narrowDayNames,
    hourLabels,

    // Week view
    weekDates,
    weekLabel,
    navigateWeek,

    // Event state
    editingEvent,
    setEditingEvent,
    selectedEventId,
    setSelectedEventId,
    prefillTime,

    // Actions
    setSelectedDate,
    setView,
    navigateMonth,
    goToToday,
    handleDateClick,
    handleDateDoubleClick,
    handleNewEvent,
    handleNewEventAtTime,
    handleEditEvent,
    handleSaveEvent,
    handleEditSelectedEvent,
    handleDeleteSelectedEvent,
    handleDeleteEditingEvent,

    // Import / Export
    fileInputRef,
    handleImport,
    handleFileSelected,
    handleExport,
  };
}
