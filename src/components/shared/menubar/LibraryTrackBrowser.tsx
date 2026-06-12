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
import { cn } from "@/lib/utils";

export type LibraryBrowserItem = {
  id: string;
  title: string;
  artist?: string;
};

export function LibraryTrackBrowser<T extends LibraryBrowserItem>({
  tracks,
  currentIndex,
  tracksByArtist,
  artists,
  onPlayTrack,
  t,
  allItemsLabel,
  itemVariant = "checkbox",
  limitLargeLibraries = true,
}: {
  tracks: T[];
  currentIndex: number;
  tracksByArtist: Record<string, TrackWithIndex<T>[]>;
  artists: string[];
  onPlayTrack: (index: number) => void;
  t: TFunction;
  /** Label for the "all items" submenu. Defaults to the iPod "All Songs" label. */
  allItemsLabel?: string;
  /**
   * How the current item is indicated: "checkbox" renders checkmark items
   * (iPod/Karaoke), "nowPlaying" renders plain items with a ♪ prefix (Videos).
   */
  itemVariant?: "checkbox" | "nowPlaying";
  /**
   * Cap rendered tracks/artists and add scroll containers so huge libraries
   * don't commit thousands of DOM nodes (iPod/Karaoke). Disable for small,
   * unbounded libraries (Videos).
   */
  limitLargeLibraries?: boolean;
}) {
  if (tracks.length === 0) {
    return null;
  }

  const allLabel = allItemsLabel ?? t("apps.ipod.menu.allSongs");

  const renderTrackItem = (
    track: T,
    index: number,
    key: string,
    maxWidthClass: string
  ) =>
    itemVariant === "checkbox" ? (
      <MenubarCheckboxItem
        key={key}
        checked={index === currentIndex}
        onCheckedChange={() => onPlayTrack(index)}
        className={cn("text-md h-6 pr-3 truncate", maxWidthClass)}
      >
        <span className="truncate min-w-0">{track.title}</span>
      </MenubarCheckboxItem>
    ) : (
      <MenubarItem
        key={key}
        onClick={() => onPlayTrack(index)}
        className={cn(
          "text-md h-6 px-3 truncate",
          maxWidthClass,
          index === currentIndex && "bg-neutral-200"
        )}
      >
        <div className="flex items-center w-full">
          <span
            className={cn(
              "flex-none whitespace-nowrap",
              index === currentIndex ? "mr-1" : "pl-5"
            )}
          >
            {index === currentIndex ? "♪ " : ""}
          </span>
          <span className="truncate min-w-0">{track.title}</span>
        </div>
      </MenubarItem>
    );

  const visibleTracks = limitLargeLibraries
    ? tracks.slice(0, MENUBAR_TRACK_LIMIT)
    : tracks;
  const visibleArtists = limitLargeLibraries
    ? artists.slice(0, MENUBAR_ARTIST_LIMIT)
    : artists;

  const artistSubmenus = visibleArtists.map((artist) => (
    <MenubarSub key={artist}>
      <MenubarSubTrigger className="text-md h-6 px-3">
        <div className="flex justify-between w-full items-center overflow-hidden">
          <span className="truncate min-w-0">{artist}</span>
        </div>
      </MenubarSubTrigger>
      <MenubarSubContent
        className={cn(
          "px-0 max-w-[180px] sm:max-w-[220px]",
          limitLargeLibraries && "max-h-[200px] overflow-y-auto"
        )}
      >
        {(limitLargeLibraries
          ? tracksByArtist[artist].slice(0, MENUBAR_TRACK_LIMIT)
          : tracksByArtist[artist]
        ).map(({ track, index }) =>
          renderTrackItem(
            track,
            index,
            `${artist}-${track.id}`,
            "max-w-[160px] sm:max-w-[200px]"
          )
        )}
      </MenubarSubContent>
    </MenubarSub>
  ));

  return (
    <>
      <MenubarSub>
        <MenubarSubTrigger className="text-md h-6 px-3">
          <div className="flex justify-between w-full items-center overflow-hidden">
            <span className="truncate min-w-0">{allLabel}</span>
          </div>
        </MenubarSubTrigger>
        <MenubarSubContent
          className={cn(
            "px-0 max-w-[180px] sm:max-w-[220px]",
            limitLargeLibraries && "max-h-[400px] overflow-y-auto"
          )}
        >
          {visibleTracks.map((track, index) =>
            renderTrackItem(track, index, `all-${track.id}`, "max-w-[220px]")
          )}
          {limitLargeLibraries && tracks.length > MENUBAR_TRACK_LIMIT && (
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
      {limitLargeLibraries ? (
        <div className="max-h-[300px] overflow-y-auto">
          {artistSubmenus}
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
      ) : (
        artistSubmenus
      )}
    </>
  );
}
