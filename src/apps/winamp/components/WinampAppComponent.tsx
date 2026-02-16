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

    const container = document.createElement("div");
    container.id = `webamp-container-${instanceId}`;
    document.body.appendChild(container);
    containerRef.current = container;

    const webamp = new Webamp({
      initialTracks: [
        {
          metaData: {
            artist: "DJ Mike Llama",
            title: "Llama Whippin' Intro",
          },
          url: "https://cdn.jsdelivr.net/gh/nicedoc/winamp-skins@master/demo.mp3",
          duration: 5.322286,
        },
      ],
      windowLayout: {
        main: { position: { top: 0, left: 0 } },
        equalizer: { position: { top: 116, left: 0 }, closed: true },
        playlist: { position: { top: 116, left: 0 }, closed: true },
      },
    });

    webampRef.current = webamp;
    isInitializedRef.current = true;

    // Handle Webamp's close button
    webamp.onClose(() => {
      handleClose();
    });

    // Handle minimize
    webamp.onMinimize(() => {
      // No-op: Webamp shade mode handles this internally
    });

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
    if (!containerRef.current) return;
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
