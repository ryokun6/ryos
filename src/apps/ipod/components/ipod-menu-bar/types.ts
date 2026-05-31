/** Props for the iPod app menubar shell (`ipod-menu-bar/`). */
export interface IpodMenuBarProps {
  onClose: () => void;
  onShowHelp: () => void;
  onShowAbout: () => void;
  onClearLibrary: () => void;
  onSyncLibrary: () => void;
  onAddSong: () => void;
  onShareSong: () => void;
  onAddToFavorites?: () => void;
  onRefreshLyrics?: () => void;
  onAdjustTiming?: () => void;
  onToggleCoverFlow?: () => void;
  appleMusicAuthorized?: boolean;
  musicKitConfigured?: boolean;
  onSwitchLibrary?: (source: "youtube" | "appleMusic") => void;
  onAppleMusicSignIn?: () => void;
  onAppleMusicSignOut?: () => void;
  onAppleMusicRefresh?: () => void;
}
