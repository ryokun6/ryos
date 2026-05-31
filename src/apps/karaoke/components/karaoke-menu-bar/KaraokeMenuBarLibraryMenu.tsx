import {
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSeparator,
} from "@/components/ui/menubar";
import { LyricsLibraryTrackList } from "@/components/shared/menubar/lyrics/LyricsLibraryTrackList";
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
            <MenubarSeparator className="h-[2px] bg-black my-1" />

            <LyricsLibraryTrackList
              allSongsLabel={t("apps.ipod.menu.allSongs")}
              tracks={tracks}
              currentIndex={currentIndex}
              artists={artists}
              tracksByArtist={tracksByArtist}
              onPlayTrack={onPlayTrack}
            />

            <MenubarSeparator className="h-[2px] bg-black my-1" />
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
