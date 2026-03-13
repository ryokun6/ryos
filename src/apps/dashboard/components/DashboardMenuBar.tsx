import { MenuBar } from "@/components/layout/MenuBar";
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
import { useThemeStore } from "@/stores/useThemeStore";
import { useTranslation } from "react-i18next";

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
  onAddStickyNote: () => void;
  onAddDictionary: () => void;
  onAddCalculator: () => void;
  onAddConverter: () => void;
  onResetWidgets: () => void;
}

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
  onAddStickyNote,
  onAddDictionary,
  onAddCalculator,
  onAddConverter,
  onResetWidgets,
}: DashboardMenuBarProps) {
  const { t } = useTranslation();
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  const isMacOsxTheme = currentTheme === "macosx";

  return (
    <MenuBar inWindowFrame={isXpTheme}>
      {/* File Menu */}
      <MenubarMenu>
        <MenubarTrigger className="text-md px-2 py-1 border-none focus-visible:ring-0">
          {t("common.menu.file")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarSub>
            <MenubarSubTrigger className="text-md h-6 px-3">
              {t("apps.dashboard.menu.addWidget")}
            </MenubarSubTrigger>
            <MenubarSubContent className="px-0">
              <MenubarItem onClick={onAddClock} className="text-md h-6 px-3">
                🕐 {t("apps.dashboard.widgets.clock")}
              </MenubarItem>
              <MenubarItem onClick={onAddCalendar} className="text-md h-6 px-3">
                📅 {t("apps.dashboard.widgets.calendar")}
              </MenubarItem>
              <MenubarItem onClick={onAddWeather} className="text-md h-6 px-3">
                🌤️ {t("apps.dashboard.widgets.weather")}
              </MenubarItem>
              <MenubarItem onClick={onAddStocks} className="text-md h-6 px-3">
                📈 {t("apps.dashboard.widgets.stocks")}
              </MenubarItem>
              <MenubarItem onClick={onAddIpod} className="text-md h-6 px-3">
                🎵 {t("apps.dashboard.widgets.ipod", "iPod")}
              </MenubarItem>
              <MenubarItem onClick={onAddTranslation} className="text-md h-6 px-3">
                🌐 {t("apps.dashboard.widgets.translation", "Translation")}
              </MenubarItem>
              <MenubarItem onClick={onAddStickyNote} className="text-md h-6 px-3">
                📝 {t("apps.dashboard.widgets.stickyNote", "Sticky Note")}
              </MenubarItem>
              <MenubarItem onClick={onAddDictionary} className="text-md h-6 px-3">
                📖 {t("apps.dashboard.widgets.dictionary", "Dictionary")}
              </MenubarItem>
              <MenubarItem onClick={onAddCalculator} className="text-md h-6 px-3">
                🧮 {t("apps.dashboard.widgets.calculator", "Calculator")}
              </MenubarItem>
              <MenubarItem onClick={onAddConverter} className="text-md h-6 px-3">
                📐 {t("apps.dashboard.widgets.converter", "Unit Converter")}
              </MenubarItem>
            </MenubarSubContent>
          </MenubarSub>
          <MenubarSeparator className="h-[2px] bg-black my-1" />
          <MenubarItem onClick={onResetWidgets} className="text-md h-6 px-3">
            {t("apps.dashboard.menu.resetWidgets")}
          </MenubarItem>
          <MenubarSeparator className="h-[2px] bg-black my-1" />
          <MenubarItem onClick={onClose} className="text-md h-6 px-3">
            {t("common.menu.close")}
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      {/* Help Menu */}
      <MenubarMenu>
        <MenubarTrigger className="text-md px-2 py-1 border-none focus-visible:ring-0">
          {t("common.menu.help")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarItem onClick={onShowHelp} className="text-md h-6 px-3">
            {t("apps.dashboard.menu.help")}
          </MenubarItem>
          {!isMacOsxTheme && (
            <>
              <MenubarSeparator className="h-[2px] bg-black my-1" />
              <MenubarItem onClick={onShowAbout} className="text-md h-6 px-3">
                {t("apps.dashboard.menu.about")}
              </MenubarItem>
            </>
          )}
        </MenubarContent>
      </MenubarMenu>
    </MenuBar>
  );
}
