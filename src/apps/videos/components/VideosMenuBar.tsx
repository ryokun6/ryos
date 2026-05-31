import {
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSeparator,
  MenubarSub,
  MenubarSubTrigger,
  MenubarSubContent,
} from "@/components/ui/menubar";
import { AppMenuBarShell } from "@/components/shared/menubar/AppMenuBarShell";
import { MediaControlsMenu } from "@/components/shared/menubar/MediaControlsMenu";
import { MENUBAR_SEPARATOR_CLASS } from "@/components/shared/menubar/menubarStyles";
import { useAppMenuBarChrome } from "@/hooks/useAppMenuBarChrome";
import { cn } from "@/lib/utils";
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
    isXpTheme,
    isMacOsxTheme,
    appId,
    appName,
  } = useAppMenuBarChrome("videos");

  // Group videos by artist
  const videosByArtist = videos.reduce<Record<string, Video[]>>(
    (acc, video) => {
      const artist = video.artist || t("apps.videos.menu.unknownArtist");
      if (!acc[artist]) {
        acc[artist] = [];
      }
      acc[artist].push(video);
      return acc;
    },
    {}
  );

  // Get sorted list of artists
  const artists = Object.keys(videosByArtist).sort();

  return (
    <AppMenuBarShell
      isXpTheme={isXpTheme}
      isMacOsxTheme={isMacOsxTheme}
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
      <MenubarMenu>
        <MenubarTrigger className="text-md px-2 py-1 border-none focus-visible:ring-0">
          {t("common.menu.file")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarItem
            onClick={onOpenVideo}
            className="text-md h-6 px-3"
          >
            {t("apps.videos.menu.openVideo")}
          </MenubarItem>
          <MenubarItem
            onClick={onShareVideo}
            className="text-md h-6 px-3"
            disabled={videos.length === 0}
          >
            {t("apps.videos.menu.shareVideo")}
          </MenubarItem>
          <MenubarSeparator className={MENUBAR_SEPARATOR_CLASS} />
          <MenubarItem
            onClick={onClose}
            className="text-md h-6 px-3"
          >
            {t("common.menu.close")}
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

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
              
              {/* All Videos section */}
              <MenubarSub>
                <MenubarSubTrigger className="text-md h-6 px-3">
                  <div className="flex justify-between w-full items-center overflow-hidden">
                    <span className="truncate min-w-0">{t("apps.videos.menu.allVideos")}</span>
                  </div>
                </MenubarSubTrigger>
                <MenubarSubContent className="px-0 max-w-[180px] sm:max-w-[220px]">
                  {videos.map((video) => (
                    <MenubarItem
                      key={`all-${video.id}`}
                      onClick={() => onPlayVideo(video.id)}
                      className={cn(
                        "text-md h-6 px-3 max-w-[220px] truncate",
                        video.id === currentVideoId && "bg-neutral-200"
                      )}
                    >
                      <div className="flex items-center w-full">
                        <span
                          className={cn(
                            "flex-none whitespace-nowrap",
                            video.id === currentVideoId ? "mr-1" : "pl-5"
                          )}
                        >
                          {video.id === currentVideoId ? "♪ " : ""}
                        </span>
                        <span className="truncate min-w-0">{video.title}</span>
                      </div>
                    </MenubarItem>
                  ))}
                </MenubarSubContent>
              </MenubarSub>
              
              {/* Individual Artist submenus */}
              {artists.map((artist) => (
                <MenubarSub key={artist}>
                  <MenubarSubTrigger className="text-md h-6 px-3">
                    <div className="flex justify-between w-full items-center overflow-hidden">
                      <span className="truncate min-w-0">{artist}</span>
                    </div>
                  </MenubarSubTrigger>
                  <MenubarSubContent className="px-0 max-w-[180px] sm:max-w-[220px]">
                    {videosByArtist[artist].map((video) => (
                      <MenubarItem
                        key={`${artist}-${video.id}`}
                        onClick={() => onPlayVideo(video.id)}
                        className={cn(
                          "text-md h-6 px-3 max-w-[160px] sm:max-w-[200px] truncate",
                          video.id === currentVideoId && "bg-neutral-200"
                        )}
                      >
                        <div className="flex items-center w-full">
                          <span
                            className={cn(
                              "flex-none whitespace-nowrap",
                              video.id === currentVideoId ? "mr-1" : "pl-5"
                            )}
                          >
                            {video.id === currentVideoId ? "♪ " : ""}
                          </span>
                          <span className="truncate min-w-0">{video.title}</span>
                        </div>
                      </MenubarItem>
                    ))}
                  </MenubarSubContent>
                </MenubarSub>
              ))}
              
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
