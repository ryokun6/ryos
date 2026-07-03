/**
 * MediaCore Phase 5 — unified `mediaControl` tool.
 *
 * Covers:
 * 1. The `mediaControlSchema` target/action vocabulary and gating rules.
 * 2. Client handler wiring for the `videos` and `tv` transport targets.
 */
import "fake-indexeddb/auto";
import { describe, expect, test, beforeEach } from "bun:test";

// Browser globals must be installed before importing the media stores (the
// iPod store imports useChatsStore, which reads localStorage at module load).
class MemoryStorage implements Storage {
  private readonly map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

const browserGlobals = globalThis as typeof globalThis & {
  localStorage?: Storage;
  navigator?: Navigator;
};
if (!browserGlobals.localStorage) {
  Object.defineProperty(browserGlobals, "localStorage", {
    configurable: true,
    value: new MemoryStorage(),
    writable: true,
  });
}
Object.defineProperty(browserGlobals, "navigator", {
  value: {
    ...(browserGlobals.navigator ?? {}),
    onLine: true,
    userAgent: "test",
  },
  configurable: true,
});

const { mediaControlSchema } = await import("../api/chat/tools/schemas");
const { MEDIA_TARGETS } = await import("../api/chat/tools/types");
const { createChatTools, TOOL_DESCRIPTIONS } = await import(
  "../api/chat/tools/index"
);
const { handleMediaControl } = await import(
  "../src/apps/chats/tools/mediaHandler"
);
const { useVideoStore } = await import("../src/stores/useVideoStore");
const { useTvStore } = await import("../src/stores/useTvStore");

const TRANSPORT_ACTIONS = [
  "toggle",
  "play",
  "pause",
  "playKnown",
  "addAndPlay",
  "next",
  "previous",
] as const;

const TV_CHANNEL_ACTIONS = [
  "list",
  "tune",
  "createChannel",
  "deleteChannel",
  "addVideo",
  "removeVideo",
] as const;

const validTransportParams = (action: string): Record<string, unknown> =>
  action === "addAndPlay" ? { id: "dQw4w9WgXcQ" } : {};

describe("mediaControl schema", () => {
  test("is the only registered browser media-control tool", () => {
    const tools = createChatTools(
      {} as Parameters<typeof createChatTools>[0]
    ) as Record<string, unknown>;

    expect(tools.mediaControl).toBeDefined();
    expect("ipodControl" in tools).toBe(false);
    expect("karaokeControl" in tools).toBe(false);
    expect("tvControl" in tools).toBe(false);
    expect("ipodControl" in TOOL_DESCRIPTIONS).toBe(false);
    expect("karaokeControl" in TOOL_DESCRIPTIONS).toBe(false);
    expect("tvControl" in TOOL_DESCRIPTIONS).toBe(false);
  });

  test("target vocabulary is pinned and defaults to music", () => {
    expect([...MEDIA_TARGETS]).toEqual(["music", "karaoke", "videos", "tv"]);
    const result = mediaControlSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.target).toBe("music");
      expect(result.data.action).toBe("toggle");
    }
  });

  test("accepts all transport actions for music, karaoke, and videos", () => {
    for (const target of ["music", "karaoke", "videos"] as const) {
      for (const action of TRANSPORT_ACTIONS) {
        const result = mediaControlSchema.safeParse({
          target,
          action,
          ...validTransportParams(action),
        });
        expect(result.success).toBe(true);
      }
    }
  });

  test("tv target only supports toggle/play/pause transport", () => {
    for (const action of ["toggle", "play", "pause"]) {
      expect(
        mediaControlSchema.safeParse({ target: "tv", action }).success
      ).toBe(true);
    }
    for (const action of ["playKnown", "addAndPlay", "next", "previous"]) {
      expect(
        mediaControlSchema.safeParse({
          target: "tv",
          action,
          ...validTransportParams(action),
        }).success
      ).toBe(false);
    }
  });

