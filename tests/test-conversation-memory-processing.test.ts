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

    expect(resetRoute).toContain("result.clearedMessages");
    expect(resetRoute).toContain("extractMemoriesFromConversation");
    expect(resetRoute).toContain("waitUntil(Promise.all(backgroundTasks))");
    expect(chatsSource).not.toContain("processConversationMemories");
    expect(assistantSource).not.toContain("processConversationMemories");
  });

  test("identity changes clear the device-local Assistant transcript", async () => {
    const [{ useChatsStore }, { useAssistantStore }] = await Promise.all([
      import("../src/stores/useChatsStore"),
      import("../src/stores/useAssistantStore"),
    ]);
    const previousChats = useChatsStore.getState();
    const previousAssistant = useAssistantStore.getState();

    try {
      useChatsStore.setState({
        username: "alice",
        isAuthenticated: true,
        rooms: [],
        aiMessages: [
          textMessage("private-chat", "user", "Alice's private Ryo chat"),
        ],
      });
      useAssistantStore.setState({
        messages: [
          textMessage("private", "user", "Alice's private conversation"),
        ],
        lastInteractionAt: Date.now(),
        bubbleDismissedAt: Date.now(),
      });

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
    expect(chatsStoreSource).toMatch(
      /setUsername: \(username\) => \{[\s\S]*?previousUsername !== username[\s\S]*?useAssistantStore\.getState\(\)\.clearMessages\(\)/
    );
    expect(
      chatsStoreSource.match(
        /useAssistantStore\.getState\(\)\.clearMessages\(\)/g
      )
    ).toHaveLength(5);
  });
});
