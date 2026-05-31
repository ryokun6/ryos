import { MenubarItem } from "@/components/ui/menubar";
import type { IpodMenuBarViewModel } from "./useIpodMenuBar";

export function IpodMenuBarLibrarySwitchItem({ vm }: { vm: IpodMenuBarViewModel }) {
  const { t, isAppleMusic, onSwitchLibrary, musicKitConfigured, handleSwitchLibraryMenu } = vm;
  return (
    <MenubarItem
      onClick={handleSwitchLibraryMenu}
      className="text-md h-6 px-3 whitespace-nowrap"
      disabled={!onSwitchLibrary || (!isAppleMusic && !musicKitConfigured)}
    >
      {isAppleMusic
        ? t("apps.ipod.menu.switchToYoutubeLibrary")
        : t("apps.ipod.menu.switchToAppleMusic")}
    </MenubarItem>
  );
}
