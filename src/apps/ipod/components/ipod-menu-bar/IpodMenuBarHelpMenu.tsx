import {
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSeparator,
} from "@/components/ui/menubar";
import type { IpodMenuBarViewModel } from "./useIpodMenuBar";

export function IpodMenuBarHelpMenu({ vm }: { vm: IpodMenuBarViewModel }) {
  const { t, isMacOsxTheme, onShowHelp, onShowAbout, setIsShareDialogOpen } = vm;
  return (
    <>
      <MenubarMenu>
        <MenubarTrigger className="px-2 py-1 text-md focus-visible:ring-0">
          {t("common.menu.help")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarItem
            onClick={onShowHelp}
            className="text-md h-6 px-3"
          >
            {t("apps.ipod.menu.ipodHelp")}
          </MenubarItem>
          {!isMacOsxTheme && (
            <>
              <MenubarItem
                onSelect={() => setIsShareDialogOpen(true)}
                className="text-md h-6 px-3"
              >
                {t("apps.ipod.menu.shareApp")}
              </MenubarItem>
              <MenubarSeparator className="h-[2px] bg-black my-1" />
              <MenubarItem
                onClick={onShowAbout}
                className="text-md h-6 px-3"
              >
                {t("apps.ipod.menu.aboutIpod")}
              </MenubarItem>
            </>
          )}
        </MenubarContent>
      </MenubarMenu>
    </>
  );
}
