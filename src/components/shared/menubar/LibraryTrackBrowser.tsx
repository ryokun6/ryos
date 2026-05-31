import type { TFunction } from "i18next";
import {
  MenubarItem,
  MenubarSub,
  MenubarSubTrigger,
  MenubarSubContent,
  MenubarCheckboxItem,
} from "@/components/ui/menubar";
import {
  MENUBAR_TRACK_LIMIT,
  MENUBAR_ARTIST_LIMIT,
} from "@/components/shared/menubar/libraryMenuConstants";
import type { TrackWithIndex } from "@/utils/groupTracksByArtist";
import type { Track } from "@/stores/useIpodStore";

export function LibraryTrackBrowser({
  tracks,
  currentIndex,
  tracksByArtist,
  artists,
  onPlayTrack,
  t,
}: {
  tracks: Track[];
  currentIndex: number;
  tracksByArtist: Record<string, TrackWithIndex<Track>[]>;
  artists: string[];
  onPlayTrack: (index: number) => void;
  t: TFunction;
}) {
  if (tracks.length === 0) {
    return null;
  }

  return (
    <>
      <MenubarSub>
        <MenubarSubTrigger className="text-md h-6 px-3">
          <div className="flex justify-between w-full items-center overflow-hidden">
            <span className="truncate min-w-0">
              {t("apps.ipod.menu.allSongs")}
            </span>
          </div>
        </MenubarSubTrigger>
        <MenubarSubContent className="px-0 max-w-[180px] sm:max-w-[220px] max-h-[400px] overflow-y-auto">
          {tracks.slice(0, MENUBAR_TRACK_LIMIT).map((track, index) => (
            <MenubarCheckboxItem
              key={`all-${track.id}`}
              checked={index === currentIndex}
              onCheckedChange={() => onPlayTrack(index)}
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
                    onCheckedChange={() => onPlayTrack(index)}
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
    </>
  );
}
