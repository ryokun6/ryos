import { AppMenuBarShell } from "@/components/shared/menubar/AppMenuBarShell";
import {
  AppMenuBarMenus,
  type MenuDescriptor,
  type MenuItemDescriptor,
} from "@/components/shared/menubar/AppMenuBarMenus";
import { useAppMenuBarChrome } from "@/hooks/useAppMenuBarChrome";
import { useTranslation } from "react-i18next";
import { Emoji } from "@/components/shared/Emoji";

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
    isXpTheme,
    isMacOsxTheme,
    appId,
    appName,
  } = useAppMenuBarChrome("dashboard");

  const widgetItem = (
    emoji: string,
    label: string,
    onClick: () => void
  ): MenuItemDescriptor => ({
    type: "action",
    label: (
      <>
        <Emoji emoji={emoji} size={14} />
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
            widgetItem("🕐", t("apps.dashboard.widgets.clock"), onAddClock),
            widgetItem(
              "📅",
              t("apps.dashboard.widgets.calendar"),
              onAddCalendar
            ),
            widgetItem("🌤️", t("apps.dashboard.widgets.weather"), onAddWeather),
            widgetItem("📈", t("apps.dashboard.widgets.stocks"), onAddStocks),
            widgetItem("🎵", t("apps.dashboard.widgets.ipod", "iPod"), onAddIpod),
            widgetItem(
              "🌐",
              t("apps.dashboard.widgets.translation", "Translation"),
              onAddTranslation
            ),
            widgetItem(
              "💱",
              t(
                "apps.dashboard.widgets.currencyConverter",
                "Currency Converter"
              ),
              onAddCurrency
            ),
            widgetItem(
              "📝",
              t("apps.dashboard.widgets.stickyNote", "Sticky Note"),
              onAddStickyNote
            ),
            widgetItem(
              "📖",
              t("apps.dashboard.widgets.dictionary", "Dictionary"),
              onAddDictionary
            ),
            widgetItem(
              "🐠",
              t("apps.dashboard.widgets.aquarium", "Aquarium"),
              onAddAquarium
            ),
            widgetItem(
              "🌿",
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
        { type: "action", label: t("common.menu.close"), onClick: onClose },
      ],
    },
  ];

  return (
    <AppMenuBarShell
      isXpTheme={isXpTheme}
      isMacOsxTheme={isMacOsxTheme}
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
