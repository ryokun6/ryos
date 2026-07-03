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
  playbackRequested,
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
  playbackRequested: boolean;
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
  }, [currentChannelId, currentVideoId, setLcdSlot]);

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
  }, [
    isWindowOpen,
    skipInitialSound,
    playPowerOn,
    setPowerOnKey,
    setPoweringOff,
    stopStatic,
    isMobileSafariDevice,
  ]);

  const channelMountedRef = useRef(false);
  useEffect(() => {
    if (!channelMountedRef.current) {
      channelMountedRef.current = true;
      return;
    }
    if (isFullScreen) return;
    setChannelSwitchKey((k) => k + 1);
    void playChannelSwitch();
  }, [
    currentChannelId,
    currentVideoId,
    playChannelSwitch,
    setChannelSwitchKey,
    isFullScreen,
  ]);

  useEffect(() => {
    setIsBuffering(false);
  }, [currentVideoId, setIsBuffering]);

  const ccTransitionMountedRef = useRef(false);
  useEffect(() => {
    if (!ccTransitionMountedRef.current) {
      ccTransitionMountedRef.current = true;
      return;
    }
    setIsTransitioningCc(true);
    const id = window.setTimeout(() => setIsTransitioningCc(false), 700);
    return () => window.clearTimeout(id);
  }, [currentChannelId, currentVideoId, setIsTransitioningCc]);

  const prevPlayingRef = useRef(isPlaying);
  const prevPlaybackRequestedRef = useRef(playbackRequested);
  const prevChannelIdRef = useRef(currentChannelId);
  const prevVideoIdRef = useRef(currentVideoId);
  const hasPausedRef = useRef(false);
  useEffect(() => {
    const nextVideoId = currentVideoId;
    const prev = prevPlayingRef.current;
    const prevPlaybackRequested = prevPlaybackRequestedRef.current;
    const prevChannelId = prevChannelIdRef.current;
    const prevVideoId = prevVideoIdRef.current;
    prevPlayingRef.current = isPlaying;
    prevPlaybackRequestedRef.current = playbackRequested;
    prevChannelIdRef.current = currentChannelId;
    prevVideoIdRef.current = nextVideoId;
    const sourceChanged =
      prevChannelId !== currentChannelId || prevVideoId !== nextVideoId;

    if (!isWindowOpen || !wasOpenRef.current || poweringOff) {
      return;
    }

    if (sourceChanged && playbackRequested) {
      hasPausedRef.current = false;
      if (screenOff) setScreenOff(false);
      return;
    }

    if (screenOff && playbackRequested) {
      hasPausedRef.current = false;
      setScreenOff(false);
      setPowerOnKey((k) => k + 1);
      void playPowerOn();
      return;
    }

    if (
      (prev && !isPlaying) ||
      (prevPlaybackRequested && !playbackRequested)
    ) {
      hasPausedRef.current = true;
      setScreenOff(true);
      stopStatic();
      void playPowerOff();
      return;
    }

    if (isBuffering || sourceChanged) return;

    if (!prev && isPlaying && hasPausedRef.current) {
      hasPausedRef.current = false;
      setScreenOff(false);
      setPowerOnKey((k) => k + 1);
      void playPowerOn();
    }
  }, [
    isPlaying,
    playbackRequested,
    isWindowOpen,
    isBuffering,
    poweringOff,
    screenOff,
    currentVideoId,
    currentChannelId,
    playPowerOff,
    playPowerOn,
    setPowerOnKey,
    setScreenOff,
    stopStatic,
  ]);

  useEffect(() => {
    if (!isWindowOpen) {
      setScreenOff(isMobileSafariDevice);
      hasPausedRef.current = false;
    }
  }, [isWindowOpen, isMobileSafariDevice, setScreenOff]);

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
