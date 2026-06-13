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
  searchQuery, onSearchQueryChange, showSearch,
  isNarrow,
  isXpTheme, isMacOSTheme, isSystem7Theme, t,
}: {
  view: string; onSetView: (v: "day" | "week" | "month") => void; onGoToToday: () => void; onNewEvent: () => void;
  onPrev: () => void; onNext: () => void;
  showCalendarSidebar: boolean; onToggleCalendarSidebar: () => void;
  showMiniCalendar: boolean; onToggleMiniCalendar: () => void;
  showTodoSidebar: boolean; onToggleTodoSidebar: () => void;
  searchQuery: string; onSearchQueryChange: (value: string) => void; showSearch: boolean;
  isNarrow: boolean;
  isXpTheme: boolean; isMacOSTheme: boolean; isSystem7Theme: boolean; t: (key: string) => string;
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

  return (
    <div
      className={cn(
        "py-1.5 border-t flex items-center gap-2",
        // macOS: on desktop, match bottom padding to the horizontal padding so
        // the buttons sit evenly inside the 8px metal margin (window-body adds
        // mb-[8px]); keep the roomier py-1.5 bottom on mobile.
        isMacOSTheme ? "px-1 md:pb-1" : "px-2",
        osToolbarSurfaceClassName(
          { isMacOSTheme, isSystem7Theme, isXpTheme },
          { border: "top" }
        )
      )}
    >
      {isMacOSTheme ? (
        <>
          {!isNarrow && (
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
                className="metal-inset-btn font-geneva-12 !text-[11px] w-[48px] justify-center px-0"
                onClick={onGoToToday}
              >
                {t("apps.calendar.today")}
              </button>
            </div>
          </div>
          <div className="shrink-0">
            <div className="metal-inset-btn-group">
              <button type="button" className="metal-inset-btn metal-inset-icon" onClick={onPrev}>
                <span className="inline-block size-0 border-t-[4px] border-t-transparent border-b-[4px] border-b-transparent border-r-[5px] border-r-current" />
              </button>
              {views.map((v) => (
                <button key={v.id} type="button" className="metal-inset-btn font-geneva-12 !text-[11px] w-[48px] justify-center px-0"
                  data-state={view === v.id ? "on" : "off"} onClick={() => onSetView(v.id)}>
                  {v.label}
                </button>
              ))}
              <button type="button" className="metal-inset-btn metal-inset-icon" onClick={onNext}>
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
              <button type="button" className="metal-inset-btn metal-inset-icon" onClick={onNewEvent} title={t("apps.calendar.menu.newEvent")}>
                <Plus size={12} weight="bold" />
              </button>
              <button
                type="button"
                className="metal-inset-btn metal-inset-icon"
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
          <div className="flex items-center gap-1.5 shrink-0">
            {!isNarrow && (
              <div className="flex items-center gap-0">
                <Button
                  variant={isSystem7Theme ? "player" : "ghost"}
                  onClick={onToggleCalendarSidebar}
                  data-state={showCalendarSidebar ? "on" : "off"}
                  className={cn("size-6", isXpTheme && "text-black")}
                  title={t("apps.calendar.sidebar.calendars")}
                >
                  <SidebarSimple size={14} />
                </Button>
                <Button
                  variant={isSystem7Theme ? "player" : "ghost"}
                  onClick={onToggleMiniCalendar}
                  data-state={showMiniCalendar ? "on" : "off"}
                  className={cn("size-6", isXpTheme && "text-black")}
                >
                  <CalendarBlank size={14} />
                </Button>
              </div>
            )}
            <Button variant={isSystem7Theme ? "player" : "ghost"} onClick={onGoToToday}
              className={cn("h-6 w-[48px] text-[11px] px-0", isSystem7Theme && "font-geneva-12", isXpTheme && "text-black")}>
              {t("apps.calendar.today")}
            </Button>
            <div className="flex items-center gap-0">
              <Button variant={isSystem7Theme ? "player" : "default"} size="icon"
                className={cn("h-[22px] w-6", isXpTheme && "text-black")} onClick={onPrev}>
                <CaretLeft size={12} weight="bold" />
              </Button>
              {views.map((v) => (
                <Button key={v.id} variant={isSystem7Theme ? "player" : "default"}
                  data-state={view === v.id ? "on" : "off"} onClick={() => onSetView(v.id)}
                  className={cn("h-[22px] w-[48px] px-0 text-[11px]", isSystem7Theme && "font-geneva-12", isXpTheme && "text-black")}>
                  {v.label}
                </Button>
              ))}
              <Button variant={isSystem7Theme ? "player" : "default"} size="icon"
                className={cn("h-[22px] w-6", isXpTheme && "text-black")} onClick={onNext}>
                <CaretRight size={12} weight="bold" />
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
            <Button variant={isSystem7Theme ? "player" : "ghost"} onClick={onNewEvent}
              className={cn("size-6", isXpTheme && "text-black")} title={t("apps.calendar.menu.newEvent")}>
              <Plus size={12} weight="bold" />
            </Button>
            <Button variant={isSystem7Theme ? "player" : "ghost"}
              onClick={onToggleTodoSidebar} data-state={showTodoSidebar ? "on" : "off"}
              className={cn("size-6", isXpTheme && "text-black")} title={t("apps.calendar.sidebar.toDoItems")}>
              <ListChecks size={12} weight="bold" />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
