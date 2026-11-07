import { MusicNotes } from "@phosphor-icons/react";
import {
  getActiveIpodCurrentSongId,
  getActiveIpodTracks,
  setActiveIpodCurrentSongId,
  useIpodStore,
} from "@/stores/useIpodStore";

export function useJournalSongCover(songId: string | null, stored: string | null): string | null {
  return useIpodStore((state) => {
    if (stored) return stored;
    if (!songId) return null;
    const active = getActiveIpodTracks(state);
    const tracks =
      active.length > 0 ? active : state.tracks.length > 0 ? state.tracks : state.appleMusicTracks;
    const cover = tracks.find((track) => track.id === songId)?.cover;
    return cover && cover.length > 0 ? cover : null;
  });
}

/** Switch the iPod to this song and play it. Clicking the current song pauses, then plays again. */
export function toggleJournalSong(songId: string) {
  const ipod = useIpodStore.getState();
  const currentId = getActiveIpodCurrentSongId(ipod);
  const active = ipod.isPlaying || ipod.playbackRequested;
  if (currentId === songId && active) {
    ipod.setIsPlaying(false);
    return;
  }
  if (currentId !== songId) setActiveIpodCurrentSongId(ipod, songId);
  ipod.setIsPlaying(true);
}

export function JournalSongMark({
  songId,
  cover,
  size = 32,
}: {
  songId: string | null;
  cover: string | null;
  size?: number;
}) {
  const art = useJournalSongCover(songId, cover);
  if (!art) {
    return <MusicNotes size={Math.min(size, 18)} weight="bold" className="shrink-0" />;
  }
  return (
    <img
      src={art}
      alt=""
      draggable={false}
      className="shrink-0 rounded-[4px] object-cover"
      style={{ width: size, height: size }}
    />
  );
}
