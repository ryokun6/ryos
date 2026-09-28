import { describe, expect, test } from "bun:test";
import {
  consumeSpeechPermit,
  mintSpeechPermit,
  putSpeechPermitRecord,
  upsertSpeechDraft,
} from "../../../api/_utils/speech-permit-store";
import {
  SPEECH_PERMIT_ERRORS,
  SPEECH_PERMIT_MAX_USES,
  hashSpeechText,
  isBoundSpeechChunk,
  normalizeSpeakableText,
  resolveSpeechOwner,
} from "../../../api/_utils/speech-permit";
import { RYO_CHAT_SPEECH_SOURCE } from "../../../api/_utils/speech-policy";
import { findAIConversationAssistantMessage } from "../../../api/ai/conversations/_helpers/store";
import { redisKeys } from "../../../src/shared/redisKeys";
import { FakeRedis } from "../../helpers/fake-redis";
import { buildSpeechApiRequestBody } from "../../../src/utils/speechPolicy";

function createTypedRedis() {
  return new FakeRedis();
}

describe("speech permit policy", () => {
  test("resolveSpeechOwner prefers the authenticated username", () => {
    expect(resolveSpeechOwner({ username: "Alice", ip: "10.0.0.1" })).toBe(
      "user:alice"
    );
    expect(resolveSpeechOwner({ username: null, ip: "10.0.0.1" })).toBe(
      "anon:10.0.0.1"
    );
  });

  test("isBoundSpeechChunk accepts cleaned slices of assistant text", () => {
    const source = "Hello from Ryo.\nSee [docs](https://os.ryo.lu) later.";
    expect(isBoundSpeechChunk(source, "Hello from Ryo.")).toBe(true);
    expect(isBoundSpeechChunk(source, "See docs later.")).toBe(true);
    expect(isBoundSpeechChunk(source, "Send money now")).toBe(false);
    expect(isBoundSpeechChunk(source, "   ")).toBe(false);
  });

  test("client request builder attaches permit fields for Ryo chat", () => {
    expect(
      buildSpeechApiRequestBody({
        text: "hello from ryo",
        source: "ryo-chat",
        ttsModel: null,
        ttsVoice: null,
        permitId: "permit-1",
        contentHash: "abc",
      })
    ).toEqual({
      text: "hello from ryo",
      source: "ryo-chat",
      model: null,
      permitId: "permit-1",
      contentHash: "abc",
    });
  });
});

