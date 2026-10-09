import { CaretLeft, CaretRight, Plus, ListChecks, SidebarSimple, CalendarBlank } from "@phosphor-icons/react";
import { SearchInput } from "@/components/ui/search-input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { osToolbarSurfaceClassName } from "@/components/shared/osThemePrimitives";

export function BottomToolbar({
  view, onSetView, onGoToToday, onNewEvent, onPrev, onNext,
  showCalendarSidebar, onToggleCalendarSidebar,
  showMiniCalendar, onToggleMiniCalendar,
  showTodoSidebar, onToggleTodoSidebar,
  showMobileCalendarsPanel, onToggleMobileCalendars,
  searchQuery, onSearchQueryChange, showSearch,
  isNarrow,
  isWindowsTheme, isMacOSTheme, isSystem7Theme, t,
}: {
  view: string; onSetView: (v: "day" | "week" | "month") => void; onGoToToday: () => void; onNewEvent: () => void;
  onPrev: () => void; onNext: () => void;
  showCalendarSidebar: boolean; onToggleCalendarSidebar: () => void;
  showMiniCalendar: boolean; onToggleMiniCalendar: () => void;
  showTodoSidebar: boolean; onToggleTodoSidebar: () => void;
  showMobileCalendarsPanel: boolean; onToggleMobileCalendars: () => void;
  searchQuery: string; onSearchQueryChange: (value: string) => void; showSearch: boolean;
  isNarrow: boolean;
  isWindowsTheme: boolean; isMacOSTheme: boolean; isSystem7Theme: boolean;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  const views: { id: "day" | "week" | "month"; label: string }[] = [
    { id: "day", label: t("apps.calendar.views.day") },
    { id: "week", label: t("apps.calendar.views.week") },
    { id: "month", label: t("apps.calendar.views.month") },
  ];

  const searchField = showSearch ? (
    <div className="flex items-center justify-center min-w-0">
      <SearchInput
        value={searchQuery}
        onChange={onSearchQueryChange}
        width={isMacOSTheme ? "150px" : "170px"}
        ariaLabel={t("common.search")}
        onKeyDown={(e) => e.stopPropagation()}
      />
    </div>
  ) : null;

  const viewButtonWidth = isNarrow ? "w-[40px]" : "w-[48px]";

  return (
    <div
      className={cn(
        "py-1.5 border-t flex items-center gap-1.5 sm:gap-2",
        // macOS: on desktop, match bottom padding to the horizontal padding so
        // the buttons sit evenly inside the 8px metal margin (window-body adds
        // mb-[8px]); keep the roomier py-1.5 bottom on mobile.
        isMacOSTheme ? "px-1 md:pb-1" : "px-2",
        osToolbarSurfaceClassName(
          { isMacOSTheme, isSystem7Theme, isWindowsTheme },
          { border: "top" }
        )
      )}
    >
      {isMacOSTheme ? (
        <>
          {isNarrow ? (
            <div className="shrink-0">
              <div className="metal-inset-btn-group">
                <button
                  type="button"
                  className="metal-inset-btn metal-inset-icon touch-manipulation min-h-8 min-w-8"
                  onClick={onToggleMobileCalendars}
                  data-state={showMobileCalendarsPanel ? "on" : "off"}
                  title={t("apps.calendar.sidebar.calendars")}
                  aria-label={t("apps.calendar.sidebar.calendars")}
                >
                  <CalendarBlank size={14} />
                </button>
              </div>
            </div>
          ) : (
            <div className="shrink-0">
              <div className="metal-inset-btn-group">
                <button
                  type="button"
                  className="metal-inset-btn metal-inset-icon"
                  onClick={onToggleCalendarSidebar}
                  data-state={showCalendarSidebar ? "on" : "off"}
                  title={t("apps.calendar.sidebar.calendars")}
                >
                  <SidebarSimple size={14} />
                </button>
                <button
                  type="button"
                  className="metal-inset-btn metal-inset-icon"
                  onClick={onToggleMiniCalendar}
                  data-state={showMiniCalendar ? "on" : "off"}
                >
                  <CalendarBlank size={14} />
                </button>
              </div>
            </div>
          )}
          <div className="shrink-0">
            <div className="metal-inset-btn-group">
              <button
                type="button"
                className={cn(
                  "metal-inset-btn font-geneva-12 !text-[11px] justify-center px-0 touch-manipulation",
                  isNarrow ? "w-[44px] min-h-8" : "w-[48px]"
                )}
                onClick={onGoToToday}
              >
                {t("apps.calendar.today")}
              </button>
            </div>
          </div>
          <div className="shrink-0">
            <div className="metal-inset-btn-group">
              <button
                type="button"
                className={cn(
                  "metal-inset-btn metal-inset-icon touch-manipulation",
                  isNarrow && "min-h-8 min-w-8"
                )}
                onClick={onPrev}
                aria-label={t("apps.calendar.navigate.previous")}
              >
                <span className="inline-block size-0 border-t-[4px] border-t-transparent border-b-[4px] border-b-transparent border-r-[5px] border-r-current" />
              </button>
              {views.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  className={cn(
                    "metal-inset-btn font-geneva-12 !text-[11px] justify-center px-0 touch-manipulation",
                    viewButtonWidth,
                    isNarrow && "min-h-8"
                  )}
                  data-state={view === v.id ? "on" : "off"}
                  onClick={() => onSetView(v.id)}
                >
                  {v.label}
                </button>
              ))}
              <button
                type="button"
                className={cn(
                  "metal-inset-btn metal-inset-icon touch-manipulation",
                  isNarrow && "min-h-8 min-w-8"
                )}
                onClick={onNext}
                aria-label={t("apps.calendar.navigate.next")}
              >
                <span className="inline-block size-0 border-t-[4px] border-t-transparent border-b-[4px] border-b-transparent border-l-[5px] border-l-current" />
              </button>
            </div>
          </div>
          {showSearch ? (
            <div className="flex-1 min-w-0 flex items-center justify-center">
              {searchField}
            </div>
          ) : (
            <div className="flex-1" />
          )}
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="metal-inset-btn-group">
              <button
                type="button"
                className={cn(
                  "metal-inset-btn metal-inset-icon touch-manipulation",
                  isNarrow && "min-h-8 min-w-8"
                )}
                onClick={onNewEvent}
                title={t("apps.calendar.menu.newEvent")}
              >
                <Plus size={12} weight="bold" />
              </button>
              <button
                type="button"
                className={cn(
                  "metal-inset-btn metal-inset-icon touch-manipulation",
                  isNarrow && "min-h-8 min-w-8"
                )}
                onClick={onToggleTodoSidebar}
                data-state={showTodoSidebar ? "on" : "off"}
                title={t("apps.calendar.sidebar.toDoItems")}
              >
                <ListChecks size={12} weight="bold" />
              </button>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center gap-1 shrink-0">
            {isNarrow ? (
              <Button
                variant={isSystem7Theme ? "player" : "ghost"}
                onClick={onToggleMobileCalendars}
                data-state={showMobileCalendarsPanel ? "on" : "off"}
                className={cn("size-8 touch-manipulation", isWindowsTheme && "text-black")}
                title={t("apps.calendar.sidebar.calendars")}
                aria-label={t("apps.calendar.sidebar.calendars")}
              >
                <CalendarBlank size={14} />
              </Button>
            ) : (
              <div className="flex items-center gap-0">
                <Button
                  variant={isSystem7Theme ? "player" : "ghost"}
                  onClick={onToggleCalendarSidebar}
                  data-state={showCalendarSidebar ? "on" : "off"}
                  className={cn("size-6", isWindowsTheme && "text-black")}
                  title={t("apps.calendar.sidebar.calendars")}
                >
                  <SidebarSimple size={14} />
                </Button>
                <Button
                  variant={isSystem7Theme ? "player" : "ghost"}
                  onClick={onToggleMiniCalendar}
                  data-state={showMiniCalendar ? "on" : "off"}
                  className={cn("size-6", isWindowsTheme && "text-black")}
                >
                  <CalendarBlank size={14} />
                </Button>
              </div>
            )}
            <Button
              variant={isSystem7Theme ? "player" : "ghost"}
              onClick={onGoToToday}
              className={cn(
                "text-[11px] px-0 touch-manipulation",
                isNarrow ? "h-8 w-[44px]" : "h-6 w-[48px]",
                isSystem7Theme && "font-geneva-12",
                isWindowsTheme && "text-black"
              )}
            >
              {t("apps.calendar.today")}
            </Button>
            <div className="flex items-center gap-0">
              <Button
                variant={isSystem7Theme ? "player" : "default"}
                size="icon"
                className={cn(
                  "touch-manipulation",
                  isNarrow ? "size-8" : "h-[22px] w-6",
                  isWindowsTheme && "text-black"
                )}
                onClick={onPrev}
                aria-label={t("apps.calendar.navigate.previous")}
              >
                <CaretLeft size={isNarrow ? 14 : 12} weight="bold" />
              </Button>
              {views.map((v) => (
                <Button
                  key={v.id}
                  variant={isSystem7Theme ? "player" : "default"}
                  data-state={view === v.id ? "on" : "off"}
                  onClick={() => onSetView(v.id)}
                  className={cn(
                    "px-0 text-[11px] touch-manipulation",
                    isNarrow ? "h-8 w-[40px]" : "h-[22px] w-[48px]",
                    isSystem7Theme && "font-geneva-12",
                    isWindowsTheme && "text-black"
                  )}
                >
                  {v.label}
                </Button>
              ))}
              <Button
                variant={isSystem7Theme ? "player" : "default"}
                size="icon"
                className={cn(
                  "touch-manipulation",
                  isNarrow ? "size-8" : "h-[22px] w-6",
                  isWindowsTheme && "text-black"
                )}
                onClick={onNext}
                aria-label={t("apps.calendar.navigate.next")}
              >
                <CaretRight size={isNarrow ? 14 : 12} weight="bold" />
              </Button>
            </div>
          </div>
          {showSearch ? (
            <div className="flex-1 min-w-0 flex items-center justify-center">
              {searchField}
            </div>
          ) : (
            <div className="flex-1" />
          )}
          <div className="flex items-center gap-0 shrink-0">
            <Button
              variant={isSystem7Theme ? "player" : "ghost"}
              onClick={onNewEvent}
              className={cn(
                "touch-manipulation",
                isNarrow ? "size-8" : "size-6",
                isWindowsTheme && "text-black"
              )}
              title={t("apps.calendar.menu.newEvent")}
            >
              <Plus size={12} weight="bold" />
            </Button>
            <Button
              variant={isSystem7Theme ? "player" : "ghost"}
              onClick={onToggleTodoSidebar}
              data-state={showTodoSidebar ? "on" : "off"}
              className={cn(
                "touch-manipulation",
                isNarrow ? "size-8" : "size-6",
                isWindowsTheme && "text-black"
              )}
              title={t("apps.calendar.sidebar.toDoItems")}
            >
              <ListChecks size={12} weight="bold" />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
