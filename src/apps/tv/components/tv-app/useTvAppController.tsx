import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from "react";
import ReactPlayer from "react-player";
import { toast } from "sonner";
import type { AppProps } from "@/apps/base/types";
import { TvMenuBar } from "../TvMenuBar";
import {
  useCreateTvChannel,
  TvChannelAuthRequiredError,
} from "../../hooks/useCreateTvChannel";
import {
  fetchYoutubeVideoForTvPrompt,
  parseYoutubePasteInput,
} from "../../utils/youtubeFromPrompt";
import { useTvSoundFx } from "../../hooks/useTvSoundFx";
import { useAuth } from "@/hooks/useAuth";
import { useTvStore } from "@/stores/useTvStore";
import { useIpodStore } from "@/stores/useIpodStore";
import { useVideoStore } from "@/stores/useVideoStore";
import { isMobileSafari } from "@/utils/device";
import { getTranslatedAppName } from "@/utils/i18n";
import { useTvLogic, MTV_CHANNEL_ID, RYO_TV_CHANNEL_ID } from "../../hooks/useTvLogic";
import { getChannelLogo, getChannelLogoCorner } from "../../data/channels";
import { TvChannelBug } from "../TvChannelBug";
import {
  createInitialTvLocalState,
  tvLocalReducer,
  type TvLocalState,
} from "./tvLocalState";

export type UseTvAppControllerArgs = Pick<
  AppProps,
  "isWindowOpen" | "onClose" | "isForeground" | "skipInitialSound" | "instanceId"
>;

export function useTvAppController({
  isWindowOpen,
  onClose,
  isForeground,
  skipInitialSound,
  instanceId,
}: UseTvAppControllerArgs) {
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
  const isMobileSafariDevice = useRef(isMobileSafari()).current;

  const [localState, dispatchLocal] = useReducer(
    tvLocalReducer,
    createInitialTvLocalState(isMobileSafariDevice)
  );
  const {
    lcdSlot,
    scheduleAnimDirection,
    isCreateChannelOpen,
    pendingDeleteId,
    isResetConfirmOpen,
    isDrawerOpen,
    isYoutubePasteLoading,
    powerOnKey,
    channelSwitchKey,
    poweringOff,
    isBuffering,
    screenOff,
    isTransitioningCc,
  } = localState;
  const setField = useCallback(
    <K extends keyof TvLocalState>(
      key: K,
      value: TvLocalState[K] | ((prev: TvLocalState[K]) => TvLocalState[K])
    ) => {
      dispatchLocal({
        type: "setField",
        key,
        value: value as TvLocalState[keyof TvLocalState],
      });
    },
    []
  );
  const setLcdSlot = useCallback(
    (
      value:
        | TvLocalState["lcdSlot"]
        | ((prev: TvLocalState["lcdSlot"]) => TvLocalState["lcdSlot"])
    ) => setField("lcdSlot", value),
    [setField]
  );
  const setIsCreateChannelOpen = useCallback(
    (value: boolean) => setField("isCreateChannelOpen", value),
    [setField]
  );
  const setPendingDeleteId = useCallback(
    (value: string | null) => setField("pendingDeleteId", value),
    [setField]
  );
  const setIsResetConfirmOpen = useCallback(
    (value: boolean) => setField("isResetConfirmOpen", value),
    [setField]
  );
  const setIsDrawerOpen = useCallback(
    (value: boolean | ((prev: boolean) => boolean)) => setField("isDrawerOpen", value),
    [setField]
  );
  const setIsYoutubePasteLoading = useCallback(
    (value: boolean) => setField("isYoutubePasteLoading", value),
    [setField]
  );
  const setPowerOnKey = useCallback(
    (value: number | ((prev: number) => number)) => setField("powerOnKey", value),
    [setField]
  );
  const setChannelSwitchKey = useCallback(
    (value: number | ((prev: number) => number)) =>
      setField("channelSwitchKey", value),
    [setField]
  );
  const setPoweringOff = useCallback(
    (value: boolean) => setField("poweringOff", value),
    [setField]
  );
  const setIsBuffering = useCallback(
    (value: boolean) => setField("isBuffering", value),
    [setField]
  );
  const setScreenOff = useCallback(
    (value: boolean) => setField("screenOff", value),
    [setField]
  );
  const setIsTransitioningCc = useCallback(
    (value: boolean) => setField("isTransitioningCc", value),
    [setField]
  );

  // Classic-Mac-OS-X-style drawer that lists every video on the
  // current channel. Closed by default so the picture-and-LCD layout
  // stays the focal point on first open.

  // CRT shader effect triggers. Bumping these counters re-keys the
  // animations inside TvCrtEffects so a new burst plays on every event.
  
  // While true, the picture is squeezed away and a black "screen-off"
  // overlay holds until the user un-pauses. Driven by isPlaying
  // transitions below.
  // On mobile Safari, autoplay is blocked until the user explicitly taps,
  // so we open the TV powered off (mirrors the iPod / Karaoke pattern in
  // their hooks). The user wakes it up by tapping play, which flips
  // `isPlaying` true and routes through the existing
  // `screenOff && isPlaying` resume path below.

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
      dispatchLocal({ type: "toggleLcdSlotWithDirection" });
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

  return {
    isWindowOpen,
    onClose,
    isForeground,
    instanceId,
    skipInitialSound,
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
    statusMessage,
    animationDirection,
    scheduleNowTitle,
    scheduleNextTitle,
    playedSeconds,
    videoIndex,
    lcdSlot,
    scheduleAnimDirection,
    isCreateChannelOpen,
    setIsCreateChannelOpen,
    pendingDeleteId,
    setPendingDeleteId,
    isResetConfirmOpen,
    setIsResetConfirmOpen,
    isDrawerOpen,
    setIsDrawerOpen,
    isYoutubePasteLoading,
    powerOnKey,
    channelSwitchKey,
    poweringOff,
    isBuffering,
    setIsBuffering,
    screenOff,
    isTransitioningCc,
    handleTogglePlay,
    showStatus,
    customChannels,
    toggleDrawer,
    isCreatingChannel,
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
    promptSetUsername,
    handleInlinePromptSubmit,
    pendingDeleteChannel,
    hasResettableChannelChanges,
    handleImportChannels,
    handleExportChannels,
    menuBar,
    handleInterceptedClose,
    handlePowerOffComplete,
    windowTitle,
    channelBugOverlay,
    lcdFilterOn,
    toggleLcdFilter,
    closedCaptionsOn,
    toggleClosedCaptions,
    ensureLoggedIn,
    removeChannel,
    resetChannels,
  };
}
