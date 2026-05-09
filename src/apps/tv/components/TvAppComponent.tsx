import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { motion, AnimatePresence, type Transition } from "framer-motion";
import type { YouTubePlayerHandle as ReactPlayer } from "@/components/shared/YouTubePlayer";
import { cn } from "@/lib/utils";
import { AppProps } from "@/apps/base/types";
import { WindowFrame } from "@/components/layout/WindowFrame";
import { TvMenuBar } from "./TvMenuBar";
import { CreateChannelDialog } from "./CreateChannelDialog";
import { ChannelPromptInput } from "./ChannelPromptInput";
import { TvCrtEffects } from "./TvCrtEffects";
import { TvVideoDrawer } from "./TvVideoDrawer";
import {
  useCreateTvChannel,
  TvChannelAuthRequiredError,
} from "../hooks/useCreateTvChannel";
import {
  fetchYoutubeVideoForTvPrompt,
  parseYoutubePasteInput,
} from "../utils/youtubeFromPrompt";
import { useTvSoundFx } from "../hooks/useTvSoundFx";
import { LoginDialog } from "@/components/dialogs/LoginDialog";
import { useAuth } from "@/hooks/useAuth";
import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { useTvStore } from "@/stores/useTvStore";
import { useIpodStore } from "@/stores/useIpodStore";
import { useVideoStore } from "@/stores/useVideoStore";
import { isMobileSafari } from "@/utils/device";
import { appMetadata } from "..";
import { Button } from "@/components/ui/button";
import { getTranslatedAppName } from "@/utils/i18n";
import { VideoFullScreenPortal } from "@/components/shared/VideoFullScreenPortal";
import { YouTubePlayer } from "@/components/shared/YouTubePlayer";
import { useTvLogic, MTV_CHANNEL_ID, RYO_TV_CHANNEL_ID } from "../hooks/useTvLogic";
import { MtvLyricsOverlay } from "./MtvLyricsOverlay";
import { getChannelLogo, getChannelLogoCorner } from "../data/channels";
import { TvChannelBug } from "./TvChannelBug";
import {
  SkipBack,
  SkipForward,
  Play,
  Pause,
  List,
} from "@phosphor-icons/react";
import { toast } from "sonner";

// Hoisted transition / animation prop objects so the LCD widgets don't
// receive freshly-allocated framer-motion props on every parent render
// (TvAppComponent re-renders on each onProgress tick). Reusing the same
// references lets framer-motion bail out of unnecessary diff work.
const SPRING_TRANSITION: Transition = {
  y: { type: "spring", stiffness: 300, damping: 30 },
  opacity: { duration: 0.2 },
};

const STATIC_TRANSITION: Transition = { duration: 0.3 };

const MARQUEE_TITLE_TRANSITION: Transition = {
  duration: 20,
  ease: "linear",
  repeat: Infinity,
  repeatType: "loop",
};

const MARQUEE_NAME_TRANSITION: Transition = {
  duration: 8,
  ease: "linear",
  repeat: Infinity,
  repeatType: "loop",
};

const STATUS_FADE_TRANSITION: Transition = { duration: 0.2 };

const STATUS_TEXT_STROKE_STYLE: React.CSSProperties = {
  WebkitTextStroke: "3px black",
  textShadow: "none",
};

// Stable framer-motion target objects for marquee variants. Kept at
// module scope so `motion.div` doesn't see a "new" prop reference each
// time the parent (TvAppComponent) re-renders for an unrelated state
// change like onProgress.
const MARQUEE_INITIAL = { x: "0%" } as const;
const MARQUEE_TITLE_ANIMATE = { x: "-100%" } as const;
const MARQUEE_TITLE_ANIMATE_STATIC = { x: "0%" } as const;

const STATUS_OPACITY_INITIAL = { opacity: 0 } as const;
const STATUS_OPACITY_ANIMATE = { opacity: 1 } as const;

// Right-edge fade applied to LCD marquees that are overflowing but not
// actively scrolling (e.g. when playback is paused). Uses mask-image so
// the fade is theme-agnostic — transparent at the right edge regardless
// of the LCD background color (black on most themes, sage green on
// macOS X).
const STATIC_OVERFLOW_MASK_STYLE: React.CSSProperties = {
  maskImage:
    "linear-gradient(to right, black calc(100% - 32px), transparent)",
  WebkitMaskImage:
    "linear-gradient(to right, black calc(100% - 32px), transparent)",
};

