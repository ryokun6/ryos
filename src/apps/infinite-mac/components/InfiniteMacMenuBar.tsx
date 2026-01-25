import { MenuBar } from "@/components/layout/MenuBar";
import {
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSeparator,
} from "@/components/ui/menubar";
import { useThemeStore } from "@/stores/useThemeStore";
import { useTranslation } from "react-i18next";

interface InfiniteMacMenuBarProps {
  onClose: () => void;
  onShowHelp: () => void;
  onShowAbout: () => void;
  onBackToPresets: () => void;
  onPause: () => void;
  onUnpause: () => void;
  hasEmulator: boolean;
  isPaused: boolean;
}

export function InfiniteMacMenuBar({
  onClose,
  onShowHelp,
  onShowAbout,
  onBackToPresets,
  onPause,
  onUnpause,
  hasEmulator,
  isPaused,
}: InfiniteMacMenuBarProps) {
  const { t } = useTranslation();
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  const isMacOsxTheme = currentTheme === "macosx";

  return (
    <MenuBar inWindowFrame={isXpTheme}>
      <MenubarMenu>
        <MenubarTrigger className="text-md px-2 py-1 border-none focus-visible:ring-0">
          {t("common.menu.file")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          {hasEmulator && (
            <>
              <MenubarItem
                onClick={onBackToPresets}
                className="text-md h-6 px-3"
              >
                {t("apps.infinite-mac.menu.backToPresets")}
              </MenubarItem>
              <MenubarSeparator className="h-[2px] bg-black my-1" />
            </>
          )}
          <MenubarItem onClick={onClose} className="text-md h-6 px-3">
            {t("common.menu.close")}
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      {hasEmulator && (
        <MenubarMenu>
          <MenubarTrigger className="px-2 py-1 text-md focus-visible:ring-0">
            {t("common.menu.view")}
          </MenubarTrigger>
          <MenubarContent align="start" sideOffset={1} className="px-0">
            <MenubarItem
              onClick={isPaused ? onUnpause : onPause}
              className="text-md h-6 px-3"
            >
              {isPaused
                ? t("apps.infinite-mac.menu.resume")
                : t("apps.infinite-mac.menu.pause")}
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>
      )}

      <MenubarMenu>
        <MenubarTrigger className="px-2 py-1 text-md focus-visible:ring-0">
          {t("common.menu.help")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarItem onClick={onShowHelp} className="text-md h-6 px-3">
            {t("apps.infinite-mac.menu.infiniteMacHelp")}
          </MenubarItem>
          {!isMacOsxTheme && (
            <>
              <MenubarSeparator className="h-[2px] bg-black my-1" />
              <MenubarItem onClick={onShowAbout} className="text-md h-6 px-3">
                {t("apps.infinite-mac.menu.aboutInfiniteMac")}
              </MenubarItem>
            </>
          )}
        </MenubarContent>
      </MenubarMenu>
    </MenuBar>
  );
}
