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
  });

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
});
