import { describe, expect, test } from "bun:test";
import {
  BASE_URL,
  ensureUserAuth,
  fetchWithAuth,
  fetchWithOrigin,
  makeRateLimitBypassHeaders,
  uniqueTestUsername,
} from "../../helpers/test-utils";
import type {
  AIConversationResetResult,
  AIConversationSnapshot,
} from "../../../src/shared/contracts/aiConversation";

const password = "testtest123";
const CHAT_ID = "11111111-1111-4111-8111-111111111111";
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);

function apiMessage(id: string, role: "user" | "assistant", text: string) {
  return {
    id,
    role,
    parts: [{ type: "text", text }],
    metadata: { createdAt: new Date().toISOString() },
  };
}

function messageText(
  message: AIConversationSnapshot["messages"][number] | undefined
): string {
  return (
    message?.parts
      .flatMap((part) => (part.type === "text" ? [part.text] : []))
      .join("") ?? ""
  );
}

async function fetchSnapshot(
  username: string,
  token: string,
  query = ""
): Promise<AIConversationSnapshot> {
  const response = await fetchWithAuth(
    `${BASE_URL}/api/ai/conversations/chat${query}`,
    username,
    token
  );
  expect(response.status).toBe(200);
  return (await response.json()) as AIConversationSnapshot;
}

