import { useMemo } from "react";
import {
  useIpodStore,
  getActiveIpodCurrentTrack,
  type AppleMusicKitNowPlaying,
} from "@/stores/useIpodStore";
import type { Track } from "@/shared/media/library";
import { useKaraokeStore } from "@/stores/useKaraokeStore";
import {
  resolveAppleMusicArtworkUrl,
  resolveMediaCoverUrl,
} from "@/utils/coverArt";

export interface NowPlayingCover {
  coverUrl: string | null;
  title: string | null;
  /** Whichever player is currently driving the cover. */
  source: "ipod" | "karaoke" | null;
  isPlaying: boolean;
}

const EMPTY: NowPlayingCover = {
  coverUrl: null,
  title: null,
  source: null,
  isPlaying: false,
};

function resolveCover(
  track: Track | null,
  nowPlaying: AppleMusicKitNowPlaying | null
): string | null {
  if (track?.source === "appleMusic" || (!track && nowPlaying)) {
    const cover = nowPlaying?.cover ?? track?.cover;
    return resolveAppleMusicArtworkUrl(cover, 1000);
  }
  return resolveMediaCoverUrl(track, { kugouSize: 800 });
}

/**
 * Resolves the cover art that should be shown for the "Now Playing" dynamic
 * wallpaper. Prefers whichever of the iPod / Karaoke players is actively
 * playing (iPod wins ties); otherwise falls back to whichever has a current
 * track so the cover still shows while paused.
 */
export function useNowPlayingCover(): NowPlayingCover {
  // iPod playback state.
  const ipodIsPlaying = useIpodStore((s) => s.isPlaying);
  const ipodLibrarySource = useIpodStore((s) => s.librarySource);
  const ipodCurrentSongId = useIpodStore((s) => s.currentSongId);
  const ipodAppleSongId = useIpodStore((s) => s.appleMusicCurrentSongId);
  const ipodTracks = useIpodStore((s) => s.tracks);
  const ipodAppleTracks = useIpodStore((s) => s.appleMusicTracks);
  const ipodNowPlaying = useIpodStore((s) => s.appleMusicKitNowPlaying);

  // Karaoke playback state (library is shared with the iPod's YouTube tracks).
  const karaokeIsPlaying = useKaraokeStore((s) => s.isPlaying);
  const karaokeSongId = useKaraokeStore((s) => s.currentSongId);

  return useMemo<NowPlayingCover>(() => {
    const ipodTrack = getActiveIpodCurrentTrack({
      librarySource: ipodLibrarySource,
      tracks: ipodTracks,
      currentSongId: ipodCurrentSongId,
      appleMusicTracks: ipodAppleTracks,
      appleMusicCurrentSongId: ipodAppleSongId,
    });

    const karaokeTrack = karaokeSongId
      ? ipodTracks.find((t) => t.id === karaokeSongId) ?? null
      : null;

    type Candidate = {
      source: "ipod" | "karaoke";
      track: Track | null;
      nowPlaying: AppleMusicKitNowPlaying | null;
      isPlaying: boolean;
    };

    const ipodCandidate: Candidate = {
      source: "ipod",
      track: ipodTrack,
      nowPlaying: ipodLibrarySource === "appleMusic" ? ipodNowPlaying : null,
      isPlaying: ipodIsPlaying,
    };
    const karaokeCandidate: Candidate = {
      source: "karaoke",
      track: karaokeTrack,
      nowPlaying: null,
      isPlaying: karaokeIsPlaying,
    };

    // Precedence: actively playing first (iPod wins ties), then whichever has
    // a track so paused playback still shows its cover.
    let chosen: Candidate | null = null;
    if (ipodCandidate.isPlaying) chosen = ipodCandidate;
    else if (karaokeCandidate.isPlaying) chosen = karaokeCandidate;
    else if (ipodCandidate.track) chosen = ipodCandidate;
    else if (karaokeCandidate.track) chosen = karaokeCandidate;

    if (!chosen) return EMPTY;

    const coverUrl = resolveCover(chosen.track, chosen.nowPlaying);
    const title = chosen.nowPlaying?.title ?? chosen.track?.title ?? null;
    return {
      coverUrl,
      title,
      source: chosen.source,
      isPlaying: chosen.isPlaying,
    };
  }, [
    ipodIsPlaying,
    ipodLibrarySource,
    ipodCurrentSongId,
    ipodAppleSongId,
    ipodTracks,
    ipodAppleTracks,
    ipodNowPlaying,
    karaokeIsPlaying,
    karaokeSongId,
  ]);
}
