import { useCallback, useRef } from "react";
import { updateSongById } from "@/api/songs";
import {
  normalizeCoverColor,
} from "@/apps/ipod/components/lyrics-display/colorUtils";
import { useChatsStore } from "@/stores/useChatsStore";
import { useIpodStore } from "@/stores/useIpodStore";

interface SongCoverColorTrack {
  id: string;
  coverColor?: string | null;
}

export function useSaveSongCoverColor(track: SongCoverColorTrack | null) {
  const savedKeysRef = useRef<Set<string>>(new Set());
  const username = useChatsStore((state) => state.username);
  const isAuthenticated = useChatsStore((state) => state.isAuthenticated);
  const setTrackCoverColor = useIpodStore((state) => state.setTrackCoverColor);

  return useCallback(
    async (coverColor: string, coverUrl: string) => {
      const normalized = normalizeCoverColor(coverColor);
      if (!track || !normalized || normalizeCoverColor(track.coverColor) === normalized) {
        return;
      }
      setTrackCoverColor(track.id, normalized);
      if (!username || !isAuthenticated) {
        return;
      }

      const saveKey = `${track.id}:${coverUrl}:${normalized}`;
      if (savedKeysRef.current.has(saveKey)) return;
      savedKeysRef.current.add(saveKey);

      try {
        await updateSongById(
          track.id,
          { coverColor: normalized },
          { username, isAuthenticated }
        );
      } catch (error) {
        savedKeysRef.current.delete(saveKey);
        console.warn(`[SongCoverColor] Failed to save cover color for ${track.id}`, error);
      }
    },
    [isAuthenticated, setTrackCoverColor, track, username]
  );
}
