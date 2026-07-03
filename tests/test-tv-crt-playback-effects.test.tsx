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
let channelSwitchCalls: number;
let channelSwitchKeyUpdates: number;

const noop = () => {};
const playPowerOnSpy = () => {
  powerOnCalls += 1;
};
const playPowerOffSpy = () => {
  powerOffCalls += 1;
};
const playChannelSwitchSpy = () => {
  channelSwitchCalls += 1;
};
const setChannelSwitchKeySpy = () => {
  channelSwitchKeyUpdates += 1;
};

function Harness({
  playbackRequested,
  isPlaying = false,
  isBuffering = false,
  poweringOff = false,
  screenOff,
  currentChannelId = "ryos-picks",
  currentVideoId = "video-1",
}: {
  playbackRequested: boolean;
  isPlaying?: boolean;
  isBuffering?: boolean;
  poweringOff?: boolean;
  screenOff: boolean;
  currentChannelId?: string;
  currentVideoId?: string;
}) {
  useTvCrtPlaybackEffects({
    currentChannelId,
    currentVideoId,
    setLcdSlot: noop,
    isWindowOpen: true,
    skipInitialSound: true,
    isMobileSafariDevice: true,
    setPowerOnKey: noop,
    setPoweringOff: noop,
    setChannelSwitchKey: setChannelSwitchKeySpy,
    setIsBuffering: noop,
    setIsTransitioningCc: noop,
    setScreenOff: (value) => screenOffUpdates.push(value),
    isFullScreen: false,
    playPowerOn: playPowerOnSpy,
    playPowerOff: playPowerOffSpy,
    playChannelSwitch: playChannelSwitchSpy,
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
    channelSwitchCalls = 0;
    channelSwitchKeyUpdates = 0;
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

  test("a video skip preserves playback intent and shows switch static", async () => {
    await act(async () =>
      root.render(
        <Harness playbackRequested isPlaying screenOff={false} />
      )
    );
    screenOffUpdates = [];
    powerOffCalls = 0;
    channelSwitchCalls = 0;
    channelSwitchKeyUpdates = 0;

    await act(async () =>
      root.render(
        <Harness
          playbackRequested
          isPlaying={false}
          screenOff={false}
          currentVideoId="video-2"
        />
      )
    );

    expect(screenOffUpdates).toEqual([]);
    expect(powerOffCalls).toBe(0);
    expect(channelSwitchKeyUpdates).toBe(1);
    expect(channelSwitchCalls).toBe(1);
  });

  test("a channel switch preserves playback when both channels reuse a video id", async () => {
    await act(async () =>
      root.render(
        <Harness playbackRequested isPlaying screenOff={false} />
      )
    );
    screenOffUpdates = [];
    powerOffCalls = 0;
    channelSwitchCalls = 0;

    await act(async () =>
      root.render(
        <Harness
          playbackRequested
          isPlaying={false}
          screenOff={false}
          currentChannelId="other-channel"
        />
      )
    );

    expect(screenOffUpdates).toEqual([]);
    expect(powerOffCalls).toBe(0);
    expect(channelSwitchCalls).toBe(1);
  });

  test("a source change clears a stale off screen without power-on", async () => {
    await act(async () =>
      root.render(
        <Harness playbackRequested isPlaying screenOff={false} />
      )
    );
    screenOffUpdates = [];
    powerOnCalls = 0;

    await act(async () =>
      root.render(
        <Harness
          playbackRequested
          screenOff
          currentVideoId="video-2"
        />
      )
    );

    expect(screenOffUpdates).toEqual([false]);
    expect(powerOnCalls).toBe(0);
  });

  test("pause then resume consumes power-on before the next source starts", async () => {
    await act(async () =>
      root.render(
        <Harness playbackRequested isPlaying screenOff={false} />
      )
    );

    await act(async () =>
      root.render(<Harness playbackRequested={false} screenOff={false} />)
    );
    powerOnCalls = 0;

    await act(async () =>
      root.render(<Harness playbackRequested screenOff />)
    );
    await act(async () =>
      root.render(
        <Harness playbackRequested isPlaying screenOff={false} />
      )
    );
    await act(async () =>
      root.render(
        <Harness
          playbackRequested
          isPlaying={false}
          screenOff={false}
          currentVideoId="video-2"
        />
      )
    );
    await act(async () =>
      root.render(
        <Harness
          playbackRequested
          isPlaying
          screenOff={false}
          currentVideoId="video-2"
        />
      )
    );

    expect(powerOnCalls).toBe(1);
    expect(channelSwitchCalls).toBe(1);
  });
});
