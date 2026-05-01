import { beforeEach, describe, expect, test } from "bun:test";
import {
  buildTvChannelLineup,
  DEFAULT_CHANNEL_ID,
} from "../src/apps/tv/data/channels";
import { useCloudSyncStore } from "../src/stores/useCloudSyncStore";
import { useTvStore } from "../src/stores/useTvStore";

describe("TV store default channel removal", () => {
  beforeEach(() => {
    useTvStore.setState({
      currentChannelId: DEFAULT_CHANNEL_ID,
      lastVideoIndexByChannel: {},
      isPlaying: false,
      customChannels: [],
      hiddenDefaultChannelIds: [],
      lcdFilterOn: true,
      closedCaptionsOn: true,
    });
    useCloudSyncStore.setState((state) => ({
      deletionMarkers: {
        ...state.deletionMarkers,
        tvCustomChannelIds: {},
      },
    }));
  });

  test("hides a default channel until reset", () => {
    useTvStore.getState().setCurrentChannelId("taiwan");
    useTvStore.getState().removeChannel("taiwan");

    const state = useTvStore.getState();
    expect(state.hiddenDefaultChannelIds).toEqual(["taiwan"]);
    expect(state.currentChannelId).toBe(DEFAULT_CHANNEL_ID);
    expect(
      buildTvChannelLineup(state.customChannels, state.hiddenDefaultChannelIds)
        .map((channel) => channel.id)
    ).not.toContain("taiwan");

    useTvStore.getState().resetChannels();

    const resetState = useTvStore.getState();
    expect(resetState.hiddenDefaultChannelIds).toEqual([]);
    expect(
      buildTvChannelLineup(
        resetState.customChannels,
        resetState.hiddenDefaultChannelIds
      ).map((channel) => channel.id)
    ).toContain("taiwan");
  });

  test("removes a custom channel without hiding defaults", () => {
    const custom = useTvStore.getState().addCustomChannel({
      name: "Custom",
      videos: [
        {
          id: "dQw4w9WgXcQ",
          url: "https://youtu.be/dQw4w9WgXcQ",
          title: "Test",
        },
      ],
    });

    useTvStore.getState().removeChannel(custom.id);

    const state = useTvStore.getState();
    expect(state.customChannels).toHaveLength(0);
    expect(state.hiddenDefaultChannelIds).toEqual([]);
    expect(
      useCloudSyncStore.getState().deletionMarkers.tvCustomChannelIds[custom.id]
    ).toBeString();
  });

  test("marks reset custom channels as deleted for sync", () => {
    const first = useTvStore.getState().addCustomChannel({
      name: "First",
      videos: [
        {
          id: "first-video",
          url: "https://youtu.be/first-video",
          title: "First",
        },
      ],
    });
    const second = useTvStore.getState().addCustomChannel({
      name: "Second",
      videos: [
        {
          id: "second-video",
          url: "https://youtu.be/second-video",
          title: "Second",
        },
      ],
    });

    useTvStore.getState().resetChannels();

    const state = useTvStore.getState();
    const deleted = useCloudSyncStore.getState().deletionMarkers.tvCustomChannelIds;
    expect(state.customChannels).toEqual([]);
    expect(Object.keys(deleted).sort()).toEqual([first.id, second.id].sort());
  });
});
