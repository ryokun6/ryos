import { describe, expect, test } from "bun:test";
import {
  buildStaticSystemPrompt,
  buildVolatileStatePrompt,
  type RyoConversationSystemState,
} from "../../../api/_utils/ryo-conversation.js";
import {
  appendDeviceConversationMessage,
  clearDeviceConversationHistory,
  loadDeviceConversationHistory,
  type DeviceHistoryStore,
} from "../../../api/_utils/device-conversation.js";

const systemState: RyoConversationSystemState = {
  username: "testuser",
  runningApps: {
    foreground: { instanceId: "1", appId: "chats", title: "Chats" },
    background: [],
  },
  ipod: {
    currentTrack: { id: "track1", title: "Test Song", artist: "Test Artist" },
    librarySource: "youtube",
    isPlaying: true,
  },
};

function memoryRedis(): DeviceHistoryStore & { lists: Map<string, string[]> } {
  const lists = new Map<string, string[]>();
  return {
    lists,
    async lpush(key, ...values) {
      const list = lists.get(key) ?? [];
      list.unshift(...values);
      lists.set(key, list);
      return list.length;
    },
    async lrange(key, start, stop) {
      const list = lists.get(key) ?? [];
      const end = stop < 0 ? list.length + stop : stop;
      return list.slice(start, end + 1);
    },
    async ltrim(key, start, stop) {
      const list = lists.get(key) ?? [];
      const end = stop < 0 ? list.length + stop : stop;
      lists.set(key, list.slice(start, end + 1));
      return "OK";
    },
    async expire() {
      return 1;
    },
    async del(...keys) {
      for (const key of keys) lists.delete(key);
      return keys.length;
    },
  };
}

describe("device conversation channel", () => {
  test("prompt is spoken and headless", () => {
    const prompt = buildStaticSystemPrompt("device");
    expect(prompt).toContain("voice terminal");
    expect(prompt).toContain("spoken aloud");
    expect(prompt).not.toContain("<telegram_chat_instructions>");
  });

  test("volatile state skips the desktop", () => {
    const prompt = buildVolatileStatePrompt({
      channel: "device",
      systemState,
      username: "testuser",
    });
    expect(prompt).toContain("Ryo Time:");
    expect(prompt).not.toContain("RUNNING APPLICATIONS");
    expect(prompt).not.toContain("MEDIA PLAYBACK");
  });

  test("history is per user and newest-last when loaded", async () => {
    const redis = memoryRedis();
    await appendDeviceConversationMessage(redis, "Ada", {
      role: "user",
      content: "hi",
      createdAt: 1,
    });
    await appendDeviceConversationMessage(redis, "Ada", {
      role: "assistant",
      content: "hey",
      createdAt: 2,
    });
    await appendDeviceConversationMessage(redis, "other", {
      role: "user",
      content: "nope",
      createdAt: 3,
    });

    expect(await loadDeviceConversationHistory(redis, "ada")).toEqual([
      { role: "user", content: "hi", createdAt: 1 },
      { role: "assistant", content: "hey", createdAt: 2 },
    ]);

    await clearDeviceConversationHistory(redis, "ada");
    expect(await loadDeviceConversationHistory(redis, "ada")).toEqual([]);
    expect(await loadDeviceConversationHistory(redis, "other")).toHaveLength(1);
  });
});
