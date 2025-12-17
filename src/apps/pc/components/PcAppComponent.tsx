import { useState, useEffect, useRef } from "react";
import { AppProps } from "@/apps/base/types";
import { WindowFrame } from "@/components/layout/WindowFrame";
import { PcMenuBar } from "./PcMenuBar";
import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { helpItems, appMetadata } from "..";
import { getTranslatedAppName } from "@/utils/i18n";
import { Game, loadGames } from "@/stores/usePcStore";
import { motion } from "framer-motion";
import { useJsDos, DosProps, DosEvent } from "../hooks/useJsDos";
import { useThemeStore } from "@/stores/useThemeStore";
import { useTranslation } from "react-i18next";
import { useTranslatedHelpItems } from "@/hooks/useTranslatedHelpItems";
import { ActivityIndicator } from "@/components/ui/activity-indicator";

export function PcAppComponent({
  isWindowOpen,
  onClose,
  isForeground,
  skipInitialSound,
  instanceId,
  onNavigateNext,
  onNavigatePrevious,
}: AppProps) {
  const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false);
  const [isAboutDialogOpen, setIsAboutDialogOpen] = useState(false);
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { isScriptLoaded } = useJsDos();
  const [selectedGame, setSelectedGame] = useState<Game>(() => {
    const games = loadGames();
    return games[0];
  });
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

  useEffect(() => {
    // Cleanup dosbox instance when window is closed
    if (!isWindowOpen && dosPropsRef.current) {
      console.log("Stopping dosbox instance...");
      dosPropsRef.current
        .stop()
        .then(() => {
          console.log("Dosbox instance stopped");
          dosPropsRef.current = null;
          setIsGameRunning(false);
          // Clear the container
          if (containerRef.current) {
            containerRef.current.innerHTML = "";
          }
        })
        .catch((error) => {
          console.error("Error stopping dosbox:", error);
          // Force cleanup even if stop fails
          dosPropsRef.current = null;
          setIsGameRunning(false);
          if (containerRef.current) {
            containerRef.current.innerHTML = "";
          }
        });
    }
  }, [isWindowOpen]);

  // Cleanup on unmount
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
    // If there's a pending game and the script is loaded, try loading it
    if (isScriptLoaded && pendingGame) {
      console.log("Loading pending game:", pendingGame);
      handleLoadGame(pendingGame);
      setPendingGame(null);
    }
  }, [isScriptLoaded, pendingGame]);

  const handleSetMouseCapture = (capture: boolean) => {
    setIsMouseCaptured(capture);
    if (dosPropsRef.current) {
      dosPropsRef.current.setMouseCapture(capture);
    }
  };

  const handleSetFullScreen = (fullScreen: boolean) => {
    setIsFullScreen(fullScreen);
    if (dosPropsRef.current) {
      dosPropsRef.current.setFullScreen(fullScreen);
    }
  };

  const handleSetRenderAspect = (aspect: string) => {
    setCurrentRenderAspect(aspect);
    if (dosPropsRef.current) {
      dosPropsRef.current.setRenderAspect(aspect);
    }
  };

  const handleSetMouseSensitivity = (sensitivity: number) => {
    setMouseSensitivity(sensitivity);
    if (dosPropsRef.current) {
      dosPropsRef.current.setMouseSensitivity(sensitivity);
    }
  };

  const handleLoadGame = async (game: Game) => {
    setSelectedGame(game);
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

      // Stop existing instance if any
      if (dosPropsRef.current) {
        console.log("Stopping existing instance...");
        await dosPropsRef.current.stop();
        dosPropsRef.current = null;
      }

      // Clear container and wait for next tick
      containerRef.current.innerHTML = "";
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Start new instance
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
              handleLoadGame(selectedGame);
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
  };

  const handleSaveState = () => {
    // Save state functionality is not directly available in v8
    console.log("Save state not available in v8");
  };

  const handleLoadState = () => {
    // Load state functionality is not directly available in v8
    console.log("Load state not available in v8");
  };

  const handleReset = async () => {
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
  };

  const menuBar = (
    <PcMenuBar
      onClose={onClose}
      onShowHelp={() => setIsHelpDialogOpen(true)}
      onShowAbout={() => setIsAboutDialogOpen(true)}
      onSaveState={handleSaveState}
      onLoadState={handleLoadState}
      onReset={() => setIsResetDialogOpen(true)}
      onLoadGame={handleLoadGame}
      selectedGame={selectedGame}
      onSetMouseCapture={handleSetMouseCapture}
      onSetFullScreen={handleSetFullScreen}
      onSetRenderAspect={handleSetRenderAspect}
      onSetMouseSensitivity={handleSetMouseSensitivity}
      isMouseCaptured={isMouseCaptured}
      isFullScreen={isFullScreen}
      currentRenderAspect={currentRenderAspect}
      mouseSensitivity={mouseSensitivity}
    />
  );

  if (!isWindowOpen) return null;

  return (
    <>
      {!isXpTheme && isForeground && menuBar}
      <WindowFrame
        title={getTranslatedAppName("pc")}
        onClose={onClose}
        isForeground={isForeground}
        appId="pc"
        skipInitialSound={skipInitialSound}
        instanceId={instanceId}
        onNavigateNext={onNavigateNext}
        onNavigatePrevious={onNavigatePrevious}
        menuBar={isXpTheme ? menuBar : undefined}
      >
        <div className="flex flex-col h-full w-full bg-[#1a1a1a]">
          <div className="flex-1 relative h-full">
            {/* Always keep the DOSBox container in DOM but hide when not in use */}
            <div
              id="dosbox"
              ref={containerRef}
              className={`w-full h-full ${isGameRunning ? "block" : "hidden"}`}
              style={{ minHeight: "400px", position: "relative" }}
            />
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
                <div className="px-4 py-2 rounded bg-black/50 backdrop-blur-sm">
                  <div className="font-geneva-12 text-sm shimmer">
                    {t("apps.pc.loadingGame", { gameName: selectedGame.name })}
                  </div>
                </div>
              </div>
            )}
            {!isGameRunning && (
              <div className="flex flex-col h-full">
                {/* Retro Display Header */}
                <div className="bg-black px-4 py-2 border-b border-[#3a3a3a]">
                  <div className="flex items-center justify-between">
                    <div className="font-apple-garamond text-white text-lg">
                      {t("apps.pc.virtualPc")}
                    </div>
                    <div className="font-geneva-12 text-gray-400 text-[12px] flex items-center gap-2">
                      {isScriptLoaded ? (
                        t("apps.pc.programsAvailable", { count: loadGames().length })
                      ) : (
                        <>
                          <ActivityIndicator size="xs" className="text-gray-400" />
                          {t("apps.pc.loadingEmulator")}
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Game Grid */}
                <div className="flex-1 p-4 overflow-y-auto flex justify-start md:justify-center w-full">
                  <div
                    className={`grid grid-cols-2 md:grid-cols-3 lg:grid-cols-3 gap-4 transition-opacity duration-300 w-full ${
                      !isScriptLoaded
                        ? "opacity-50 pointer-events-none"
                        : "opacity-100"
                    }`}
                  >
                    {loadGames().map((game) => (
                      <motion.button
                        key={game.id}
                        onClick={() => handleLoadGame(game)}
                        className="group relative aspect-video rounded overflow-hidden bg-[#2a2a2a] hover:bg-[#3a3a3a] transition-all duration-200 shadow-[0_4px_12px_rgba(0,0,0,0.5)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.7)] border border-[#3a3a3a] hover:border-[#4a4a4a] w-full h-full"
                        style={{ aspectRatio: "16/9" }}
                        whileHover={{
                          scale: 1.05,
                          y: -2,
                          transition: {
                            duration: 0.08,
                            ease: "linear",
                          },
                        }}
                        whileTap={{
                          scale: 0.95,
                          y: 0,
                          transition: {
                            type: "spring",
                            duration: 0.15,
                          },
                        }}
                      >
                        <div className="relative w-full h-full">
                          <img
                            src={game.image}
                            alt={game.name}
                            className="w-full h-full object-cover"
                            width={320}
                            height={180}
                            loading="lazy"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3">
                            <span className="text-white font-geneva-12 text-[12px]">
                              {game.name}
                            </span>
                          </div>
                        </div>
                      </motion.button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        <HelpDialog
          isOpen={isHelpDialogOpen}
          onOpenChange={setIsHelpDialogOpen}
          helpItems={translatedHelpItems}
          appId="pc"
        />
        <AboutDialog
          isOpen={isAboutDialogOpen}
          onOpenChange={setIsAboutDialogOpen}
          metadata={appMetadata}
          appId="pc"
        />
        <ConfirmDialog
          isOpen={isResetDialogOpen}
          onOpenChange={setIsResetDialogOpen}
          onConfirm={handleReset}
          title={t("apps.pc.dialogs.resetVirtualPcTitle")}
          description={t("apps.pc.dialogs.resetVirtualPcDescription")}
        />
      </WindowFrame>
    </>
  );
}
