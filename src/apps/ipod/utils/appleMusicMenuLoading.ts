import type { MenuItem } from "../types";

export function shouldUseModernAppleMusicTitlebarLoading(
  uiVariant: string | undefined
): boolean {
  return (uiVariant ?? "modern") !== "classic";
}

export function resolveAppleMusicMenuTitlebarLoading(options: {
  menuTitle: string;
  recentlyAddedTitle: string;
  favoriteSongsTitle: string;
  radioTitle: string;
  playlistsTitle: string;
  isRecentlyAddedLoading: boolean;
  isFavoritesLoading: boolean;
  isRadioLoading: boolean;
  isLibraryLoading: boolean;
  isPlaylistsLoading: boolean;
  playlistTracksLoading: Record<string, boolean>;
  playlists: { id: string; name: string }[];
  playlistsCount: number;
}): boolean {
  const {
    menuTitle,
    recentlyAddedTitle,
    favoriteSongsTitle,
    radioTitle,
    playlistsTitle,
    isRecentlyAddedLoading,
    isFavoritesLoading,
    isRadioLoading,
    isLibraryLoading,
    isPlaylistsLoading,
    playlistTracksLoading,
    playlists,
    playlistsCount,
  } = options;

  if (menuTitle === recentlyAddedTitle) return isRecentlyAddedLoading;
  if (menuTitle === favoriteSongsTitle) return isFavoritesLoading;
  if (menuTitle === radioTitle) return isRadioLoading;
  if (menuTitle === playlistsTitle) {
    // Show the titlebar spinner whenever ANY of the following is in flight:
    //   - The very first library load (`isLibraryLoading` with no cached
    //     playlists), so the menu reads as actively populating rather
    //     than empty.
    //   - The playlist *list* refresh itself, even when a cached list
    //     is already on screen (opportunistic background revalidation,
    //     `loadAppleMusicPlaylists` on menu entry, etc.).
    //   - Any per-playlist track pre-fetch — this is what fills in the
    //     "N songs" subtitles on each row, so the spinner remains until
    //     every row has its count.
    if (isLibraryLoading && playlistsCount === 0) return true;
    if (isPlaylistsLoading) return true;
    for (const id in playlistTracksLoading) {
      if (playlistTracksLoading[id] === true) return true;
    }
    return false;
  }

  const playlist = playlists.find((entry) => entry.name === menuTitle);
  if (playlist) {
    return playlistTracksLoading[playlist.id] === true;
  }

  return false;
}

/** Classic LCD: one non-interactive "Loading…" row; modern: empty list + titlebar spinner. */
export function appleMusicLoadingPlaceholderMenuItems(
  loadingLabel: string,
  useModernTitlebarLoading: boolean
): MenuItem[] {
  if (useModernTitlebarLoading) {
    return [];
  }
  return [
    {
      label: loadingLabel,
      action: () => {},
      showChevron: false,
      isLoading: true,
    },
  ];
}
