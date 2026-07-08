import { afterAll, describe, expect, mock, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

// The partial `window` stub must not leak into later test files.
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");

afterAll(() => {
  if (originalWindow) {
    Object.defineProperty(globalThis, "window", originalWindow);
  } else {
    delete (globalThis as { window?: unknown }).window;
  }
});

const playerMock = mock((props: Record<string, unknown>) => {
  return React.createElement("div", { "data-testid": "player" }, JSON.stringify(props));
});

mock.module("react-player", () => ({
  default: playerMock,
}));

const { YouTubePlayer } = await import("../../../src/components/shared/YouTubePlayer");

describe("YouTubePlayer", () => {
  test("preserves default YouTube config while applying caller overrides", () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { location: { origin: "http://localhost:3000" } },
    });

    renderToStaticMarkup(
      React.createElement(YouTubePlayer, {
        url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        config: {
          youtube: {
            playerVars: {
              fs: 0,
              controls: 0,
            },
            embedOptions: {
              loading: "lazy",
            },
          },
        },
      })
    );

    expect(playerMock).toHaveBeenCalledTimes(1);
    const props = playerMock.mock.calls[0][0] as {
      config: {
        youtube: {
          playerVars: Record<string, unknown>;
          embedOptions: Record<string, unknown>;
        };
      };
    };

    expect(props.config.youtube.playerVars).toMatchObject({
      modestbranding: 1,
      rel: 0,
      iv_load_policy: 3,
      disablekb: 1,
      playsinline: 1,
      enablejsapi: 1,
      fs: 0,
      controls: 0,
    });
    expect(props.config.youtube.embedOptions).toMatchObject({
      referrerPolicy: "strict-origin-when-cross-origin",
      loading: "lazy",
    });
  });

  test("does not ask ReactPlayer to play before YouTube reports ready", () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { location: { origin: "http://localhost:3000" } },
    });

    renderToStaticMarkup(
      React.createElement(YouTubePlayer, {
        url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        playing: true,
      })
    );

    const lastCall = playerMock.mock.calls[playerMock.mock.calls.length - 1];
    expect(lastCall[0]).toMatchObject({
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      playing: false,
    });
  });
});
