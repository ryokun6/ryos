import {
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSeparator,
  MenubarSub,
  MenubarSubTrigger,
  MenubarSubContent,
} from "@/components/ui/menubar";
import { AppMenuBarShell } from "@/components/shared/menubar/AppMenuBarShell";
import {
  MENUBAR_ITEM_CLASS,
  MENUBAR_SEPARATOR_CLASS,
  MENUBAR_TRIGGER_CLASS,
} from "@/components/shared/menubar/menubarStyles";
import { useAppMenuBarChrome } from "@/hooks/useAppMenuBarChrome";
import { cn } from "@/lib/utils";
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

const WIDGET_MENU_ITEM_CLASS = cn(MENUBAR_ITEM_CLASS, "gap-1.5");

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
      <MenubarMenu>
        <MenubarTrigger className={MENUBAR_TRIGGER_CLASS}>
          {t("common.menu.file")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarSub>
            <MenubarSubTrigger className={MENUBAR_ITEM_CLASS}>
              {t("apps.dashboard.menu.addWidget")}
            </MenubarSubTrigger>
            <MenubarSubContent className="px-0">
              <MenubarItem onClick={onAddClock} className={WIDGET_MENU_ITEM_CLASS}>
                <Emoji emoji="🕐" size={14} />
                {t("apps.dashboard.widgets.clock")}
              </MenubarItem>
              <MenubarItem onClick={onAddCalendar} className={WIDGET_MENU_ITEM_CLASS}>
                <Emoji emoji="📅" size={14} />
                {t("apps.dashboard.widgets.calendar")}
              </MenubarItem>
              <MenubarItem onClick={onAddWeather} className={WIDGET_MENU_ITEM_CLASS}>
                <Emoji emoji="🌤️" size={14} />
                {t("apps.dashboard.widgets.weather")}
              </MenubarItem>
              <MenubarItem onClick={onAddStocks} className={WIDGET_MENU_ITEM_CLASS}>
                <Emoji emoji="📈" size={14} />
                {t("apps.dashboard.widgets.stocks")}
              </MenubarItem>
              <MenubarItem onClick={onAddIpod} className={WIDGET_MENU_ITEM_CLASS}>
                <Emoji emoji="🎵" size={14} />
                {t("apps.dashboard.widgets.ipod", "iPod")}
              </MenubarItem>
              <MenubarItem
                onClick={onAddTranslation}
                className={WIDGET_MENU_ITEM_CLASS}
              >
                <Emoji emoji="🌐" size={14} />
                {t("apps.dashboard.widgets.translation", "Translation")}
              </MenubarItem>
              <MenubarItem onClick={onAddCurrency} className={WIDGET_MENU_ITEM_CLASS}>
                <Emoji emoji="💱" size={14} />
                {t("apps.dashboard.widgets.currencyConverter", "Currency Converter")}
              </MenubarItem>
              <MenubarItem
                onClick={onAddStickyNote}
                className={WIDGET_MENU_ITEM_CLASS}
              >
                <Emoji emoji="📝" size={14} />
                {t("apps.dashboard.widgets.stickyNote", "Sticky Note")}
              </MenubarItem>
              <MenubarItem
                onClick={onAddDictionary}
                className={WIDGET_MENU_ITEM_CLASS}
              >
                <Emoji emoji="📖" size={14} />
                {t("apps.dashboard.widgets.dictionary", "Dictionary")}
              </MenubarItem>
              <MenubarItem onClick={onAddAquarium} className={WIDGET_MENU_ITEM_CLASS}>
                <Emoji emoji="🐠" size={14} />
                {t("apps.dashboard.widgets.aquarium", "Aquarium")}
              </MenubarItem>
              <MenubarItem
                onClick={onAddTerrarium}
                className={WIDGET_MENU_ITEM_CLASS}
              >
                <Emoji emoji="🌿" size={14} />
                {t("apps.dashboard.widgets.terrarium", "Terrarium")}
              </MenubarItem>
            </MenubarSubContent>
          </MenubarSub>
          <MenubarSeparator className={MENUBAR_SEPARATOR_CLASS} />
          <MenubarItem onClick={onResetWidgets} className={MENUBAR_ITEM_CLASS}>
            {t("apps.dashboard.menu.resetWidgets")}
          </MenubarItem>
          <MenubarSeparator className={MENUBAR_SEPARATOR_CLASS} />
          <MenubarItem onClick={onClose} className={MENUBAR_ITEM_CLASS}>
            {t("common.menu.close")}
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>
    </AppMenuBarShell>
  );
}
