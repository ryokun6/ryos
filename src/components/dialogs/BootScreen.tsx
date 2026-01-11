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
}

export function BootScreen({
  isOpen,
  onOpenChange,
  onBootComplete,
  title,
}: BootScreenProps) {
  const { play } = useSound(Sounds.BOOT, 0.5);
  const [progress, setProgress] = useState(0);
  const { t } = useTranslation();
  const currentTheme = useThemeStore((state) => state.current);
  const localizedTitle = title ?? t("common.system.systemRestoring");
  
  const isWindowsTheme = currentTheme === "xp" || currentTheme === "win98";

  useEffect(() => {
    let interval: number;
    let timer: number;
    let soundTimer: number;

    if (isOpen) {
      // Play boot sound with a delay
      soundTimer = window.setTimeout(() => {
        play();
      }, 100);

      // Simulate boot progress
      interval = window.setInterval(() => {
        setProgress((prev) => {
          const newProgress = prev + Math.random() * 10;
          return newProgress >= 100 ? 100 : newProgress;
        });
      }, 100);

      // Close after boot completes (2 seconds)
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
    } else {
      setProgress(0);
    }

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timer);
      window.clearTimeout(soundTimer);
    };
  }, [isOpen, play, onBootComplete, onOpenChange]);

  if (!isOpen) return null;

  // Get splash image based on theme
  const getSplashImage = () => {
    switch (currentTheme) {
      case "xp":
        return "/assets/splash/xp.png";
      case "win98":
        return "/assets/splash/win98.png";
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
            style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0 }}
          />
          <DialogContent
            className="bg-black p-0 w-full h-full max-w-none border-none shadow-none z-[80] outline-none rounded-none"
            style={{ position: "fixed", zIndex: 80 }}
          >
            <VisuallyHidden>
              <DialogTitle>{localizedTitle}</DialogTitle>
            </VisuallyHidden>
            <div className="flex flex-col items-center justify-center w-full h-full">
              <img
                src={getSplashImage()}
                alt={currentTheme === "xp" ? "Windows XP" : "Windows 98"}
                className="max-w-full max-h-full object-contain"
              />
            </div>
          </DialogContent>
        </DialogPrimitive.Portal>
      </Dialog>
    );
  }

  // Mac themes (macOS X and System 7)
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
          <div className="flex flex-col items-center justify-center p-8 min-h-[300px] w-full">
            <div className="flex flex-col items-center justify-center border border-neutral-200 bg-white p-8 w-full pb-4">
              <img
                src={getSplashImage()}
                alt={currentTheme === "system7" ? "Hello" : "macOS"}
                className="w-64 h-32"
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
