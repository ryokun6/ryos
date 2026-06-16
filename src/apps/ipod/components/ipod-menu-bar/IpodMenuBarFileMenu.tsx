import {
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSeparator,
} from "@/components/ui/menubar";
import { MENUBAR_SEPARATOR_CLASS } from "@/components/shared/menubar/menubarStyles";
import { ShortcutHint } from "@/components/shared/menubar/ShortcutHint";
import { IpodMenuBarLibrarySourceActions } from "./IpodMenuBarLibrarySourceActions";
import { IpodMenuBarLibrarySwitchItem } from "./IpodMenuBarLibrarySwitchItem";
import type { IpodMenuBarViewModel } from "./useIpodMenuBar";

export function IpodMenuBarFileMenu({ vm }: { vm: IpodMenuBarViewModel }) {
  const {
    t, tracks, currentIndex, isAppleMusic, appleMusicAuthorized,
    onAddSong, onShareSong, onAddToFavorites, handleExportLibrary, handleImportLibrary, onClose,
  } = vm;
  return (
    <>
      <MenubarMenu>
        <MenubarTrigger className="text-md px-2 py-1 border-none focus-visible:ring-0">
          {t("apps.ipod.menu.file")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarItem
            onClick={onAddSong}
            className="text-md h-6 px-3"
          >
            {t("apps.ipod.menu.addSong")}
          </MenubarItem>
          <MenubarItem
            onClick={onShareSong}
            className="text-md h-6 px-3"
            disabled={tracks.length === 0 || currentIndex === -1}
          >
            {t("apps.ipod.menu.shareSong")}
          </MenubarItem>
          {isAppleMusic && (
            <MenubarItem
              onClick={onAddToFavorites}
              className="text-md h-6 px-3"
              disabled={
                !appleMusicAuthorized ||
                !onAddToFavorites ||
                tracks.length === 0 ||
                currentIndex === -1
              }
            >
              {t("apps.ipod.menu.addToFavorites", "Add to Favorites")}
            </MenubarItem>
          )}
          {!isAppleMusic && (
            <>
              <MenubarSeparator className={MENUBAR_SEPARATOR_CLASS} />
              <MenubarItem
                onClick={handleExportLibrary}
                className="text-md h-6 px-3"
                disabled={tracks.length === 0}
              >
                {t("apps.ipod.menu.exportLibrary")}
              </MenubarItem>
              <MenubarItem
                onClick={handleImportLibrary}
                className="text-md h-6 px-3"
              >
                {t("apps.ipod.menu.importLibrary")}
              </MenubarItem>
            </>
          )}
          <MenubarSeparator className={MENUBAR_SEPARATOR_CLASS} />
          <IpodMenuBarLibrarySourceActions vm={vm} />
          <MenubarSeparator className={MENUBAR_SEPARATOR_CLASS} />
          <IpodMenuBarLibrarySwitchItem vm={vm} />
          <MenubarSeparator className={MENUBAR_SEPARATOR_CLASS} />
          <MenubarItem
            onClick={onClose}
            className="text-md h-6 px-3"
          >
            {t("common.menu.close")}
            <ShortcutHint id="close" />
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>
    </>
  );
}
