import { useRef, useEffect, useState, useMemo, useCallback } from "react";
import { AppProps } from "@/apps/base/types";
import { AppWindowShell } from "@/components/shared/AppWindowShell";
import { CalendarMenuBar } from "../CalendarMenuBar";
import { requestCloudSyncDomainCheck } from "@/utils/cloudSyncEvents";
import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { appMetadata } from "../../metadata";
import { useCalendarLogic } from "../../hooks/useCalendarLogic";
import { DEFAULT_TIME_GRID_HOUR_HEIGHT } from "../../hooks/useTimeScaleGestures";
import { useRegisterUndoRedo } from "@/hooks/useUndoRedo";
import { cn } from "@/lib/utils";
import { useCalendarStore } from "@/stores/useCalendarStore";
import { useChatsStore } from "@/stores/useChatsStore";
import { useCloudSyncStore } from "@/stores/useCloudSyncStore";
import { useResizeObserverWithRef } from "@/hooks/useResizeObserver";
import { AppDrawer } from "@/components/shared/AppDrawer";
import { useSound, Sounds } from "@/hooks/useSound";
import { TrayDetails } from "../TrayDetails";
import { BottomToolbar } from "./BottomToolbar";
import { CalendarList } from "./CalendarList";
import { DayTimeGrid } from "./DayTimeGrid";
import { MiniCalendar } from "./MiniCalendar";
import { MonthGrid } from "./MonthGrid";
import { TodoSidebar } from "./TodoSidebar";
import { WeekTimeGrid } from "./WeekTimeGrid";
import { isKeyboardDeleteTargetEditable } from "./calendarAppUtils";