  test("channel actions require target tv", () => {
    const validChannelCalls: Record<string, Record<string, unknown>> = {
      list: {},
      tune: { channelId: "mtv" },
      createChannel: { prompt: "lofi beats" },
      deleteChannel: { channelId: "custom-1" },
      addVideo: { channelId: "custom-1", videoId: "dQw4w9WgXcQ" },
      removeVideo: { channelId: "custom-1", removeVideoId: "dQw4w9WgXcQ" },
    };
    for (const action of TV_CHANNEL_ACTIONS) {
      expect(
        mediaControlSchema.safeParse({
          target: "tv",
          action,
          ...validChannelCalls[action],
        }).success
      ).toBe(true);
      for (const target of ["music", "karaoke", "videos"]) {
        expect(
          mediaControlSchema.safeParse({
            target,
            action,
            ...validChannelCalls[action],
          }).success
        ).toBe(false);
      }
    }
  });

  test("enforces channel-action parameter rules", () => {
    expect(
      mediaControlSchema.safeParse({ target: "tv", action: "tune" }).success
    ).toBe(false);
    expect(
      mediaControlSchema.safeParse({ target: "tv", action: "createChannel" })
        .success
    ).toBe(false);
    expect(
      mediaControlSchema.safeParse({ target: "tv", action: "deleteChannel" })
        .success
    ).toBe(false);
    expect(
      mediaControlSchema.safeParse({
        target: "tv",
        action: "addVideo",
        channelId: "custom-1",
      }).success
    ).toBe(false);
    expect(
      mediaControlSchema.safeParse({
        target: "tv",
        action: "removeVideo",
        channelId: "custom-1",
      }).success
    ).toBe(false);
  });

  test("enableVideo is only valid for target music", () => {
    expect(
      mediaControlSchema.safeParse({
        target: "music",
        action: "play",
        enableVideo: true,
      }).success
    ).toBe(true);
    for (const target of ["karaoke", "videos", "tv"]) {
      expect(
        mediaControlSchema.safeParse({
          target,
          action: "play",
          enableVideo: true,
        }).success
      ).toBe(false);
    }
  });

  test("enableTranslation and enableFullscreen are gated to music/karaoke", () => {
    for (const target of ["music", "karaoke"]) {
      expect(
        mediaControlSchema.safeParse({
          target,
          action: "play",
          enableTranslation: "zh-TW",
          enableFullscreen: true,
        }).success
      ).toBe(true);
    }
    for (const target of ["videos", "tv"]) {
      expect(
        mediaControlSchema.safeParse({
          target,
          action: "play",
          enableTranslation: "zh-TW",
        }).success
      ).toBe(false);
      expect(
        mediaControlSchema.safeParse({
          target,
          action: "play",
          enableFullscreen: true,
        }).success
      ).toBe(false);
    }
  });

  test("enforces transport parameter rules", () => {
    // addAndPlay requires id and rejects manual title/artist.
    expect(
      mediaControlSchema.safeParse({ target: "music", action: "addAndPlay" })
        .success
    ).toBe(false);
    expect(
      mediaControlSchema.safeParse({
        target: "music",
        action: "addAndPlay",
        id: "dQw4w9WgXcQ",
        title: "Manual",
      }).success
    ).toBe(false);
    // playKnown allows bare invocation and id/title/artist.
    expect(
      mediaControlSchema.safeParse({ target: "karaoke", action: "playKnown" })
        .success
    ).toBe(true);
    expect(
      mediaControlSchema.safeParse({
        target: "karaoke",
        action: "playKnown",
        title: "Song",
        artist: "Artist",
      }).success
    ).toBe(true);
    // Playback-state and navigation actions reject item identifiers.
    for (const action of ["toggle", "play", "pause", "next", "previous"]) {
      expect(
        mediaControlSchema.safeParse({ target: "videos", action, id: "x" })
          .success
      ).toBe(false);
    }
  });
});

// ============================================================================
// Handler wiring for the new targets
// ============================================================================

const makeContext = () => {
  const outputs: Array<Record<string, unknown>> = [];
  return {
    outputs,
    context: {
      launchApp: () => "instance",
      addToolOutput: (result: unknown) =>
        outputs.push(result as Record<string, unknown>),
    },
  };
};

