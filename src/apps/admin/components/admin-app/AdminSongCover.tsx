import { MusicNote } from "@phosphor-icons/react";
import { isAppleMusicId } from "@/utils/appleMusicId";
import {
  formatKugouImageUrl,
  resolveAppleMusicArtworkUrl,
} from "@/utils/coverArt";
import { useAppleMusicArtwork } from "../../hooks/useAppleMusicArtwork";

interface AdminSongCoverProps {
  /** Song id (YouTube video id or `am:` Apple Music id). */
  id: string;
  /** Stored cover URL from the song metadata, if any. */
  cover?: string;
  /** Pixel size used to resolve Kugou/Apple artwork templates. */
  pxSize: number;
  /** YouTube thumbnail quality used as a fallback for YouTube songs. */
  youtubeQuality?: "default" | "mqdefault";
  imgClassName?: string;
  placeholderClassName?: string;
}

/**
 * Renders a song's cover art with the right source per song type:
 * - Apple Music (`am:`) songs use the stored Apple/Kugou artwork, falling back
 *   to a lazy iTunes lookup, then a music-note placeholder.
 * - YouTube songs use the stored Kugou cover, falling back to the YouTube
 *   thumbnail.
 */
export function AdminSongCover({
  id,
  cover,
  pxSize,
  youtubeQuality = "mqdefault",
  imgClassName,
  placeholderClassName,
}: AdminSongCoverProps) {
  const isAppleMusic = isAppleMusicId(id);

  const directCover = isAppleMusic
    ? resolveAppleMusicArtworkUrl(cover, pxSize)
    : formatKugouImageUrl(cover, pxSize) ||
      `https://i.ytimg.com/vi/${id}/${youtubeQuality}.jpg`;

  // Only hit the network for Apple Music songs that lack a usable cover.
  const fetchedTemplate = useAppleMusicArtwork(id, {
    enabled: isAppleMusic && !directCover,
  });
  const resolvedFetched = resolveAppleMusicArtworkUrl(
    fetchedTemplate ?? undefined,
    pxSize
  );

  const finalUrl = directCover ?? resolvedFetched;

  if (!finalUrl) {
    return <MusicNote className={placeholderClassName} weight="bold" />;
  }

  return (
    <img
      src={finalUrl}
      alt=""
      className={imgClassName}
      loading="lazy"
      onError={
        isAppleMusic
          ? undefined
          : (e) => {
              const target = e.target as HTMLImageElement;
              try {
                const url = new URL(target.src);
                const isYouTube =
                  url.hostname === "img.youtube.com" ||
                  url.hostname === "i.ytimg.com";
                if (!isYouTube) {
                  target.src = `https://i.ytimg.com/vi/${id}/${youtubeQuality}.jpg`;
                }
              } catch {
                target.src = `https://i.ytimg.com/vi/${id}/${youtubeQuality}.jpg`;
              }
            }
      }
    />
  );
}
