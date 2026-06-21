import { useCallback, useEffect, useRef, useState } from "react";
import type { TFunction } from "i18next";
import { toast } from "sonner";
import {
  useIpodStore,
  type IpodBacklightTimeout,
} from "@/stores/useIpodStore";

const BACKLIGHT_TIMEOUT_BY_SETTING: Record<
  Exclude<IpodBacklightTimeout, "off" | "always-on">,
  number
> = {
  "2s": 2000,
  "10s": 10000,
};

interface UseIpodStatusBacklightOptions {
  t: TFunction;
  /** Used instead of `t` in dep arrays to avoid re-creating callbacks every render. */
  menuLocale: string;
  isForeground: boolean | undefined;
  toggleBacklight: () => void;
  /** Shared "user interacted" gate (owned by useIpodPlayback). */
  userHasInteractedRef: React.MutableRefObject<boolean>;
  isMusicQuizOpen: boolean;
  isBrickGameOpen: boolean;
  backlightOn: boolean;
  backlightTimeout: IpodBacklightTimeout;
}

export interface UseIpodStatusBacklightResult {
  statusMessage: string | null;
  lastActivityTime: number;
  setLastActivityTime: React.Dispatch<React.SetStateAction<number>>;
  showStatus: (message: string) => void;
  showOfflineStatus: () => void;
  registerActivity: () => void;
  registerActivityRef: () => void;
}

/**
 * Owns the iPod's transient LCD status message, the "last activity" clock, and
 * the backlight auto-off / foreground-wake behavior.
 *
 * `registerActivity` / `showStatus` are consumed across the rest of the iPod
 * logic (menu, wheel, settings, Apple Music), so this hook is composed early
 * and its outputs are threaded down. Extracted verbatim from `useIpodLogic`.
 */
export function useIpodStatusBacklight({
  t,
  menuLocale,
  isForeground,
  toggleBacklight,
  userHasInteractedRef,
  isMusicQuizOpen,
  isBrickGameOpen,
  backlightOn,
  backlightTimeout,
}: UseIpodStatusBacklightOptions): UseIpodStatusBacklightResult {
  // Lazy initializer so `Date.now()` is captured once on mount.
  const [lastActivityTime, setLastActivityTime] = useState(() => Date.now());
  const backlightTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const statusTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const prevIsForeground = useRef(isForeground);

  const showStatus = useCallback((message: string) => {
    setStatusMessage(message);
    if (statusTimeoutRef.current) {
      clearTimeout(statusTimeoutRef.current);
    }
    statusTimeoutRef.current = setTimeout(() => {
      setStatusMessage(null);
    }, 2000);
  }, []);

  const showOfflineStatus = useCallback(() => {
    toast.error(t("apps.ipod.dialogs.youreOffline"), {
      id: "ipod-offline",
      description: t("apps.ipod.dialogs.ipodRequiresInternet"),
    });
    showStatus("🚫");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showStatus, menuLocale]);

  // Ref-only version — marks activity without triggering any React state update.
  // Use this on high-frequency paths (e.g. brick game wheel) to keep the RAF
  // loop uninterrupted.
  const registerActivityRef = useCallback(() => {
    userHasInteractedRef.current = true;
  }, [userHasInteractedRef]);

  const registerActivity = useCallback(() => {
    setLastActivityTime(Date.now());
    userHasInteractedRef.current = true;
    const { backlightOn: isBacklightOn, backlightTimeout: timeoutSetting } =
      useIpodStore.getState();
    if (timeoutSetting !== "off" && !isBacklightOn) {
      toggleBacklight();
    }
  }, [toggleBacklight, userHasInteractedRef]);

  // Backlight timer
  useEffect(() => {
    if (backlightTimerRef.current) {
      clearTimeout(backlightTimerRef.current);
    }

    const timeoutMs =
      backlightTimeout === "off" || backlightTimeout === "always-on"
        ? null
        : BACKLIGHT_TIMEOUT_BY_SETTING[backlightTimeout];

    if (backlightOn && timeoutMs !== null) {
      backlightTimerRef.current = setTimeout(() => {
        const currentShowVideo = useIpodStore.getState().showVideo;
        const currentIsPlaying = useIpodStore.getState().isPlaying;
        const isGameOpen = isMusicQuizOpen || isBrickGameOpen;
        if (
          Date.now() - lastActivityTime >= timeoutMs &&
          !(currentShowVideo && currentIsPlaying) &&
          !isGameOpen
        ) {
          toggleBacklight();
        }
      }, timeoutMs);
    }

    return () => {
      if (backlightTimerRef.current) {
        clearTimeout(backlightTimerRef.current);
      }
    };
  }, [
    backlightOn,
    backlightTimeout,
    isBrickGameOpen,
    isMusicQuizOpen,
    lastActivityTime,
    toggleBacklight,
  ]);

  // Foreground handling
  useEffect(() => {
    if (isForeground && !prevIsForeground.current) {
      const { backlightOn: isBacklightOn, backlightTimeout: timeoutSetting } =
        useIpodStore.getState();
      if (!isBacklightOn && timeoutSetting !== "off") {
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

  // Cleanup status timeout on unmount
  useEffect(() => {
    return () => {
      if (statusTimeoutRef.current) {
        clearTimeout(statusTimeoutRef.current);
      }
    };
  }, []);

  return {
    statusMessage,
    lastActivityTime,
    setLastActivityTime,
    showStatus,
    showOfflineStatus,
    registerActivity,
    registerActivityRef,
  };
}
