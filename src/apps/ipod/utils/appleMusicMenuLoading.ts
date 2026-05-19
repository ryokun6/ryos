import type { MenuItem } from "../types";

export function shouldUseModernAppleMusicTitlebarLoading(
  uiVariant: string | undefined
): boolean {
  return (uiVariant ?? "modern") === "modern";
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
    playlistTracksLoading,
    playlists,
    playlistsCount,
  } = options;

  if (menuTitle === recentlyAddedTitle) return isRecentlyAddedLoading;
  if (menuTitle === favoriteSongsTitle) return isFavoritesLoading;
  if (menuTitle === radioTitle) return isRadioLoading;
  if (menuTitle === playlistsTitle) {
    return isLibraryLoading && playlistsCount === 0;
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
