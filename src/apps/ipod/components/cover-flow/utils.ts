import {
  getYouTubeVideoId,
  formatKugouImageUrl,
} from "../../constants";
import type { Track } from "@/stores/useIpodStore";

// Format a track duration in milliseconds as `m:ss`. Returns an empty
// string when the duration is unknown so the tracklist row collapses
// gracefully instead of showing "0:00" for songs that haven't reported
// their length yet (mostly a YouTube-only edge case).
export function formatTrackDuration(durationMs?: number): string {
  if (!durationMs || durationMs <= 0) return "";
  const totalSeconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

// Resolve the best cover URL for a track. Apple Music supplies a
// fully resolved URL; YouTube tracks fall back to a thumbnail derived
// from the video ID. The CoverFlow root + the per-cover renderer both
// need this same logic to drive the album-flip front face, so it
// lives here as a small helper instead of being duplicated.
export function resolveCoverUrl(
  track: Track | undefined | null,
  ipodMode: boolean
): string | null {
  if (!track) return null;
  const videoId = track.url ? getYouTubeVideoId(track.url) : null;
  const youtubeThumbnail = videoId
    ? `https://img.youtube.com/vi/${videoId}/${ipodMode ? "mqdefault" : "hqdefault"}.jpg`
    : null;
  const kugouImageSize = ipodMode ? 400 : 800;
  return track.source === "appleMusic"
    ? track.cover ?? null
    : formatKugouImageUrl(track.cover, kugouImageSize) ?? youtubeThumbnail;
}

// Cover size in `cqmin` units for a given Cover Flow variant. Used by
// `CoverImage` for the carousel and by the album-flip overlay so the
// flip's front face perfectly aligns with the underlying carousel
// cover before it rotates away.
export function getCoverSizeCqmin(
  ipodMode: boolean,
  compactIpodCarousel: boolean
): number {
  return ipodMode && !compactIpodCarousel ? 65 : ipodMode ? 58 : 60;
}
