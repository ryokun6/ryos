import { useEffect, useState, useCallback, lazy, Suspense } from "react";
import { useAppStoreShallow } from "@/stores/helpers";
import type { ScreenSaverType } from "./index";

// Lazy load screen saver components
const Starfield = lazy(() => import("./Starfield").then((m) => ({ default: m.Starfield })));
const FlyingToasters = lazy(() => import("./FlyingToasters").then((m) => ({ default: m.FlyingToasters })));
const Matrix = lazy(() => import("./Matrix").then((m) => ({ default: m.Matrix })));
const BouncingLogo = lazy(() => import("./BouncingLogo").then((m) => ({ default: m.BouncingLogo })));
const Pipes = lazy(() => import("./Pipes").then((m) => ({ default: m.Pipes })));
const Maze = lazy(() => import("./Maze").then((m) => ({ default: m.Maze })));

const SCREEN_SAVER_COMPONENTS: Record<ScreenSaverType, React.LazyExoticComponent<React.ComponentType>> = {
  starfield: Starfield,
  "flying-toasters": FlyingToasters,
  matrix: Matrix,
  "bouncing-logo": BouncingLogo,
  pipes: Pipes,
  maze: Maze,
};

export function ScreenSaverOverlay() {
  const {
    screenSaverEnabled,
    screenSaverType,
    screenSaverIdleTime,
  } = useAppStoreShallow((s) => ({
    screenSaverEnabled: s.screenSaverEnabled,
    screenSaverType: s.screenSaverType,
    screenSaverIdleTime: s.screenSaverIdleTime,
  }));

  const [isActive, setIsActive] = useState(false);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [previewType, setPreviewType] = useState<string | null>(null);

  // Dismiss screen saver - starts fade out
  const dismiss = useCallback(() => {
    setIsFadingOut(true);
  }, []);

  // Called when fade out transition completes
  const handleTransitionEnd = useCallback(() => {
    if (isFadingOut) {
      setIsActive(false);
      setIsFadingOut(false);
      setIsPreviewMode(false);
      setPreviewType(null);
      window.dispatchEvent(new CustomEvent("screenSaverDismiss"));
    }
  }, [isFadingOut]);

  // Handle idle timeout
  useEffect(() => {
    if (!screenSaverEnabled || isPreviewMode) return;

    let timeoutId: ReturnType<typeof setTimeout>;
    let lastActivity = Date.now();

    const resetTimer = () => {
      lastActivity = Date.now();
      if (isActive) {
        dismiss();
      }
    };

    const checkIdle = () => {
      const idleTime = Date.now() - lastActivity;
      const idleTimeMs = screenSaverIdleTime * 60 * 1000;

      if (idleTime >= idleTimeMs && !isActive) {
        setIsActive(true);
      }

      timeoutId = setTimeout(checkIdle, 1000);
    };

    // Activity listeners
    const events = ["mousedown", "mousemove", "keydown", "touchstart", "scroll", "wheel"];
    events.forEach((event) => {
      window.addEventListener(event, resetTimer, { passive: true });
    });

    // Start checking
    checkIdle();

    return () => {
      clearTimeout(timeoutId);
      events.forEach((event) => {
        window.removeEventListener(event, resetTimer);
      });
    };
  }, [screenSaverEnabled, screenSaverIdleTime, isActive, isPreviewMode, dismiss]);

  // Handle preview mode
  useEffect(() => {
    const handlePreview = (e: CustomEvent<{ type: string }>) => {
      setPreviewType(e.detail.type);
      setIsPreviewMode(true);
      setIsActive(true);
    };

    window.addEventListener("screenSaverPreview", handlePreview as EventListener);
    return () => {
      window.removeEventListener("screenSaverPreview", handlePreview as EventListener);
    };
  }, []);

  // Handle escape key and clicks to dismiss
  useEffect(() => {
    if (!isActive) return;

    const handleDismiss = (e: MouseEvent | KeyboardEvent | TouchEvent) => {
      // Prevent immediate dismiss on preview activation
      if (e.type === "keydown" && (e as KeyboardEvent).key !== "Escape") {
        dismiss();
        return;
      }
      if (e.type === "keydown" && (e as KeyboardEvent).key === "Escape") {
        dismiss();
      }
      if (e.type === "mousedown" || e.type === "touchstart") {
        dismiss();
      }
    };

    // Small delay to prevent immediate dismiss
    const timeoutId = setTimeout(() => {
      window.addEventListener("mousedown", handleDismiss);
      window.addEventListener("keydown", handleDismiss);
      window.addEventListener("touchstart", handleDismiss);
    }, 500);

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener("mousedown", handleDismiss);
      window.removeEventListener("keydown", handleDismiss);
      window.removeEventListener("touchstart", handleDismiss);
    };
  }, [isActive, dismiss]);

  if (!isActive) return null;

  const activeType = (isPreviewMode && previewType ? previewType : screenSaverType) as ScreenSaverType;
  const ScreenSaverComponent = SCREEN_SAVER_COMPONENTS[activeType];

  if (!ScreenSaverComponent) return null;

  return (
    <div
      className={`fixed inset-0 z-[9999] cursor-none transition-opacity duration-500 ease-in-out ${
        isFadingOut ? "opacity-0" : "animate-screensaver-fade-in"
      }`}
      style={{ background: "black" }}
      onTransitionEnd={handleTransitionEnd}
    >
      <Suspense
        fallback={
          <div className="w-full h-full bg-black" />
        }
      >
        <ScreenSaverComponent />
      </Suspense>
      {/* Hint text - fades out */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/30 text-xs font-geneva-12 animate-pulse">
        Click or press any key to exit
      </div>
    </div>
  );
}
