import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactPlayer from "react-player";
import { cn } from "@/lib/utils";
import { AppProps } from "@/apps/base/types";
import { WindowFrame } from "@/components/layout/WindowFrame";
import { TvMenuBar } from "./TvMenuBar";
import { CreateChannelDialog } from "./CreateChannelDialog";
import { ChannelPromptInput } from "./ChannelPromptInput";
import { TvCrtEffects } from "./TvCrtEffects";
import {
  useCreateTvChannel,
  TvChannelAuthRequiredError,
} from "../hooks/useCreateTvChannel";
import { useTvSoundFx } from "../hooks/useTvSoundFx";
import { LoginDialog } from "@/components/dialogs/LoginDialog";
import { useAuth } from "@/hooks/useAuth";
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

/**
 * Channel name shown in the LCD's NET column. Truncates when it fits, but
 * marquee-scrolls (matching the NOW/NEXT title scroll) when the name is
 * longer than the available width so the viewer can read the whole thing.
 */
function ScrollingChannelName({
  name,
  isPlaying,
}: {
  name: string;
  isPlaying: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLSpanElement>(null);
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;
    const check = () => {
      setOverflows(content.scrollWidth > container.clientWidth + 1);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(container);
    return () => ro.disconnect();
  }, [name]);

  const shouldAnimate = overflows && isPlaying;

  return (
    <div ref={containerRef} className="relative overflow-hidden text-xl">
      {/* Single copy establishes the column height; hidden once we scroll
          so it doesn't double up with the marquee copies below. */}
      <span
        ref={contentRef}
        className={cn(
          "block whitespace-nowrap",
          overflows ? "invisible" : "truncate"
        )}
      >
        {name}
      </span>
      {overflows && (
        <>
          <div className="absolute inset-0 flex whitespace-nowrap">
            <motion.span
              initial={{ x: "0%" }}
              animate={{ x: shouldAnimate ? "-100%" : "0%" }}
              transition={
                shouldAnimate
                  ? {
                      duration: 8,
                      ease: "linear",
                      repeat: Infinity,
                      repeatType: "loop",
                    }
                  : { duration: 0.3 }
              }
              className="shrink-0 pr-4"
            >
              {name}
            </motion.span>
            <motion.span
              initial={{ x: "0%" }}
              animate={{ x: shouldAnimate ? "-100%" : "0%" }}
              transition={
                shouldAnimate
                  ? {
                      duration: 8,
                      ease: "linear",
                      repeat: Infinity,
                      repeatType: "loop",
                    }
                  : { duration: 0.3 }
              }
              className="shrink-0 pr-4"
              aria-hidden
            >
              {name}
            </motion.span>
          </div>
          {shouldAnimate && (
            <>
              <div className="absolute left-0 top-0 h-full w-3 bg-gradient-to-r from-black to-transparent videos-lcd-fade-left pointer-events-none" />
              <div className="absolute right-0 top-0 h-full w-3 bg-gradient-to-l from-black to-transparent videos-lcd-fade-right pointer-events-none" />
            </>
          )}
        </>
      )}
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
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);

  // CRT shader effect triggers. Bumping these counters re-keys the
  // animations inside TvCrtEffects so a new burst plays on every event.
  const [powerOnKey, setPowerOnKey] = useState(0);
  const [channelSwitchKey, setChannelSwitchKey] = useState(0);
  const [poweringOff, setPoweringOff] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  // While true, the picture is squeezed away and a black "screen-off"
  // overlay holds until the user un-pauses. Driven by isPlaying
  // transitions below.
  const [screenOff, setScreenOff] = useState(false);

  // Procedural CRT sound effects synced to the shader animations above.
  const {
    playPowerOn,
    playPowerOff,
    playChannelSwitch,
    startStatic,
    stopStatic,
  } = useTvSoundFx();

  const customChannels = useTvStore((s) => s.customChannels);
  const removeCustomChannel = useTvStore((s) => s.removeCustomChannel);
  const importChannels = useTvStore((s) => s.importChannels);
  const exportChannels = useTvStore((s) => s.exportChannels);
  const resetChannels = useTvStore((s) => s.resetChannels);
  const { create: createChannel, isCreating: isCreatingChannel } =
    useCreateTvChannel();

  // Auth state + LoginDialog plumbing. Channel creation requires an
  // account so the API doesn't burn YouTube quota on anonymous abuse,
  // and so the user's custom channels are tied to a name they can sign
  // back into. We surface a toast-with-action (Log In / Sign Up) when
  // the user tries to create while signed out instead of letting the
  // API reject them with a generic rate-limit error.
  const {
    username,
    isAuthenticated,
    promptVerifyToken,
    promptSetUsername,
    isUsernameDialogOpen,
    setIsUsernameDialogOpen,
    newUsername,
    setNewUsername,
    newPassword,
    setNewPassword,
    isSettingUsername,
    usernameError,
    submitUsernameDialog,
    isVerifyDialogOpen,
    setVerifyDialogOpen,
    verifyPasswordInput,
    setVerifyPasswordInput,
    verifyUsernameInput,
    setVerifyUsernameInput,
    isVerifyingToken,
    verifyError,
    handleVerifyTokenSubmit,
  } = useAuth();
  // "Probably logged in" — either auth is confirmed this session OR
  // we have a recovered username from localStorage (httpOnly auth
  // cookie is likely still valid; session restore is in flight). If
  // the API ends up rejecting the request anyway, the catch handlers
  // below convert TvChannelAuthRequiredError into the same login
  // toast the up-front gate would have shown. This avoids flashing a
  // spurious "sign in" toast in the brief window between page load
  // and the session-restore network request completing.
  const isProbablyLoggedIn = !!username || isAuthenticated;

  const showLoginRequiredToast = useCallback(() => {
    toast.error(t("apps.tv.create.signInRequired"), {
      description: t("apps.tv.create.signInRequiredDescription"),
      duration: 8000,
      action: {
        label: t("common.appleMenu.login"),
        onClick: () => {
          promptVerifyToken();
        },
      },
    });
  }, [t, promptVerifyToken]);

  const ensureLoggedIn = useCallback((): boolean => {
    if (isProbablyLoggedIn) return true;
    showLoginRequiredToast();
    return false;
  }, [isProbablyLoggedIn, showLoginRequiredToast]);

  const handleInlinePromptSubmit = useCallback(
    async (description: string): Promise<string | null> => {
      if (!ensureLoggedIn()) return null;
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
        // Stale-cookie / not-actually-logged-in case: the server
        // returned 401 even though we had a recovered username. Show
        // the same login toast the up-front gate would have shown.
        if (err instanceof TvChannelAuthRequiredError) {
          showLoginRequiredToast();
        } else {
          toast.error(
            err instanceof Error ? err.message : t("apps.tv.create.errorGeneric")
          );
        }
        return null;
      }
    },
    [
      ensureLoggedIn,
      createChannel,
      setChannelById,
      showLoginRequiredToast,
      t,
    ]
  );
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

  // Power-on shader: play once whenever the window transitions from
  // closed → open. Reset on close so re-opening triggers a fresh
  // animation. Skipping when `skipInitialSound` is true keeps the
  // browser-restore path quiet (matches WindowFrame's open-sound rule).
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (isWindowOpen && !wasOpenRef.current) {
      wasOpenRef.current = true;
      if (!skipInitialSound) {
        setPowerOnKey((k) => k + 1);
        void playPowerOn();
      }
    } else if (!isWindowOpen && wasOpenRef.current) {
      wasOpenRef.current = false;
      setPoweringOff(false);
      stopStatic();
    }
  }, [isWindowOpen, skipInitialSound, playPowerOn, stopStatic]);

  // Channel-switch static: fire a brief burst whenever the current
  // channel changes. Skip the very first mount so opening the TV doesn't
  // double up with the power-on animation.
  const channelMountedRef = useRef(false);
  useEffect(() => {
    if (!channelMountedRef.current) {
      channelMountedRef.current = true;
      return;
    }
    setChannelSwitchKey((k) => k + 1);
    void playChannelSwitch();
  }, [currentChannelId, playChannelSwitch]);

  // Reset the buffering flag whenever the URL changes so a previous
  // channel's pending-buffer state can't leak into the new picture.
  useEffect(() => {
    setIsBuffering(false);
  }, [currentVideo?.id]);

  // Pause / play "turn the TV off and on". We only fire the off→on
  // power-on shader after the user has previously paused at least
  // once (`hasPausedRef`), so the natural autoplay-success transition
  // right after the window opens doesn't double-trigger the
  // window-open power-on.
  //
  // Suppression rules:
  //   - Buffering transitions are ignored (YouTube briefly toggles
  //     play state during buffer events).
  //   - Channel-switch / video-id transitions are mostly ignored: when
  //     the video changes, isBuffering is reset and the new video's
  //     onBuffer/onPlay/onPause events arrive in an unpredictable
  //     order. Without this, a play → channel-switch flow could
  //     double-fire (channel-switch burst + spurious power-on shader).
  //     The exception is "screen-off → next/prev/CH+ while paused":
  //     screenOff stays true unless we explicitly turn it back on, so
  //     a user-initiated playback action (which sets isPlaying true)
  //     while screenOff is true must trigger the power-on even though
  //     the video id also changed.
  //   - Powering off / closing: don't react to anything; we're
  //     tearing down.
  const prevPlayingRef = useRef(isPlaying);
  const prevVideoIdRef = useRef(currentVideo?.id);
  const hasPausedRef = useRef(false);
  useEffect(() => {
    const currentVideoId = currentVideo?.id;
    if (!isWindowOpen || !wasOpenRef.current || poweringOff) {
      prevPlayingRef.current = isPlaying;
      prevVideoIdRef.current = currentVideoId;
      return;
    }

    // Resume-from-paused via Next/Prev/CH+/CH-: setIsPlaying(true) plus
    // a video/channel change land in the same render. Power back on
    // first, then let the channel-switch / buffer logic handle the
    // rest of the visual choreography.
    if (screenOff && isPlaying) {
      setScreenOff(false);
      setPowerOnKey((k) => k + 1);
      void playPowerOn();
      prevPlayingRef.current = isPlaying;
      prevVideoIdRef.current = currentVideoId;
      return;
    }

    if (isBuffering) {
      prevPlayingRef.current = isPlaying;
      prevVideoIdRef.current = currentVideoId;
      return;
    }
    if (prevVideoIdRef.current !== currentVideoId) {
      // Video just changed; treat the next play/pause flip as the
      // baseline rather than a transition off the previous video's
      // state.
      prevPlayingRef.current = isPlaying;
      prevVideoIdRef.current = currentVideoId;
      return;
    }
    const prev = prevPlayingRef.current;
    prevPlayingRef.current = isPlaying;
    if (prev === isPlaying) return;
    if (prev && !isPlaying) {
      // play → pause: turn off
      hasPausedRef.current = true;
      setScreenOff(true);
      stopStatic();
      void playPowerOff();
    } else if (!prev && isPlaying && hasPausedRef.current) {
      // pause → play: turn on (only after at least one explicit pause)
      setScreenOff(false);
      setPowerOnKey((k) => k + 1);
      void playPowerOn();
    }
  }, [
    isPlaying,
    isWindowOpen,
    isBuffering,
    poweringOff,
    screenOff,
    currentVideo?.id,
    playPowerOff,
    playPowerOn,
    stopStatic,
  ]);

  // Reset pause state when the window closes so the next open starts
  // clean (otherwise a session-restore could open with a black screen).
  useEffect(() => {
    if (!isWindowOpen) {
      setScreenOff(false);
      hasPausedRef.current = false;
    }
  }, [isWindowOpen]);

  // Drive the looping static-noise bed from the same flag that powers
  // the visual buffering overlay so audio + picture stay in sync.
  // Suppress while powering off (closing animation) or while the
  // screen is off (paused) so we don't "shhhh" through either CRT
  // shutdown — buffering events that fire just before either state
  // takes effect would otherwise leak through.
  const hasUrl = Boolean(currentVideo?.url);
  const staticBedActive =
    (isBuffering || (!hasUrl && isPlaying)) && !poweringOff && !screenOff;
  useEffect(() => {
    if (staticBedActive) {
      void startStatic();
    } else {
      stopStatic();
    }
  }, [staticBedActive, startStatic, stopStatic]);

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
      onCreateChannel={() => {
        if (!ensureLoggedIn()) return;
        setIsCreateChannelOpen(true);
      }}
      onDeleteChannel={(id) => setPendingDeleteId(id)}
      onImportChannels={handleImportChannels}
      onExportChannels={handleExportChannels}
      onResetChannels={() => setIsResetConfirmOpen(true)}
      isPlaying={isPlaying}
      onTogglePlay={togglePlay}
      onNextVideo={nextVideo}
      onPrevVideo={prevVideo}
      onNextChannel={nextChannel}
      onPrevChannel={prevChannel}
      onFullScreen={toggleFullScreen}
    />
  );

  // Tell WindowFrame to actually run its close animation + cleanup.
  // Used both by the natural power-off completion path and the
  // already-paused short-circuit below.
  const dispatchWindowClose = () => {
    if (!instanceId) {
      // Non-instance fallback: just call the prop. (Shouldn't happen
      // in practice — TV is always instance-mounted — but keep it
      // safe against legacy mounts.)
      onClose?.();
      return;
    }
    window.dispatchEvent(
      new CustomEvent(`closeWindow-${instanceId}`, {
        detail: { onComplete: onClose },
      })
    );
  };

  // Power-off shader runs *before* the window-frame close animation.
  // We intercept the close, play the CRT collapse, then dispatch the
  // standard close-confirmation event WindowFrame listens for.
  //
  // Short-circuit: if the screen is already off (user paused the TV
  // and is now closing), skip the 750ms squeeze + sound — it's
  // already black, replaying the animation just delays the close
  // without any visible benefit. Also stops the static bed in case
  // it was somehow still running.
  const handleInterceptedClose = () => {
    if (poweringOff) return;
    if (screenOff) {
      stopStatic();
      dispatchWindowClose();
      return;
    }
    setPoweringOff(true);
    stopStatic();
    void playPowerOff();
  };

  const handlePowerOffComplete = () => {
    dispatchWindowClose();
  };

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
        onClose={handleInterceptedClose}
        isForeground={isForeground}
        appId="tv"
        material={isMacOSTheme ? "brushedmetal" : "default"}
        skipInitialSound={skipInitialSound}
        instanceId={instanceId}
        interceptClose={true}
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
            className="flex-1 relative overflow-hidden min-h-0 bg-black"
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
            <div className="w-full h-full overflow-hidden relative bg-black">
              <div className="w-full h-[calc(100%+300px)] mt-[-150px] relative">
                {!isFullScreen && url && (
                  <YouTubePlayer
                    ref={playerRef}
                    url={url}
                    // Pause the iframe during the CRT shutdown / paused
                    // "screen off" overlay so audio doesn't keep
                    // playing through a black screen.
                    playing={
                      isPlaying && !isFullScreen && !poweringOff && !screenOff
                    }
                    controls={false}
                    width="calc(100% + 1px)"
                    height="calc(100% + 1px)"
                    volume={masterVolume}
                    onEnded={handleVideoEnd}
                    onError={handleError}
                    onProgress={handleProgress}
                    onDuration={handleDuration}
                    onPlay={() => {
                      setIsPlaying(true);
                      setIsBuffering(false);
                    }}
                    onPause={() => setIsPlaying(false)}
                    onBuffer={() => setIsBuffering(true)}
                    onBufferEnd={() => setIsBuffering(false)}
                    config={{
                      youtube: { playerVars: { fs: 0, autoplay: 1 } },
                    }}
                  />
                )}
              </div>
              <TvCrtEffects
                powerOnKey={powerOnKey}
                poweringOff={poweringOff}
                onPowerOffComplete={handlePowerOffComplete}
                screenOff={screenOff}
                channelSwitchKey={channelSwitchKey}
                buffering={isBuffering || (!url && isPlaying)}
                crtActive={true}
              />
              <AnimatePresence>
                {statusMessage && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="absolute top-4 left-4 z-[45]"
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
                  <ScrollingChannelName
                    name={currentChannel?.name ?? ""}
                    isPlaying={isPlaying}
                  />
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
      <ConfirmDialog
        isOpen={isResetConfirmOpen}
        onOpenChange={setIsResetConfirmOpen}
        onConfirm={() => {
          resetChannels();
          setIsResetConfirmOpen(false);
          toast.success(t("apps.tv.toasts.resetSuccess"));
        }}
        title={t("apps.tv.reset.title")}
        description={t("apps.tv.reset.description")}
      />
      <LoginDialog
        initialTab={isVerifyDialogOpen ? "login" : "signup"}
        isOpen={isUsernameDialogOpen || isVerifyDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setIsUsernameDialogOpen(false);
            setVerifyDialogOpen(false);
          }
        }}
        usernameInput={verifyUsernameInput}
        onUsernameInputChange={setVerifyUsernameInput}
        passwordInput={verifyPasswordInput}
        onPasswordInputChange={setVerifyPasswordInput}
        onLoginSubmit={async () => {
          await handleVerifyTokenSubmit(verifyPasswordInput, true);
        }}
        isLoginLoading={isVerifyingToken}
        loginError={verifyError}
        newUsername={newUsername}
        onNewUsernameChange={setNewUsername}
        newPassword={newPassword}
        onNewPasswordChange={setNewPassword}
        onSignUpSubmit={
          isVerifyDialogOpen
            ? async () => {
                setVerifyDialogOpen(false);
                promptSetUsername();
              }
            : submitUsernameDialog
        }
        isSignUpLoading={isSettingUsername}
        signUpError={usernameError}
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
