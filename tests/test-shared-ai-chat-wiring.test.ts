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
});
