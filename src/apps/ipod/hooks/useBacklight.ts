import { useState, useRef, useEffect, useCallback } from "react";
import { useIpodStore } from "@/stores/useIpodStore";

export function useBacklight(isForeground: boolean) {
  const backlightOn = useIpodStore((s) => s.backlightOn);
  const toggleBacklight = useIpodStore((s) => s.toggleBacklight);
  const userHasInteractedRef = useRef(false);
  const [lastActivityTime, setLastActivityTime] = useState(Date.now());
  const backlightTimerRef = useRef<NodeJS.Timeout | null>(null);
  const prevIsForeground = useRef(isForeground);

  const registerActivity = useCallback(() => {
    setLastActivityTime(Date.now());
    userHasInteractedRef.current = true;
    if (!useIpodStore.getState().backlightOn) {
      toggleBacklight();
    }
  }, [toggleBacklight]);

  const updateActivityTime = useCallback(() => {
    setLastActivityTime(Date.now());
    userHasInteractedRef.current = true;
  }, []);

  useEffect(() => {
    if (backlightTimerRef.current) {
      clearTimeout(backlightTimerRef.current);
    }

    if (backlightOn) {
      backlightTimerRef.current = setTimeout(() => {
        const { showVideo, isPlaying } = useIpodStore.getState();
        if (
          Date.now() - lastActivityTime >= 5000 &&
          !(showVideo && isPlaying)
        ) {
          toggleBacklight();
        }
      }, 5000);
    }

    return () => {
      if (backlightTimerRef.current) {
        clearTimeout(backlightTimerRef.current);
      }
    };
  }, [backlightOn, lastActivityTime, toggleBacklight]);

  useEffect(() => {
    if (isForeground && !prevIsForeground.current) {
      if (!useIpodStore.getState().backlightOn) {
        toggleBacklight();
      }
      registerActivity();
    } else if (!isForeground && prevIsForeground.current) {
      if (useIpodStore.getState().backlightOn) {
        toggleBacklight();
      }
    }

    prevIsForeground.current = isForeground;
  }, [isForeground, toggleBacklight, registerActivity]);

  return { registerActivity, updateActivityTime, userHasInteractedRef };
}

