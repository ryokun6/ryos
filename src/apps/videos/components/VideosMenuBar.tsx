import { useMemo } from "react";
import {
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSeparator,
} from "@/components/ui/menubar";
import { AppMenuBarShell } from "@/components/shared/menubar/AppMenuBarShell";
import {
  AppMenuBarMenus,
  type MenuDescriptor,
} from "@/components/shared/menubar/AppMenuBarMenus";
import { MediaControlsMenu } from "@/components/shared/menubar/MediaControlsMenu";
import { LibraryTrackBrowser } from "@/components/shared/menubar/LibraryTrackBrowser";
import { MENUBAR_SEPARATOR_CLASS } from "@/components/shared/menubar/menubarStyles";
import { useAppMenuBarChrome } from "@/hooks/useAppMenuBarChrome";
import {
  getSortedArtistNames,
  groupTracksByArtist,
} from "@/utils/groupTracksByArtist";
import { useTranslation } from "react-i18next";

interface Video {
  id: string;
  url: string;
  title: string;
  artist?: string;
}

interface VideosMenuBarProps {
  onClose: () => void;
  onShowHelp: () => void;
  onShowAbout: () => void;
  videos: Video[];
  currentVideoId: string | null;
  onPlayVideo: (videoId: string) => void;
  onClearPlaylist: () => void;
  onShufflePlaylist: () => void;
  onToggleLoopAll: () => void;
  onToggleLoopCurrent: () => void;
  onTogglePlay: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onAddVideo: () => void;
  onOpenVideo: () => void;
  onResetPlaylist: () => void;
  isLoopAll: boolean;
  isLoopCurrent: boolean;
  isPlaying: boolean;
  isShuffled: boolean;
  onFullScreen: () => void;
  onShareVideo: () => void;
}

export function VideosMenuBar({
  onClose,
  onShowHelp,
  onShowAbout,
  videos,
  currentVideoId,
  onPlayVideo,
  onClearPlaylist,
  onShufflePlaylist,
  onToggleLoopAll,
  onToggleLoopCurrent,
  onTogglePlay,
  onNext,
  onPrevious,
  onAddVideo,
  onOpenVideo,
  onResetPlaylist,
  isLoopAll,
  isLoopCurrent,
  isPlaying,
  isShuffled,
  onFullScreen,
  onShareVideo,
}: VideosMenuBarProps) {
  const { t } = useTranslation();
  const {
    isShareDialogOpen,
    setIsShareDialogOpen,
    isWindowsTheme,
    isMacOSTheme,
    appId,
    appName,
  } = useAppMenuBarChrome("videos");

  // Group videos by artist. Memoized because the menubar re-renders on
  // every player tick and the reduce/sort is wasted work otherwise.
  const unknownArtistLabel = t("apps.videos.menu.unknownArtist");
  const videosByArtist = useMemo(
    () => groupTracksByArtist(videos, unknownArtistLabel),
    [videos, unknownArtistLabel]
  );
  const artists = useMemo(
    () => getSortedArtistNames(videosByArtist),
    [videosByArtist]
  );

  const currentIndex = useMemo(
    () => videos.findIndex((video) => video.id === currentVideoId),
    [videos, currentVideoId]
  );

  const handlePlayVideo = (index: number) => {
    const video = videos[index];
    if (video) {
      onPlayVideo(video.id);
    }
  };

  const menus: MenuDescriptor[] = [
    {
      label: t("common.menu.file"),
      items: [
        {
          type: "action",
          label: t("apps.videos.menu.openVideo"),
          onClick: onOpenVideo,
        },
        {
          type: "action",
          label: t("apps.videos.menu.shareVideo"),
          onClick: onShareVideo,
          disabled: videos.length === 0,
        },
        { type: "separator" },
        {
          type: "action",
          label: t("common.menu.close"),
          onClick: onClose,
          shortcutId: "close",
        },
      ],
    },
  ];

  return (
    <AppMenuBarShell
      isWindowsTheme={isWindowsTheme}
      isMacOSTheme={isMacOSTheme}
      appId={appId}
      appName={appName}
      isShareDialogOpen={isShareDialogOpen}
      setIsShareDialogOpen={setIsShareDialogOpen}
      helpItemLabel={t("apps.videos.menu.videosHelp")}
      aboutItemLabel={t("apps.videos.menu.aboutVideos")}
      onShowHelp={onShowHelp}
      onShowAbout={onShowAbout}
    >
      {/* File Menu */}
      <AppMenuBarMenus menus={menus} />

      {/* Controls Menu */}
      <MediaControlsMenu
        menuLabel={t("apps.videos.menu.controls")}
        triggerClassName="px-2 py-1 text-md focus-visible:ring-0"
        tracksCount={videos.length}
        isPlaying={isPlaying}
        onTogglePlay={onTogglePlay}
        onPreviousTrack={onPrevious}
        onNextTrack={onNext}
        playLabel={t("apps.videos.menu.play")}
        pauseLabel={t("apps.videos.menu.pause")}
        previousLabel={t("apps.videos.menu.previous")}
        nextLabel={t("apps.videos.menu.next")}
        shuffleLabel={t("apps.videos.menu.shuffle")}
        repeatAllLabel={t("apps.videos.menu.repeatAll")}
        repeatOneLabel={t("apps.videos.menu.repeatOne")}
        isShuffled={isShuffled}
        onToggleShuffle={onShufflePlaylist}
        isLoopAll={isLoopAll}
        onToggleLoopAll={onToggleLoopAll}
        isLoopCurrent={isLoopCurrent}
        onToggleLoopCurrent={onToggleLoopCurrent}
        extraItems={
          <>
            <MenubarSeparator className={MENUBAR_SEPARATOR_CLASS} />
            <MenubarItem onClick={onFullScreen} className="text-md h-6 px-3">
              {t("apps.videos.menu.fullScreen")}
            </MenubarItem>
          </>
        }
      />

      {/* Library Menu */}
      <MenubarMenu>
        <MenubarTrigger className="px-2 py-1 text-md focus-visible:ring-0">
          {t("apps.videos.menu.library")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0 max-w-[180px] sm:max-w-[220px]">
          <MenubarItem
            onClick={onAddVideo}
            className="text-md h-6 px-3"
          >
            {t("apps.videos.menu.addToLibrary")}
          </MenubarItem>
          
          {videos.length > 0 && (
            <>
              <MenubarSeparator className={MENUBAR_SEPARATOR_CLASS} />

              <LibraryTrackBrowser
                tracks={videos}
                currentIndex={currentIndex}
                tracksByArtist={videosByArtist}
                artists={artists}
                onPlayTrack={handlePlayVideo}
                t={t}
                allItemsLabel={t("apps.videos.menu.allVideos")}
                itemVariant="nowPlaying"
                limitLargeLibraries={false}
              />

              <MenubarSeparator className={MENUBAR_SEPARATOR_CLASS} />
            </>
          )}
          
          <MenubarItem
            onClick={onClearPlaylist}
            className="text-md h-6 px-3"
          >
            {t("apps.videos.menu.clearLibrary")}
          </MenubarItem>
          <MenubarItem
            onClick={onResetPlaylist}
            className="text-md h-6 px-3"
          >
            {t("apps.videos.menu.resetLibrary")}
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

    </AppMenuBarShell>
  );
}
