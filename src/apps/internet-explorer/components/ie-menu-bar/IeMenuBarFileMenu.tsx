import {
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSeparator,
} from "@/components/ui/menubar";
import { ShortcutHint } from "@/components/shared/menubar/ShortcutHint";
import type { InternetExplorerMenuBarViewModel } from "./useInternetExplorerMenuBar";

export function IeMenuBarFileMenu({
  vm,
}: {
  vm: InternetExplorerMenuBarViewModel;
}) {
  const { t, onFocusUrlInput, onSharePage, onOpenTimeMachine, onClose } = vm;

  return (
    <MenubarMenu>
      <MenubarTrigger className="text-md px-2 py-1 border-none focus-visible:ring-0">
        {t("common.menu.file")}
      </MenubarTrigger>
      <MenubarContent align="start" sideOffset={1} className="px-0">
        <MenubarItem onClick={onFocusUrlInput} className="text-md h-6 px-3">
          {t("apps.internet-explorer.menu.goToUrl")}
        </MenubarItem>
        <MenubarItem onClick={onSharePage} className="text-md h-6 px-3">
          {t("apps.internet-explorer.menu.sharePage")}
        </MenubarItem>
        <MenubarSeparator className="h-[2px] bg-black my-1" />
        <MenubarItem onClick={onOpenTimeMachine} className="text-md h-6 px-3">
          {t("apps.internet-explorer.menu.openTimeMachine")}
        </MenubarItem>
        <MenubarSeparator className="h-[2px] bg-black my-1" />
        <MenubarItem onClick={onClose} className="text-md h-6 px-3">
          {t("common.menu.close")}
          <ShortcutHint id="close" />
        </MenubarItem>
      </MenubarContent>
    </MenubarMenu>
  );
}
