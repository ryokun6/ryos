import {
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSeparator,
} from "@/components/ui/menubar";
import type { InternetExplorerMenuBarViewModel } from "./useInternetExplorerMenuBar";

export function IeMenuBarHelpMenu({
  vm,
}: {
  vm: InternetExplorerMenuBarViewModel;
}) {
  const {
    t,
    onShowHelp,
    onShowAbout,
    isMacOsxTheme,
    setIsShareDialogOpen,
  } = vm;

  return (
    <MenubarMenu>
      <MenubarTrigger className="px-2 py-1 text-md focus-visible:ring-0">
        {t("common.menu.help")}
      </MenubarTrigger>
      <MenubarContent align="start" sideOffset={1} className="px-0">
        <MenubarItem onClick={onShowHelp} className="text-md h-6 px-3">
          {t("apps.internet-explorer.menu.internetExplorerHelp")}
        </MenubarItem>
        {!isMacOsxTheme && (
          <>
            <MenubarItem
              onSelect={() => setIsShareDialogOpen(true)}
              className="text-md h-6 px-3"
            >
              {t("common.menu.shareApp")}
            </MenubarItem>
            <MenubarSeparator className="h-[2px] bg-black my-1" />
            <MenubarItem onClick={onShowAbout} className="text-md h-6 px-3">
              {t("apps.internet-explorer.menu.aboutInternetExplorer")}
            </MenubarItem>
          </>
        )}
      </MenubarContent>
    </MenubarMenu>
  );
}
