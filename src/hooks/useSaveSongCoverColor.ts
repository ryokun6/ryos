import { useCallback, useRef } from "react";
import { updateSongById } from "@/api/songs";
import {
  normalizeCoverColor,
} from "@/apps/ipod/components/lyrics-display/colorUtils";
import { useChatsStore } from "@/stores/useChatsStore";

interface SongCoverColorTrack {
  id: string;
  coverColor?: string | null;
}

export function useSaveSongCoverColor(track: SongCoverColorTrack | null) {
  const savedKeysRef = useRef<Set<string>>(new Set());
  const username = useChatsStore((state) => state.username);
  const isAuthenticated = useChatsStore((state) => state.isAuthenticated);

  return useCallback(
    async (coverColor: string, coverUrl: string) => {
      const normalized = normalizeCoverColor(coverColor);
      if (!track || !normalized || normalizeCoverColor(track.coverColor) === normalized) {
        return;
      }
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
    [isAuthenticated, track, username]
  );
}
