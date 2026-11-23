import { AppMenuBarShell } from "@/components/shared/menubar/AppMenuBarShell";
import {
  AppMenuBarMenus,
  type MenuDescriptor,
} from "@/components/shared/menubar/AppMenuBarMenus";
import { useAppMenuBarChrome } from "@/hooks/useAppMenuBarChrome";
import { requestCloudSyncDomainCheck } from "@/utils/cloudSyncEvents";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { CalendarView } from "@/stores/useCalendarStore";
import { useInstanceUndoRedo } from "@/hooks/useUndoRedo";
import { useGoogleSyncStoreShallow } from "@/stores/useGoogleSyncStore";
import {
  disableGoogleFeatureSync,
  enableGoogleFeatureSync,
  runGoogleCalendarSync,
} from "@/sync/googleSyncEngine";

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
    isWindowsTheme,
    isMacOSTheme,
    appId,
    appName,
  } = useAppMenuBarChrome("calendar");
  const { canUndo, canRedo, undo, redo } = useInstanceUndoRedo(instanceId || "");
  const { googleConfigured, googleCalendarSyncEnabled, isSyncingGoogleCalendar } =
    useGoogleSyncStoreShallow((s) => ({
      googleConfigured: s.configured,
      googleCalendarSyncEnabled: s.calendarSyncEnabled,
      isSyncingGoogleCalendar: s.isSyncingCalendar,
    }));

  const handleToggleGoogleCalendarSync = async () => {
    if (googleCalendarSyncEnabled) {
      disableGoogleFeatureSync("calendar");
      return;
    }
    try {
      const enabled = await enableGoogleFeatureSync("calendar");
      if (enabled) {
        toast.success(t("apps.control-panels.google.calendarSyncSyncedToast"));
      }
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : t("apps.control-panels.google.genericError")
      );
    }
  };

  const handleSyncGoogleCalendarNow = async () => {
    try {
      await runGoogleCalendarSync({ mode: "incremental" });
      toast.success(t("apps.control-panels.google.calendarSyncSyncedToast"));
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : t("apps.control-panels.google.genericError")
      );
    }
  };

  const viewCheckbox = (viewValue: CalendarView, label: string) =>
    ({
      type: "checkbox",
      label,
      checked: view === viewValue,
      onChange: () => onSetView(viewValue),
    } as const);

  const menus: MenuDescriptor[] = [
    {
      label: t("common.menu.file"),
      items: [
        {
          type: "action",
          label: t("apps.calendar.menu.newEvent"),
          onClick: onNewEvent,
        },
        { type: "separator" },
        {
          type: "action",
          label: t("apps.calendar.menu.importFromDevice"),
          onClick: onImport,
        },
        {
          type: "action",
          label: t("apps.calendar.menu.exportToIcs"),
          onClick: onExport,
        },
        { type: "separator" },
        {
          type: "action",
          label: t("apps.calendar.menu.syncCalendar", {
            defaultValue: "Sync Calendar",
          }),
          onClick: () => requestCloudSyncDomainCheck("calendar"),
        },
        ...(googleConfigured
          ? ([
              {
                type: "checkbox",
                label: t("apps.calendar.menu.googleCalendarSync"),
                checked: googleCalendarSyncEnabled,
                onChange: () => void handleToggleGoogleCalendarSync(),
              },
              ...(googleCalendarSyncEnabled
                ? ([
                    {
                      type: "action",
                      label: isSyncingGoogleCalendar
                        ? t("apps.control-panels.google.syncing")
                        : t("apps.calendar.menu.syncGoogleCalendarNow"),
                      disabled: isSyncingGoogleCalendar,
                      onClick: () => void handleSyncGoogleCalendarNow(),
                    },
                  ] as const)
                : []),
            ] as const)
          : []),
        { type: "separator" },
        {
          type: "action",
          label: t("common.menu.close"),
          onClick: onClose,
          shortcutId: "close",
        },
      ],
    },
    {
      label: t("common.menu.edit"),
      items: [
        {
          type: "action",
          label: t("common.menu.undo"),
          onClick: undo,
          disabled: !canUndo,
          className: !canUndo ? "text-neutral-500" : "",
          shortcutId: "undo",
        },
        {
          type: "action",
          label: t("common.menu.redo"),
          onClick: redo,
          disabled: !canRedo,
          className: !canRedo ? "text-neutral-500" : "",
          shortcutId: "redo",
        },
        { type: "separator" },
        {
          type: "action",
          label: t("apps.calendar.menu.editEvent"),
          onClick: onEditEvent,
          disabled: !hasSelectedEvent,
        },
        {
          type: "action",
          label: t("apps.calendar.menu.deleteEvent"),
          onClick: onDeleteEvent,
          disabled: !hasSelectedEvent,
        },
      ],
    },
    {
      label: t("common.menu.view"),
      items: [
        viewCheckbox("day", t("apps.calendar.menu.dayView")),
        viewCheckbox("week", t("apps.calendar.menu.weekView")),
        viewCheckbox("month", t("apps.calendar.menu.monthView")),
        { type: "separator" },
        {
          type: "checkbox",
          label: t("apps.calendar.menu.showToDoItems"),
          checked: showTodoSidebar,
          onChange: () => onToggleTodoSidebar(),
        },
        { type: "separator" },
        {
          type: "action",
          label: t("apps.calendar.menu.goToToday"),
          onClick: onGoToToday,
        },
      ],
    },
  ];

  return (
    <AppMenuBarShell
      isWindowsTheme={isWindowsTheme}
      isMacOSTheme={isMacOSTheme}
      appId={appId}
      appName={appName}
      isShareDialogOpen={isShareDialogOpen}
      setIsShareDialogOpen={setIsShareDialogOpen}
      helpItemLabel={t("apps.calendar.menu.help")}
      aboutItemLabel={t("apps.calendar.menu.about")}
      onShowHelp={onShowHelp}
      onShowAbout={onShowAbout}
    >
      <AppMenuBarMenus menus={menus} />
    </AppMenuBarShell>
  );
}
