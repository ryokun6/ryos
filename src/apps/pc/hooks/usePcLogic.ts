import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppHelpAboutDialogs } from "@/hooks/useAppHelpAboutDialogs";
import { useTranslation } from "react-i18next";
import { helpItems } from "@/apps/infinite-pc/metadata";
import { useTranslatedHelpItems } from "@/hooks/useTranslatedHelpItems";
import { Game, loadGames } from "@/stores/usePcStore";
import { useJsDos, DosProps, DosEvent } from "./useJsDos";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { createClientLogger } from "@/utils/logger";

const log = createClientLogger("PC");

interface UsePcLogicProps {
  isWindowOpen: boolean;
  instanceId?: string;
}

export function usePcLogic({ isWindowOpen, instanceId }: UsePcLogicProps) {
  const {
    isHelpDialogOpen,
    setIsHelpDialogOpen,
    isAboutDialogOpen,
    setIsAboutDialogOpen,
  } = useAppHelpAboutDialogs();
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { isScriptLoaded } = useJsDos();
  const games = useMemo(() => loadGames(), []);
  const [selectedGame, setSelectedGame] = useState<Game>(() => games[0]);
  const [pendingGame, setPendingGame] = useState<Game | null>(null);
  const [isGameRunning, setIsGameRunning] = useState(false);
  const [isMouseCaptured, setIsMouseCaptured] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [currentRenderAspect, setCurrentRenderAspect] = useState("4/3");
  const [mouseSensitivity, setMouseSensitivity] = useState(1.0);
  const containerRef = useRef<HTMLDivElement>(null);
  const dosPropsRef = useRef<DosProps | null>(null);

  const { t } = useTranslation();
  const { currentTheme, isWindowsTheme } = useThemeFlags();
  const translatedHelpItems = useTranslatedHelpItems("pc", helpItems);

  const handleLoadGame = useCallback(
    async (game: Game) => {
      const targetGame = game;
      setSelectedGame(targetGame);
      setIsGameRunning(true);

      if (!containerRef.current) {
        console.error("Container ref is null");
        return;
      }
      if (!window.Dos) {
        console.error("Dos function is not available");
        if (!isScriptLoaded) {
          log.debug("Script not loaded yet; queuing game load", {
            gameId: game.id,
          });
          setPendingGame(game);
          return;
        }
        return;
      }
      if (!isScriptLoaded) {
        log.debug("Script not fully loaded yet; queuing game load", {
          gameId: game.id,
        });
        setPendingGame(game);
        return;
      }

      try {
        log.debug("Starting game load", { gameId: game.id, path: game.path });
        log.debug("Container dimensions", {
          width: containerRef.current.offsetWidth,
          height: containerRef.current.offsetHeight,
        });
        setIsLoading(true);

        if (dosPropsRef.current) {
          log.debug("Stopping existing instance");
          await dosPropsRef.current.stop();
          dosPropsRef.current = null;
        }

        containerRef.current.innerHTML = "";
        await new Promise((resolve) => setTimeout(resolve, 100));

        log.debug("Creating new Dos instance");
        const options = {
          url: game.path,
          theme: "dark",
          renderAspect: currentRenderAspect,
          renderBackend: "webgl",
          imageRendering: "pixelated",
          mouseCapture: isMouseCaptured,
          mouseSensitivity: mouseSensitivity,
          workerThread: true,
          autoStart: true,
          kiosk: true,
          onEvent: (event: DosEvent, arg?: unknown) => {
            log.debug("js-dos event", { event, arg });
            if (event === "emu-ready") {
              log.debug("Emulator is ready");
            } else if (event === "ci-ready") {
              log.debug("Command interface is ready");
              setIsLoading(false);
            } else if (event === "bnd-play") {
              log.debug("Play button clicked");
          } else if (event === "exit") {
              log.debug("Program terminated", { arg });
              if (containerRef.current) {
                containerRef.current.innerHTML = "";
              handleLoadGame(targetGame);
              }
            }
          },
          onload: () => {
            log.debug("Game bundle loaded successfully");
          },
          onerror: (error: Error) => {
            console.error("Failed to load game:", error);
            setIsLoading(false);
          },
        };
        log.debug("Dos options prepared", {
          url: options.url,
          renderAspect: options.renderAspect,
          mouseCapture: options.mouseCapture,
          mouseSensitivity: options.mouseSensitivity,
        });

        dosPropsRef.current = window.Dos(containerRef.current, options);
        log.debug("Dos instance created", { created: Boolean(dosPropsRef.current) });
      } catch (error) {
        console.error("Failed to start DOSBox:", error);
        setIsLoading(false);
      }
    },
    [currentRenderAspect, isMouseCaptured, isScriptLoaded, mouseSensitivity]
  );

  useEffect(() => {
    if (!isWindowOpen && dosPropsRef.current) {
      log.debug("Stopping dosbox instance");
      dosPropsRef.current
        .stop()
        .then(() => {
          log.debug("Dosbox instance stopped");
          dosPropsRef.current = null;
          setIsGameRunning(false);
          if (containerRef.current) {
            containerRef.current.innerHTML = "";
          }
        })
        .catch((error) => {
          console.error("Error stopping dosbox:", error);
          dosPropsRef.current = null;
          setIsGameRunning(false);
          if (containerRef.current) {
            containerRef.current.innerHTML = "";
          }
        });
    }
  }, [isWindowOpen]);

  useEffect(() => {
    const containerEl = containerRef.current;
    return () => {
      if (dosPropsRef.current) {
        log.debug("Cleaning up dosbox instance on unmount");
        dosPropsRef.current.stop().catch(console.error);
        dosPropsRef.current = null;
        if (containerEl) {
          containerEl.innerHTML = "";
        }
      }
    };
  }, []);

  useEffect(() => {
    if (isScriptLoaded && pendingGame) {
      log.debug("Loading pending game", { gameId: pendingGame.id });
      handleLoadGame(pendingGame);
      setPendingGame(null);
    }
  }, [isScriptLoaded, pendingGame, handleLoadGame]);

  useEffect(() => {
    const handleAppMenuFullScreen = (
      e: CustomEvent<{ appId: string; instanceId: string }>
    ) => {
      if (e.detail.instanceId === instanceId) {
        setIsFullScreen((prev) => {
          const newValue = !prev;
          if (dosPropsRef.current) {
            dosPropsRef.current.setFullScreen(newValue);
          }
          return newValue;
        });
      }
    };

    window.addEventListener(
      "toggleAppFullScreen",
      handleAppMenuFullScreen as EventListener
    );
    return () =>
      window.removeEventListener(
        "toggleAppFullScreen",
        handleAppMenuFullScreen as EventListener
      );
  }, [instanceId]);

  const handleSetMouseCapture = useCallback((capture: boolean) => {
    setIsMouseCaptured(capture);
    if (dosPropsRef.current) {
      dosPropsRef.current.setMouseCapture(capture);
    }
  }, []);

  const handleSetFullScreen = useCallback((fullScreen: boolean) => {
    setIsFullScreen(fullScreen);
    if (dosPropsRef.current) {
      dosPropsRef.current.setFullScreen(fullScreen);
    }
  }, []);

  const handleSetRenderAspect = useCallback((aspect: string) => {
    setCurrentRenderAspect(aspect);
    if (dosPropsRef.current) {
      dosPropsRef.current.setRenderAspect(aspect);
    }
  }, []);

  const handleSetMouseSensitivity = useCallback((sensitivity: number) => {
    setMouseSensitivity(sensitivity);
    if (dosPropsRef.current) {
      dosPropsRef.current.setMouseSensitivity(sensitivity);
    }
  }, []);

  const handleSaveState = useCallback(() => {
    log.debug("Save state not available in v8");
  }, []);

  const handleLoadState = useCallback(() => {
    log.debug("Load state not available in v8");
  }, []);

  const handleReset = useCallback(async () => {
    if (containerRef.current) {
      if (dosPropsRef.current) {
        log.debug("Stopping dosbox instance before reset");
        await dosPropsRef.current.stop();
        dosPropsRef.current = null;
      }
      containerRef.current.innerHTML = "";
      setIsGameRunning(false);
    }
    setIsResetDialogOpen(false);
  }, []);

  const handleBackToGames = useCallback(async () => {
    if (containerRef.current) {
      if (dosPropsRef.current) {
        await dosPropsRef.current.stop();
        dosPropsRef.current = null;
      }
      containerRef.current.innerHTML = "";
      setIsGameRunning(false);
    }
  }, []);

  return {
    t,
    translatedHelpItems,
    currentTheme,
    isWindowsTheme,
    isHelpDialogOpen,
    setIsHelpDialogOpen,
    isAboutDialogOpen,
    setIsAboutDialogOpen,
    isResetDialogOpen,
    setIsResetDialogOpen,
    isLoading,
    isScriptLoaded,
    games,
    selectedGame,
    isGameRunning,
    isMouseCaptured,
    isFullScreen,
    currentRenderAspect,
    mouseSensitivity,
    containerRef,
    handleLoadGame,
    handleSaveState,
    handleLoadState,
    handleReset,
    handleSetMouseCapture,
    handleSetFullScreen,
    handleSetRenderAspect,
    handleSetMouseSensitivity,
    handleBackToGames,
  };
}
