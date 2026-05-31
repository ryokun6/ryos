import {
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSeparator,
} from "@/components/ui/menubar";
import type { KaraokeMenuBarViewModel } from "./useKaraokeMenuBar";

export function KaraokeMenuBarHelpMenu({ vm }: { vm: KaraokeMenuBarViewModel }) {
  const { t, isMacOsxTheme, onShowHelp, onShowAbout, setIsShareDialogOpen } =
    vm;

  return (
    <MenubarMenu>
      <MenubarTrigger className="text-md px-2 py-1 border-none focus-visible:ring-0">
        {t("common.menu.help")}
      </MenubarTrigger>
      <MenubarContent align="start" sideOffset={1} className="px-0">
        <MenubarItem onClick={onShowHelp} className="text-md h-6 px-3">
          {t("apps.karaoke.menu.karaokeHelp")}
        </MenubarItem>
        {!isMacOsxTheme && (
          <>
            <MenubarItem
              onSelect={() => setIsShareDialogOpen(true)}
              className="text-md h-6 px-3"
            >
              {t("apps.karaoke.menu.shareApp")}
            </MenubarItem>
            <MenubarSeparator className="h-[2px] bg-black my-1" />
            <MenubarItem onClick={onShowAbout} className="text-md h-6 px-3">
              {t("apps.karaoke.menu.aboutKaraoke")}
            </MenubarItem>
          </>
        )}
      </MenubarContent>
    </MenubarMenu>
  );
}