const AnimatedDigit = memo(function AnimatedDigit({
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
          transition={SPRING_TRANSITION}
          className="absolute inset-0 flex justify-center"
        >
          {digit}
        </motion.div>
      </AnimatePresence>
    </div>
  );
});

const AnimatedNumber = memo(function AnimatedNumber({
  number,
}: {
  number: number;
}) {
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
});

const AnimatedTitle = memo(function AnimatedTitle({
  title,
  direction,
  isPlaying,
}: {
  title: string;
  direction: "next" | "prev";
  isPlaying: boolean;
}) {
  const yOffset = direction === "next" ? 30 : -30;
  const marqueeAnimate = isPlaying
    ? MARQUEE_TITLE_ANIMATE
    : MARQUEE_TITLE_ANIMATE_STATIC;
  const marqueeTransition = isPlaying
    ? MARQUEE_TITLE_TRANSITION
    : STATIC_TRANSITION;
  const titleClass = cn(
    "shrink-0 font-geneva-12 text-xl px-2 transition-colors duration-300 -mt-1 animated-title-text",
    isPlaying ? "text-[#ff00ff]" : "text-neutral-600",
    !isPlaying && "opacity-50"
  );

  // Detect when the (paused) title is wider than its viewport so we can
  // soften the hard right-edge clip with a fade mask. We measure an
  // invisible, absolutely-positioned copy that mirrors the rendered
  // padding/font of the real marquee text.
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [overflows, setOverflows] = useState(false);
  useEffect(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) return;
    const check = () => {
      setOverflows(measure.scrollWidth > container.clientWidth + 1);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(container);
    return () => ro.disconnect();
  }, [title]);

  const showStaticFade = overflows && !isPlaying;

  return (
    <div
      ref={containerRef}
      className="relative h-[22px] mb-[3px] overflow-hidden"
      style={showStaticFade ? STATIC_OVERFLOW_MASK_STYLE : undefined}
    >
      <span
        ref={measureRef}
        aria-hidden
        className="invisible absolute font-geneva-12 text-xl px-2 whitespace-nowrap pointer-events-none"
      >
        {title}
      </span>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={title}
          initial={{ y: yOffset, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: yOffset, opacity: 0 }}
          transition={SPRING_TRANSITION}
          className="absolute inset-0 flex whitespace-nowrap"
        >
          <motion.div
            initial={MARQUEE_INITIAL}
            animate={marqueeAnimate}
            transition={marqueeTransition}
            className={titleClass}
          >
            {title}
          </motion.div>
          <motion.div
            initial={MARQUEE_INITIAL}
            animate={marqueeAnimate}
            transition={marqueeTransition}
            className={titleClass}
            aria-hidden
          >
            {title}
          </motion.div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
});

/**
 * NOW/NEXT label that swaps with the same vertical spring used by the Videos
 * `AnimatedTitle`. Structurally renders as a plain `<div>{text}</div>` (no
 * forced height, no flex centering) so it baseline-aligns with the CH/NET
 * labels — an invisible spacer locks the natural line height while the
 * animated copies are absolutely positioned and clipped by overflow-hidden.
 */
const AnimatedScheduleLabel = memo(function AnimatedScheduleLabel({
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
          transition={SPRING_TRANSITION}
          className="absolute inset-0"
        >
          {text}
        </motion.div>
      </AnimatePresence>
    </div>
  );
});

/**
 * Channel name shown in the LCD's NET column. Truncates when it fits, but
 * marquee-scrolls (matching the NOW/NEXT title scroll) when the name is
 * longer than the available width so the viewer can read the whole thing.
 */
