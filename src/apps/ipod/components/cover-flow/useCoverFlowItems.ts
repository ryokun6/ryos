import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { getAlbumGroupingKey } from "../../constants";
import type { Track } from "@/stores/useIpodStore";
import type { CoverFlowItem } from "./types";

export function useCoverFlowItems(
  tracks: Track[],
  currentIndex: number,
  groupAppleMusicAlbums: boolean
) {
  const { t } = useTranslation();
  const unknownArtistLabel = t("apps.ipod.menu.unknownArtist");
  const unknownAlbumLabel = t("apps.ipod.menuItems.unknownAlbum");

  const coverItems = useMemo<CoverFlowItem[]>(() => {
    if (!groupAppleMusicAlbums) {
      return tracks.map((track, index) => ({
        key: track.id,
        track,
        trackIndex: index,
        trackIndices: [index],
        title: track.title,
        artist: track.artist,
      }));
    }

    const grouped = new Map<string, CoverFlowItem>();
    for (let index = 0; index < tracks.length; index++) {
      const track = tracks[index];
      const artist = track.albumArtist || track.artist || unknownArtistLabel;
      const album = track.album || unknownAlbumLabel;
      const key = getAlbumGroupingKey(
        track,
        unknownAlbumLabel,
        unknownArtistLabel
      );
      const existing = grouped.get(key);
      if (existing) {
        existing.trackIndices.push(index);
      } else {
        grouped.set(key, {
          key,
          track,
          trackIndex: index,
          trackIndices: [index],
          title: album,
          artist,
        });
      }
    }

    return Array.from(grouped.values()).sort((a, b) => {
      const artistCompare = (a.artist ?? "").localeCompare(b.artist ?? "", undefined, {
        sensitivity: "base",
      });
      if (artistCompare !== 0) return artistCompare;
      return a.title.localeCompare(b.title, undefined, {
        sensitivity: "base",
      });
    });
  }, [tracks, groupAppleMusicAlbums, unknownArtistLabel, unknownAlbumLabel]);

  const currentCoverIndex = useMemo(() => {
    const index = coverItems.findIndex((item) =>
      item.trackIndices.includes(currentIndex)
    );
    return index >= 0 ? index : Math.min(currentIndex, coverItems.length - 1);
  }, [coverItems, currentIndex]);

  return { coverItems, currentCoverIndex };
}