export function CalendarAppComponent({
  isWindowOpen, onClose, isForeground, skipInitialSound, instanceId, onNavigateNext, onNavigatePrevious,
}: AppProps) {
  const username = useChatsStore((s) => s.username);
  const isAuthenticated = useChatsStore((s) => s.isAuthenticated);
  const calendarSyncReady = useCloudSyncStore(
    (s) => s.autoSyncEnabled && s.syncCalendar
  );
  const canSyncCalendar = Boolean(
    username && isAuthenticated && calendarSyncReady
  );
  useEffect(() => {
    if (canSyncCalendar) {
      requestCloudSyncDomainCheck("calendar");
    }
  }, [canSyncCalendar]);

  const logic = useCalendarLogic();
  const {
    t, translatedHelpItems,
    isHelpDialogOpen, setIsHelpDialogOpen, isAboutDialogOpen, setIsAboutDialogOpen,
    isXpTheme, isMacOSTheme, isSystem7Theme,
    searchQuery, setSearchQuery,
    selectedDate, view, monthYearLabel, selectedDateLabel, calendarGrid, selectedDateEvents,
    narrowDayNames, hourLabels, weekDates, weekLabel,
    selectedEventId, setSelectedEventId,
    calendars, toggleCalendarVisibility,
    todos, addTodo, toggleTodo, updateTodo, deleteTodo, showTodoSidebar, setShowTodoSidebar,
    navigateMonth, navigateWeek, goToToday, setView, setSelectedDate,
    handleDateClick, handleDateDoubleClick, handleNewEvent, handleNewEventAtTime, handleEditSelectedEvent, handleDeleteSelectedEvent, handleUpdateEvent,
    fileInputRef, handleImport, handleFileSelected, handleExport,
    undoCalendar, redoCalendar, canUndo, canRedo,
  } = logic;

  const events = useCalendarStore((s) => s.events);

  useRegisterUndoRedo(instanceId!, {
    undo: undoCalendar,
    redo: redoCalendar,
    canUndo,
    canRedo,
  });

  // Selected todo (mirrors selectedEventId — drives the details tray).
  const [selectedTodoId, setSelectedTodoId] = useState<string | null>(null);

  // Resolve currently-selected event/todo for the tray.
  const selectedEvent = useMemo(
    () => (selectedEventId ? events.find((e) => e.id === selectedEventId) || null : null),
    [selectedEventId, events]
  );
  const selectedTodo = useMemo(
    () => (selectedTodoId ? todos.find((t) => t.id === selectedTodoId) || null : null),
    [selectedTodoId, todos]
  );

  // Open the details tray whenever something is selected; close otherwise.
  const showTrayDrawer = !!(selectedEvent || selectedTodo);

  // Selecting an event clears any selected todo and vice versa so only one
  // detail panel shows at a time.
  const handleSelectEvent = useCallback(
    (id: string, options?: { toggle?: boolean }) => {
      setSelectedTodoId(null);
      if (options?.toggle === false) {
        setSelectedEventId(id);
        return;
      }
      setSelectedEventId((prev) => (prev === id ? null : id));
    },
    [setSelectedEventId]
  );

  const handleSelectTodo = useCallback((id: string) => {
    setSelectedEventId(null);
    setSelectedTodoId(id);
  }, [setSelectedEventId]);

  const handleDeleteEventFromTray = useCallback((id: string) => {
    if (id === selectedEventId) {
      handleDeleteSelectedEvent();
    }
  }, [selectedEventId, handleDeleteSelectedEvent]);

  const handleDeleteTodoFromTray = useCallback((id: string) => {
    deleteTodo(id);
    if (id === selectedTodoId) setSelectedTodoId(null);
  }, [deleteTodo, selectedTodoId]);

  /** New events open in the tray; clear to-do selection so the drawer targets the event. */
  const onNewEvent = useCallback(() => {
    setSelectedTodoId(null);
    handleNewEvent();
  }, [handleNewEvent]);

  const onNewEventAtTime = useCallback(
    (date: string, hour: number) => {
      setSelectedTodoId(null);
      handleNewEventAtTime(date, hour);
    },
    [handleNewEventAtTime]
  );

  const onDateDoubleClick = useCallback(
    (date: string) => {
      setSelectedTodoId(null);
      handleDateDoubleClick(date);
    },
    [handleDateDoubleClick]
  );

  // Drawer open/close sounds — same SFX as the TV drawer for consistency.
  const { play: playDrawerOpen } = useSound(Sounds.WINDOW_ZOOM_MAXIMIZE);
  const { play: playDrawerClose } = useSound(Sounds.WINDOW_ZOOM_MINIMIZE);
  const drawerSoundMountedRef = useRef(false);
  useEffect(() => {
    if (!drawerSoundMountedRef.current) {
      drawerSoundMountedRef.current = true;
      return;
    }
    if (showTrayDrawer) void playDrawerOpen();
    else void playDrawerClose();
  }, [showTrayDrawer, playDrawerOpen, playDrawerClose]);

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(700);
  const [showCalendarSidebar, setShowCalendarSidebar] = useState(true);
  const [showMiniCalendar, setShowMiniCalendar] = useState(true);
  const [weekTimeGridHourHeight, setWeekTimeGridHourHeight] = useState(
    DEFAULT_TIME_GRID_HOUR_HEIGHT,
  );
  const [dayTimeGridHourHeight, setDayTimeGridHourHeight] = useState(
    DEFAULT_TIME_GRID_HOUR_HEIGHT,
  );
  useResizeObserverWithRef(containerRef, (entry) => {
    setContainerWidth(entry.contentRect.width);
  });

  const isNarrow = containerWidth < 600;
  const showSidebar = containerWidth >= 540 && showCalendarSidebar;
  const showTodo = showTodoSidebar && !isNarrow;
  const showTodoFullWidth = showTodoSidebar && isNarrow;
  const effectiveView = view;
  const safeSearchQuery = searchQuery ?? "";
  const normalizedSearchQuery = useMemo(() => safeSearchQuery.trim().toLocaleLowerCase(), [safeSearchQuery]);

  const handlePrev = useCallback(() => {
    if (effectiveView === "week") navigateWeek(-1);
    else if (effectiveView === "month") navigateMonth(-1);
    else {
      const [y, m, d] = selectedDate.split("-").map(Number);
      const prev = new Date(y, m - 1, d - 1);
      setSelectedDate(`${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}-${String(prev.getDate()).padStart(2, "0")}`);
    }
  }, [effectiveView, navigateWeek, navigateMonth, selectedDate, setSelectedDate]);

  const handleNext = useCallback(() => {
    if (effectiveView === "week") navigateWeek(1);
    else if (effectiveView === "month") navigateMonth(1);
    else {
      const [y, m, d] = selectedDate.split("-").map(Number);
      const next = new Date(y, m - 1, d + 1);
      setSelectedDate(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`);
    }
  }, [effectiveView, navigateWeek, navigateMonth, selectedDate, setSelectedDate]);

  const headerLabel = showTodoFullWidth
    ? t("apps.calendar.sidebar.toDoItems")
    : effectiveView === "week" ? weekLabel : effectiveView === "day" ? selectedDateLabel : monthYearLabel;

  const menuBar = (
    <CalendarMenuBar
      onClose={onClose}
      onShowHelp={() => setIsHelpDialogOpen(true)}
      onShowAbout={() => setIsAboutDialogOpen(true)}
      onNewEvent={onNewEvent}
      onImport={handleImport}
      onExport={handleExport}
      onEditEvent={handleEditSelectedEvent}
      onDeleteEvent={handleDeleteSelectedEvent}
      hasSelectedEvent={!!selectedEventId}
      view={view}
      onSetView={setView}
      onGoToToday={goToToday}
      showTodoSidebar={showTodoSidebar}
      onToggleTodoSidebar={() => setShowTodoSidebar(!showTodoSidebar)}
      instanceId={instanceId}
    />
  );

  useEffect(() => {
    if (!isWindowOpen || !isForeground) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isKeyboardDeleteTargetEditable(e.target)) return;
      if (!selectedEventId && !selectedTodoId) return;
      e.preventDefault();
      if (selectedEventId) {
        handleDeleteSelectedEvent();
      } else if (selectedTodoId) {
        handleDeleteTodoFromTray(selectedTodoId);
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [
    isWindowOpen,
    isForeground,
    selectedEventId,
    selectedTodoId,
    handleDeleteSelectedEvent,
    handleDeleteTodoFromTray,
  ]);

  return (
    <AppWindowShell
      isWindowOpen={isWindowOpen}
      isXpTheme={isXpTheme}
      isForeground={isForeground}
      menuBar={menuBar}
      windowFrameProps={{
        title: headerLabel,
        onClose,
        isForeground,
        appId: "calendar",
        material: isMacOSTheme ? "brushedmetal" : "default",
        skipInitialSound,
        instanceId,
        onNavigateNext,
        onNavigatePrevious,
        windowConstraints: { minWidth: 300, minHeight: 380 },
        drawer: (
          <AppDrawer isOpen={showTrayDrawer}>
            <TrayDetails
              selectedEvent={selectedEvent}
              selectedTodo={selectedTodo}
              calendars={calendars}
              isMacOSTheme={isMacOSTheme}
              isSystem7Theme={isSystem7Theme}
              isXpTheme={isXpTheme}
              onUpdateEvent={handleUpdateEvent}
              onDeleteEvent={handleDeleteEventFromTray}
              onUpdateTodo={updateTodo}
              onToggleTodo={toggleTodo}
              onDeleteTodo={handleDeleteTodoFromTray}
            />
          </AppDrawer>
        ),
      }}
      trailing={
        <>
          <HelpDialog isOpen={isHelpDialogOpen} onOpenChange={setIsHelpDialogOpen} appId="calendar" helpItems={translatedHelpItems} />
          <AboutDialog isOpen={isAboutDialogOpen} onOpenChange={setIsAboutDialogOpen} metadata={appMetadata} appId="calendar" />
          <input
            ref={fileInputRef}
            type="file"
            accept=".ics,.ical,.ifb,.icalendar"
            className="hidden"
            onChange={handleFileSelected}
          />
        </>
      }
    >
        <div
          ref={containerRef}
          className={cn("flex flex-col size-full font-os-ui overflow-hidden", isMacOSTheme ? "bg-transparent" : "bg-white")}
        >
          {/* Main content area */}
          <div className={cn("flex-1 flex overflow-hidden", isMacOSTheme && "gap-[5px]")}>
            {/* Left sidebar: Calendar list + Mini calendar */}
            {showSidebar && (
              isMacOSTheme ? (
                <div className="flex flex-col shrink-0 gap-[5px]" style={{ width: 160 }}>
                  <div
                    className="flex-1 overflow-y-auto bg-white"
                    style={{
                      border: "1px solid rgba(0, 0, 0, 0.55)",
                      boxShadow: "inset 0 1px 2px rgba(0, 0, 0, 0.25), 0 1px 0 rgba(255, 255, 255, 0.4)",
                    }}
                  >
                    <CalendarList
                      calendars={calendars}
                      onToggle={toggleCalendarVisibility}
                      isMacOSTheme={isMacOSTheme}
                      isSystem7Theme={isSystem7Theme}
                    />
                  </div>
                  {showMiniCalendar && (
                    <div
                      className="shrink-0 bg-white"
                      style={{
                        border: "1px solid rgba(0, 0, 0, 0.55)",
                        boxShadow: "inset 0 1px 2px rgba(0, 0, 0, 0.25), 0 1px 0 rgba(255, 255, 255, 0.4)",
                      }}
                    >
                      <MiniCalendar
                        calendarGrid={calendarGrid}
                        selectedDate={selectedDate}
                        todayStr={logic.todayStr}
                        onDateClick={handleDateClick}
                        isXpTheme={isXpTheme}
                        isMacOSTheme={isMacOSTheme}
                        isSystem7Theme={isSystem7Theme}
                        monthYearLabel={monthYearLabel}
                        narrowDayNames={narrowDayNames}
                        onPrevMonth={() => navigateMonth(-1)}
                        onNextMonth={() => navigateMonth(1)}
                      />
                    </div>
                  )}
                </div>
              ) : (
                <div
                  className="flex flex-col overflow-y-auto shrink-0 bg-white"
                  style={{ width: 160, borderRight: "1px solid rgba(0,0,0,0.08)" }}
                >
                  <CalendarList
                    calendars={calendars}
                    onToggle={toggleCalendarVisibility}
                    isMacOSTheme={isMacOSTheme}
                    isSystem7Theme={isSystem7Theme}
                  />
                  <div className="flex-1" />
                  {showMiniCalendar && (
                    <MiniCalendar
                      calendarGrid={calendarGrid}
                      selectedDate={selectedDate}
                      todayStr={logic.todayStr}
                      onDateClick={handleDateClick}
                      isXpTheme={isXpTheme}
                      isMacOSTheme={isMacOSTheme}
                      isSystem7Theme={isSystem7Theme}
                      monthYearLabel={monthYearLabel}
                      narrowDayNames={narrowDayNames}
                      onPrevMonth={() => navigateMonth(-1)}
                      onNextMonth={() => navigateMonth(1)}
                    />
                  )}
                </div>
              )
            )}

            {/* Main view area — hidden when todo is full-width on narrow screens */}
            {!showTodoFullWidth && (
              <div
                className={cn("flex-1 flex overflow-hidden calendar-grid bg-white")}
                style={isMacOSTheme ? {
                  border: "1px solid rgba(0, 0, 0, 0.55)",
                  boxShadow: "inset 0 1px 2px rgba(0, 0, 0, 0.25), 0 1px 0 rgba(255, 255, 255, 0.4)",
                } : undefined}
              >
                {effectiveView === "week" && (
                  <WeekTimeGrid weekDates={weekDates} selectedEventId={selectedEventId}
                    onDateClick={handleDateClick} onTimeSlotClick={onNewEventAtTime}
                    onEventClick={(ev) => handleSelectEvent(ev.id)}
                    onEventDoubleClick={(ev) => handleSelectEvent(ev.id, { toggle: false })}
                    isXpTheme={isXpTheme} isMacOSTheme={isMacOSTheme} isSystem7Theme={isSystem7Theme} searchQuery={normalizedSearchQuery} hourLabels={hourLabels}
                    hourHeight={weekTimeGridHourHeight} setHourHeight={setWeekTimeGridHourHeight}
                    onUpdateEvent={handleUpdateEvent} />
                )}
                {effectiveView === "day" && (
                  <DayTimeGrid date={selectedDate} events={selectedDateEvents} selectedEventId={selectedEventId}
                    onTimeSlotClick={onNewEventAtTime}
                    onEventClick={(ev) => handleSelectEvent(ev.id)}
                    onEventDoubleClick={(ev) => handleSelectEvent(ev.id, { toggle: false })}
                    isXpTheme={isXpTheme} isMacOSTheme={isMacOSTheme} isSystem7Theme={isSystem7Theme} searchQuery={normalizedSearchQuery} hourLabels={hourLabels}
                    hourHeight={dayTimeGridHourHeight} setHourHeight={setDayTimeGridHourHeight}
                    onUpdateEvent={handleUpdateEvent} />
                )}
                {effectiveView === "month" && (
                  <MonthGrid calendarGrid={calendarGrid} selectedEventId={selectedEventId}
                    onDateClick={handleDateClick} onDateDoubleClick={onDateDoubleClick}
                    onEventClick={(ev) => handleSelectEvent(ev.id)}
                    onEventDoubleClick={(ev) => handleSelectEvent(ev.id, { toggle: false })}
                    isXpTheme={isXpTheme} searchQuery={normalizedSearchQuery} narrowDayNames={narrowDayNames} />
                )}
              </div>
            )}

            {/* Todo: full-width on narrow screens, sidebar on wide */}
            {showTodoFullWidth && (
              <div
                className="flex-1 overflow-y-auto bg-white"
                style={isMacOSTheme ? {
                  border: "1px solid rgba(0, 0, 0, 0.55)",
                  boxShadow: "inset 0 1px 2px rgba(0, 0, 0, 0.25), 0 1px 0 rgba(255, 255, 255, 0.4)",
                } : undefined}
              >
                <TodoSidebar
                  todos={todos}
                  calendars={calendars}
                  onToggle={toggleTodo}
                  onAdd={addTodo}
                  onUpdate={updateTodo}
                  onDelete={deleteTodo}
                  isMacOSTheme={isMacOSTheme}
                  isSystem7Theme={isSystem7Theme}
                  fullWidth
                  selectedTodoId={selectedTodoId}
                  onSelectTodo={handleSelectTodo}
                />
              </div>
            )}
            {showTodo && (
              <div
                className="shrink-0 overflow-y-auto bg-white"
                style={isMacOSTheme ? {
                  border: "1px solid rgba(0, 0, 0, 0.55)",
                  boxShadow: "inset 0 1px 2px rgba(0, 0, 0, 0.25), 0 1px 0 rgba(255, 255, 255, 0.4)",
                } : { borderLeft: "1px solid rgba(0,0,0,0.08)" }}
              >
                <TodoSidebar
                  todos={todos}
                  calendars={calendars}
                  onToggle={toggleTodo}
                  onAdd={addTodo}
                  onUpdate={updateTodo}
                  onDelete={deleteTodo}
                  isMacOSTheme={isMacOSTheme}
                  isSystem7Theme={isSystem7Theme}
                  selectedTodoId={selectedTodoId}
                  onSelectTodo={handleSelectTodo}
                />
              </div>
            )}
          </div>

          {/* Bottom toolbar */}
          <BottomToolbar
            view={effectiveView} onSetView={setView} onGoToToday={goToToday} onNewEvent={onNewEvent}
            onPrev={handlePrev} onNext={handleNext}
            showCalendarSidebar={showCalendarSidebar} onToggleCalendarSidebar={() => setShowCalendarSidebar((current) => !current)}
            showMiniCalendar={showMiniCalendar} onToggleMiniCalendar={() => setShowMiniCalendar((current) => !current)}
            showTodoSidebar={showTodoSidebar} onToggleTodoSidebar={() => setShowTodoSidebar(!showTodoSidebar)}
            searchQuery={safeSearchQuery} onSearchQueryChange={setSearchQuery} showSearch={!isNarrow}
            isNarrow={isNarrow}
            isXpTheme={isXpTheme} isMacOSTheme={isMacOSTheme} isSystem7Theme={isSystem7Theme} t={t}
          />
        </div>
    </AppWindowShell>
  );
}