describe("mediaControl handler — videos target", () => {
  beforeEach(() => {
    useVideoStore.setState({
      videos: [
        { id: "vid1", url: "https://youtu.be/vid1", title: "First Video" },
        {
          id: "vid2",
          url: "https://youtu.be/vid2",
          title: "Second Video",
          artist: "Someone",
        },
        { id: "vid3", url: "https://youtu.be/vid3", title: "Third Video" },
      ],
      currentVideoId: "vid1",
      loopAll: true,
      playbackRequested: false,
      isPlaying: false,
    });
  });

  test("playKnown selects a video by title and requests playback", async () => {
    const { outputs, context } = makeContext();
    await handleMediaControl(
      { target: "videos", action: "playKnown", title: "Second" },
      "call-1",
      context
    );
    const state = useVideoStore.getState();
    expect(state.currentVideoId).toBe("vid2");
    expect(state.playbackRequested).toBe(true);
    expect(state.isPlaying).toBe(false);
    expect(outputs).toHaveLength(1);
    expect(outputs[0].tool).toBe("mediaControl");
  });

  test("next advances the playlist and wraps with loopAll", async () => {
    const { context } = makeContext();
    useVideoStore.setState({ currentVideoId: "vid3" });
    await handleMediaControl(
      { target: "videos", action: "next" },
      "call-2",
      context
    );
    expect(useVideoStore.getState().currentVideoId).toBe("vid1");
    expect(useVideoStore.getState().playbackRequested).toBe(true);
  });

  test("previous stays on the first video when loopAll is off", async () => {
    const { context } = makeContext();
    useVideoStore.setState({ currentVideoId: "vid1", loopAll: false });
    await handleMediaControl(
      { target: "videos", action: "previous" },
      "call-3",
      context
    );
    expect(useVideoStore.getState().currentVideoId).toBe("vid1");
  });

  test("pause clears the playback request", async () => {
    const { context } = makeContext();
    useVideoStore.setState({ playbackRequested: true, isPlaying: true });
    await handleMediaControl(
      { target: "videos", action: "pause" },
      "call-4",
      context
    );
    expect(useVideoStore.getState().playbackRequested).toBe(false);
  });

  test("playKnown reports not-found for unknown titles", async () => {
    const { outputs, context } = makeContext();
    await handleMediaControl(
      { target: "videos", action: "playKnown", title: "does not exist" },
      "call-5",
      context
    );
    expect(useVideoStore.getState().currentVideoId).toBe("vid1");
    expect(outputs).toHaveLength(1);
  });
});

describe("mediaControl handler — tv transport", () => {
  beforeEach(() => {
    useTvStore.setState({
      playbackRequested: false,
      isPlaying: false,
    });
  });

  test("play requests TV playback", async () => {
    const { outputs, context } = makeContext();
    await handleMediaControl(
      { target: "tv", action: "play" },
      "call-tv-1",
      context
    );
    expect(useTvStore.getState().playbackRequested).toBe(true);
    expect(outputs).toHaveLength(1);
    expect(outputs[0].tool).toBe("mediaControl");
  });

  test("pause stops TV playback", async () => {
    const { context } = makeContext();
    useTvStore.setState({ playbackRequested: true, isPlaying: true });
    await handleMediaControl(
      { target: "tv", action: "pause" },
      "call-tv-2",
      context
    );
    expect(useTvStore.getState().playbackRequested).toBe(false);
  });

  test("tune selects a channel without autoplay on iOS", async () => {
    Object.defineProperty(browserGlobals, "navigator", {
      configurable: true,
      value: { onLine: true, userAgent: "iPhone" },
    });
    try {
      const { outputs, context } = makeContext();
      await handleMediaControl(
        { target: "tv", action: "tune", channelId: "mtv" },
        "call-tv-ios",
        context
      );
      expect(useTvStore.getState().currentChannelId).toBe("mtv");
      expect(useTvStore.getState().playbackRequested).toBe(false);
      expect(outputs[0].output).toMatchObject({ success: true });
    } finally {
      Object.defineProperty(browserGlobals, "navigator", {
        configurable: true,
        value: { onLine: true, userAgent: "test" },
      });
    }
  });

  test("channel actions with a non-tv target report an error", async () => {
    const { outputs, context } = makeContext();
    await handleMediaControl(
      { target: "music", action: "tune", channelId: "mtv" },
      "call-tv-3",
      context
    );
    expect(outputs).toHaveLength(1);
    expect(outputs[0].state).toBe("output-error");
  });
});
