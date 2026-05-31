import {
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSeparator,
} from "@/components/ui/menubar";
import { useTranslation } from "react-i18next";
import {
  MENUBAR_ITEM_CLASS,
  MENUBAR_SEPARATOR_CLASS,
  MENUBAR_TRIGGER_CLASS,
} from "./menubarStyles";

interface AppMenuBarHelpMenuProps {
  helpItemLabel: string;
  aboutItemLabel: string;
  shareItemLabel?: string;
  isMacOsxTheme: boolean;
  onShowHelp?: () => void;
  onShowAbout?: () => void;
  onOpenShareDialog: () => void;
}

export function AppMenuBarHelpMenu({
  helpItemLabel,
  aboutItemLabel,
  shareItemLabel,
  isMacOsxTheme,
  onShowHelp,
  onShowAbout,
  onOpenShareDialog,
}: AppMenuBarHelpMenuProps) {
  const { t } = useTranslation();
  const shareLabel = shareItemLabel ?? t("common.menu.shareApp");

  return (
    <MenubarMenu>
      <MenubarTrigger className={MENUBAR_TRIGGER_CLASS}>
        {t("common.menu.help")}
      </MenubarTrigger>
      <MenubarContent align="start" sideOffset={1} className="px-0">
        <MenubarItem
          onClick={() => onShowHelp?.()}
          className={MENUBAR_ITEM_CLASS}
        >
          {helpItemLabel}
        </MenubarItem>
        {!isMacOsxTheme && (
          <>
            <MenubarItem
              onSelect={onOpenShareDialog}
              className={MENUBAR_ITEM_CLASS}
            >
              {shareLabel}
            </MenubarItem>
            <MenubarSeparator className={MENUBAR_SEPARATOR_CLASS} />
            <MenubarItem
              onClick={() => onShowAbout?.()}
              className={MENUBAR_ITEM_CLASS}
            >
              {aboutItemLabel}
            </MenubarItem>
          </>
        )}
      </MenubarContent>
    </MenubarMenu>
  );
}
