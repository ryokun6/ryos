import { type ReactNode } from "react";
import {
  MenubarItem,
  MenubarSub,
  MenubarSubTrigger,
  MenubarSubContent,
  MenubarCheckboxItem,
} from "@/components/ui/menubar";
import type { TrackWithIndex } from "@/utils/groupTracksByArtist";

type LibraryTrack = { id: string; title: string; artist?: string };

export type LyricsLibraryTrackListProps<T extends LibraryTrack> = {
  allSongsLabel: string;
  tracks: T[];
  currentIndex: number;
  artists: string[];
  tracksByArtist: Record<string, TrackWithIndex<T>[]>;
  onPlayTrack: (index: number) => void;
  /** Optional cap on rendered tracks per list (iPod uses this for big libraries). */
  trackLimit?: number;
  /** Optional cap on rendered artists. */
  artistLimit?: number;
  /** Rendered as a disabled row when the track list is truncated. */
  renderTrackLimitNotice?: (shown: number, total: number) => ReactNode;
  /** Rendered as a disabled row when the artist list is truncated. */
  renderArtistLimitNotice?: (shown: number, total: number) => ReactNode;
};

/**
 * Shared "All Songs" + per-artist submenus used by the iPod and Karaoke
 * library menus. iPod passes limits to cap DOM nodes for huge libraries;
 * Karaoke omits them to render the full list.
 */
export function LyricsLibraryTrackList<T extends LibraryTrack>({
  allSongsLabel,
  tracks,
  currentIndex,
  artists,
  tracksByArtist,
  onPlayTrack,
  trackLimit,
  artistLimit,
  renderTrackLimitNotice,
  renderArtistLimitNotice,
}: LyricsLibraryTrackListProps<T>) {
  const shownTracks =
    trackLimit !== undefined ? tracks.slice(0, trackLimit) : tracks;
  const shownArtists =
    artistLimit !== undefined ? artists.slice(0, artistLimit) : artists;

  return (
    <>
      <MenubarSub>
        <MenubarSubTrigger className="text-md h-6 px-3">
          <div className="flex justify-between w-full items-center overflow-hidden">
            <span className="truncate min-w-0">{allSongsLabel}</span>
          </div>
        </MenubarSubTrigger>
        <MenubarSubContent className="px-0 max-w-[180px] sm:max-w-[220px] max-h-[400px] overflow-y-auto">
          {shownTracks.map((track, index) => (
            <MenubarCheckboxItem
              key={`all-${track.id}`}
              checked={index === currentIndex}
              onCheckedChange={() => onPlayTrack(index)}
              className="text-md h-6 pr-3 max-w-[220px] truncate"
            >
              <span className="truncate min-w-0">{track.title}</span>
            </MenubarCheckboxItem>
          ))}
          {trackLimit !== undefined &&
            tracks.length > trackLimit &&
            renderTrackLimitNotice && (
              <MenubarItem
                disabled
                className="text-md h-6 px-3 italic opacity-70"
              >
                {renderTrackLimitNotice(trackLimit, tracks.length)}
              </MenubarItem>
            )}
        </MenubarSubContent>
      </MenubarSub>
      <div className="max-h-[300px] overflow-y-auto">
        {shownArtists.map((artist) => (
          <MenubarSub key={artist}>
            <MenubarSubTrigger className="text-md h-6 px-3">
              <div className="flex justify-between w-full items-center overflow-hidden">
                <span className="truncate min-w-0">{artist}</span>
              </div>
            </MenubarSubTrigger>
            <MenubarSubContent className="px-0 max-w-[180px] sm:max-w-[220px] max-h-[200px] overflow-y-auto">
              {(trackLimit !== undefined
                ? tracksByArtist[artist].slice(0, trackLimit)
                : tracksByArtist[artist]
              ).map(({ track, index }) => (
                <MenubarCheckboxItem
                  key={`${artist}-${track.id}`}
                  checked={index === currentIndex}
                  onCheckedChange={() => onPlayTrack(index)}
                  className="text-md h-6 pr-3 max-w-[160px] sm:max-w-[200px] truncate"
                >
                  <span className="truncate min-w-0">{track.title}</span>
                </MenubarCheckboxItem>
              ))}
            </MenubarSubContent>
          </MenubarSub>
        ))}
        {artistLimit !== undefined &&
          artists.length > artistLimit &&
          renderArtistLimitNotice && (
            <MenubarItem
              disabled
              className="text-md h-6 px-3 italic opacity-70"
            >
              {renderArtistLimitNotice(artistLimit, artists.length)}
            </MenubarItem>
          )}
      </div>
    </>
  );
}