describe("AI conversation API", () => {
  test("requires authentication", async () => {
    const response = await fetchWithOrigin(
      `${BASE_URL}/api/ai/conversations/chat`
    );
    expect(response.status).toBe(401);
  });

  test("rejects a malformed afterSeq", async () => {
    const username = uniqueTestUsername("aiseq");
    const token = await ensureUserAuth(username, password);
    if (!token) throw new Error("Failed to authenticate test user");

    const response = await fetchWithAuth(
      `${BASE_URL}/api/ai/conversations/chat?afterSeq=nope`,
      username,
      token
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_after_seq" });
  });

  test("isolates channels and resets idempotently", async () => {
    const username = uniqueTestUsername("aic");
    const token = await ensureUserAuth(username, password);
    expect(token).not.toBeNull();
    if (!token) throw new Error("Failed to authenticate test user");

    const initial = await fetchSnapshot(username, token);
    expect(initial.conversation.revision).toBe(0);
    expect(initial.messages).toEqual([]);

    const assistantResponse = await fetchWithAuth(
      `${BASE_URL}/api/ai/conversations/assistant`,
      username,
      token
    );
    const assistant =
      (await assistantResponse.json()) as AIConversationSnapshot;
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

    // A reset with the id of the already-replaced conversation conflicts.
    const staleReset = await fetchWithAuth(
      `${BASE_URL}/api/ai/conversations/chat/reset`,
      username,
      token,
      {
        method: "POST",
        headers: makeRateLimitBypassHeaders(),
        body: JSON.stringify({
          conversationId: initial.conversation.id,
          operationId: crypto.randomUUID(),
        }),
      }
    );
    expect(staleReset.status).toBe(409);
    expect(await staleReset.json()).toEqual({ error: "conversation_changed" });

    const afterReset = await fetchSnapshot(username, token);
    expect(afterReset.conversation.id).toBe(reset.conversation.id);
    expect(afterReset.messages).toEqual([]);
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

    const first = await fetchSnapshot(firstUsername, firstToken);

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

  test("round-trips an owned image through a streamed turn", async () => {
    const username = uniqueTestUsername("airich");
    const otherUsername = uniqueTestUsername("airichother");
    const [token, otherToken] = await Promise.all([
      ensureUserAuth(username, password),
      ensureUserAuth(otherUsername, password),
    ]);
    if (!token || !otherToken)
      throw new Error("Failed to authenticate test users");

    const upload = await fetchWithAuth(
      `${BASE_URL}/api/ai/attachments`,
      username,
      token,
      {
        method: "POST",
        headers: { "Content-Type": "image/png" },
        body: PNG_1X1,
      }
    );
    expect(upload.status).toBe(201);
    const attachment = (await upload.json()) as {
      mediaType: string;
      url: string;
    };

    const initial = await fetchSnapshot(username, token);
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
              { type: "text", text: "Reply with exactly IMAGE_OK." },
              {
                type: "file",
                mediaType: attachment.mediaType,
                url: attachment.url,
              },
            ],
            metadata: { createdAt: new Date().toISOString() },
          },
        }),
      }
    );
    expect(chatResponse.status).toBe(200);
    expect(await chatResponse.text()).toContain("IMAGE_OK");

    let persisted: AIConversationSnapshot | null = null;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const snapshot = await fetchSnapshot(username, token);
      if (snapshot.messages.some((message) => message.role === "assistant")) {
        persisted = snapshot;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!persisted) throw new Error("Streamed turn was not persisted");

    expect(persisted.messages[0]?.id).toBe(userMessageId);
    expect(persisted.messages[0]?.parts).toEqual([
      { type: "text", text: "Reply with exactly IMAGE_OK." },
      { type: "file", mediaType: "image/png", url: attachment.url },
    ]);

    const image = await fetchWithAuth(
      `${BASE_URL}${attachment.url}`,
      username,
      token
    );
    expect(image.status).toBe(200);
    expect(Buffer.from(await image.arrayBuffer())).toEqual(PNG_1X1);

    const isolated = await fetchWithAuth(
      `${BASE_URL}${attachment.url}`,
      otherUsername,
      otherToken
    );
    expect(isolated.status).toBe(404);
  }, 60_000);

  test("persists authenticated streamed turns and serves afterSeq deltas", async () => {
    const username = uniqueTestUsername("aistream");
    const token = await ensureUserAuth(username, password);
    if (!token) throw new Error("Failed to authenticate stream test user");

    const initial = await fetchSnapshot(username, token);
    const firstOperationId = crypto.randomUUID();
    const userMessageId = crypto.randomUUID();
    const firstBody = JSON.stringify({
      model: "gemini-3-flash",
      conversation: {
        id: initial.conversation.id,
        revision: initial.conversation.revision,
        operationId: firstOperationId,
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
    });
    const chatResponse = await fetchWithAuth(
      `${BASE_URL}/api/chat`,
      username,
      token,
      {
        method: "POST",
        headers: makeRateLimitBypassHeaders(),
        body: firstBody,
      }
    );
    expect(chatResponse.status).toBe(200);
    const streamBody = await chatResponse.text();
    expect(streamBody).toContain("SYNC_OK");

    let persisted: AIConversationSnapshot | null = null;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const snapshot = await fetchSnapshot(username, token);
      if (snapshot.messages.some((message) => message.role === "assistant")) {
        persisted = snapshot;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    expect(persisted).not.toBeNull();
    if (!persisted) throw new Error("First streamed turn was not persisted");
    expect(persisted.messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
    ]);
    expect(persisted.messages[0]?.id).toBe(userMessageId);
    expect(messageText(persisted.messages[1])).toContain("SYNC_OK");

    // Replaying the same operation must not append a duplicate turn.
    const replay = await fetchWithAuth(
      `${BASE_URL}/api/chat`,
      username,
      token,
      {
        method: "POST",
        headers: makeRateLimitBypassHeaders(),
        body: firstBody,
      }
    );
    expect(replay.status).toBe(409);
    expect(await replay.json()).toEqual({ error: "operation_replayed" });

    // A fresh operation with a stale revision conflicts before generation.
    const stale = await fetchWithAuth(`${BASE_URL}/api/chat`, username, token, {
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
        message: apiMessage(crypto.randomUUID(), "user", "stale write"),
      }),
    });
    expect(stale.status).toBe(409);
    expect(await stale.json()).toEqual({ error: "revision_conflict" });

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

    const twoTurns = await fetchSnapshot(username, token);
    expect(twoTurns.messages).toHaveLength(4);
    expect(twoTurns.messages[1]?.id).toBe(firstAssistantId);
    expect(new Set(twoTurns.messages.map((message) => message.id)).size).toBe(
      4
    );

    // Delta read: only messages newer than the first turn come back, while
    // the summary still describes the whole thread.
    const firstTurnNewestSeq = persisted.conversation.newestSeq;
    expect(firstTurnNewestSeq).not.toBeNull();
    const delta = await fetchSnapshot(
      username,
      token,
      `?afterSeq=${firstTurnNewestSeq}`
    );
    expect(delta.conversation).toEqual(twoTurns.conversation);
    expect(delta.messages.map((message) => message.id)).toEqual(
      twoTurns.messages.slice(2).map((message) => message.id)
    );
    const emptyDelta = await fetchSnapshot(
      username,
      token,
      `?afterSeq=${twoTurns.conversation.newestSeq}`
    );
    expect(emptyDelta.messages).toEqual([]);

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

    const regenerated = await fetchSnapshot(username, token);
    expect(regenerated.messages).toHaveLength(4);
    expect(
      regenerated.messages.some(
        (message) => message.id === oldSecondAssistantId
      )
    ).toBe(false);
    expect(messageText(regenerated.messages[3])).toContain(
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
