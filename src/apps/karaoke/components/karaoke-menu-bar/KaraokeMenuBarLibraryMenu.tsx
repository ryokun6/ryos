import {
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSeparator,
} from "@/components/ui/menubar";
import { MENUBAR_SEPARATOR_CLASS } from "@/components/shared/menubar/menubarStyles";
import { LibraryTrackBrowser } from "@/components/shared/menubar/LibraryTrackBrowser";
import type { KaraokeMenuBarViewModel } from "./useKaraokeMenuBar";

export function KaraokeMenuBarLibraryMenu({
  vm,
}: {
  vm: KaraokeMenuBarViewModel;
}) {
  const {
    t,
    tracks,
    currentIndex,
    onAddSong,
    onPlayTrack,
    tracksByArtist,
    artists,
    onClearLibrary,
    onSyncLibrary,
  } = vm;

  return (
    <MenubarMenu>
      <MenubarTrigger className="px-2 py-1 text-md focus-visible:ring-0">
        {t("apps.ipod.menu.library")}
      </MenubarTrigger>
      <MenubarContent
        align="start"
        sideOffset={1}
        className="px-0 max-w-[180px] sm:max-w-[220px]"
      >
        <MenubarItem onClick={onAddSong} className="text-md h-6 px-3">
          {t("apps.ipod.menu.addToLibrary")}
        </MenubarItem>

        {tracks.length > 0 && (
          <>
            <MenubarSeparator className={MENUBAR_SEPARATOR_CLASS} />

            <LibraryTrackBrowser
              tracks={tracks}
              currentIndex={currentIndex}
              tracksByArtist={tracksByArtist}
              artists={artists}
              onPlayTrack={onPlayTrack}
              t={t}
            />

            <MenubarSeparator className={MENUBAR_SEPARATOR_CLASS} />
          </>
        )}

        <MenubarItem onClick={onClearLibrary} className="text-md h-6 px-3">
          {t("apps.ipod.menu.clearLibrary")}
        </MenubarItem>
        <MenubarItem onClick={onSyncLibrary} className="text-md h-6 px-3">
          {t("apps.ipod.menu.syncLibrary")}
        </MenubarItem>
      </MenubarContent>
    </MenubarMenu>
  );
}
