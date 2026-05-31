import {
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSeparator,
} from "@/components/ui/menubar";
import { LyricsLibraryTrackList } from "@/components/shared/menubar/lyrics/LyricsLibraryTrackList";
import { MENUBAR_TRACK_LIMIT, MENUBAR_ARTIST_LIMIT } from "./constants";
import { IpodMenuBarLibrarySourceActions } from "./IpodMenuBarLibrarySourceActions";
import { IpodMenuBarLibrarySwitchItem } from "./IpodMenuBarLibrarySwitchItem";
import type { IpodMenuBarViewModel } from "./useIpodMenuBar";

export function IpodMenuBarLibraryMenu({ vm }: { vm: IpodMenuBarViewModel }) {
  const { t, tracks, currentIndex, artists, tracksByArtist, handlePlayTrack, onAddSong } = vm;
  return (
    <>
      <MenubarMenu>
        <MenubarTrigger className="px-2 py-1 text-md focus-visible:ring-0">
          {t("apps.ipod.menu.library")}
        </MenubarTrigger>
        <MenubarContent
          align="start"
          sideOffset={1}
          className="px-0 max-w-[260px] sm:max-w-[280px]"
        >
          <MenubarItem
            onClick={onAddSong}
            className="text-md h-6 px-3 whitespace-nowrap"
          >
            {t("apps.ipod.menu.addToLibrary")}
          </MenubarItem>

          <IpodMenuBarLibrarySourceActions vm={vm} />

          <MenubarSeparator className="h-[2px] bg-black my-1" />

          {tracks.length > 0 && (
            <>
              <LyricsLibraryTrackList
                allSongsLabel={t("apps.ipod.menu.allSongs")}
                tracks={tracks}
                currentIndex={currentIndex}
                artists={artists}
                tracksByArtist={tracksByArtist}
                onPlayTrack={handlePlayTrack}
                trackLimit={MENUBAR_TRACK_LIMIT}
                artistLimit={MENUBAR_ARTIST_LIMIT}
                renderTrackLimitNotice={(limit, total) =>
                  t(
                    "apps.ipod.menu.menubarTrackLimit",
                    `Showing ${limit} of ${total} — open iPod to browse all`,
                    { limit, total }
                  )
                }
                renderArtistLimitNotice={(limit, total) =>
                  t(
                    "apps.ipod.menu.menubarArtistLimit",
                    `Showing ${limit} of ${total} artists`,
                    { limit, total }
                  )
                }
              />

              <MenubarSeparator className="h-[2px] bg-black my-1" />
            </>
          )}

          <IpodMenuBarLibrarySwitchItem vm={vm} />
        </MenubarContent>
      </MenubarMenu>
    </>
  );
}
