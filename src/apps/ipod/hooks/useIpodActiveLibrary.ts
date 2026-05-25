import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  isAppleMusicCollectionTrack,
  useIpodStore,
} from "@/stores/useIpodStore";
import {
  buildIpodLibraryIndex,
  resolveCurrentTrackIndex,
} from "../utils/ipodLibraryIndex";

export function useIpodActiveLibrary() {
  const {
    youtubeTracks,
    youtubeCurrentSongId,
    appleMusicTracks,
    appleMusicPlaylists,
    appleMusicPlaylistTracks,
    appleMusicPlaylistTracksLoading,
    appleMusicPlaylistsLoading,
    appleMusicPlaybackQueue,
    appleMusicCurrentSongId,
    librarySource,
    loopCurrent,
    loopAll,
    isShuffled,
    isPlaying,
    showVideo,
    backlightOn,
  } = useIpodStore(
    useShallow((s) => ({
      youtubeTracks: s.tracks,
      youtubeCurrentSongId: s.currentSongId,
      appleMusicTracks: s.appleMusicTracks,
      appleMusicPlaylists: s.appleMusicPlaylists,
      appleMusicPlaylistTracks: s.appleMusicPlaylistTracks,
      appleMusicPlaylistTracksLoading: s.appleMusicPlaylistTracksLoading,
      appleMusicPlaylistsLoading: s.appleMusicPlaylistsLoading,
      appleMusicPlaybackQueue: s.appleMusicPlaybackQueue,
      appleMusicCurrentSongId: s.appleMusicCurrentSongId,
      librarySource: s.librarySource,
      loopCurrent: s.loopCurrent,
      loopAll: s.loopAll,
      isShuffled: s.isShuffled,
      isPlaying: s.isPlaying,
      showVideo: s.showVideo,
      backlightOn: s.backlightOn,
    }))
  );

  const isAppleMusic = librarySource === "appleMusic";
  const tracks = isAppleMusic ? appleMusicTracks : youtubeTracks;
  const browsableTracks = useMemo(
    () =>
      isAppleMusic
        ? tracks.filter((track) => !isAppleMusicCollectionTrack(track))
        : tracks,
    [isAppleMusic, tracks]
  );
  const currentSongId = isAppleMusic
    ? appleMusicCurrentSongId
    : youtubeCurrentSongId;
  const trackIndex = useMemo(() => buildIpodLibraryIndex(tracks), [tracks]);
  const browsableTrackIndex = useMemo(
    () => buildIpodLibraryIndex(browsableTracks),
    [browsableTracks]
  );

  const currentIndex = useMemo(
    () =>
      resolveCurrentTrackIndex(
        trackIndex.indexById,
        currentSongId,
        tracks.length
      ),
    [trackIndex, currentSongId, tracks.length]
  );
  const browseCurrentIndex = useMemo(
    () =>
      resolveCurrentTrackIndex(
        browsableTrackIndex.indexById,
        currentSongId,
        browsableTracks.length
      ),
    [browsableTrackIndex, currentSongId, browsableTracks.length]
  );
  const coverFlowCurrentIndex = browseCurrentIndex >= 0 ? browseCurrentIndex : 0;

  const nowPlayingScope = useMemo(() => {
    if (!isAppleMusic) {
      return { index: currentIndex, total: tracks.length };
    }
    if (!appleMusicPlaybackQueue || appleMusicPlaybackQueue.length === 0) {
      return {
        index: browseCurrentIndex >= 0 ? browseCurrentIndex : currentIndex,
        total: browsableTracks.length,
      };
    }
    const queue = appleMusicPlaybackQueue.filter((id) =>
      trackIndex.idSet.has(id)
    );
    if (queue.length === 0) {
      return { index: currentIndex, total: tracks.length };
    }
    const idx = currentSongId ? queue.indexOf(currentSongId) : -1;
    if (idx < 0) return { index: currentIndex, total: tracks.length };
    return { index: idx, total: queue.length };
  }, [
    isAppleMusic,
    appleMusicPlaybackQueue,
    tracks.length,
    trackIndex,
    browsableTracks.length,
    currentSongId,
    currentIndex,
    browseCurrentIndex,
  ]);

  return {
    appleMusicTracks,
    appleMusicPlaylists,
    appleMusicPlaylistTracks,
    appleMusicPlaylistTracksLoading,
    appleMusicPlaylistsLoading,
    appleMusicCurrentSongId,
    librarySource,
    isAppleMusic,
    tracks,
    browsableTracks,
    currentSongId,
    currentIndex,
    browseCurrentIndex,
    coverFlowCurrentIndex,
    nowPlayingScope,
    loopCurrent,
    loopAll,
    isShuffled,
    isPlaying,
    showVideo,
    backlightOn,
  };
}
