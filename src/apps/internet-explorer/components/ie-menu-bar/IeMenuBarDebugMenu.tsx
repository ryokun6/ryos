import {
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarCheckboxItem,
  MenubarSeparator,
} from "@/components/ui/menubar";
import type { InternetExplorerMenuBarViewModel } from "./useInternetExplorerMenuBar";

/**
 * Developer-only menu for the Internet Explorer proxy. Rendered only when the
 * signed-in user is the admin (ryo) or global debug mode is on. The toggles
 * opt the proxy into env-gated features per browser; logs surface in the
 * in-app debug console.
 */
export function IeMenuBarDebugMenu({
  vm,
}: {
  vm: InternetExplorerMenuBarViewModel;
}) {
  const {
    t,
    debugProxySessions,
    debugForceHeadless,
    debugVerboseLogging,
    ieLiveBrowserAvailable,
    onToggleProxySessions,
    onToggleForceHeadless,
    onToggleVerboseLogging,
    onOpenLiveBrowser,
    onOpenDebugConsole,
  } = vm;

  return (
    <MenubarMenu>
      <MenubarTrigger className="px-2 py-1 text-md focus-visible:ring-0">
        {t("apps.internet-explorer.menu.debug")}
      </MenubarTrigger>
      <MenubarContent align="start" sideOffset={1} className="px-0">
        <MenubarCheckboxItem
          checked={!!debugProxySessions}
          onCheckedChange={(checked) => onToggleProxySessions?.(!!checked)}
          className="text-md h-6 px-3"
        >
          {t("apps.internet-explorer.menu.proxySessions")}
        </MenubarCheckboxItem>
        <MenubarCheckboxItem
          checked={!!debugForceHeadless}
          onCheckedChange={(checked) => onToggleForceHeadless?.(!!checked)}
          className="text-md h-6 px-3"
        >
          {t("apps.internet-explorer.menu.forceHeadless")}
        </MenubarCheckboxItem>
        <MenubarCheckboxItem
          checked={!!debugVerboseLogging}
          onCheckedChange={(checked) => onToggleVerboseLogging?.(!!checked)}
          className="text-md h-6 px-3"
        >
          {t("apps.internet-explorer.menu.verboseLogging")}
        </MenubarCheckboxItem>
        <MenubarSeparator className="h-[2px] bg-black my-1" />
        <MenubarItem
          onClick={onOpenLiveBrowser}
          disabled={!ieLiveBrowserAvailable}
          className={
            !ieLiveBrowserAvailable
              ? "text-neutral-400 text-md h-6 px-3"
              : "text-md h-6 px-3"
          }
        >
          {t("apps.internet-explorer.menu.openLiveBrowser")}
        </MenubarItem>
        <MenubarItem onClick={onOpenDebugConsole} className="text-md h-6 px-3">
          {t("apps.internet-explorer.menu.openDebugConsole")}
        </MenubarItem>
      </MenubarContent>
    </MenubarMenu>
  );
}
