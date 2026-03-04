import { MenuBar } from "@/components/layout/MenuBar";
import {
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSeparator,
  MenubarCheckboxItem,
} from "@/components/ui/menubar";
import { useThemeStore } from "@/stores/useThemeStore";
import { useTranslation } from "react-i18next";
import type { CalendarView } from "@/stores/useCalendarStore";
import { useInstanceUndoRedo } from "@/hooks/useUndoRedo";

interface CalendarMenuBarProps {
  onClose: () => void;
  onShowHelp: () => void;
  onShowAbout: () => void;
  onNewEvent: () => void;
  onImport: () => void;
  onEditEvent: () => void;
  onDeleteEvent: () => void;
  hasSelectedEvent: boolean;
  view: CalendarView;
  onSetView: (view: CalendarView) => void;
  onGoToToday: () => void;
  showTodoSidebar: boolean;
  onToggleTodoSidebar: () => void;
  instanceId?: string;
}

export function CalendarMenuBar({
  onClose,
  onShowHelp,
  onShowAbout,
  onNewEvent,
  onImport,
  onEditEvent,
  onDeleteEvent,
  hasSelectedEvent,
  view,
  onSetView,
  onGoToToday,
  showTodoSidebar,
  onToggleTodoSidebar,
  instanceId,
}: CalendarMenuBarProps) {
  const { t } = useTranslation();
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  const isMacOsxTheme = currentTheme === "macosx";
  const { canUndo, canRedo, undo, redo } = useInstanceUndoRedo(instanceId || "");

  return (
    <MenuBar inWindowFrame={isXpTheme}>
      <MenubarMenu>
        <MenubarTrigger className="text-md px-2 py-1 border-none focus-visible:ring-0">
          {t("common.menu.file")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarItem onClick={onNewEvent} className="text-md h-6 px-3">
            {t("apps.calendar.menu.newEvent")}
          </MenubarItem>
          <MenubarSeparator className="h-[2px] bg-black my-1" />
          <MenubarItem onClick={onImport} className="text-md h-6 px-3">
            {t("apps.calendar.menu.importFromDevice")}
          </MenubarItem>
          <MenubarSeparator className="h-[2px] bg-black my-1" />
          <MenubarItem onClick={onClose} className="text-md h-6 px-3">
            {t("common.menu.close")}
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger className="text-md px-2 py-1 border-none focus-visible:ring-0">
          {t("common.menu.edit")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarItem
            onClick={undo}
            disabled={!canUndo}
            className={`text-md h-6 px-3 ${!canUndo ? "text-gray-500" : ""}`}
          >
            {t("common.menu.undo")}
          </MenubarItem>
          <MenubarItem
            onClick={redo}
            disabled={!canRedo}
            className={`text-md h-6 px-3 ${!canRedo ? "text-gray-500" : ""}`}
          >
            {t("common.menu.redo")}
          </MenubarItem>
          <MenubarSeparator className="h-[2px] bg-black my-1" />
          <MenubarItem
            disabled={!hasSelectedEvent}
            onClick={onEditEvent}
            className="text-md h-6 px-3"
          >
            {t("apps.calendar.menu.editEvent")}
          </MenubarItem>
          <MenubarItem
            disabled={!hasSelectedEvent}
            onClick={onDeleteEvent}
            className="text-md h-6 px-3"
          >
            {t("apps.calendar.menu.deleteEvent")}
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger className="text-md px-2 py-1 border-none focus-visible:ring-0">
          {t("common.menu.view")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarCheckboxItem
            checked={view === "day"}
            onClick={() => onSetView("day")}
            className="text-md h-6 px-3"
          >
            {t("apps.calendar.menu.dayView")}
          </MenubarCheckboxItem>
          <MenubarCheckboxItem
            checked={view === "week"}
            onClick={() => onSetView("week")}
            className="text-md h-6 px-3"
          >
            {t("apps.calendar.menu.weekView")}
          </MenubarCheckboxItem>
          <MenubarCheckboxItem
            checked={view === "month"}
            onClick={() => onSetView("month")}
            className="text-md h-6 px-3"
          >
            {t("apps.calendar.menu.monthView")}
          </MenubarCheckboxItem>
          <MenubarSeparator className="h-[2px] bg-black my-1" />
          <MenubarCheckboxItem
            checked={showTodoSidebar}
            onClick={onToggleTodoSidebar}
            className="text-md h-6 px-3"
          >
            {t("apps.calendar.menu.showToDoItems")}
          </MenubarCheckboxItem>
          <MenubarSeparator className="h-[2px] bg-black my-1" />
          <MenubarItem onClick={onGoToToday} className="text-md h-6 px-3">
            {t("apps.calendar.menu.goToToday")}
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger className="text-md px-2 py-1 border-none focus-visible:ring-0">
          {t("common.menu.help")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarItem onClick={onShowHelp} className="text-md h-6 px-3">
            {t("apps.calendar.menu.help")}
          </MenubarItem>
          {!isMacOsxTheme && (
            <>
              <MenubarSeparator className="h-[2px] bg-black my-1" />
              <MenubarItem onClick={onShowAbout} className="text-md h-6 px-3">
                {t("apps.calendar.menu.about")}
              </MenubarItem>
            </>
          )}
        </MenubarContent>
      </MenubarMenu>
    </MenuBar>
  );
}
