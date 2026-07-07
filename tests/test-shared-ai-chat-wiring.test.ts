/**
 * Guardrail tests for the shared AI chat instance.
 *
 * Chats and Terminal both call useAiChat(). Each useChat() call used to
 * create its OWN SDK Chat (separate transport/message state/tool execution)
 * that fought over the single Zustand message store. These tests pin the
 * wiring that keeps all callers attached to ONE module-level Chat.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, test, expect } from "bun:test";

const readSource = (relativePath: string): string =>
  readFileSync(resolve(process.cwd(), relativePath), "utf-8");

describe("shared AI chat wiring", () => {
  const source = readSource("src/apps/chats/hooks/useAiChat.ts");

  test("exactly one Chat instance is constructed (module-level singleton)", () => {
    const constructions = source.match(/new Chat</g) || [];
    expect(constructions).toHaveLength(1);
    expect(source).toContain("let sharedAiChat");
    expect(source).toContain("function getSharedAiChat()");
  });

  test("useChat attaches to the shared chat instead of creating its own", () => {
    expect(source).toMatch(/useChat<AIChatMessage>\(\{\s*chat: getSharedAiChat\(\)/);
    // No per-hook chat config: transport/messages/sendAutomaticallyWhen live
    // on the shared Chat, not in the useChat() options.
    const useChatCall = source.slice(source.indexOf("useChat<AIChatMessage>("));
    const optionsBlock = useChatCall.slice(0, useChatCall.indexOf("});"));
    expect(optionsBlock).not.toContain("transport:");
    expect(optionsBlock).not.toContain("sendAutomaticallyWhen");
  });

  test("lifecycle handlers delegate through the role registry (primary wins)", () => {
    expect(source).toContain("resolveSharedHandlers()?.onToolCall");
    expect(source).toContain("resolveSharedHandlers()?.onFinish");
    expect(source).toContain("resolveSharedHandlers()?.onError");
    expect(source).toMatch(
      /sharedHandlerRegistry\.get\("primary"\) \?\? sharedHandlerRegistry\.get\("secondary"\)/
    );
    // Unmount cleanup must not clobber a newer registration.
    expect(source).toMatch(
      /if \(sharedHandlerRegistry\.get\(sharedHandlerRole\) === sharedHandlersRef\)/
    );
  });

  test("chats registers as primary; terminal consumes without a username prompt", () => {
    const chatsController = readSource(
      "src/apps/chats/components/chats-app/useChatsAppController.tsx"
    );
    expect(chatsController).toMatch(/useAiChat\(promptSetUsername\)/);

    const terminal = readSource("src/apps/terminal/hooks/useTerminalLogic.ts");
    expect(terminal).toMatch(/useAiChat\(\)/);
  });

  test("generic error retry resubmits the latest user message in place", () => {
    const retryStart = source.indexOf("const retryLastUserMessage");
    const retryEnd = source.indexOf("const {", retryStart);
    const retry = source.slice(retryStart, retryEnd);
    expect(retryStart).toBeGreaterThan(-1);
    expect(retry).toContain('messages[index]?.role === "user"');
    expect(retry).toContain('invalidateAIConversationSession("chat", owner)');
    expect(retry).toContain("parts: latestUserMessage.parts");
    expect(retry).toContain("metadata: latestUserMessage.metadata");
    expect(retry).toContain("messageId: latestUserMessage.id");
    expect(retry).toContain("return sendMessage(");
    expect(retry).not.toContain("sdkRegenerate");
    expect(source).toContain("regenerateAssistantMessage: sdkRegenerate");

    const chatsWindow = readSource(
      "src/apps/chats/components/chats-app/ChatsWindowContent.tsx"
    );
    expect(chatsWindow).toContain("onRetry={retryLastUserMessage}");
  });

  test("submissions pin identity and identity changes reset the composer", () => {
    expect(
      source.match(
        /const submissionIdentity = captureChatSubmissionIdentity\(\);/g
      ) ?? []
    ).toHaveLength(2);
    const imageUpload = source.indexOf(
      "image = await uploadAIConversationImage(imageContent)"
    );
    const imageSend = source.indexOf("sendMessage(", imageUpload);
    const postUpload = source.slice(imageUpload, imageSend);
    expect(imageUpload).toBeGreaterThan(-1);
    expect(postUpload).toContain(
      "isChatSubmissionIdentityCurrent(submissionIdentity)"
    );
    const finalIdentityCheck = source.lastIndexOf(
      "isChatSubmissionIdentityCurrent(submissionIdentity)",
      imageSend
    );
    expect(finalIdentityCheck).toBeGreaterThan(imageUpload);
    expect(source.slice(finalIdentityCheck, imageSend)).not.toContain("await ");

    const chatsController = readSource(
      "src/apps/chats/components/chats-app/useChatsAppController.tsx"
    );
    expect(chatsController).toContain(
      "previousComposerIdentityRef.current === composerIdentity"
    );
    expect(chatsController).toContain(
      "setInputResetTrigger((previous) => previous + 1)"
    );
  });

  test("subscribes the shared chat once and includes remote streams in loading state", () => {
    expect(source).toContain(
      'new AIConversationRealtimeService("chat")'
    );
    expect(source).toContain("chatConversationRealtime.register({");
    expect(source).toContain(
      'priority: sharedHandlerRole === "primary" ? 1 : 0'
    );
    expect(source).toContain("isRemoteStreaming");

    const assistant = readSource(
      "src/components/assistant/useAssistantChat.ts"
    );
    expect(assistant).toContain(
      'new AIConversationRealtimeService(\n  "assistant"\n)'
    );
    expect(assistant).toContain("assistantConversationRealtime.register({");
    expect(assistant).toContain("isRemoteStreaming");
  });
});

describe("server AI chat lifecycle wiring", () => {
  const source = readSource("api/chat.ts");

  test("uses one turn-scoped completion operation across new and continued responses", () => {
    expect(source).toContain(
      "getAIConversationTurnCompletionOperationId(conversationOperationId)"
    );
    expect(
      source.match(/operationId: conversationCompletionOperationId/g) ?? []
    ).toHaveLength(2);
    expect(source).not.toContain("operationId: responseMessage.id");
  });

  test("rate-limits regeneration and every anonymous non-greeting generation", () => {
    expect(source).toMatch(
      /const shouldRateLimit =\s*normalizedTrigger === "regenerate-message" \|\|/
    );
    expect(source).toContain("(!isAuthenticated || isNewUserTurn)");
    expect(source).toContain("requestMessages.length === 1");
    expect(source).toMatch(
      /if \(shouldRateLimit\) \{\s*const rateLimitResult = await checkAndIncrementAIMessageCount/
    );
  });

  test("forwards disconnects to the model while keeping the persistence consumer", () => {
    expect(source).toContain('req.once("aborted", abortGeneration)');
    expect(source).toContain('res.once("close", handleResponseClose)');
    expect(source).toContain('requestSocket?.once("close", abortGeneration)');
    expect(source).toContain('req.off("aborted", abortGeneration)');
    expect(source).toContain('res.off("close", handleResponseClose)');
    expect(source).toContain('requestSocket?.off("close", abortGeneration)');
    expect(source).toMatch(
      /agent\.stream\(\{\s*messages: enrichedMessages,\s*abortSignal: generationAbortController\.signal/
    );
    expect(source).toContain("consumeSseStream: consumeResponseStream");
    expect(source).toContain(": consumeStream;");
    expect(source).toMatch(
      /if \(isAborted \|\| !finishReason \|\| finishReason === "error"\) \{\s*await releaseTurnAfterClientAbort\(\)/
    );
  });

  test("logs and releases late persistence failures without rethrowing", () => {
    const start = source.indexOf("onFinish: async");
    const end = source.indexOf("\n      },\n    });", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const onFinish = source.slice(start, end);
    expect(onFinish).toContain(
      'logError("Failed to persist completed conversation response", error)'
    );
    expect(onFinish).toContain("await releaseAIConversationTurn");
    expect(onFinish).not.toContain("throw error");
    expect(onFinish).toContain("clearGenerationAbortListeners()");
  });

  test("broadcasts turn lifecycle and forwards the visible response stream", () => {
    expect(source).toContain("broadcastAIConversationRealtimeEvent(username");
    expect(source).toContain("forwardAIConversationRealtimeStream({");
    expect(source).toContain("kind: \"turn-started\"");
    expect(source).toContain("kind: \"turn-finished\"");
    expect(source).toContain("waitUntil(forwarding)");
  });
});
