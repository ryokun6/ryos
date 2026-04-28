import { useEffect, useMemo, useState, type RefObject } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactPlayer from "react-player";
import { cn } from "@/lib/utils";
import { AppProps } from "@/apps/base/types";
import { WindowFrame } from "@/components/layout/WindowFrame";
import { TvMenuBar } from "./TvMenuBar";
import { CreateChannelDialog } from "./CreateChannelDialog";
import { ChannelPromptInput } from "./ChannelPromptInput";
import { useCreateTvChannel } from "../hooks/useCreateTvChannel";
import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { useTvStore } from "@/stores/useTvStore";
import { appMetadata } from "..";
import { Button } from "@/components/ui/button";
import { getTranslatedAppName } from "@/utils/i18n";
import { VideoFullScreenPortal } from "@/components/shared/VideoFullScreenPortal";
import { YouTubePlayer } from "@/components/shared/YouTubePlayer";
import { useTvLogic } from "../hooks/useTvLogic";
import { SkipBack, SkipForward, Play, Pause } from "@phosphor-icons/react";
import { toast } from "sonner";

function AnimatedDigit({
  digit,
  direction,
}: {
  digit: string;
  direction: "next" | "prev";
}) {
  const yOffset = direction === "next" ? 30 : -30;

  return (
    <div className="relative w-[0.6em] h-[28px] overflow-hidden inline-block">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={digit}
          initial={{ y: yOffset, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: yOffset, opacity: 0 }}
          transition={{
            y: { type: "spring", stiffness: 300, damping: 30 },
            opacity: { duration: 0.2 },
          }}
          className="absolute inset-0 flex justify-center"
        >
          {digit}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function AnimatedNumber({ number }: { number: number }) {
  const [prevNumber, setPrevNumber] = useState(number);
  const direction = number > prevNumber ? "next" : "prev";

  useEffect(() => {
    setPrevNumber(number);
  }, [number]);

  const digits = String(number).padStart(2, "0").split("");
  return (
    <div className="flex">
      {digits.map((digit, index) => (
        <AnimatedDigit key={index} digit={digit} direction={direction} />
      ))}
    </div>
  );
}

function AnimatedTitle({
  title,
  direction,
  isPlaying,
}: {
  title: string;
  direction: "next" | "prev";
  isPlaying: boolean;
}) {
  const yOffset = direction === "next" ? 30 : -30;

  return (
    <div className="relative h-[22px] mb-[3px] overflow-hidden">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={title}
          initial={{ y: yOffset, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: yOffset, opacity: 0 }}
          transition={{
            y: { type: "spring", stiffness: 300, damping: 30 },
            opacity: { duration: 0.2 },
          }}
          className="absolute inset-0 flex whitespace-nowrap"
        >
          <motion.div
            initial={{ x: "0%" }}
            animate={{ x: isPlaying ? "-100%" : "0%" }}
            transition={
              isPlaying
                ? {
                    duration: 20,
                    ease: "linear",
                    repeat: Infinity,
                    repeatType: "loop",
                  }
                : { duration: 0.3 }
            }
            className={cn(
              "shrink-0 font-geneva-12 text-xl px-2 transition-colors duration-300 -mt-1 animated-title-text",
              isPlaying ? "text-[#ff00ff]" : "text-neutral-600",
              !isPlaying && "opacity-50"
            )}
          >
            {title}
          </motion.div>
          <motion.div
            initial={{ x: "0%" }}
            animate={{ x: isPlaying ? "-100%" : "0%" }}
            transition={
              isPlaying
                ? {
                    duration: 20,
                    ease: "linear",
                    repeat: Infinity,
                    repeatType: "loop",
                  }
                : { duration: 0.3 }
            }
            className={cn(
              "shrink-0 font-geneva-12 text-xl px-2 transition-colors duration-300 -mt-1 animated-title-text",
              isPlaying ? "text-[#ff00ff]" : "text-neutral-600",
              !isPlaying && "opacity-50"
            )}
            aria-hidden
          >
            {title}
          </motion.div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/**
 * NOW/NEXT label that swaps with the same vertical spring used by the Videos
 * `AnimatedTitle`. Structurally renders as a plain `<div>{text}</div>` (no
 * forced height, no flex centering) so it baseline-aligns with the CH/NET
 * labels — an invisible spacer locks the natural line height while the
 * animated copies are absolutely positioned and clipped by overflow-hidden.
 */
function AnimatedScheduleLabel({
  slotKey,
  text,
  direction,
}: {
  slotKey: string;
  text: string;
  direction: "next" | "prev";
}) {
  // Use a generous offset so the entering/exiting copy is always fully
  // outside the spacer height regardless of the rendered Geneva-12 line
  // metrics across themes; `overflow-hidden` on the wrapper clips anything
  // beyond the natural label height.
  const yOffset = direction === "next" ? 30 : -30;
  return (
    <div className="relative overflow-hidden">
      <div className="invisible" aria-hidden>
        {text}
      </div>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={slotKey}
          initial={{ y: yOffset, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: yOffset, opacity: 0 }}
          transition={{
            y: { type: "spring", stiffness: 300, damping: 30 },
            opacity: { duration: 0.2 },
          }}
          className="absolute inset-0"
        >
          {text}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function StatusDisplay({ message }: { message: string }) {
  return (
    <div className="relative videos-status">
      <div className="font-geneva-12 text-white text-xl relative z-10">
        {message}
      </div>
      <div
        className="font-geneva-12 text-black text-xl absolute inset-0"
        style={{ WebkitTextStroke: "3px black", textShadow: "none" }}
      >
        {message}
      </div>
    </div>
  );
}

export function TvAppComponent({
  isWindowOpen,
  onClose,
  isForeground,
  skipInitialSound,
  instanceId,
}: AppProps) {
  const {
    t,
    translatedHelpItems,
    isXpTheme,
    isMacOSTheme,
    isHelpDialogOpen,
    setIsHelpDialogOpen,
    isAboutDialogOpen,
    setIsAboutDialogOpen,
    isFullScreen,
    toggleFullScreen,
    isPlaying,
    setIsPlaying,
    togglePlay,
    currentChannel,
    currentVideo,
    currentChannelId,
    setChannelById,
    nextChannel,
    prevChannel,
    nextVideo,
    prevVideo,
    handleVideoEnd,
    handleError,
    playerRef,
    fullScreenPlayerRef,
    masterVolume,
    handleProgress,
    handleDuration,
    handleSeek,
    channels,
    showStatus,
    statusMessage,
    animationDirection,
    scheduleNowTitle,
    scheduleNextTitle,
  } = useTvLogic({ isWindowOpen, isForeground });

  // NOTE: All hooks must be called unconditionally on every render. The
  // early `return null` for a closed window happens AFTER the local hooks
  // below — moving the return above them violates the Rules of Hooks and
  // crashes on close (mismatched hook count between renders).
  const [lcdSlot, setLcdSlot] = useState<"now" | "next">("now");
  const [scheduleAnimDirection, setScheduleAnimDirection] = useState<
    "next" | "prev"
  >("next");
  const [isCreateChannelOpen, setIsCreateChannelOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const customChannels = useTvStore((s) => s.customChannels);
  const removeCustomChannel = useTvStore((s) => s.removeCustomChannel);
  const importChannels = useTvStore((s) => s.importChannels);
  const exportChannels = useTvStore((s) => s.exportChannels);
  const { create: createChannel, isCreating: isCreatingChannel } =
    useCreateTvChannel();

  const handleInlinePromptSubmit = async (
    description: string
  ): Promise<string | null> => {
    try {
      const { channel } = await createChannel(description);
      // Tune in to the freshly-created channel; this also drives the
      // status-flash via setChannelById -> showStatus.
      setChannelById(channel.id);
      toast.success(
        t("apps.tv.create.toastSuccess", { name: channel.name })
      );
      return channel.name;
    } catch (err) {
      console.error("Inline create channel failed:", err);
      toast.error(
        err instanceof Error ? err.message : t("apps.tv.create.errorGeneric")
      );
      return null;
    }
  };
  const customChannelIds = useMemo(
    () => new Set(customChannels.map((c) => c.id)),
    [customChannels]
  );
  const pendingDeleteChannel = useMemo(
    () =>
      pendingDeleteId
        ? customChannels.find((c) => c.id === pendingDeleteId) ?? null
        : null,
    [pendingDeleteId, customChannels]
  );

  const handleExportChannels = () => {
    try {
      const json = exportChannels();
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `tv-channels-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(t("apps.tv.toasts.exportSuccess"));
    } catch (error) {
      console.error("Failed to export channels:", error);
      toast.error(t("apps.tv.toasts.exportFailed"));
    }
  };

  const handleImportChannels = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const json = event.target?.result;
          if (typeof json !== "string") throw new Error("empty file");
          const result = importChannels(json);
          if (result.added === 0) {
            toast.error(t("apps.tv.toasts.importEmpty"));
            return;
          }
          toast.success(
            t("apps.tv.toasts.importSuccess", {
              count: result.added,
              skipped: result.skipped,
            })
          );
        } catch (error) {
          console.error("Failed to import channels:", error);
          toast.error(t("apps.tv.toasts.importFailed"));
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  useEffect(() => {
    setLcdSlot("now");
  }, [currentChannelId, currentVideo?.id]);

  useEffect(() => {
    if (!isPlaying || !scheduleNextTitle) return;
    const id = window.setInterval(() => {
      setLcdSlot((s) => {
        const next = s === "now" ? "next" : "now";
        setScheduleAnimDirection(next === "next" ? "next" : "prev");
        return next;
      });
    }, 4500);
    return () => window.clearInterval(id);
  }, [isPlaying, scheduleNextTitle]);

  const menuBar = (
    <TvMenuBar
      onClose={onClose}
      onShowHelp={() => setIsHelpDialogOpen(true)}
      onShowAbout={() => setIsAboutDialogOpen(true)}
      channels={channels}
      customChannelIds={customChannelIds}
      hasCustomChannels={customChannels.length > 0}
      currentChannelId={currentChannelId}
      onSelectChannel={setChannelById}
      onCreateChannel={() => setIsCreateChannelOpen(true)}
      onDeleteChannel={(id) => setPendingDeleteId(id)}
      onImportChannels={handleImportChannels}
      onExportChannels={handleExportChannels}
      isPlaying={isPlaying}
      onTogglePlay={togglePlay}
      onNextVideo={nextVideo}
      onPrevVideo={prevVideo}
      onNextChannel={nextChannel}
      onPrevChannel={prevChannel}
      onFullScreen={toggleFullScreen}
    />
  );

  if (!isWindowOpen) return null;

  const url = currentVideo?.url ?? "";
  const hasVideos = (currentChannel?.videos.length ?? 0) > 0;

  const lcdScrollTitle =
    lcdSlot === "now" ? scheduleNowTitle : scheduleNextTitle;
  const lcdScrollPlaying = isPlaying && Boolean(lcdScrollTitle);
  const scheduleLabel =
    lcdSlot === "now" ? t("apps.tv.status.now") : t("apps.tv.status.next");
  const titleAnimDirection =
    lcdSlot === "now" ? animationDirection : scheduleAnimDirection;

  return (
    <>
      {!isXpTheme && isForeground && menuBar}
      <WindowFrame
        title={getTranslatedAppName("tv")}
        onClose={onClose}
        isForeground={isForeground}
        appId="tv"
        material={isMacOSTheme ? "brushedmetal" : "default"}
        skipInitialSound={skipInitialSound}
        instanceId={instanceId}
        menuBar={isXpTheme ? menuBar : undefined}
        onFullscreenToggle={toggleFullScreen}
      >
        <div
          className={cn(
            "flex flex-col w-full h-full text-white",
            isMacOSTheme ? "bg-transparent" : "bg-[#1a1a1a]"
          )}
        >
          <div
            className="flex-1 relative overflow-hidden min-h-0"
            style={
              isMacOSTheme
                ? {
                    border: "1px solid rgba(0, 0, 0, 0.55)",
                    boxShadow:
                      "inset 0 1px 2px rgba(0, 0, 0, 0.25), 0 1px 0 rgba(255, 255, 255, 0.4)",
                  }
                : undefined
            }
          >
            <div className="w-full h-full overflow-hidden relative">
              <div className="w-full h-[calc(100%+300px)] mt-[-150px] relative">
                {!isFullScreen && url && (
                  <YouTubePlayer
                    ref={playerRef}
                    url={url}
                    playing={isPlaying && !isFullScreen}
                    controls={false}
                    width="calc(100% + 1px)"
                    height="calc(100% + 1px)"
                    volume={masterVolume}
                    onEnded={handleVideoEnd}
                    onError={handleError}
                    onProgress={handleProgress}
                    onDuration={handleDuration}
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                    config={{
                      youtube: { playerVars: { fs: 0, autoplay: 1 } },
                    }}
                  />
                )}
              </div>
              <AnimatePresence>
                {statusMessage && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="absolute top-4 left-4 z-40"
                  >
                    <StatusDisplay message={statusMessage} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          <div
            className={cn(
              "flex flex-col gap-4 shrink-0",
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
                  <div>{t("apps.tv.status.channel")}</div>
                  <div className="text-xl">
                    <AnimatedNumber number={currentChannel?.number ?? 0} />
                  </div>
                </div>
                <div
                  className={cn(
                    "font-geneva-12 text-[10px] transition-colors duration-300 max-w-[5.5rem]",
                    isPlaying ? "text-[#ff00ff]" : "text-neutral-600"
                  )}
                >
                  <div>{t("apps.tv.status.network")}</div>
                  <div className="text-xl truncate">
                    {currentChannel?.name ?? ""}
                  </div>
                </div>
              </div>
              <div className="relative overflow-hidden flex-1 min-w-0 px-2">
                {hasVideos && lcdScrollTitle ? (
                  <>
                    <div
                      className={cn(
                        "font-geneva-12 text-[10px] mb-[3px] pl-2 transition-colors duration-300",
                        isPlaying ? "text-[#ff00ff]" : "text-neutral-600"
                      )}
                    >
                      <AnimatedScheduleLabel
                        slotKey={lcdSlot}
                        text={scheduleLabel}
                        direction={titleAnimDirection}
                      />
                    </div>
                    <div className="relative overflow-hidden">
                      <AnimatedTitle
                        title={lcdScrollTitle}
                        direction={titleAnimDirection}
                        isPlaying={lcdScrollPlaying}
                      />
                      {lcdScrollPlaying && (
                        <>
                          <div className="absolute left-0 top-0 h-full w-4 bg-gradient-to-r from-black to-transparent videos-lcd-fade-left" />
                          <div className="absolute right-0 top-0 h-full w-4 bg-gradient-to-l from-black to-transparent videos-lcd-fade-right" />
                        </>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="font-geneva-12 text-xl text-neutral-600 opacity-50 pl-2 -mt-1">
                    {t("apps.tv.status.noSignal")}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 videos-player-controls">
              <div className="flex items-center gap-2 shrink-0">
                {isMacOSTheme ? (
                  <div className="metal-inset-btn-group">
                    <button
                      type="button"
                      className="metal-inset-btn metal-inset-icon"
                      onClick={prevVideo}
                      disabled={!hasVideos}
                    >
                      <SkipBack size={10} weight="fill" />
                    </button>
                    <button
                      type="button"
                      className="metal-inset-btn metal-inset-icon"
                      onClick={togglePlay}
                      disabled={!hasVideos}
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
                      disabled={!hasVideos}
                    >
                      <SkipForward size={10} weight="fill" />
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-0">
                    <button
                      type="button"
                      onClick={prevVideo}
                      className={cn(
                        "flex items-center justify-center disabled:opacity-50 focus:outline-none",
                        "hover:brightness-75 active:brightness-50"
                      )}
                      disabled={!hasVideos}
                    >
                      <img
                        src="/assets/videos/prev.png"
                        alt={t("apps.tv.menu.previous")}
                        width={32}
                        height={22}
                        className="pointer-events-none"
                      />
                    </button>
                    <button
                      type="button"
                      onClick={togglePlay}
                      className={cn(
                        "flex items-center justify-center disabled:opacity-50 focus:outline-none",
                        "hover:brightness-75 active:brightness-50"
                      )}
                      disabled={!hasVideos}
                    >
                      <img
                        src={
                          isPlaying
                            ? "/assets/videos/pause.png"
                            : "/assets/videos/play.png"
                        }
                        alt={
                          isPlaying
                            ? t("apps.tv.menu.pause")
                            : t("apps.tv.menu.play")
                        }
                        width={50}
                        height={22}
                        className="pointer-events-none"
                      />
                    </button>
                    <button
                      type="button"
                      onClick={nextVideo}
                      className={cn(
                        "flex items-center justify-center disabled:opacity-50 focus:outline-none",
                        "hover:brightness-75 active:brightness-50"
                      )}
                      disabled={!hasVideos}
                    >
                      <img
                        src="/assets/videos/next.png"
                        alt={t("apps.tv.menu.next")}
                        width={32}
                        height={22}
                        className="pointer-events-none"
                      />
                    </button>
                  </div>
                )}
              </div>

              <ChannelPromptInput
                className="flex-1 min-w-0"
                onSubmit={handleInlinePromptSubmit}
                isLoading={isCreatingChannel}
                placeholder={t("apps.tv.create.inlinePlaceholder")}
                loadingMessages={[
                  t("apps.tv.create.statusPlanning"),
                  t("apps.tv.create.statusSearching"),
                  t("apps.tv.create.statusTuning"),
                ]}
                ariaLabel={t("apps.tv.create.title")}
              />

              <div className="flex items-center gap-2 shrink-0">
                {isMacOSTheme ? (
                  <div className="metal-inset-btn-group">
                    <button
                      type="button"
                      className="metal-inset-btn font-geneva-12 !text-[11px]"
                      onClick={prevChannel}
                    >
                      {t("apps.tv.status.channelDown")}
                    </button>
                    <button
                      type="button"
                      className="metal-inset-btn font-geneva-12 !text-[11px]"
                      onClick={nextChannel}
                    >
                      {t("apps.tv.status.channelUp")}
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-0">
                    <Button
                      type="button"
                      onClick={prevChannel}
                      variant="player"
                      className="h-[22px] px-2 font-geneva-12"
                    >
                      {t("apps.tv.status.channelDown")}
                    </Button>
                    <Button
                      type="button"
                      onClick={nextChannel}
                      variant="player"
                      className="h-[22px] px-2 font-geneva-12"
                    >
                      {t("apps.tv.status.channelUp")}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </WindowFrame>
      <HelpDialog
        isOpen={isHelpDialogOpen}
        onOpenChange={setIsHelpDialogOpen}
        appId="tv"
        helpItems={translatedHelpItems}
      />
      <AboutDialog
        isOpen={isAboutDialogOpen}
        onOpenChange={setIsAboutDialogOpen}
        metadata={appMetadata}
        appId="tv"
      />
      <CreateChannelDialog
        isOpen={isCreateChannelOpen}
        onOpenChange={setIsCreateChannelOpen}
        onChannelCreated={(id) => {
          // Tune in immediately so the user can see what they got. The
          // store has already inserted the channel; setChannelById drives
          // the same status-flash UX as the menu / CH+/CH- buttons.
          setChannelById(id);
        }}
      />
      <ConfirmDialog
        isOpen={Boolean(pendingDeleteChannel)}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteId(null);
        }}
        onConfirm={() => {
          if (pendingDeleteId) {
            removeCustomChannel(pendingDeleteId);
            setPendingDeleteId(null);
          }
        }}
        title={t("apps.tv.delete.title")}
        description={t("apps.tv.delete.description", {
          name: pendingDeleteChannel?.name ?? "",
        })}
      />
      {isFullScreen && url && (
        <VideoFullScreenPortal
          isOpen={isFullScreen}
          onClose={() => toggleFullScreen()}
          url={url}
          isPlaying={isPlaying}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onTogglePlay={togglePlay}
          onEnded={handleVideoEnd}
          onProgress={handleProgress}
          onDuration={handleDuration}
          onReady={() => {}}
          loop={false}
          volume={masterVolume}
          playerRef={fullScreenPlayerRef as RefObject<ReactPlayer>}
          onSeek={handleSeek}
          onNext={nextVideo}
          onPrevious={prevVideo}
          showStatus={showStatus}
          statusMessage={statusMessage}
        />
      )}
    </>
  );
}
