import { useState } from "react";
import { MenuBar } from "@/components/layout/MenuBar";
import {
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSeparator,
  MenubarSub,
  MenubarSubTrigger,
  MenubarSubContent,
  MenubarCheckboxItem,
} from "@/components/ui/menubar";
import { cn } from "@/lib/utils";
import { generateAppShareUrl } from "@/utils/sharedUrl";
import { useThemeStore } from "@/stores/useThemeStore";
import { ShareItemDialog } from "@/components/dialogs/ShareItemDialog";
import { appRegistry } from "@/config/appRegistry";
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
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const appId = "videos";
  const appName = appRegistry[appId as keyof typeof appRegistry]?.name || appId;
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  const isMacOsxTheme = currentTheme === "macosx";

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
    <MenuBar inWindowFrame={isXpTheme}>
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
          <MenubarSeparator className="h-[2px] bg-black my-1" />
          <MenubarItem
            onClick={onClose}
            className="text-md h-6 px-3"
          >
            {t("common.menu.close")}
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      {/* Controls Menu */}
      <MenubarMenu>
        <MenubarTrigger className="px-2 py-1 text-md focus-visible:ring-0">
          {t("apps.videos.menu.controls")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarItem
            onClick={onTogglePlay}
            className="text-md h-6 px-3"
            disabled={videos.length === 0}
          >
            {isPlaying ? t("apps.videos.menu.pause") : t("apps.videos.menu.play")}
          </MenubarItem>
          <MenubarItem
            onClick={onPrevious}
            className="text-md h-6 px-3"
            disabled={videos.length === 0}
          >
            {t("apps.videos.menu.previous")}
          </MenubarItem>
          <MenubarItem
            onClick={onNext}
            className="text-md h-6 px-3"
            disabled={videos.length === 0}
          >
            {t("apps.videos.menu.next")}
          </MenubarItem>
          <MenubarSeparator className="h-[2px] bg-black my-1" />
          <MenubarItem
            onClick={onFullScreen}
            className="text-md h-6 px-3"
          >
            {t("apps.videos.menu.fullScreen")}
          </MenubarItem>
          <MenubarSeparator className="h-[2px] bg-black my-1" />
          <MenubarCheckboxItem
            checked={isShuffled}
            onCheckedChange={(checked) => {
              if (checked !== isShuffled) onShufflePlaylist();
            }}
            className="text-md h-6 px-3"
          >
            {t("apps.videos.menu.shuffle")}
          </MenubarCheckboxItem>
          <MenubarCheckboxItem
            checked={isLoopAll}
            onCheckedChange={(checked) => {
              if (checked !== isLoopAll) onToggleLoopAll();
            }}
            className="text-md h-6 px-3"
          >
            {t("apps.videos.menu.repeatAll")}
          </MenubarCheckboxItem>
          <MenubarCheckboxItem
            checked={isLoopCurrent}
            onCheckedChange={(checked) => {
              if (checked !== isLoopCurrent) onToggleLoopCurrent();
            }}
            className="text-md h-6 px-3"
          >
            {t("apps.videos.menu.repeatOne")}
          </MenubarCheckboxItem>
        </MenubarContent>
      </MenubarMenu>

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
              <MenubarSeparator className="h-[2px] bg-black my-1" />
              
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
                        video.id === currentVideoId && "bg-gray-200"
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
                          video.id === currentVideoId && "bg-gray-200"
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
              
              <MenubarSeparator className="h-[2px] bg-black my-1" />
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

      {/* Help Menu */}
      <MenubarMenu>
        <MenubarTrigger className="px-2 py-1 text-md focus-visible:ring-0">
          {t("common.menu.help")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarItem
            onClick={onShowHelp}
            className="text-md h-6 px-3"
          >
            {t("apps.videos.menu.videosHelp")}
          </MenubarItem>
          {!isMacOsxTheme && (
            <>
              <MenubarItem
                onSelect={() => setIsShareDialogOpen(true)}
                className="text-md h-6 px-3"
              >
                {t("common.menu.shareApp")}
              </MenubarItem>
              <MenubarSeparator className="h-[2px] bg-black my-1" />
              <MenubarItem
                onClick={onShowAbout}
                className="text-md h-6 px-3"
              >
                {t("apps.videos.menu.aboutVideos")}
              </MenubarItem>
            </>
          )}
        </MenubarContent>
      </MenubarMenu>
      <ShareItemDialog
        isOpen={isShareDialogOpen}
        onClose={() => setIsShareDialogOpen(false)}
        itemType="App"
        itemIdentifier={appId}
        title={appName}
        generateShareUrl={generateAppShareUrl}
      />
    </MenuBar>
  );
}
