import { MenubarItem } from "@/components/ui/menubar";
import type { IpodMenuBarViewModel } from "./useIpodMenuBar";

export function IpodMenuBarLibrarySourceActions({ vm }: { vm: IpodMenuBarViewModel }) {
  const {
    t,
    isAppleMusic,
    musicKitConfigured,
    appleMusicAuthorized,
    onClearLibrary,
    onSyncLibrary,
    onAppleMusicRefresh,
    onAppleMusicSignOut,
    onAppleMusicSignIn,
  } = vm;

  return (
    <>
      {!isAppleMusic && (
        <>
          <MenubarItem onClick={onClearLibrary} className="text-md h-6 px-3 whitespace-nowrap">
            {t("apps.ipod.menu.clearLibrary")}
          </MenubarItem>
          <MenubarItem onClick={onSyncLibrary} className="text-md h-6 px-3 whitespace-nowrap">
            {t("apps.ipod.menu.syncLibrary")}
          </MenubarItem>
        </>
      )}
      {isAppleMusic && musicKitConfigured && (
        <>
          {appleMusicAuthorized ? (
            <>
              <MenubarItem
                onClick={onAppleMusicRefresh}
                className="text-md h-6 px-3 whitespace-nowrap"
                disabled={!onAppleMusicRefresh}
              >
                {t("apps.ipod.menu.refreshAppleMusic")}
              </MenubarItem>
              <MenubarItem
                onClick={onAppleMusicSignOut}
                className="text-md h-6 px-3 whitespace-nowrap"
                disabled={!onAppleMusicSignOut}
              >
                {t("apps.ipod.menu.appleMusicSignOut")}
              </MenubarItem>
            </>
          ) : (
            <MenubarItem
              onClick={onAppleMusicSignIn}
              className="text-md h-6 px-3 whitespace-nowrap"
              disabled={!onAppleMusicSignIn}
            >
              {t("apps.ipod.menu.appleMusicSignIn")}
            </MenubarItem>
          )}
        </>
      )}
    </>
  );
}
