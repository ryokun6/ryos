import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SkipBack, SkipForward, Play, Pause } from "@phosphor-icons/react";
import { AnimatedNumber } from "@/components/shared/lcd/AnimatedNumber";
import { LcdAnimatedTitle } from "@/components/shared/lcd/LcdAnimatedTitle";
import { VideosLcdTime } from "./VideosLcdTime";
import type { VideosAppController } from "./useVideosAppController";

type VideosCdPlayerControlsProps = {
  c: VideosAppController;
};

export function VideosCdPlayerControls({ c }: VideosCdPlayerControlsProps) {
  const {
    t,
    videos,
    isMacOSTheme,
    isPlaying,
    getCurrentIndex,
    formatTime,
    isDraggingSeek,
    dragSeekTime,
    getCurrentVideo,
    animationDirection,
    previousVideo,
    togglePlay,
    nextVideo,
    toggleShuffle,
    isShuffled,
    loopAll,
    setLoopAll,
    loopCurrent,
    setLoopCurrent,
    setIsAddDialogOpen,
  } = c;

  const currentVideo = getCurrentVideo();
  const lcdTitle = currentVideo?.artist
    ? `${currentVideo.title} - ${currentVideo.artist}`
    : currentVideo?.title || "";

  return (
    <div
      className={cn(
        "flex flex-col gap-4",
        isMacOSTheme
          ? "bg-transparent p-2 pt-4 border-t-0"
          : "bg-[#2a2a2a] os-toolbar-texture p-4 border-t border-[#3a3a3a]"
      )}
    >
      <div className="videos-lcd bg-black py-2 px-4 flex items-center justify-between w-full">
        <div className="flex items-center gap-8">
          <div
            className={cn(
              "font-geneva-12 text-[10px] transition-colors duration-300",
              isPlaying ? "text-[#ff00ff]" : "text-neutral-600"
            )}
          >
            <div>{t("apps.videos.status.track")}</div>
            <div className="text-xl">
              <AnimatedNumber number={getCurrentIndex() + 1} />
            </div>
          </div>
          <div
            className={cn(
              "font-geneva-12 text-[10px] transition-colors duration-300",
              isPlaying ? "text-[#ff00ff]" : "text-neutral-600"
            )}
          >
            <div>{t("apps.videos.status.time")}</div>
            <div className="text-xl">
              <VideosLcdTime
                formatTime={formatTime}
                isDraggingSeek={isDraggingSeek}
                dragSeekTime={dragSeekTime}
              />
            </div>
          </div>
        </div>
        <div className="relative overflow-hidden flex-1 px-2">
          <div
            className={cn(
              "font-geneva-12 text-[10px] transition-colors duration-300 mb-[3px] pl-2",
              isPlaying ? "text-[#ff00ff]" : "text-neutral-600"
            )}
          >
            {t("apps.videos.status.title")}
          </div>
          {videos.length > 0 && (
            <div className="relative overflow-hidden">
              <LcdAnimatedTitle
                title={lcdTitle}
                direction={animationDirection}
                isPlaying={isPlaying}
              />
              {isPlaying && (
                <div className="absolute left-0 top-0 h-full w-4 bg-gradient-to-r from-black to-transparent videos-lcd-fade-left" />
              )}
              <div className="absolute right-0 top-0 h-full w-4 bg-gradient-to-l from-black to-transparent videos-lcd-fade-right" />
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between videos-player-controls">
        <div className="flex items-center gap-2">
          {isMacOSTheme ? (
            <div className="metal-inset-btn-group">
              <button
                type="button"
                className="metal-inset-btn metal-inset-icon"
                onClick={previousVideo}
                disabled={videos.length === 0}
              >
                <SkipBack size={10} weight="fill" />
              </button>
              <button
                type="button"
                className="metal-inset-btn metal-inset-icon"
                onClick={togglePlay}
                disabled={videos.length === 0}
                style={{ minWidth: 32 }}
              >
                {isPlaying ? (
                  <Pause size={10} weight="fill" />
                ) : (
                  <Play size={10} weight="fill" />
                )}
              </button>
              <button
                type="button"
                className="metal-inset-btn metal-inset-icon"
                onClick={nextVideo}
                disabled={videos.length === 0}
              >
                <SkipForward size={10} weight="fill" />
              </button>
            </div>
          ) : (
            <div className="flex gap-0">
              <button
                onClick={previousVideo}
                className={cn(
                  "flex items-center justify-center disabled:opacity-50 focus:outline-none",
                  "hover:brightness-75 active:brightness-50"
                )}
                disabled={videos.length === 0}
              >
                <img
                  src="/assets/videos/prev.png"
                  alt={t("apps.videos.menu.previous")}
                  width={32}
                  height={22}
                  className="pointer-events-none"
                />
              </button>
              <button
                onClick={togglePlay}
                className={cn(
                  "flex items-center justify-center disabled:opacity-50 focus:outline-none",
                  "hover:brightness-75 active:brightness-50"
                )}
                disabled={videos.length === 0}
              >
                <img
                  src={
                    isPlaying
                      ? "/assets/videos/pause.png"
                      : "/assets/videos/play.png"
                  }
                  alt={
                    isPlaying
                      ? t("apps.videos.menu.pause")
                      : t("apps.videos.menu.play")
                  }
                  width={50}
                  height={22}
                  className="pointer-events-none"
                />
              </button>
              <button
                onClick={nextVideo}
                className={cn(
                  "flex items-center justify-center disabled:opacity-50 focus:outline-none",
                  "hover:brightness-75 active:brightness-50"
                )}
                disabled={videos.length === 0}
              >
                <img
                  src="/assets/videos/next.png"
                  alt={t("apps.videos.menu.next")}
                  width={32}
                  height={22}
                  className="pointer-events-none"
                />
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isMacOSTheme ? (
            <>
              <div className="metal-inset-btn-group">
                <button
                  type="button"
                  className="metal-inset-btn font-geneva-12 !text-[11px]"
                  onClick={toggleShuffle}
                  data-state={isShuffled ? "on" : "off"}
                >
                  {t("apps.videos.status.shuffle")}
                </button>
                <button
                  type="button"
                  className="metal-inset-btn font-geneva-12 !text-[11px]"
                  onClick={() => setLoopAll(!loopAll)}
                  data-state={loopAll ? "on" : "off"}
                >
                  {t("apps.videos.status.repeat")}
                </button>
                <button
                  type="button"
                  className="metal-inset-btn font-geneva-12 !text-[11px]"
                  onClick={() => setLoopCurrent(!loopCurrent)}
                  data-state={loopCurrent ? "on" : "off"}
                >
                  {loopCurrent ? "↺" : "→"}
                </button>
              </div>
              <div className="metal-inset-btn-group">
                <button
                  type="button"
                  className="metal-inset-btn font-geneva-12 !text-[11px]"
                  onClick={() => setIsAddDialogOpen(true)}
                >
                  {t("apps.videos.status.add")}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex gap-0">
                <Button
                  onClick={toggleShuffle}
                  variant="player"
                  data-state={isShuffled ? "on" : "off"}
                  className="h-[22px] px-2"
                >
                  {t("apps.videos.status.shuffle")}
                </Button>
                <Button
                  onClick={() => setLoopAll(!loopAll)}
                  variant="player"
                  data-state={loopAll ? "on" : "off"}
                  className="h-[22px] px-2"
                >
                  {t("apps.videos.status.repeat")}
                </Button>
                <Button
                  onClick={() => setLoopCurrent(!loopCurrent)}
                  variant="player"
                  data-state={loopCurrent ? "on" : "off"}
                  className="h-[22px] px-2"
                >
                  {loopCurrent ? "↺" : "→"}
                </Button>
              </div>
              <Button
                onClick={() => setIsAddDialogOpen(true)}
                variant="player"
                className="h-[22px] px-2"
              >
                {t("apps.videos.status.add")}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
