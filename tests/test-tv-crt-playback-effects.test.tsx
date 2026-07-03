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
let powerOffCalls: number;

const noop = () => {};

function Harness({
  playbackRequested,
  isPlaying = false,
  isBuffering = false,
  poweringOff = false,
  screenOff,
}: {
  playbackRequested: boolean;
  isPlaying?: boolean;
  isBuffering?: boolean;
  poweringOff?: boolean;
  screenOff: boolean;
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
    playPowerOff: () => {
      powerOffCalls += 1;
    },
    playChannelSwitch: noop,
    startStatic: noop,
    stopStatic: noop,
    playbackRequested,
    isPlaying,
    isBuffering,
    poweringOff,
    screenOff,
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
    powerOffCalls = 0;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  test("a pending play request wakes the mobile Safari screen before confirmation", async () => {
    await act(async () =>
      root.render(<Harness playbackRequested={false} screenOff />)
    );
    screenOffUpdates = [];
    powerOnCalls = 0;

    await act(async () =>
      root.render(<Harness playbackRequested screenOff />)
    );

    expect(screenOffUpdates).toEqual([false]);
    expect(powerOnCalls).toBe(1);
  });

  test("cancelling a pending request powers the screen off", async () => {
    await act(async () =>
      root.render(<Harness playbackRequested screenOff={false} />)
    );
    screenOffUpdates = [];
    powerOffCalls = 0;

    await act(async () =>
      root.render(<Harness playbackRequested={false} screenOff={false} />)
    );

    expect(screenOffUpdates).toEqual([true]);
    expect(powerOffCalls).toBe(1);
  });

  test("pausing confirmed playback powers the screen off once", async () => {
    await act(async () =>
      root.render(
        <Harness playbackRequested isPlaying screenOff={false} />
      )
    );
    screenOffUpdates = [];
    powerOffCalls = 0;

    await act(async () =>
      root.render(<Harness playbackRequested={false} screenOff={false} />)
    );

    expect(screenOffUpdates).toEqual([true]);
    expect(powerOffCalls).toBe(1);
  });

  test("pausing while buffering still powers the screen off", async () => {
    await act(async () =>
      root.render(
        <Harness
          playbackRequested
          isPlaying
          isBuffering
          screenOff={false}
        />
      )
    );
    screenOffUpdates = [];
    powerOffCalls = 0;

    await act(async () =>
      root.render(
        <Harness
          playbackRequested={false}
          isBuffering
          screenOff={false}
        />
      )
    );

    expect(screenOffUpdates).toEqual([true]);
    expect(powerOffCalls).toBe(1);
  });

  test("a pending request cannot wake the screen during power-off", async () => {
    await act(async () =>
      root.render(<Harness playbackRequested={false} screenOff />)
    );
    screenOffUpdates = [];
    powerOnCalls = 0;

    await act(async () =>
      root.render(<Harness playbackRequested poweringOff screenOff />)
    );

    expect(screenOffUpdates).toEqual([]);
    expect(powerOnCalls).toBe(0);
  });
});
