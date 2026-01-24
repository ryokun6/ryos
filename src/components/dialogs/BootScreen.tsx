import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { useSound, Sounds } from "@/hooks/useSound";
import { useTranslation } from "react-i18next";
import { useThemeStore } from "@/stores/useThemeStore";

interface BootScreenProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onBootComplete?: () => void;
  title?: string;
  debugMode?: boolean;
}

export function BootScreen({
  isOpen,
  onOpenChange,
  onBootComplete,
  title,
  debugMode = false,
}: BootScreenProps) {
  const { play } = useSound(Sounds.BOOT, 0.5);
  const [progress, setProgress] = useState(0);
  const { t } = useTranslation();
  const currentTheme = useThemeStore((state) => state.current);
  const localizedTitle = title ?? t("common.system.systemRestoring");
  
  const isWindowsTheme = currentTheme === "xp" || currentTheme === "win98";
  const isMacOSX = currentTheme === "macosx";

  const handleDone = () => {
    onBootComplete?.();
    onOpenChange(false);
  };

  useEffect(() => {
    let interval: number;
    let timer: number;
    let soundTimer: number;

    if (isOpen) {
      // Play boot sound with a delay (skip in debug mode)
      if (!debugMode) {
        soundTimer = window.setTimeout(() => {
          play();
        }, 100);
      }

      // Simulate boot progress
      interval = window.setInterval(() => {
        setProgress((prev) => {
          const newProgress = prev + Math.random() * 10;
          return newProgress >= 100 ? 100 : newProgress;
        });
      }, 100);

      // Close after boot completes (2 seconds) - skip in debug mode
      if (!debugMode) {
        timer = window.setTimeout(() => {
          window.clearInterval(interval);
          setProgress(100);

          // Wait a moment at 100% before completing
          const completeTimer = window.setTimeout(() => {
            onBootComplete?.();
            onOpenChange(false);
          }, 500);

          return () => window.clearTimeout(completeTimer);
        }, 2000);
      }
    } else {
      setProgress(0);
    }

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timer);
      window.clearTimeout(soundTimer);
    };
  }, [isOpen, play, onBootComplete, onOpenChange, debugMode]);

  if (!isOpen) return null;

  // Get splash image based on theme
  const getSplashImage = () => {
    switch (currentTheme) {
      case "xp":
        return "/assets/splash/xp-boot.gif";
      case "win98":
        return "/assets/splash/win98.gif";
      case "system7":
        return "/assets/splash/hello.svg";
      default:
        return "/assets/splash/macos.svg";
    }
  };

  // Windows themes use full boot screen images
  if (isWindowsTheme) {
    return (
      <Dialog open={isOpen} onOpenChange={() => {}} modal>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay
            className="fixed inset-0 z-[75] bg-black data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
            style={{ 
              position: "fixed", 
              top: 0, 
              left: 0, 
              right: 0, 
              bottom: 0,
              backgroundColor: "#000000"
            }}
          />
          <DialogPrimitive.Content
            className="fixed inset-0 z-[80] bg-black p-0 w-full h-full max-w-none border-none shadow-none outline-none rounded-none m-0"
            style={{ 
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "#000000",
              zIndex: 80,
              margin: 0,
              padding: 0,
              border: "none",
              boxShadow: "none",
              borderRadius: 0
            }}
          >
            <VisuallyHidden>
              <DialogTitle>{localizedTitle}</DialogTitle>
            </VisuallyHidden>
            <div 
              className="flex flex-col items-center justify-center w-full h-full bg-black"
              onClick={debugMode ? handleDone : undefined}
              style={{
                width: "100%",
                height: "100%",
                backgroundColor: "#000000",
                cursor: debugMode ? "pointer" : undefined
              }}
            >
              <img
                src={getSplashImage()}
                alt={currentTheme === "xp" ? "Windows XP" : "Windows 98"}
                className={currentTheme === "win98" ? "w-full h-full object-fill" : "max-w-full max-h-full object-contain"}
                style={{ display: "block" }}
              />
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </Dialog>
    );
  }

  // macOS X boot screen - classic Aqua style
  if (isMacOSX) {
    return (
      <Dialog open={isOpen} onOpenChange={() => {}} modal>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay
            className="fixed inset-0 z-[75] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
            style={{ 
              position: "fixed", 
              top: 0, 
              left: 0, 
              right: 0, 
              bottom: 0,
              backgroundColor: "#4566a0"
            }}
          />
          <DialogContent
            className="p-0 w-[calc(100%-24px)] border-none shadow-xl max-w-lg z-[80] outline-none macosx-dialog rounded-none"
            style={{ 
              position: "fixed", 
              zIndex: 80,
              borderRadius: 0,
              backgroundImage: "var(--os-pinstripe-window)",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)"
            }}
          >
            <VisuallyHidden>
              <DialogTitle>{localizedTitle}</DialogTitle>
            </VisuallyHidden>
            <div 
              className="flex flex-col items-center justify-center pt-2 pb-12 px-16 min-h-[280px] w-full"
              onClick={debugMode ? handleDone : undefined}
              style={debugMode ? { cursor: "pointer" } : undefined}
            >
              {/* Apple logo */}
              <img
                src="/icons/macosx/apple.png"
                alt="Apple"
                className="w-[120px] h-[120px] object-contain"
                style={{ marginBottom: "-30px", filter: "grayscale(50%) brightness(1.25)" }}
              />
              {/* ryOS X text */}
              <h1 
                className="text-[52px] mb-6"
                style={{ 
                  color: "#333333",
                  fontFamily: "AppleGaramond, 'Apple Garamond', 'Times New Roman', serif",
                  letterSpacing: "1px",
                  textShadow: "0 1px 2px rgba(0, 0, 0, 0.15)"
                }}
              >
                ryOS X
              </h1>
              {/* Progress bar - using aqua-progress classes */}
              <div className="aqua-progress w-[220px] h-[20px] rounded-none" style={{ borderRadius: 0 }}>
                <div
                  className="aqua-progress-fill transition-all duration-200 rounded-none"
                  style={{ width: `${progress}%`, borderRadius: 0 }}
                />
              </div>
              {/* Status text */}
              <p 
                className="text-[12px] mt-5"
                style={{ 
                  color: "#000000",
                  fontFamily: "LucidaGrande, 'Lucida Grande', sans-serif"
                }}
              >
                {localizedTitle}
              </p>
            </div>
          </DialogContent>
        </DialogPrimitive.Portal>
      </Dialog>
    );
  }

  // System 7 boot screen
  return (
    <Dialog open={isOpen} onOpenChange={() => {}} modal>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-[75] bg-neutral-500/90 backdrop-blur-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
          style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0 }}
        />
        <DialogContent
          className="bg-neutral-100 p-0 w-[calc(100%-24px)] border-none shadow-xl max-w-lg z-[80] outline-none rounded-none"
          style={{ position: "fixed", zIndex: 80 }}
        >
          <VisuallyHidden>
            <DialogTitle>{localizedTitle}</DialogTitle>
          </VisuallyHidden>
          <div 
            className="flex flex-col items-center justify-center p-8 min-h-[300px] w-full"
            onClick={debugMode ? handleDone : undefined}
            style={debugMode ? { cursor: "pointer" } : undefined}
          >
            <div className="flex flex-col items-center justify-center border border-neutral-200 bg-white p-8 w-full pb-4">
              <img
                src={getSplashImage()}
                alt="Hello"
                className="w-64 h-32"
                style={{ filter: "invert(1)" }}
              />
              <h1 className="text-[36px] font-mondwest mt-4 mb-0">
                <span className="text-blue-500">ry</span>OS
              </h1>
            </div>
            <h2 className="text-[16px] font-chicago mt-4 mb-1">
              {localizedTitle}
            </h2>
            <div className="w-[50%] h-3 border-1 border-neutral-500 rounded-sm overflow-hidden">
              <div
                className="h-full bg-neutral-900 transition-all duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </DialogContent>
      </DialogPrimitive.Portal>
    </Dialog>
  );
}
