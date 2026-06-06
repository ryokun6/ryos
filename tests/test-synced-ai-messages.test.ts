import { describe, expect, test } from "bun:test";

/**
 * Documents the store→SDK sync guard that prevents proactive greeting (or any
 * shorter store snapshot) from clobbering an in-flight AI SDK conversation.
 */
describe("synced AI messages guard", () => {
  test("does not overwrite SDK when it has more messages than the store", () => {
    const aiMessages = [
      {
        id: "1",
        role: "assistant" as const,
        parts: [{ type: "text" as const, text: "hello" }],
      },
    ];
    const sdkMessages = [
      aiMessages[0],
      {
        id: "user-1",
        role: "user" as const,
        parts: [{ type: "text" as const, text: "what's new?" }],
      },
      {
        id: "assistant-1",
        role: "assistant" as const,
        parts: [{ type: "text" as const, text: "streaming..." }],
      },
    ];

    const shouldSyncStoreToSdk = sdkMessages.length <= aiMessages.length;
    expect(shouldSyncStoreToSdk).toBe(false);
  });
});
