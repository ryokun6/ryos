import { beforeEach, describe, expect, test } from "bun:test";
import { handleTvPlayerPause } from "../src/apps/tv/components/tv-app/tvPlayerEvents";
import { useTvStore } from "../src/stores/useTvStore";

describe("TV player events", () => {
  beforeEach(() => {
    useTvStore.setState({
      isPlaying: false,
      playbackRequested: false,
    });
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
