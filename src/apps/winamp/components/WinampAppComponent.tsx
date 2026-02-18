import { useEffect, useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Webamp from "webamp";
import { WinampMenuBar } from "./WinampMenuBar";
import { AppProps } from "@/apps/base/types";
import { useWinampLogic } from "../hooks/useWinampLogic";
import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { appMetadata } from "..";
import { useAppStore } from "@/stores/useAppStore";
import { useIpodStore, type Track } from "@/stores/useIpodStore";
import { YouTubeMedia } from "../utils/youtubeMedia";
import { WEBAMP_SKINS } from "../skins";
import { useTranslation } from "react-i18next";
import { getYouTubeVideoId } from "@/apps/ipod/constants";

const MAIN_WINDOW_WIDTH = 275;
const MAIN_WINDOW_HEIGHT = 116;
const PLAYLIST_HEIGHT = 116;

/** Convert iPod tracks to Webamp-compatible track objects */
function ipodTracksToWebamp(tracks: Track[], unknownArtist: string) {
  return tracks.map((track) => ({
    url: getYouTubeVideoId(track.url) ?? track.url,
    metaData: {
      artist: track.artist ?? unknownArtist,
      title: track.title,
    },
  }));
}

export function WinampAppComponent({
  isWindowOpen,
  onClose: _onClose,
  isForeground,
  instanceId,
}: AppProps) {
  const { t } = useTranslation();
  const closeAppInstance = useAppStore((state) => state.closeAppInstance);
  const bringInstanceToForeground = useAppStore(
    (state) => state.bringInstanceToForeground
  );
  const webampRef = useRef<Webamp | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isInitializedRef = useRef(false);
  const webampElRef = useRef<HTMLElement | null>(null);
  const [currentSkinUrl, setCurrentSkinUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isShuffleEnabled, setIsShuffleEnabled] = useState(false);
  const [isRepeatEnabled, setIsRepeatEnabled] = useState(false);

  const {
    translatedHelpItems,
    isHelpDialogOpen,
    setIsHelpDialogOpen,
    isAboutDialogOpen,
    setIsAboutDialogOpen,
    isXpTheme,
  } = useWinampLogic();

  const handleSkinChange = useCallback((url: string | null) => {
    const webamp = webampRef.current;
    if (!webamp) return;
    webamp.setSkinFromUrl(url ?? "/skins/base-2.91.wsz");
    setCurrentSkinUrl(url);
  }, []);

  const syncMediaState = useCallback(() => {
    const webamp = webampRef.current;
    if (!webamp) return;
    setIsPlaying(webamp.getMediaStatus() === "PLAYING");
    setIsShuffleEnabled(webamp.isShuffleEnabled());
    setIsRepeatEnabled(webamp.isRepeatEnabled());
  }, []);

  const handleTogglePlay = useCallback(() => {
    const webamp = webampRef.current;
    if (!webamp) return;
    if (webamp.getMediaStatus() === "PLAYING") {
      webamp.pause();
    } else {
      webamp.play();
    }
    syncMediaState();
  }, [syncMediaState]);

  const handleStopPlayback = useCallback(() => {
    const webamp = webampRef.current;
    if (!webamp) return;
    webamp.stop();
    syncMediaState();
  }, [syncMediaState]);

  const handlePreviousTrack = useCallback(() => {
    const webamp = webampRef.current;
    if (!webamp) return;
    webamp.previousTrack();
    syncMediaState();
  }, [syncMediaState]);

  const handleNextTrack = useCallback(() => {
    const webamp = webampRef.current;
    if (!webamp) return;
    webamp.nextTrack();
    syncMediaState();
  }, [syncMediaState]);

  const handleToggleShuffle = useCallback(() => {
    const webamp = webampRef.current;
    if (!webamp) return;
    webamp.toggleShuffle();
    syncMediaState();
  }, [syncMediaState]);

  const handleToggleRepeat = useCallback(() => {
    const webamp = webampRef.current;
    if (!webamp) return;
    webamp.toggleRepeat();
    syncMediaState();
  }, [syncMediaState]);

  const handleClose = useCallback(() => {
    if (instanceId) {
      closeAppInstance(instanceId);
    }
  }, [instanceId, closeAppInstance]);

  // Listen for close requests from external sources (dock, menu bar, etc.)
  useEffect(() => {
    if (!instanceId) return;

    const handleRequestClose = () => {
      handleClose();
    };

    window.addEventListener(
      `requestCloseWindow-${instanceId}`,
      handleRequestClose
    );

    return () => {
      window.removeEventListener(
        `requestCloseWindow-${instanceId}`,
        handleRequestClose
      );
    };
  }, [instanceId, handleClose]);

  // Initialize Webamp
  useEffect(() => {
    if (!isWindowOpen || isInitializedRef.current) return;

    // Read the cascade position that ryOS assigned to this instance
    const instance = useAppStore.getState().instances[instanceId];
    const storePosition = instance?.position;

    // Invisible positioning container (pointer-events: none).
    // Webamp reads its bounding-rect for centering, then creates #webamp
    // at the body level. We keep the container only for the centering hint.
    const container = document.createElement("div");
    container.id = `webamp-container-${instanceId}`;
    container.style.position = "fixed";
    container.style.left = `${storePosition?.x ?? 48}px`;
    container.style.top = `${storePosition?.y ?? 60}px`;
    container.style.width = `${MAIN_WINDOW_WIDTH}px`;
    container.style.height = `${MAIN_WINDOW_HEIGHT + PLAYLIST_HEIGHT}px`;
    container.style.pointerEvents = "none";

    document.body.appendChild(container);
    containerRef.current = container;

    // Load tracks from the iPod music library
    const ipodTracks = useIpodStore.getState().tracks;
    const webampTracks = ipodTracksToWebamp(
      ipodTracks,
      t("apps.winamp.status.unknownArtist")
    );

    const webamp = new Webamp({
      initialTracks:
        webampTracks.length > 0
          ? webampTracks
          : [
              {
              url: "youtube:dQw4w9WgXcQ",
                metaData: {
                  artist: "Rick Astley",
                  title: "Never Gonna Give You Up",
                },
              },
            ],
      availableSkins: WEBAMP_SKINS,
      windowLayout: {
        main: { position: { top: 0, left: 0 } },
        equalizer: {
          position: { top: MAIN_WINDOW_HEIGHT, left: 0 },
          closed: true,
        },
        playlist: {
          position: { top: MAIN_WINDOW_HEIGHT, left: 0 },
          size: { extraHeight: 0, extraWidth: 0 },
        },
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      __customMediaClass: YouTubeMedia as any,
    } as any);

    webampRef.current = webamp;
    isInitializedRef.current = true;

    webamp.onClose(() => {
      handleClose();
    });

    webamp.onMinimize(() => {});

    webamp.renderWhenReady(container).then(() => {
      // After render, grab the #webamp element that Webamp created
      const el = document.querySelector("#webamp") as HTMLElement;
      if (el) {
        webampElRef.current = el;
        el.style.zIndex = isForeground ? "40" : "1";
      }
      syncMediaState();
    });
    const unsubscribeTrackChange = webamp.onTrackDidChange(syncMediaState);
    const mediaStateInterval = window.setInterval(syncMediaState, 750);

    return () => {
      unsubscribeTrackChange();
      clearInterval(mediaStateInterval);
      webampElRef.current = null;
      if (webampRef.current) {
        webampRef.current.dispose();
        webampRef.current = null;
      }
      if (containerRef.current) {
        containerRef.current.remove();
        containerRef.current = null;
      }
      isInitializedRef.current = false;
    };
    // handleClose and syncMediaState are intentionally included so media state
    // remains synced without re-running on unrelated UI changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWindowOpen, instanceId, handleClose, syncMediaState]);

  // Update z-index based on foreground state
  useEffect(() => {
    if (webampElRef.current) {
      webampElRef.current.style.zIndex = isForeground ? "40" : "1";
    }
  }, [isForeground]);

  // Bring Winamp to foreground when clicking anywhere on a Webamp element.
  // Uses capture phase so it fires before Webamp's own handlers and does
  // NOT call preventDefault/stopPropagation, so Webamp keeps working.
  useEffect(() => {
    if (!instanceId) return;

    const handler = (e: MouseEvent) => {
      const webampEl = webampElRef.current ?? document.querySelector("#webamp");
      if (webampEl && webampEl.contains(e.target as Node)) {
        bringInstanceToForeground(instanceId);
      }
    };

    document.addEventListener("mousedown", handler, { capture: true });
    return () => {
      document.removeEventListener("mousedown", handler, { capture: true });
    };
  }, [instanceId, bringInstanceToForeground]);

  const menuBar = (
    <WinampMenuBar
      onClose={handleClose}
      onShowHelp={() => setIsHelpDialogOpen(true)}
      onShowAbout={() => setIsAboutDialogOpen(true)}
      currentSkinUrl={currentSkinUrl}
      onSkinChange={handleSkinChange}
      isPlaying={isPlaying}
      isShuffleEnabled={isShuffleEnabled}
      isRepeatEnabled={isRepeatEnabled}
      onTogglePlay={handleTogglePlay}
      onStopPlayback={handleStopPlayback}
      onPreviousTrack={handlePreviousTrack}
      onNextTrack={handleNextTrack}
      onToggleShuffle={handleToggleShuffle}
      onToggleRepeat={handleToggleRepeat}
    />
  );

  if (!isWindowOpen) return null;

  return (
    <>
      {!isXpTheme && isForeground && menuBar}

      {createPortal(<div />, document.body)}

      <HelpDialog
        isOpen={isHelpDialogOpen}
        onOpenChange={setIsHelpDialogOpen}
        appId="winamp"
        helpItems={translatedHelpItems}
      />
      <AboutDialog
        isOpen={isAboutDialogOpen}
        onOpenChange={setIsAboutDialogOpen}
        metadata={appMetadata}
        appId="winamp"
      />
    </>
  );
}
