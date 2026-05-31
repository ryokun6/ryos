import { useEffect, useRef, type Dispatch } from "react";
import type { TvLocalAction, TvLocalState } from "./tvLocalState";

export function useTvCrtPlaybackEffects({
  currentChannelId,
  currentVideoId,
  setLcdSlot,
  isWindowOpen,
  skipInitialSound,
  isMobileSafariDevice,
  setPowerOnKey,
  setPoweringOff,
  setChannelSwitchKey,
  setIsBuffering,
  setIsTransitioningCc,
  setScreenOff,
  isFullScreen,
  playPowerOn,
  playPowerOff,
  playChannelSwitch,
  startStatic,
  stopStatic,
  isPlaying,
  isBuffering,
  poweringOff,
  screenOff,
  staticBedActive,
  scheduleNextTitle,
  dispatchLocal,
}: {
  currentChannelId: string;
  currentVideoId: string | undefined;
  setLcdSlot: (
    value:
      | TvLocalState["lcdSlot"]
      | ((prev: TvLocalState["lcdSlot"]) => TvLocalState["lcdSlot"])
  ) => void;
  isWindowOpen: boolean;
  skipInitialSound: boolean | undefined;
  isMobileSafariDevice: boolean;
  setPowerOnKey: (value: number | ((prev: number) => number)) => void;
  setPoweringOff: (value: boolean) => void;
  setChannelSwitchKey: (value: number | ((prev: number) => number)) => void;
  setIsBuffering: (value: boolean) => void;
  setIsTransitioningCc: (value: boolean) => void;
  setScreenOff: (value: boolean) => void;
  isFullScreen: boolean;
  playPowerOn: () => void | Promise<void>;
  playPowerOff: () => void | Promise<void>;
  playChannelSwitch: () => void | Promise<void>;
  startStatic: () => void | Promise<void>;
  stopStatic: () => void;
  isPlaying: boolean;
  isBuffering: boolean;
  poweringOff: boolean;
  screenOff: boolean;
  staticBedActive: boolean;
  scheduleNextTitle: string | null | undefined;
  dispatchLocal: Dispatch<TvLocalAction>;
}) {
  useEffect(() => {
    setLcdSlot("now");
  }, [currentChannelId, currentVideoId]);

  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (isWindowOpen && !wasOpenRef.current) {
      wasOpenRef.current = true;
      if (!skipInitialSound && !isMobileSafariDevice) {
        setPowerOnKey((k) => k + 1);
        void playPowerOn();
      }
    } else if (!isWindowOpen && wasOpenRef.current) {
      wasOpenRef.current = false;
      setPoweringOff(false);
      stopStatic();
    }
  }, [isWindowOpen, skipInitialSound, playPowerOn, stopStatic, isMobileSafariDevice]);

  const channelMountedRef = useRef(false);
  useEffect(() => {
    if (!channelMountedRef.current) {
      channelMountedRef.current = true;
      return;
    }
    if (isFullScreen) return;
    setChannelSwitchKey((k) => k + 1);
    void playChannelSwitch();
  }, [currentChannelId, playChannelSwitch, isFullScreen]);

  useEffect(() => {
    setIsBuffering(false);
  }, [currentVideoId]);

  const ccTransitionMountedRef = useRef(false);
  useEffect(() => {
    if (!ccTransitionMountedRef.current) {
      ccTransitionMountedRef.current = true;
      return;
    }
    setIsTransitioningCc(true);
    const id = window.setTimeout(() => setIsTransitioningCc(false), 700);
    return () => window.clearTimeout(id);
  }, [currentChannelId, currentVideoId]);

  const prevPlayingRef = useRef(isPlaying);
  const prevVideoIdRef = useRef(currentVideoId);
  const hasPausedRef = useRef(false);
  useEffect(() => {
    const nextVideoId = currentVideoId;
    if (!isWindowOpen || !wasOpenRef.current || poweringOff) {
      prevPlayingRef.current = isPlaying;
      prevVideoIdRef.current = nextVideoId;
      return;
    }

    if (screenOff && isPlaying) {
      setScreenOff(false);
      setPowerOnKey((k) => k + 1);
      void playPowerOn();
      prevPlayingRef.current = isPlaying;
      prevVideoIdRef.current = nextVideoId;
      return;
    }

    if (isBuffering) {
      prevPlayingRef.current = isPlaying;
      prevVideoIdRef.current = nextVideoId;
      return;
    }
    if (prevVideoIdRef.current !== nextVideoId) {
      prevPlayingRef.current = isPlaying;
      prevVideoIdRef.current = nextVideoId;
      return;
    }
    const prev = prevPlayingRef.current;
    prevPlayingRef.current = isPlaying;
    if (prev === isPlaying) return;
    if (prev && !isPlaying) {
      hasPausedRef.current = true;
      setScreenOff(true);
      stopStatic();
      void playPowerOff();
    } else if (!prev && isPlaying && hasPausedRef.current) {
      setScreenOff(false);
      setPowerOnKey((k) => k + 1);
      void playPowerOn();
    }
  }, [
    isPlaying,
    isWindowOpen,
    isBuffering,
    poweringOff,
    screenOff,
    currentVideoId,
    playPowerOff,
    playPowerOn,
    stopStatic,
  ]);

  useEffect(() => {
    if (!isWindowOpen) {
      setScreenOff(isMobileSafariDevice);
      hasPausedRef.current = false;
    }
  }, [isWindowOpen, isMobileSafariDevice]);

  useEffect(() => {
    if (staticBedActive) {
      void startStatic();
    } else {
      stopStatic();
    }
  }, [staticBedActive, startStatic, stopStatic]);

  useEffect(() => {
    if (!isPlaying || !scheduleNextTitle) return;
    const id = window.setInterval(() => {
      dispatchLocal({ type: "toggleLcdSlotWithDirection" });
    }, 4500);
    return () => window.clearInterval(id);
  }, [isPlaying, scheduleNextTitle, dispatchLocal]);
}
