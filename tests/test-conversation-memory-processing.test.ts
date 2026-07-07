import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { AIChatMessage } from "../src/types/chat";

function textMessage(
  id: string,
  role: "user" | "assistant",
  text: string
): AIChatMessage {
  return {
    id,
    role,
    parts: [{ type: "text", text }],
    metadata: { createdAt: new Date("2026-07-05T20:00:00.000Z") },
  };
}

describe("conversation memory processing", () => {
  test("server reset owns memory extraction for both Ryo surfaces", () => {
    const resetRoute = readFileSync(
      resolve(
        process.cwd(),
        "api/ai/conversations/[channel]/reset.ts"
      ),
      "utf8"
    );
    const chatsSource = readFileSync(
      resolve(process.cwd(), "src/apps/chats/hooks/useAiChat.ts"),
      "utf8"
    );
    const assistantSource = readFileSync(
      resolve(process.cwd(), "src/components/assistant/useAssistantChat.ts"),
      "utf8"
    );
    const chatRoute = readFileSync(
      resolve(process.cwd(), "api/chat.ts"),
      "utf8"
    );

    expect(resetRoute).toContain("processClearedAIConversationMemory");
    expect(resetRoute).toMatch(
      /waitUntil\(\s*processClearedAIConversationMemory\(/
    );
    // Extraction runs inline from the reset endpoint; the chat hot path no
    // longer retries pending reset-memory snapshots.
    expect(chatRoute).not.toContain("ResetMemory");
    expect(chatsSource).not.toContain("processConversationMemories");
    expect(assistantSource).not.toContain("processConversationMemories");
  });

  test("first login preserves anonymous Chat and Assistant transcripts, then account switching clears them", async () => {
    const [{ useChatsStore }, { useAssistantStore }] = await Promise.all([
      import("../src/stores/useChatsStore"),
      import("../src/stores/useAssistantStore"),
    ]);
    const previousChats = useChatsStore.getState();
    const previousAssistant = useAssistantStore.getState();

    try {
      useChatsStore.setState({
        username: null,
        isAuthenticated: false,
        rooms: [],
        aiMessages: [
          textMessage("anonymous-chat", "user", "Anonymous Ryo chat"),
        ],
      });
      useAssistantStore.setState({
        messages: [
          textMessage("anonymous-assistant", "user", "Anonymous assistant chat"),
        ],
        lastInteractionAt: Date.now(),
        bubbleDismissedAt: Date.now(),
      });

      useChatsStore.getState().setUsername("alice");
      useChatsStore.getState().setAuthenticated(true);

      expect(useChatsStore.getState().aiMessages.map((entry) => entry.id)).toEqual([
        "anonymous-chat",
      ]);
      expect(
        useAssistantStore.getState().messages.map((entry) => entry.id)
      ).toEqual(["anonymous-assistant"]);

      useChatsStore.getState().setUsername("bob");

      expect(useChatsStore.getState().username).toBe("bob");
      expect(useChatsStore.getState().aiMessages).toHaveLength(1);
      expect(useChatsStore.getState().aiMessages[0]?.id).toBe("1");
      expect(useAssistantStore.getState().messages).toEqual([]);
      expect(useAssistantStore.getState().lastInteractionAt).toBeNull();
      expect(useAssistantStore.getState().bubbleDismissedAt).toBeNull();
    } finally {
      useChatsStore.setState({
        username: previousChats.username,
        isAuthenticated: previousChats.isAuthenticated,
        rooms: previousChats.rooms,
        aiMessages: previousChats.aiMessages,
      });
      useAssistantStore.setState({
        messages: previousAssistant.messages,
        lastInteractionAt: previousAssistant.lastInteractionAt,
        bubbleDismissedAt: previousAssistant.bubbleDismissedAt,
      });
    }

    const chatsStoreSource = readFileSync(
      resolve(process.cwd(), "src/stores/useChatsStore.ts"),
      "utf8"
    );
    expect(chatsStoreSource).toContain(
      "shouldClearAIHistoryForUsernameChange"
    );
    expect(chatsStoreSource).toContain("return previousOwner !== null");
  });
});
