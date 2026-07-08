import { beforeEach, describe, expect, test } from "bun:test";
import {
  handleTvPlayerPause,
  shouldPlayEmbeddedTv,
} from "../../../src/apps/tv/components/tv-app/tvPlayerEvents";
import { useTvStore } from "../../../src/stores/useTvStore";

describe("TV player events", () => {
  beforeEach(() => {
    useTvStore.setState({
      isPlaying: false,
      playbackRequested: false,
    });
  });

  test("the initial mobile Safari request reaches the embedded player while the screen is visually off", () => {
    expect(
      shouldPlayEmbeddedTv({
        playbackRequested: true,
        isFullScreen: false,
        poweringOff: false,
        screenOff: true,
      })
    ).toBe(true);
  });

  test("an explicit pause keeps the embedded player silent", () => {
    expect(
      shouldPlayEmbeddedTv({
        playbackRequested: false,
        isFullScreen: false,
        poweringOff: false,
        screenOff: false,
      })
    ).toBe(false);
  });

  test("an early player pause does not cancel an unconfirmed play request", () => {
    useTvStore.getState().setIsPlaying(true);

    expect(useTvStore.getState()).toMatchObject({
      isPlaying: false,
      playbackRequested: true,
    });

    handleTvPlayerPause();

    expect(useTvStore.getState()).toMatchObject({
      isPlaying: false,
      playbackRequested: true,
    });

    useTvStore.getState().confirmPlayback();

    expect(useTvStore.getState()).toMatchObject({
      isPlaying: true,
      playbackRequested: true,
    });
  });

  test("a real provider pause stops confirmed playback", () => {
    useTvStore.getState().setIsPlaying(true);
    useTvStore.getState().confirmPlayback();

    handleTvPlayerPause();

    expect(useTvStore.getState()).toMatchObject({
      isPlaying: false,
      playbackRequested: false,
    });
  });

  test("stale pauses from video and channel changes preserve playback intent", () => {
    const store = useTvStore.getState();
    store.setIsPlaying(true);
    store.confirmPlayback();

    store.setVideoIndex(store.currentChannelId, 1);
    store.setIsPlaying(true);
    handleTvPlayerPause();

    expect(useTvStore.getState()).toMatchObject({
      isPlaying: false,
      playbackRequested: true,
    });

    useTvStore.getState().confirmPlayback();
    useTvStore.getState().setCurrentChannelId("mtv");
    useTvStore.getState().setIsPlaying(true);
    handleTvPlayerPause();

    expect(useTvStore.getState()).toMatchObject({
      isPlaying: false,
      playbackRequested: true,
    });
  });
});
