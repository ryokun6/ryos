import { MusicNotes, Pause, Play } from "@phosphor-icons/react";
import type { MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  getActiveIpodCurrentSongId,
  getActiveIpodTracks,
  setActiveIpodCurrentSongId,
  useIpodStore,
} from "@/stores/useIpodStore";
import { resolveMediaCoverUrl, type MediaCoverInput } from "@/utils/coverArt";

/** Same Kugou size iPod fullscreen and Karaoke use for now-playing art. */
export const JOURNAL_SONG_COVER_KUGOU_SIZE = 800;

const PLAY_CONTROL_SELECTOR = "[data-journal-song-play]";

type JournalSongLibrary = Parameters<typeof getActiveIpodTracks>[0];

export function resolveJournalSongCover(
  track: MediaCoverInput | null | undefined,
  stored: string | null
): string | null {
  if (track) {
    return resolveMediaCoverUrl(track, { kugouSize: JOURNAL_SONG_COVER_KUGOU_SIZE });
  }
  if (!stored) return null;
  return resolveMediaCoverUrl({ cover: stored }, { kugouSize: JOURNAL_SONG_COVER_KUGOU_SIZE });
}

function findJournalSongTrack(state: JournalSongLibrary, songId: string) {
  const active = getActiveIpodTracks(state);
  return (
    active.find((track) => track.id === songId) ??
    state.tracks.find((track) => track.id === songId) ??
    state.appleMusicTracks.find((track) => track.id === songId)
  );
}

export function useJournalSongCover(songId: string | null, stored: string | null): string | null {
  return useIpodStore((state) => {
    const track = songId ? findJournalSongTrack(state, songId) : undefined;
    return resolveJournalSongCover(track, stored);
  });
}

function useJournalSongIsPlaying(songId: string | null): boolean {
  return useIpodStore((state) => {
    if (!songId) return false;
    if (getActiveIpodCurrentSongId(state) !== songId) return false;
    return state.isPlaying || state.playbackRequested;
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

export function isJournalSongPlayControl(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(PLAY_CONTROL_SELECTOR) !== null;
}

function JournalSongPlayButton({
  songId,
  playing,
  size,
}: {
  songId: string;
  playing: boolean;
  size: number;
}) {
  const { t } = useTranslation();
  const iconSize = Math.max(12, Math.round(size * 0.42));

  function onClick(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    toggleJournalSong(songId);
  }

  return (
    <button
      type="button"
      data-journal-song-play=""
      aria-label={playing ? t("apps.journal.toolbar.pause") : t("apps.journal.toolbar.play")}
      className="absolute inset-0 flex cursor-pointer items-center justify-center rounded-[4px] bg-black/45 text-white opacity-0 transition-opacity group-hover/song:opacity-100 focus-visible:opacity-100"
      onClick={onClick}
    >
      {playing ? (
        <Pause size={iconSize} weight="fill" />
      ) : (
        <Play size={iconSize} weight="fill" className="translate-x-px" />
      )}
    </button>
  );
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
  const playing = useJournalSongIsPlaying(songId);

  return (
    <span
      className="relative block shrink-0 overflow-hidden rounded-[4px]"
      style={{ width: size, height: size }}
    >
      {art ? (
        <img
          src={art}
          alt=""
          draggable={false}
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center">
          <MusicNotes size={Math.min(size, 18)} weight="bold" />
        </span>
      )}
      {songId ? <JournalSongPlayButton songId={songId} playing={playing} size={size} /> : null}
    </span>
  );
}
