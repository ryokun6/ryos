import React, { useEffect, useRef, useState, useCallback } from "react";
import { useAppStore } from "@/stores/useAppStore";
import { getScreenSaver } from "@/utils/screenSavers";
import { useSound, Sounds } from "@/hooks/useSound";

interface ScreenSaverOverlayProps {
  previewMode?: boolean; // If true, forces display and ignores idle timers (for settings preview)
  onExitPreview?: () => void;
}

export function ScreenSaverOverlay({ previewMode = false, onExitPreview }: ScreenSaverOverlayProps) {
  const { screenSaverId, screenSaverEnabled, screenSaverTimeout } = useAppStore();
  const [isActive, setIsActive] = useState(false);
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const { play: playClick } = useSound(Sounds.BUTTON_CLICK, 0.1); // Subtle sound on wake

  // Handle Screen Wake Lock
  useEffect(() => {
    const manageWakeLock = async () => {
      try {
        if (isActive) {
          if ("wakeLock" in navigator && !wakeLockRef.current) {
            wakeLockRef.current = await navigator.wakeLock.request("screen");
          }
        } else {
          if (wakeLockRef.current) {
            await wakeLockRef.current.release();
            wakeLockRef.current = null;
          }
        }
      } catch (err) {
        console.error("Wake Lock error:", err);
      }
    };

    manageWakeLock();

    return () => {
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
    };
  }, [isActive]);

  const activateScreenSaver = useCallback(() => {
    if (screenSaverEnabled || previewMode) {
      setIsActive(true);
    }
  }, [screenSaverEnabled, previewMode]);

  const resetIdleTimer = useCallback(() => {
    if (previewMode) return; // Don't manage timer in preview mode

    if (isActive) {
      // If active, any activity wakes the screen
      setIsActive(false);
      // Optional: play wake sound
      // playClick();
    }

    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
    }

    if (screenSaverEnabled && screenSaverTimeout > 0) {
      // Convert minutes to milliseconds
      idleTimerRef.current = setTimeout(activateScreenSaver, screenSaverTimeout * 60 * 1000);
    }
  }, [isActive, screenSaverEnabled, screenSaverTimeout, activateScreenSaver, previewMode]);

  // Set up activity listeners
  useEffect(() => {
    if (previewMode) {
      setIsActive(true);
      return;
    }

    const events = ["mousemove", "mousedown", "keydown", "touchstart", "wheel"];
    
    const handleActivity = () => {
      resetIdleTimer();
    };

    // Initial timer start
    resetIdleTimer();

    events.forEach((event) => {
      window.addEventListener(event, handleActivity);
    });

    return () => {
      events.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
      }
    };
  }, [resetIdleTimer, previewMode]);

  // Handle preview exit
  const handleOverlayClick = () => {
    if (previewMode && onExitPreview) {
      onExitPreview();
    } else if (isActive) {
      setIsActive(false);
    }
  };

  if (!isActive) return null;

  const ScreenSaverComponent = getScreenSaver(screenSaverId)?.component;

  if (!ScreenSaverComponent) return null;

  return (
    <div 
      className="fixed inset-0 z-[2147483647] bg-black cursor-none"
      onClick={handleOverlayClick}
      onMouseMove={() => !previewMode && setIsActive(false)}
    >
      <ScreenSaverComponent />
    </div>
  );
}

