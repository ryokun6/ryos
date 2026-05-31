import {
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSeparator,
  MenubarSub,
  MenubarSubTrigger,
  MenubarSubContent,
  MenubarCheckboxItem,
} from "@/components/ui/menubar";
import { MENUBAR_TRACK_LIMIT, MENUBAR_ARTIST_LIMIT } from "./constants";
import { MENUBAR_SEPARATOR_CLASS } from "@/components/shared/menubar/menubarStyles";
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

          <MenubarSeparator className={MENUBAR_SEPARATOR_CLASS} />

          {tracks.length > 0 && (
            <>
              <MenubarSub>
                <MenubarSubTrigger className="text-md h-6 px-3">
                  <div className="flex justify-between w-full items-center overflow-hidden">
                    <span className="truncate min-w-0">{t("apps.ipod.menu.allSongs")}</span>
                  </div>
                </MenubarSubTrigger>
                <MenubarSubContent className="px-0 max-w-[180px] sm:max-w-[220px] max-h-[400px] overflow-y-auto">
                  {tracks.slice(0, MENUBAR_TRACK_LIMIT).map((track, index) => (
                    <MenubarCheckboxItem
                      key={`all-${track.id}`}
                      checked={index === currentIndex}
                      onCheckedChange={() => handlePlayTrack(index)}
                      className="text-md h-6 pr-3 max-w-[220px] truncate"
                    >
                      <span className="truncate min-w-0">{track.title}</span>
                    </MenubarCheckboxItem>
                  ))}
                  {tracks.length > MENUBAR_TRACK_LIMIT && (
                    <MenubarItem
                      disabled
                      className="text-md h-6 px-3 italic opacity-70"
                    >
                      {t(
                        "apps.ipod.menu.menubarTrackLimit",
                        `Showing ${MENUBAR_TRACK_LIMIT} of ${tracks.length} — open iPod to browse all`,
                        {
                          limit: MENUBAR_TRACK_LIMIT,
                          total: tracks.length,
                        }
                      )}
                    </MenubarItem>
                  )}
                </MenubarSubContent>
              </MenubarSub>
              <div className="max-h-[300px] overflow-y-auto">
                {artists.slice(0, MENUBAR_ARTIST_LIMIT).map((artist) => (
                  <MenubarSub key={artist}>
                    <MenubarSubTrigger className="text-md h-6 px-3">
                      <div className="flex justify-between w-full items-center overflow-hidden">
                        <span className="truncate min-w-0">{artist}</span>
                      </div>
                    </MenubarSubTrigger>
                    <MenubarSubContent className="px-0 max-w-[180px] sm:max-w-[220px] max-h-[200px] overflow-y-auto">
                      {tracksByArtist[artist]
                        .slice(0, MENUBAR_TRACK_LIMIT)
                        .map(({ track, index }) => (
                          <MenubarCheckboxItem
                            key={`${artist}-${track.id}`}
                            checked={index === currentIndex}
                            onCheckedChange={() => handlePlayTrack(index)}
                            className="text-md h-6 pr-3 max-w-[160px] sm:max-w-[200px] truncate"
                          >
                            <span className="truncate min-w-0">
                              {track.title}
                            </span>
                          </MenubarCheckboxItem>
                        ))}
                    </MenubarSubContent>
                  </MenubarSub>
                ))}
                {artists.length > MENUBAR_ARTIST_LIMIT && (
                  <MenubarItem
                    disabled
                    className="text-md h-6 px-3 italic opacity-70"
                  >
                    {t(
                      "apps.ipod.menu.menubarArtistLimit",
                      `Showing ${MENUBAR_ARTIST_LIMIT} of ${artists.length} artists`,
                      {
                        limit: MENUBAR_ARTIST_LIMIT,
                        total: artists.length,
                      }
                    )}
                  </MenubarItem>
                )}
              </div>

              <MenubarSeparator className={MENUBAR_SEPARATOR_CLASS} />
            </>
          )}

          <IpodMenuBarLibrarySwitchItem vm={vm} />
        </MenubarContent>
      </MenubarMenu>
    </>
  );
}
