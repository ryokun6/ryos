import {
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSeparator,
  MenubarCheckboxItem,
} from "@/components/ui/menubar";
import { AppMenuBarShell } from "@/components/shared/menubar/AppMenuBarShell";
import {
  MENUBAR_ITEM_CLASS,
  MENUBAR_SEPARATOR_CLASS,
  MENUBAR_TRIGGER_CLASS,
} from "@/components/shared/menubar/menubarStyles";
import { useAppMenuBarChrome } from "@/hooks/useAppMenuBarChrome";
import { cn } from "@/lib/utils";
import { requestCloudSyncDomainCheck } from "@/utils/cloudSyncEvents";
import { useTranslation } from "react-i18next";
import type { CalendarView } from "@/stores/useCalendarStore";
import { useInstanceUndoRedo } from "@/hooks/useUndoRedo";

interface CalendarMenuBarProps {
  onClose: () => void;
  onShowHelp: () => void;
  onShowAbout: () => void;
  onNewEvent: () => void;
  onImport: () => void;
  onExport: () => void;
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
  onExport,
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
  const {
    isShareDialogOpen,
    setIsShareDialogOpen,
    isXpTheme,
    isMacOsxTheme,
    appId,
    appName,
  } = useAppMenuBarChrome("calendar");
  const { canUndo, canRedo, undo, redo } = useInstanceUndoRedo(instanceId || "");

  return (
    <AppMenuBarShell
      isXpTheme={isXpTheme}
      isMacOsxTheme={isMacOsxTheme}
      appId={appId}
      appName={appName}
      isShareDialogOpen={isShareDialogOpen}
      setIsShareDialogOpen={setIsShareDialogOpen}
      helpItemLabel={t("apps.calendar.menu.help")}
      aboutItemLabel={t("apps.calendar.menu.about")}
      onShowHelp={onShowHelp}
      onShowAbout={onShowAbout}
    >
      <MenubarMenu>
        <MenubarTrigger className={MENUBAR_TRIGGER_CLASS}>
          {t("common.menu.file")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarItem onClick={onNewEvent} className={MENUBAR_ITEM_CLASS}>
            {t("apps.calendar.menu.newEvent")}
          </MenubarItem>
          <MenubarSeparator className={MENUBAR_SEPARATOR_CLASS} />
          <MenubarItem onClick={onImport} className={MENUBAR_ITEM_CLASS}>
            {t("apps.calendar.menu.importFromDevice")}
          </MenubarItem>
          <MenubarItem onClick={onExport} className={MENUBAR_ITEM_CLASS}>
            {t("apps.calendar.menu.exportToIcs")}
          </MenubarItem>
          <MenubarSeparator className={MENUBAR_SEPARATOR_CLASS} />
          <MenubarItem
            onClick={() => requestCloudSyncDomainCheck("calendar")}
            className={MENUBAR_ITEM_CLASS}
          >
            {t("apps.calendar.menu.syncCalendar", {
              defaultValue: "Sync Calendar",
            })}
          </MenubarItem>
          <MenubarSeparator className={MENUBAR_SEPARATOR_CLASS} />
          <MenubarItem onClick={onClose} className={MENUBAR_ITEM_CLASS}>
            {t("common.menu.close")}
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger className={MENUBAR_TRIGGER_CLASS}>
          {t("common.menu.edit")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarItem
            onClick={undo}
            disabled={!canUndo}
            className={cn(
              MENUBAR_ITEM_CLASS,
              !canUndo ? "text-neutral-500" : "",
            )}
          >
            {t("common.menu.undo")}
          </MenubarItem>
          <MenubarItem
            onClick={redo}
            disabled={!canRedo}
            className={cn(
              MENUBAR_ITEM_CLASS,
              !canRedo ? "text-neutral-500" : "",
            )}
          >
            {t("common.menu.redo")}
          </MenubarItem>
          <MenubarSeparator className={MENUBAR_SEPARATOR_CLASS} />
          <MenubarItem
            disabled={!hasSelectedEvent}
            onClick={onEditEvent}
            className={MENUBAR_ITEM_CLASS}
          >
            {t("apps.calendar.menu.editEvent")}
          </MenubarItem>
          <MenubarItem
            disabled={!hasSelectedEvent}
            onClick={onDeleteEvent}
            className={MENUBAR_ITEM_CLASS}
          >
            {t("apps.calendar.menu.deleteEvent")}
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger className={MENUBAR_TRIGGER_CLASS}>
          {t("common.menu.view")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarCheckboxItem
            checked={view === "day"}
            onClick={() => onSetView("day")}
            className={MENUBAR_ITEM_CLASS}
          >
            {t("apps.calendar.menu.dayView")}
          </MenubarCheckboxItem>
          <MenubarCheckboxItem
            checked={view === "week"}
            onClick={() => onSetView("week")}
            className={MENUBAR_ITEM_CLASS}
          >
            {t("apps.calendar.menu.weekView")}
          </MenubarCheckboxItem>
          <MenubarCheckboxItem
            checked={view === "month"}
            onClick={() => onSetView("month")}
            className={MENUBAR_ITEM_CLASS}
          >
            {t("apps.calendar.menu.monthView")}
          </MenubarCheckboxItem>
          <MenubarSeparator className={MENUBAR_SEPARATOR_CLASS} />
          <MenubarCheckboxItem
            checked={showTodoSidebar}
            onClick={onToggleTodoSidebar}
            className={MENUBAR_ITEM_CLASS}
          >
            {t("apps.calendar.menu.showToDoItems")}
          </MenubarCheckboxItem>
          <MenubarSeparator className={MENUBAR_SEPARATOR_CLASS} />
          <MenubarItem onClick={onGoToToday} className={MENUBAR_ITEM_CLASS}>
            {t("apps.calendar.menu.goToToday")}
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>
    </AppMenuBarShell>
  );
}
