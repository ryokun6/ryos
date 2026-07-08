import "fake-indexeddb/auto";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { IpodWidget } from "../../../src/components/layout/dashboard/IpodWidget";
import { useAppStore } from "../../../src/stores/useAppStore";
import { useIpodStore } from "../../../src/stores/useIpodStore";
import { ensureTestLocalStorage } from "../../setup";

let registeredDomForSuite = false;
const originalActEnvironment = Object.getOwnPropertyDescriptor(
  globalThis,
  "IS_REACT_ACT_ENVIRONMENT"
);

beforeAll(() => {
  if (typeof document === "undefined") {
    GlobalRegistrator.register();
    registeredDomForSuite = true;
  }
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
    configurable: true,
    writable: true,
    value: true,
  });
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  useIpodStore.setState({
    librarySource: "youtube",
    tracks: [
      { id: "youtube-1", url: "https://youtu.be/youtube-1", title: "YouTube One" },
    ],
    currentSongId: "youtube-1",
    appleMusicTracks: [
      {
        id: "apple-1",
        url: "https://music.apple.com/song/apple-1",
        title: "Apple One",
        artist: "Apple Artist",
        source: "appleMusic",
      },
      {
        id: "apple-2",
        url: "https://music.apple.com/song/apple-2",
        title: "Apple Two",
        artist: "Apple Artist",
        source: "appleMusic",
      },
    ],
    appleMusicCurrentSongId: "apple-1",
    appleMusicPlaybackQueue: null,
    isShuffled: false,
    loopCurrent: false,
    loopAll: true,
  });
  useAppStore.setState({
    instances: {
      "ipod-test": {
        instanceId: "ipod-test",
        appId: "ipod",
        createdAt: 1,
        isOpen: true,
      },
    },
    instanceOrder: ["ipod-test"],
    foregroundInstanceId: "ipod-test",
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

afterAll(() => {
  if (registeredDomForSuite && GlobalRegistrator.isRegistered) {
    GlobalRegistrator.unregister();
  }
  ensureTestLocalStorage();
  if (originalActEnvironment) {
    Object.defineProperty(
      globalThis,
      "IS_REACT_ACT_ENVIRONMENT",
      originalActEnvironment
    );
  } else {
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT");
  }
});

describe("Dashboard iPod widget MediaCore wiring", () => {
  test("follows Apple Music selection and uses active-library navigation", async () => {
    await act(async () => {
      root.render(<IpodWidget />);
    });
    expect(container.textContent).toContain("YouTube One");

    await act(async () => {
      useIpodStore.setState({ librarySource: "appleMusic" });
    });
    expect(container.textContent).toContain("Apple One");
    expect(container.textContent).toContain("Apple Artist");

    await act(async () => {
      const nextButton = Array.from(container.querySelectorAll("button")).find(
        (button) => button.title.toLowerCase().includes("next")
      );
      nextButton?.click();
    });
    expect(useIpodStore.getState().appleMusicCurrentSongId).toBe("apple-2");
    expect(container.textContent).toContain("Apple Two");
    expect(useIpodStore.getState().currentSongId).toBe("youtube-1");
  });
});
