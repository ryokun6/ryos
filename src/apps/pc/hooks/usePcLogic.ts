import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { helpItems } from "..";
import { useTranslatedHelpItems } from "@/hooks/useTranslatedHelpItems";
import { Game, loadGames } from "@/stores/usePcStore";
import { useJsDos, DosProps, DosEvent } from "./useJsDos";
import { useThemeStore } from "@/stores/useThemeStore";

interface UsePcLogicProps {
  isWindowOpen: boolean;
  instanceId?: string;
}

export function usePcLogic({ isWindowOpen, instanceId }: UsePcLogicProps) {
  const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false);
  const [isAboutDialogOpen, setIsAboutDialogOpen] = useState(false);
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
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
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
          console.log("Script not loaded yet, queuing game load...");
          setPendingGame(game);
          return;
        }
        return;
      }
      if (!isScriptLoaded) {
        console.log("Script not fully loaded yet, queuing game load...");
        setPendingGame(game);
        return;
      }

      try {
        console.log("Starting game load...");
        console.log("Selected game:", game);
        console.log("Container dimensions:", {
          width: containerRef.current.offsetWidth,
          height: containerRef.current.offsetHeight,
        });
        setIsLoading(true);

        if (dosPropsRef.current) {
          console.log("Stopping existing instance...");
          await dosPropsRef.current.stop();
          dosPropsRef.current = null;
        }

        containerRef.current.innerHTML = "";
        await new Promise((resolve) => setTimeout(resolve, 100));

        console.log("Creating new Dos instance...");
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
            console.log("js-dos event:", event, arg);
            if (event === "emu-ready") {
              console.log("Emulator is ready");
            } else if (event === "ci-ready") {
              console.log("Command interface is ready");
              setIsLoading(false);
            } else if (event === "bnd-play") {
              console.log("Play button clicked");
          } else if (event === "exit") {
              console.log("Program terminated:", arg);
              if (containerRef.current) {
                containerRef.current.innerHTML = "";
              handleLoadGame(targetGame);
              }
            }
          },
          onload: () => {
            console.log("Game bundle loaded successfully");
          },
          onerror: (error: Error) => {
            console.error("Failed to load game:", error);
            setIsLoading(false);
          },
        };
        console.log("Dos options:", options);

        dosPropsRef.current = window.Dos(containerRef.current, options);
        console.log("Dos instance created:", !!dosPropsRef.current);
      } catch (error) {
        console.error("Failed to start DOSBox:", error);
        setIsLoading(false);
      }
    },
    [currentRenderAspect, isMouseCaptured, isScriptLoaded, mouseSensitivity]
  );

  useEffect(() => {
    if (!isWindowOpen && dosPropsRef.current) {
      console.log("Stopping dosbox instance...");
      dosPropsRef.current
        .stop()
        .then(() => {
          console.log("Dosbox instance stopped");
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
    return () => {
      if (dosPropsRef.current) {
        console.log("Cleaning up dosbox instance on unmount...");
        dosPropsRef.current.stop().catch(console.error);
        dosPropsRef.current = null;
        if (containerRef.current) {
          containerRef.current.innerHTML = "";
        }
      }
    };
  }, []);

  useEffect(() => {
    if (isScriptLoaded && pendingGame) {
      console.log("Loading pending game:", pendingGame);
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
    console.log("Save state not available in v8");
  }, []);

  const handleLoadState = useCallback(() => {
    console.log("Load state not available in v8");
  }, []);

  const handleReset = useCallback(async () => {
    if (containerRef.current) {
      if (dosPropsRef.current) {
        console.log("Stopping dosbox instance before reset...");
        await dosPropsRef.current.stop();
        dosPropsRef.current = null;
      }
      containerRef.current.innerHTML = "";
      setIsGameRunning(false);
    }
    setIsResetDialogOpen(false);
  }, []);

  return {
    t,
    translatedHelpItems,
    currentTheme,
    isXpTheme,
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
  };
}
