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

interface AssistantMenuBarProps {
  onClose: () => void;
  onShowHelp: () => void;
  onShowAbout: () => void;
  enabled: boolean;
  onToggleEnabled: () => void;
}

export function AssistantMenuBar({
  onClose,
  onShowHelp,
  onShowAbout,
  enabled,
  onToggleEnabled,
}: AssistantMenuBarProps) {
  const { t } = useTranslation();
  const currentTheme = useThemeStore((state) => state.current);
  const isWindowsTheme = currentTheme === "xp" || currentTheme === "win98";
  const isMacOSTheme = currentTheme === "macosx";

  return (
    <MenuBar inWindowFrame={isWindowsTheme}>
      <MenubarMenu>
        <MenubarTrigger className="text-md px-2 py-1 border-none focus-visible:ring-0">
          {t("common.menu.file")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarItem onClick={onToggleEnabled} className="text-md h-6 px-3">
            {enabled
              ? t("apps.assistant.menu.quitAssistant")
              : t("apps.assistant.menu.showAssistant")}
          </MenubarItem>
          <MenubarSeparator className="h-[2px] bg-black my-1" />
          <MenubarItem onClick={onClose} className="text-md h-6 px-3">
            {t("common.menu.close")}
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>
      <MenubarMenu>
        <MenubarTrigger className="text-md px-2 py-1 border-none focus-visible:ring-0">
          {t("common.menu.help")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarItem onClick={onShowHelp} className="text-md h-6 px-3">
            {t("apps.assistant.menu.help")}
          </MenubarItem>
          {!isMacOSTheme && (
            <>
              <MenubarSeparator className="h-[2px] bg-black my-1" />
              <MenubarItem onClick={onShowAbout} className="text-md h-6 px-3">
                {t("apps.assistant.menu.about")}
              </MenubarItem>
            </>
          )}
        </MenubarContent>
      </MenubarMenu>
    </MenuBar>
  );
}
