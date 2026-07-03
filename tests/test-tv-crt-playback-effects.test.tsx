import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useTvCrtPlaybackEffects } from "../src/apps/tv/components/tv-app/useTvCrtPlaybackEffects";

if (typeof document === "undefined") {
  GlobalRegistrator.register();
}

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  configurable: true,
  value: true,
});

let container: HTMLDivElement;
let root: Root;
let screenOffUpdates: boolean[];
let powerOnCalls: number;

const noop = () => {};

function Harness({
  playbackRequested,
}: {
  playbackRequested: boolean;
}) {
  useTvCrtPlaybackEffects({
    currentChannelId: "ryos-picks",
    currentVideoId: "video-1",
    setLcdSlot: noop,
    isWindowOpen: true,
    skipInitialSound: true,
    isMobileSafariDevice: true,
    setPowerOnKey: noop,
    setPoweringOff: noop,
    setChannelSwitchKey: noop,
    setIsBuffering: noop,
    setIsTransitioningCc: noop,
    setScreenOff: (value) => screenOffUpdates.push(value),
    isFullScreen: false,
    playPowerOn: () => {
      powerOnCalls += 1;
    },
    playPowerOff: noop,
    playChannelSwitch: noop,
    startStatic: noop,
    stopStatic: noop,
    playbackRequested,
    isPlaying: false,
    isBuffering: false,
    poweringOff: false,
    screenOff: true,
    staticBedActive: false,
    scheduleNextTitle: null,
    dispatchLocal: noop,
  });
  return null;
}

describe("TV CRT playback effects", () => {
  beforeEach(() => {
    screenOffUpdates = [];
    powerOnCalls = 0;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  test("a pending play request wakes the mobile Safari screen before confirmation", async () => {
    await act(async () => root.render(<Harness playbackRequested={false} />));
    screenOffUpdates = [];
    powerOnCalls = 0;

    await act(async () => root.render(<Harness playbackRequested />));

    expect(screenOffUpdates).toEqual([false]);
    expect(powerOnCalls).toBe(1);
  });
});