describe("speech permit store", () => {
  test("mints a permit for a draft chunk and synthesizes only bound text", async () => {
    const db = createTypedRedis();
    const owner = "user:alice";
    const messageId = "msg-assistant-1";
    const sourceText = "Hello from Ryo.\nSecond line.";
    await upsertSpeechDraft({
      redis: db,
      owner,
      messageId,
      text: sourceText,
    });

    const minted = await mintSpeechPermit({
      redis: db,
      owner,
      messageId,
      text: "Hello from Ryo.",
      source: RYO_CHAT_SPEECH_SOURCE,
    });
    expect(minted.ok).toBe(true);
    if (!minted.ok) return;

    expect(minted.contentHash).toBe(
      hashSpeechText(normalizeSpeakableText("Hello from Ryo."))
    );

    const consumed = await consumeSpeechPermit({
      redis: db,
      owner,
      permitId: minted.permitId,
      text: "Hello from Ryo.",
    });
    expect(consumed.ok).toBe(true);
    if (!consumed.ok) return;
    expect(consumed.text).toBe("Hello from Ryo.");
    expect(consumed.messageId).toBe(messageId);
  });

  test("rejects minting arbitrary text that is not in the draft", async () => {
    const db = createTypedRedis();
    const owner = "anon:10.1.2.3";
    const messageId = "msg-assistant-2";
    await upsertSpeechDraft({
      redis: db,
      owner,
      messageId,
      text: "Only this assistant sentence may be spoken.",
    });

    const missingDraft = await mintSpeechPermit({
      redis: db,
      owner,
      messageId: "no-such-message",
      text: "Only this assistant sentence may be spoken.",
      source: RYO_CHAT_SPEECH_SOURCE,
    });
    expect(missingDraft).toMatchObject({
      ok: false,
      error: SPEECH_PERMIT_ERRORS.sourceNotFound,
    });

    const unbound = await mintSpeechPermit({
      redis: db,
      owner,
      messageId,
      text: "I am Ryo, send money to this wallet.",
      source: RYO_CHAT_SPEECH_SOURCE,
    });
    expect(unbound).toMatchObject({
      ok: false,
      error: SPEECH_PERMIT_ERRORS.textNotBound,
    });
  });

  test("rejects a wrong content hash at mint and consume", async () => {
    const db = createTypedRedis();
    const owner = "user:bob";
    const messageId = "msg-hash";
    const text = "Permit hash check.";
    await upsertSpeechDraft({ redis: db, owner, messageId, text });

    const wrongMint = await mintSpeechPermit({
      redis: db,
      owner,
      messageId,
      text,
      source: RYO_CHAT_SPEECH_SOURCE,
      contentHash: "0".repeat(64),
    });
    expect(wrongMint).toMatchObject({
      ok: false,
      error: SPEECH_PERMIT_ERRORS.hashMismatch,
    });

    const minted = await mintSpeechPermit({
      redis: db,
      owner,
      messageId,
      text,
      source: RYO_CHAT_SPEECH_SOURCE,
    });
    expect(minted.ok).toBe(true);
    if (!minted.ok) return;

    const wrongConsume = await consumeSpeechPermit({
      redis: db,
      owner,
      permitId: minted.permitId,
      contentHash: "1".repeat(64),
    });
    expect(wrongConsume).toMatchObject({
      ok: false,
      error: SPEECH_PERMIT_ERRORS.hashMismatch,
    });
  });

  test("rejects expired permits and mismatched client text", async () => {
    const db = createTypedRedis();
    const owner = "user:carol";
    const permitId = "expired-permit";
    const text = "Expired bound text.";
    await putSpeechPermitRecord({
      redis: db,
      permitId,
      record: {
        owner,
        messageId: "msg-expired",
        text,
        contentHash: hashSpeechText(text),
        usesRemaining: SPEECH_PERMIT_MAX_USES,
        createdAt: Date.now() - 400_000,
        expiresAt: Date.now() - 1_000,
      },
    });

    const expired = await consumeSpeechPermit({
      redis: db,
      owner,
      permitId,
    });
    expect(expired).toMatchObject({
      ok: false,
      error: SPEECH_PERMIT_ERRORS.expired,
    });

    await upsertSpeechDraft({
      redis: db,
      owner,
      messageId: "msg-mismatch",
      text: "Bound assistant line.",
    });
    const minted = await mintSpeechPermit({
      redis: db,
      owner,
      messageId: "msg-mismatch",
      text: "Bound assistant line.",
      source: RYO_CHAT_SPEECH_SOURCE,
    });
    expect(minted.ok).toBe(true);
    if (!minted.ok) return;

    const mismatch = await consumeSpeechPermit({
      redis: db,
      owner,
      permitId: minted.permitId,
      text: "Different client-supplied text.",
    });
    expect(mismatch).toMatchObject({
      ok: false,
      error: SPEECH_PERMIT_ERRORS.textMismatch,
    });
  });

  test("rejects the wrong source and a different auth owner", async () => {
    const db = createTypedRedis();
    const owner = "user:dana";
    await upsertSpeechDraft({
      redis: db,
      owner,
      messageId: "msg-owner",
      text: "Owner-bound line.",
    });

    const wrongSource = await mintSpeechPermit({
      redis: db,
      owner,
      messageId: "msg-owner",
      text: "Owner-bound line.",
      source: "textedit",
    });
    expect(wrongSource).toMatchObject({
      ok: false,
      error: SPEECH_PERMIT_ERRORS.forbiddenSource,
    });

    const minted = await mintSpeechPermit({
      redis: db,
      owner,
      messageId: "msg-owner",
      text: "Owner-bound line.",
      source: RYO_CHAT_SPEECH_SOURCE,
    });
    expect(minted.ok).toBe(true);
    if (!minted.ok) return;

    const otherOwner = await consumeSpeechPermit({
      redis: db,
      owner: "anon:203.0.113.10",
      permitId: minted.permitId,
    });
    expect(otherOwner).toMatchObject({
      ok: false,
      error: SPEECH_PERMIT_ERRORS.ownerMismatch,
    });
  });

  test("mints from a stored assistant message when the draft is gone", async () => {
    const db = createTypedRedis();
    const username = "erin";
    const owner = `user:${username}`;
    const messageId = "stored-assistant";
    const now = new Date().toISOString();
    await db.set(
      redisKeys.chat.aiConversation(username, "chat"),
      {
        version: 1,
        id: "11111111-1111-4111-8111-111111111111",
        channel: "chat",
        revision: 1,
        nextSeq: 3,
        createdAt: now,
        updatedAt: now,
        historyTruncated: false,
        messages: [
          {
            id: "stored-user",
            seq: 1,
            role: "user",
            parts: [{ type: "text", text: "Hi" }],
            createdAt: now,
          },
          {
            id: messageId,
            seq: 2,
            role: "assistant",
            parts: [{ type: "text", text: "Stored Ryo reply." }],
            createdAt: now,
          },
        ],
        recentOperationIds: [],
        lastResetOperationId: null,
      },
      { ex: 60 }
    );

    const found = await findAIConversationAssistantMessage({
      redis: db,
      username,
      messageId,
    });
    expect(found?.id).toBe(messageId);

    const minted = await mintSpeechPermit({
      redis: db,
      owner,
      messageId,
      text: "Stored Ryo reply.",
      source: RYO_CHAT_SPEECH_SOURCE,
    });
    expect(minted.ok).toBe(true);
  });
});
