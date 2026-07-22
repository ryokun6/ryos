import { AppMenuBarShell } from "@/components/shared/menubar/AppMenuBarShell";
import {
  AppMenuBarMenus,
  type MenuDescriptor,
  type MenuItemDescriptor,
} from "@/components/shared/menubar/AppMenuBarMenus";
import { useAppMenuBarChrome } from "@/hooks/useAppMenuBarChrome";
import { useTranslation } from "react-i18next";
import { WIDGET_ICONS } from "@/components/layout/dashboard/dashboardWidgetConstants";
import { WidgetBarIcon } from "@/components/layout/dashboard/WidgetBarIcon";
import type { WidgetType } from "@/stores/useDashboardStore";

interface DashboardMenuBarProps {
  onClose: () => void;
  onShowHelp: () => void;
  onShowAbout: () => void;
  onAddClock: () => void;
  onAddCalendar: () => void;
  onAddWeather: () => void;
  onAddStocks: () => void;
  onAddIpod: () => void;
  onAddTranslation: () => void;
  onAddCurrency: () => void;
  onAddStickyNote: () => void;
  onAddDictionary: () => void;
  onAddAquarium: () => void;
  onAddTerrarium: () => void;
  onResetWidgets: () => void;
}

const WIDGET_MENU_ITEM_CLASS = "gap-1.5";

export function DashboardMenuBar({
  onClose,
  onShowHelp,
  onShowAbout,
  onAddClock,
  onAddCalendar,
  onAddWeather,
  onAddStocks,
  onAddIpod,
  onAddTranslation,
  onAddCurrency,
  onAddStickyNote,
  onAddDictionary,
  onAddAquarium,
  onAddTerrarium,
  onResetWidgets,
}: DashboardMenuBarProps) {
  const { t } = useTranslation();
  const {
    isShareDialogOpen,
    setIsShareDialogOpen,
    isWindowsTheme,
    isMacOSTheme,
    appId,
    appName,
  } = useAppMenuBarChrome("dashboard");

  const widgetItem = (
    type: WidgetType,
    label: string,
    onClick: () => void
  ): MenuItemDescriptor => ({
    type: "action",
    label: (
      <>
        <WidgetBarIcon icon={WIDGET_ICONS[type]} size={14} alt="" />
        {label}
      </>
    ),
    onClick,
    className: WIDGET_MENU_ITEM_CLASS,
  });

  const menus: MenuDescriptor[] = [
    {
      label: t("common.menu.file"),
      items: [
        {
          type: "submenu",
          label: t("apps.dashboard.menu.addWidget"),
          items: [
            widgetItem("clock", t("apps.dashboard.widgets.clock"), onAddClock),
            widgetItem(
              "calendar",
              t("apps.dashboard.widgets.calendar"),
              onAddCalendar
            ),
            widgetItem(
              "weather",
              t("apps.dashboard.widgets.weather"),
              onAddWeather
            ),
            widgetItem("stocks", t("apps.dashboard.widgets.stocks"), onAddStocks),
            widgetItem(
              "ipod",
              t("apps.dashboard.widgets.ipod", "iPod"),
              onAddIpod
            ),
            widgetItem(
              "translation",
              t("apps.dashboard.widgets.translation", "Translation"),
              onAddTranslation
            ),
            widgetItem(
              "currency",
              t(
                "apps.dashboard.widgets.currencyConverter",
                "Currency Converter"
              ),
              onAddCurrency
            ),
            widgetItem(
              "stickynote",
              t("apps.dashboard.widgets.stickyNote", "Sticky Note"),
              onAddStickyNote
            ),
            widgetItem(
              "dictionary",
              t("apps.dashboard.widgets.dictionary", "Dictionary"),
              onAddDictionary
            ),
            widgetItem(
              "aquarium",
              t("apps.dashboard.widgets.aquarium", "Aquarium"),
              onAddAquarium
            ),
            widgetItem(
              "terrarium",
              t("apps.dashboard.widgets.terrarium", "Terrarium"),
              onAddTerrarium
            ),
          ],
        },
        { type: "separator" },
        {
          type: "action",
          label: t("apps.dashboard.menu.resetWidgets"),
          onClick: onResetWidgets,
        },
        { type: "separator" },
        {
          type: "action",
          label: t("common.menu.close"),
          onClick: onClose,
          shortcutId: "close",
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
      helpItemLabel={t("apps.dashboard.menu.help")}
      aboutItemLabel={t("apps.dashboard.menu.about")}
      onShowHelp={onShowHelp}
      onShowAbout={onShowAbout}
    >
      <AppMenuBarMenus menus={menus} />
    </AppMenuBarShell>
  );
}
