import {
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSeparator,
} from "@/components/ui/menubar";
import type { PaintMenuBarViewModel } from "./usePaintMenuBar";

export function PaintMenuBarHelpMenu({ vm }: { vm: PaintMenuBarViewModel }) {
  const { t, isMacOsxTheme, onShowHelp, onShowAbout, setIsShareDialogOpen } = vm;

  return (
    <MenubarMenu>
      <MenubarTrigger className="text-md px-2 py-1 border-none focus-visible:ring-0">
        {t("common.menu.help")}
      </MenubarTrigger>
      <MenubarContent align="start" sideOffset={1} className="px-0">
        <MenubarItem onClick={onShowHelp} className="text-md h-6 px-3">
          {t("apps.paint.menu.paintHelp")}
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
              {t("apps.paint.menu.aboutPaint")}
            </MenubarItem>
          </>
        )}
      </MenubarContent>
    </MenubarMenu>
  );
}