const ScrollingChannelName = memo(function ScrollingChannelName({
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
  const marqueeAnimate = shouldAnimate
    ? MARQUEE_TITLE_ANIMATE
    : MARQUEE_TITLE_ANIMATE_STATIC;
  const marqueeTransition = shouldAnimate
    ? MARQUEE_NAME_TRANSITION
    : STATIC_TRANSITION;

  const showStaticFade = overflows && !isPlaying;

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden text-xl"
      style={showStaticFade ? STATIC_OVERFLOW_MASK_STYLE : undefined}
    >
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
              initial={MARQUEE_INITIAL}
              animate={marqueeAnimate}
              transition={marqueeTransition}
              className="shrink-0 pr-4"
            >
              {name}
            </motion.span>
            <motion.span
              initial={MARQUEE_INITIAL}
              animate={marqueeAnimate}
              transition={marqueeTransition}
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
});

const StatusDisplay = memo(function StatusDisplay({
  message,
}: {
  message: string;
}) {
  return (
    <div className="relative videos-status">
      <div className="font-geneva-12 text-white text-xl relative z-10">
        {message}
      </div>
      <div
        className="font-geneva-12 text-black text-xl absolute inset-0"
        style={STATUS_TEXT_STROKE_STYLE}
      >
        {message}
      </div>
    </div>
  );
});

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
    selectVideoFromPlaylist,
    playlistRemoveVideo,
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
    playedSeconds,
    videoIndex,
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
  // Classic-Mac-OS-X-style drawer that lists every video on the
  // current channel. Closed by default so the picture-and-LCD layout
  // stays the focal point on first open.
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isYoutubePasteLoading, setIsYoutubePasteLoading] = useState(false);

  // CRT shader effect triggers. Bumping these counters re-keys the
  // animations inside TvCrtEffects so a new burst plays on every event.
  const [powerOnKey, setPowerOnKey] = useState(0);
  const [channelSwitchKey, setChannelSwitchKey] = useState(0);
  const [poweringOff, setPoweringOff] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  // While true, the picture is squeezed away and a black "screen-off"
  // overlay holds until the user un-pauses. Driven by isPlaying
  // transitions below.
  // On mobile Safari, autoplay is blocked until the user explicitly taps,
  // so we open the TV powered off (mirrors the iPod / Karaoke pattern in
  // their hooks). The user wakes it up by tapping play, which flips
  // `isPlaying` true and routes through the existing
  // `screenOff && isPlaying` resume path below.
  const isMobileSafariDevice = useRef(isMobileSafari()).current;
  const [screenOff, setScreenOff] = useState(isMobileSafariDevice);

  // Procedural CRT sound effects synced to the shader animations above.
  const {
    playPowerOn,
    playPowerOff,
    playChannelSwitch,
    startStatic,
    stopStatic,
  } = useTvSoundFx();

  // Mobile Safari blocks YouTube's autoplay until a user gesture. The
  // toggle-play state path (Zustand flip → re-render → effect updates
  // screenOff → re-render → react-player asks YT to play) is fully
  // async, so by the time `playVideo()` is invoked the gesture token
  // is gone and iOS rejects the play. Mirror the iPod / Karaoke pattern
  // and call `playVideo()` *synchronously* inside the click handler so
  // the call still rides on the user gesture. Once YouTube is playing
  // the later state-driven `playing` prop update is a no-op.
  const handleTogglePlay = useCallback(() => {
    if (!isPlaying) {
      const playYt = (player: ReactPlayer | null) => {
        const internal = player?.getInternalPlayer?.();
        if (internal && typeof internal.playVideo === "function") {
          try {
            internal.playVideo();
          } catch {
            // Defensive: YT iframe may not be ready yet on first open.
            // The state-driven path will still attempt playback once
            // the iframe finishes its initial handshake.
          }
        }
      };
      playYt(playerRef.current);
      playYt(fullScreenPlayerRef.current);
    }
    togglePlay();
  }, [isPlaying, togglePlay, playerRef, fullScreenPlayerRef]);

  const customChannels = useTvStore((s) => s.customChannels);
  const hiddenDefaultChannelIds = useTvStore((s) => s.hiddenDefaultChannelIds);
  const addVideoToCustomChannel = useTvStore((s) => s.addVideoToCustomChannel);
  const removeChannel = useTvStore((s) => s.removeChannel);
  const importChannels = useTvStore((s) => s.importChannels);
  const exportChannels = useTvStore((s) => s.exportChannels);
  const resetChannels = useTvStore((s) => s.resetChannels);
  const lcdFilterOn = useTvStore((s) => s.lcdFilterOn);
  const toggleLcdFilter = useTvStore((s) => s.toggleLcdFilter);
  const closedCaptionsOn = useTvStore((s) => s.closedCaptionsOn);
  const toggleClosedCaptions = useTvStore((s) => s.toggleClosedCaptions);
  const toggleDrawer = useCallback(() => {
    setIsDrawerOpen((v) => !v);
  }, []);
  const customChannelIds = useMemo(
    () => new Set(customChannels.map((c) => c.id)),
    [customChannels]
  );
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
      const trimmed = description.trim();
      const youtubeRef = parseYoutubePasteInput(trimmed);

      if (youtubeRef) {
        setIsYoutubePasteLoading(true);
        try {
          const video = await fetchYoutubeVideoForTvPrompt(youtubeRef);
          if (!video) {
            toast.error(t("apps.tv.youtubePaste.fetchFailed"));
            return null;
          }

          if (currentChannelId === RYO_TV_CHANNEL_ID) {
            const had = useVideoStore
              .getState()
              .videos.some((v) => v.id === video.id);
            if (had) {
              toast.success(t("apps.tv.youtubePaste.alreadyInLibrary"));
            } else {
              useVideoStore.getState().setVideos((prev) => [...prev, video]);
              toast.success(
                t("apps.tv.youtubePaste.added", { title: video.title })
              );
            }
            return video.title;
          }

          if (currentChannelId === MTV_CHANNEL_ID) {
            const hadTrack = useIpodStore
              .getState()
              .tracks.some((tr) => tr.id === video.id);
            await useIpodStore
              .getState()
              .addTrackFromVideoId(video.url, false);
            if (hadTrack) {
              toast.success(t("apps.tv.youtubePaste.alreadyInLibrary"));
            } else {
              toast.success(
                t("apps.tv.youtubePaste.added", { title: video.title })
              );
            }
            return video.title;
          }

          if (customChannelIds.has(currentChannelId)) {
            const { added } = addVideoToCustomChannel(
              currentChannelId,
              video
            );
            if (added) {
              toast.success(
                t("apps.tv.youtubePaste.added", { title: video.title })
              );
            } else {
              toast.success(t("apps.tv.youtubePaste.alreadyInChannel"));
            }
            return video.title;
          }

          toast.error(t("apps.tv.youtubePaste.needsEditableChannel"));
          return null;
        } finally {
          setIsYoutubePasteLoading(false);
        }
      }

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
      addVideoToCustomChannel,
      currentChannelId,
      customChannelIds,
      ensureLoggedIn,
      createChannel,
      setChannelById,
      showLoginRequiredToast,
      t,
    ]
  );
  const pendingDeleteChannel = useMemo(
    () =>
      pendingDeleteId
        ? channels.find((c) => c.id === pendingDeleteId) ?? null
        : null,
    [pendingDeleteId, channels]
  );
  const hasResettableChannelChanges =
    customChannels.length > 0 || hiddenDefaultChannelIds.length > 0;

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
  // Also skip on mobile Safari, which blocks autoplay until the user
  // taps — there the TV opens "powered off" and the power-on shader
  // fires on the first explicit play instead.
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (isWindowOpen && !wasOpenRef.current) {
      wasOpenRef.current = true;
      if (!skipInitialSound && !isMobileSafariDevice) {
        setPowerOnKey((k) => k + 1);
        void playPowerOn();
      }
    } else if (!isWindowOpen && wasOpenRef.current) {
      wasOpenRef.current = false;
      setPoweringOff(false);
      stopStatic();
    }
  }, [isWindowOpen, skipInitialSound, playPowerOn, stopStatic, isMobileSafariDevice]);

  // Channel-switch static: fire a brief burst whenever the current
  // channel changes. Skip the very first mount so opening the TV doesn't
  // double up with the power-on animation.
  const channelMountedRef = useRef(false);
  useEffect(() => {
    if (!channelMountedRef.current) {
      channelMountedRef.current = true;
      return;
    }
    if (isFullScreen) return;
    setChannelSwitchKey((k) => k + 1);
    void playChannelSwitch();
  }, [currentChannelId, playChannelSwitch, isFullScreen]);

  // Reset the buffering flag whenever the URL changes so a previous
  // channel's pending-buffer state can't leak into the new picture.
  useEffect(() => {
    setIsBuffering(false);
  }, [currentVideo?.id]);

  // Suppress the CC overlay during channel/clip transitions so the
  // previous song's captions don't briefly show through the static
  // burst before the new video's lyrics load. Cleared after a short
  // timeout that's a touch longer than the channel-switch animation
  // so the overlay doesn't pop back in mid-burst.
  const [isTransitioningCc, setIsTransitioningCc] = useState(false);
  const ccTransitionMountedRef = useRef(false);
  useEffect(() => {
    if (!ccTransitionMountedRef.current) {
      ccTransitionMountedRef.current = true;
      return;
    }
    setIsTransitioningCc(true);
    const id = window.setTimeout(
      () => setIsTransitioningCc(false),
      // Match the visible end of the channel-switch / clip-change
      // animation; a slight buffer keeps the overlay hidden until
      // after the static fades out.
      700
    );
    return () => window.clearTimeout(id);
  }, [currentChannelId, currentVideo?.id]);

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
  // On mobile Safari we re-arm `screenOff` on every reopen so the TV
  // always opens "powered off" until the user taps play.
  useEffect(() => {
    if (!isWindowOpen) {
      setScreenOff(isMobileSafariDevice);
      hasPausedRef.current = false;
    }
  }, [isWindowOpen, isMobileSafariDevice]);

  // Drive the looping static-noise bed from the same flag that powers
  // the visual buffering overlay so audio + picture stay in sync.
  // Suppress while powering off (closing animation) or while the
  // screen is off (paused) so we don't "shhhh" through either CRT
  // shutdown — buffering events that fire just before either state
  // takes effect would otherwise leak through.
  const hasUrl = Boolean(currentVideo?.url);
  const staticBedActive =
    (isBuffering || (!hasUrl && isPlaying)) &&
    !poweringOff &&
    !screenOff &&
    !isFullScreen;
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
      hasCustomChannels={customChannels.length > 0}
      canResetChannels={hasResettableChannelChanges}
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
      isLcdFilterOn={lcdFilterOn}
      onToggleLcdFilter={toggleLcdFilter}
      closedCaptionsOn={closedCaptionsOn}
      onToggleClosedCaptions={toggleClosedCaptions}
      isDrawerOpen={isDrawerOpen}
      onToggleDrawer={toggleDrawer}
      isPlaying={isPlaying}
      onTogglePlay={handleTogglePlay}
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

  const windowTitle = useMemo(() => {
    if (!currentChannel) return getTranslatedAppName("tv");
    return t("apps.tv.channelBadge", {
      number: String(currentChannel.number).padStart(2, "0"),
      name: currentChannel.name,
    });
  }, [currentChannel, t]);

  const channelBugOverlay = useMemo(() => {
    const src = getChannelLogo(currentChannelId);
    if (screenOff || poweringOff || !src) return null;
    return (
      <TvChannelBug
        key={currentChannelId}
        src={src}
        corner={getChannelLogoCorner(currentChannelId)}
      />
    );
  }, [currentChannelId, screenOff, poweringOff]);

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
        title={windowTitle}
        onClose={handleInterceptedClose}
        isForeground={isForeground}
        appId="tv"
        material={isMacOSTheme ? "brushedmetal" : "default"}
        skipInitialSound={skipInitialSound}
        instanceId={instanceId}
        interceptClose={true}
        menuBar={isXpTheme ? menuBar : undefined}
        onFullscreenToggle={toggleFullScreen}
        drawer={
          <TvVideoDrawer
            isOpen={isDrawerOpen && !isFullScreen}
            channel={currentChannel ?? null}
            channels={channels}
            currentChannelId={currentChannelId}
            currentVideoIndex={videoIndex}
            onSelectChannel={setChannelById}
            onSelectVideo={selectVideoFromPlaylist}
            onRemoveVideo={playlistRemoveVideo}
          />
        }
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
              {/* Transparent capture layer that swallows mouse/pointer
                  events so they never reach the YouTube iframe. This
                  prevents the iframe from showing its own hover UI
                  (title overlay, watch-on-YouTube link, etc.) inside
                  the broadcast-TV experience. Sits above the iframe
                  but below the status overlay so the channel-flash
                  is unaffected. */}
              <div
                className="absolute inset-0 z-20"
                aria-hidden
                onClick={handleTogglePlay}
              />
              <TvCrtEffects
                suppressAnalogNoise={isFullScreen}
                powerOnKey={powerOnKey}
                poweringOff={poweringOff}
                onPowerOffComplete={handlePowerOffComplete}
                screenOff={screenOff}
                channelSwitchKey={channelSwitchKey}
                buffering={isBuffering || (!url && isPlaying)}
                crtActive={lcdFilterOn}
              />
              {currentChannelId === MTV_CHANNEL_ID &&
                closedCaptionsOn &&
                !isFullScreen && (
                <MtvLyricsOverlay
                  songId={currentVideo?.id}
                  title={currentVideo?.title}
                  artist={currentVideo?.artist}
                  playedSeconds={playedSeconds}
                  visible={
                    !screenOff &&
                    !poweringOff &&
                    !isBuffering &&
                    !isTransitioningCc &&
                    Boolean(url)
                  }
                />
              )}
              <AnimatePresence>
                {statusMessage && (
                  <motion.div
                    initial={STATUS_OPACITY_INITIAL}
                    animate={STATUS_OPACITY_ANIMATE}
                    exit={STATUS_OPACITY_INITIAL}
                    transition={STATUS_FADE_TRANSITION}
                    className="absolute top-4 left-4 z-[45]"
                  >
                    <StatusDisplay message={statusMessage} />
                  </motion.div>
                )}
              </AnimatePresence>
              {/* Channel-bug logo. Sits at z-[25] — above the YouTube
                  iframe and click-capture layer (z-20) but BELOW the
                  persistent CRT shader overlay (z-30) — so the
                  scanlines / vignette / phosphor mask composite over
                  the logo just like they do over the picture. Corner
                  is hashed from the channel id (top-left, top-right,
                  or bottom-right) so each channel always lands in the
                  same corner but corners vary across channels. Only
                  the built-in channels ship with branded artwork;
                  custom channels return undefined and render nothing.
                  Hidden while the CRT is "off" or collapsing so it
                  doesn't float over a black screen during pause /
                  power-off transitions. Keyed by currentChannelId so
                  channel switches unmount the old bug instantly
                  (killing its in-progress burst) and mount a fresh
                  one — the channel-switch CRT static burst covers the
                  swap. No AnimatePresence wrapper because we don't
                  want a lingering exit fade competing with the new
                  bug's mount fade-in. */}
              {!isFullScreen && channelBugOverlay}
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
                      onClick={handleTogglePlay}
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
                      onClick={handleTogglePlay}
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
                isLoading={isCreatingChannel || isYoutubePasteLoading}
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
                  <>
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
                    <div className="metal-inset-btn-group">
                      <button
                        type="button"
                        className="metal-inset-btn metal-inset-icon"
                        onClick={toggleDrawer}
                        aria-pressed={isDrawerOpen}
                        aria-label={t("apps.tv.menu.showVideos")}
                        title={t("apps.tv.menu.showVideos")}
                        data-state={isDrawerOpen ? "on" : undefined}
                      >
                        <List size={10} weight="regular" />
                      </button>
                    </div>
                  </>
                ) : (
                  <>
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
                    <div className="flex gap-0">
                      <Button
                        type="button"
                        onClick={toggleDrawer}
                        variant="player"
                        className={cn(
                          "h-[22px] px-2 font-geneva-12 flex items-center justify-center min-w-[28px]",
                          isDrawerOpen &&
                            "brightness-90 ring-1 ring-inset ring-black/25"
                        )}
                        aria-pressed={isDrawerOpen}
                        aria-label={t("apps.tv.menu.showVideos")}
                        title={t("apps.tv.menu.showVideos")}
                      >
                        <List
                          size={14}
                          weight="regular"
                          className="pointer-events-none"
                        />
                      </Button>
                    </div>
                  </>
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
            removeChannel(pendingDeleteId);
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
          onTogglePlay={handleTogglePlay}
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
          onChannelNext={nextChannel}
          onChannelPrev={prevChannel}
          showStatus={showStatus}
          statusMessage={statusMessage}
          videoOverlay={
            <>
              {channelBugOverlay}
              {currentChannelId === MTV_CHANNEL_ID && closedCaptionsOn ? (
                <MtvLyricsOverlay
                  songId={currentVideo?.id}
                  title={currentVideo?.title}
                  artist={currentVideo?.artist}
                  playedSeconds={playedSeconds}
                  visible={
                    !screenOff &&
                    !poweringOff &&
                    !isBuffering &&
                    !isTransitioningCc &&
                    Boolean(url)
                  }
                  variant="fullscreen"
                />
              ) : null}
            </>
          }
        />
      )}
    </>
  );
}
