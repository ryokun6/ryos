import { describe, expect, test } from "bun:test";
import {
  BASE_URL,
  ensureUserAuth,
  fetchWithAuth,
  fetchWithOrigin,
  makeRateLimitBypassHeaders,
  uniqueTestUsername,
} from "./test-utils";
import type {
  AIConversationPage,
  AIConversationResetResult,
} from "../src/shared/contracts/aiConversation";

const password = "testtest123";
const CHAT_ID = "11111111-1111-4111-8111-111111111111";

function apiMessage(id: string, role: "user" | "assistant", text: string) {
  return {
    id,
    role,
    parts: [{ type: "text", text }],
    metadata: { createdAt: new Date().toISOString() },
  };
}

describe("AI conversation API", () => {
  test("requires authentication", async () => {
    const response = await fetchWithOrigin(
      `${BASE_URL}/api/ai/conversations/chat`
    );
    expect(response.status).toBe(401);
  });

  test("imports, paginates, isolates channels, and resets idempotently", async () => {
    const username = uniqueTestUsername("aic");
    const token = await ensureUserAuth(username, password);
    expect(token).not.toBeNull();
    if (!token) throw new Error("Failed to authenticate test user");

    const initialResponse = await fetchWithAuth(
      `${BASE_URL}/api/ai/conversations/chat?limit=2`,
      username,
      token
    );
    expect(initialResponse.status).toBe(200);
    const initial = (await initialResponse.json()) as AIConversationPage;
    expect(initial.conversation.revision).toBe(0);
    expect(initial.messages).toEqual([]);

    const operationId = crypto.randomUUID();
    const importResponse = await fetchWithAuth(
      `${BASE_URL}/api/ai/conversations/chat/import`,
      username,
      token,
      {
        method: "POST",
        headers: makeRateLimitBypassHeaders(),
        body: JSON.stringify({
          conversationId: initial.conversation.id,
          expectedRevision: 0,
          operationId,
          messages: [
            apiMessage("u1", "user", "one"),
            apiMessage("a1", "assistant", "two"),
            apiMessage("u2", "user", "three"),
          ],
        }),
      }
    );
    expect(importResponse.status).toBe(201);

    const replayResponse = await fetchWithAuth(
      `${BASE_URL}/api/ai/conversations/chat/import`,
      username,
      token,
      {
        method: "POST",
        headers: makeRateLimitBypassHeaders(),
        body: JSON.stringify({
          conversationId: initial.conversation.id,
          expectedRevision: 0,
          operationId,
          messages: [apiMessage("different", "user", "ignored replay")],
        }),
      }
    );
    expect(replayResponse.status).toBe(201);

    const duplicateImportResponse = await fetchWithAuth(
      `${BASE_URL}/api/ai/conversations/chat/import`,
      username,
      token,
      {
        method: "POST",
        headers: makeRateLimitBypassHeaders(),
        body: JSON.stringify({
          conversationId: initial.conversation.id,
          expectedRevision: 0,
          operationId: crypto.randomUUID(),
          messages: [apiMessage("u3", "user", "four")],
        }),
      }
    );
    expect(duplicateImportResponse.status).toBe(409);
    expect(await duplicateImportResponse.json()).toEqual({
      error: "revision_conflict",
    });

    const newestResponse = await fetchWithAuth(
      `${BASE_URL}/api/ai/conversations/chat?limit=2`,
      username,
      token
    );
    const newest = (await newestResponse.json()) as AIConversationPage;
    expect(newest.messages.map((message) => message.id)).toEqual(["a1", "u2"]);
    expect(newest.page.hasMore).toBe(true);
    expect(newest.page.nextCursor).not.toBeNull();

    const olderResponse = await fetchWithAuth(
      `${BASE_URL}/api/ai/conversations/chat?limit=2&cursor=${encodeURIComponent(
        newest.page.nextCursor ?? ""
      )}`,
      username,
      token
    );
    const older = (await olderResponse.json()) as AIConversationPage;
    expect(older.messages.map((message) => message.id)).toEqual(["u1"]);

    const assistantResponse = await fetchWithAuth(
      `${BASE_URL}/api/ai/conversations/assistant`,
      username,
      token
    );
    const assistant = (await assistantResponse.json()) as AIConversationPage;
    expect(assistant.messages).toEqual([]);
    expect(assistant.conversation.id).not.toBe(initial.conversation.id);

    const resetOperationId = crypto.randomUUID();
    const resetResponse = await fetchWithAuth(
      `${BASE_URL}/api/ai/conversations/chat/reset`,
      username,
      token,
      {
        method: "POST",
        headers: makeRateLimitBypassHeaders(),
        body: JSON.stringify({
          conversationId: initial.conversation.id,
          operationId: resetOperationId,
        }),
      }
    );
    expect(resetResponse.status).toBe(200);
    const reset = (await resetResponse.json()) as AIConversationResetResult;
    expect(reset.reset).toBe(true);
    expect(reset.conversation.id).not.toBe(initial.conversation.id);

    const resetReplayResponse = await fetchWithAuth(
      `${BASE_URL}/api/ai/conversations/chat/reset`,
      username,
      token,
      {
        method: "POST",
        headers: makeRateLimitBypassHeaders(),
        body: JSON.stringify({
          conversationId: initial.conversation.id,
          operationId: resetOperationId,
        }),
      }
    );
    expect(resetReplayResponse.status).toBe(200);
    const resetReplay =
      (await resetReplayResponse.json()) as AIConversationResetResult;
    expect(resetReplay.reset).toBe(false);
    expect(resetReplay.conversation.id).toBe(reset.conversation.id);

    const oldCursorResponse = await fetchWithAuth(
      `${BASE_URL}/api/ai/conversations/chat?cursor=${encodeURIComponent(
        newest.page.nextCursor ?? ""
      )}`,
      username,
      token
    );
    expect(oldCursorResponse.status).toBe(409);
    expect(await oldCursorResponse.json()).toEqual({
      error: "conversation_changed",
    });
  }, 30_000);

  test("does not accept another user's conversation id", async () => {
    const firstUsername = uniqueTestUsername("aia");
    const secondUsername = uniqueTestUsername("aib");
    const [firstToken, secondToken] = await Promise.all([
      ensureUserAuth(firstUsername, password),
      ensureUserAuth(secondUsername, password),
    ]);
    if (!firstToken || !secondToken) {
      throw new Error("Failed to authenticate isolation test users");
    }

    const firstResponse = await fetchWithAuth(
      `${BASE_URL}/api/ai/conversations/chat`,
      firstUsername,
      firstToken
    );
    const first = (await firstResponse.json()) as AIConversationPage;

    const crossUserReset = await fetchWithAuth(
      `${BASE_URL}/api/ai/conversations/chat/reset`,
      secondUsername,
      secondToken,
      {
        method: "POST",
        headers: makeRateLimitBypassHeaders(),
        body: JSON.stringify({
          conversationId: first.conversation.id,
          operationId: crypto.randomUUID(),
        }),
      }
    );
    expect(crossUserReset.status).toBe(409);
    expect(await crossUserReset.json()).toEqual({
      error: "conversation_changed",
    });
  });

  test("persists an authenticated streamed turn on the server", async () => {
    const username = uniqueTestUsername("aistream");
    const token = await ensureUserAuth(username, password);
    if (!token) throw new Error("Failed to authenticate stream test user");

    const initialResponse = await fetchWithAuth(
      `${BASE_URL}/api/ai/conversations/chat`,
      username,
      token
    );
    const initial = (await initialResponse.json()) as AIConversationPage;
    const userMessageId = crypto.randomUUID();
    const chatResponse = await fetchWithAuth(
      `${BASE_URL}/api/chat`,
      username,
      token,
      {
        method: "POST",
        headers: makeRateLimitBypassHeaders(),
        body: JSON.stringify({
          model: "gemini-3-flash",
          conversation: {
            id: initial.conversation.id,
            revision: initial.conversation.revision,
            operationId: crypto.randomUUID(),
          },
          trigger: "submit-message",
          message: {
            id: userMessageId,
            role: "user",
            parts: [
              {
                type: "text",
                text: "Remember the passphrase SERVER_CONTEXT_OK. Reply with exactly SYNC_OK.",
              },
            ],
            metadata: { createdAt: new Date().toISOString() },
          },
        }),
      }
    );
    expect(chatResponse.status).toBe(200);
    const streamBody = await chatResponse.text();
    expect(streamBody).toContain("SYNC_OK");

    let persisted: AIConversationPage | null = null;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const response = await fetchWithAuth(
        `${BASE_URL}/api/ai/conversations/chat`,
        username,
        token
      );
      const page = (await response.json()) as AIConversationPage;
      if (page.messages.some((message) => message.role === "assistant")) {
        persisted = page;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    expect(persisted).not.toBeNull();
    expect(persisted?.messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
    ]);
    expect(persisted?.messages[0]?.id).toBe(userMessageId);
    expect(persisted?.messages[1]?.parts[0]?.text).toContain("SYNC_OK");

    if (!persisted) throw new Error("First streamed turn was not persisted");
    const firstAssistantId = persisted.messages[1]?.id;
    const secondUserId = crypto.randomUUID();
    const secondResponse = await fetchWithAuth(
      `${BASE_URL}/api/chat`,
      username,
      token,
      {
        method: "POST",
        headers: makeRateLimitBypassHeaders(),
        body: JSON.stringify({
          model: "gemini-3-flash",
          conversation: {
            id: persisted.conversation.id,
            revision: persisted.conversation.revision,
            operationId: crypto.randomUUID(),
          },
          messages: [
            apiMessage(
              "tampered-prefix",
              "user",
              "The passphrase is CLIENT_PREFIX_WRONG."
            ),
          ],
          trigger: "submit-message",
          message: {
            id: secondUserId,
            role: "user",
            parts: [
              {
                type: "text",
                text: "Reply with exactly the passphrase from my previous message.",
              },
            ],
            metadata: { createdAt: new Date().toISOString() },
          },
        }),
      }
    );
    expect(secondResponse.status).toBe(200);
    const secondStream = await secondResponse.text();
    expect(secondStream).toContain("SERVER_CONTEXT_OK");
    expect(secondStream).not.toContain("CLIENT_PREFIX_WRONG");

    const twoTurnsResponse = await fetchWithAuth(
      `${BASE_URL}/api/ai/conversations/chat`,
      username,
      token
    );
    const twoTurns = (await twoTurnsResponse.json()) as AIConversationPage;
    expect(twoTurns.messages).toHaveLength(4);
    expect(twoTurns.messages[1]?.id).toBe(firstAssistantId);
    expect(new Set(twoTurns.messages.map((message) => message.id)).size).toBe(4);

    const oldSecondAssistantId = twoTurns.messages[3]?.id;
    const regenerateResponse = await fetchWithAuth(
      `${BASE_URL}/api/chat`,
      username,
      token,
      {
        method: "POST",
        headers: makeRateLimitBypassHeaders(),
        body: JSON.stringify({
          model: "gemini-3-flash",
          trigger: "regenerate-message",
          messageId: oldSecondAssistantId,
          conversation: {
            id: twoTurns.conversation.id,
            revision: twoTurns.conversation.revision,
            operationId: crypto.randomUUID(),
          },
        }),
      }
    );
    expect(regenerateResponse.status).toBe(200);
    expect(await regenerateResponse.text()).toContain("SERVER_CONTEXT_OK");

    const regeneratedResponse = await fetchWithAuth(
      `${BASE_URL}/api/ai/conversations/chat`,
      username,
      token
    );
    const regenerated =
      (await regeneratedResponse.json()) as AIConversationPage;
    expect(regenerated.messages).toHaveLength(4);
    expect(
      regenerated.messages.some(
        (message) => message.id === oldSecondAssistantId
      )
    ).toBe(false);
    expect(regenerated.messages[3]?.parts[0]?.text).toContain(
      "SERVER_CONTEXT_OK"
    );
  }, 90_000);

  test("validates chat conversation envelopes before generation", async () => {
    const invalid = await fetchWithOrigin(`${BASE_URL}/api/chat`, {
      method: "POST",
      headers: makeRateLimitBypassHeaders(),
      body: JSON.stringify({
        messages: [],
        conversation: {
          id: CHAT_ID,
          revision: -1,
          operationId: crypto.randomUUID(),
        },
      }),
    });
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({
      error: "invalid_conversation_context",
    });

    const anonymous = await fetchWithOrigin(`${BASE_URL}/api/chat`, {
      method: "POST",
      headers: makeRateLimitBypassHeaders(),
      body: JSON.stringify({
        messages: [],
        conversation: {
          id: CHAT_ID,
          revision: 0,
          operationId: crypto.randomUUID(),
        },
      }),
    });
    expect(anonymous.status).toBe(401);
    expect(await anonymous.json()).toEqual({
      error: "conversation_auth_required",
    });
  });
});
