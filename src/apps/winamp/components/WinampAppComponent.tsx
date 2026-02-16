import { useEffect, useCallback, useRef } from "react";
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

const MAIN_WINDOW_WIDTH = 275;
const MAIN_WINDOW_HEIGHT = 116;

/** Convert iPod tracks to Webamp-compatible track objects */
function ipodTracksToWebamp(tracks: Track[]) {
  return tracks.map((t) => ({
    url: t.url,
    metaData: {
      artist: t.artist ?? "Unknown Artist",
      title: t.title,
    },
  }));
}

export function WinampAppComponent({
  isWindowOpen,
  onClose: _onClose,
  isForeground,
  instanceId,
}: AppProps) {
  const closeAppInstance = useAppStore((state) => state.closeAppInstance);
  const webampRef = useRef<Webamp | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isInitializedRef = useRef(false);

  const {
    translatedHelpItems,
    isHelpDialogOpen,
    setIsHelpDialogOpen,
    isAboutDialogOpen,
    setIsAboutDialogOpen,
    isXpTheme,
  } = useWinampLogic();

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

    // Build a positioning container so Webamp centers on the desired location.
    const container = document.createElement("div");
    container.id = `webamp-container-${instanceId}`;

    if (storePosition) {
      container.style.position = "fixed";
      container.style.left = `${storePosition.x}px`;
      container.style.top = `${storePosition.y}px`;
      container.style.width = `${MAIN_WINDOW_WIDTH}px`;
      container.style.height = `${MAIN_WINDOW_HEIGHT}px`;
      container.style.pointerEvents = "none";
    }

    document.body.appendChild(container);
    containerRef.current = container;

    // Load tracks from the iPod music library
    const ipodTracks = useIpodStore.getState().tracks;
    const webampTracks = ipodTracksToWebamp(ipodTracks);

    const webamp = new Webamp({
      initialTracks:
        webampTracks.length > 0
          ? webampTracks
          : [
              {
                url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                metaData: { artist: "Rick Astley", title: "Never Gonna Give You Up" },
              },
            ],
      windowLayout: {
        main: { position: { top: 0, left: 0 } },
        equalizer: {
          position: { top: MAIN_WINDOW_HEIGHT, left: 0 },
          closed: true,
        },
        playlist: {
          position: { top: MAIN_WINDOW_HEIGHT, left: 0 },
          closed: true,
        },
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      __customMediaClass: YouTubeMedia as any,
    } as any);

    webampRef.current = webamp;
    isInitializedRef.current = true;

    // Handle Webamp's close button
    webamp.onClose(() => {
      handleClose();
    });

    // Handle minimize – Webamp shade mode handles this internally
    webamp.onMinimize(() => {});

    webamp.renderWhenReady(container);

    return () => {
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
  }, [isWindowOpen, instanceId, handleClose]);

  // Update z-index based on foreground state
  useEffect(() => {
    const webampEl = document.querySelector("#webamp") as HTMLElement;
    if (webampEl) {
      webampEl.style.zIndex = isForeground ? "40" : "1";
    }
  }, [isForeground]);

  const menuBar = (
    <WinampMenuBar
      onClose={handleClose}
      onShowHelp={() => setIsHelpDialogOpen(true)}
      onShowAbout={() => setIsAboutDialogOpen(true)}
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
