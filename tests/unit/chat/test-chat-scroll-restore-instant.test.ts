import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const readSource = (relativePath: string): string =>
  readFileSync(join(process.cwd(), relativePath), "utf8");

describe("Chats scroll-to-bottom on restore vs new messages", () => {
  test("StickToBottom uses instant resize so restored history does not animate", () => {
    const source = readSource(
      "src/apps/chats/components/chat-messages/ChatMessages.tsx"
    );
    expect(source).toContain('resize="instant"');
    expect(source).toContain('initial="instant"');
    expect(source).not.toContain('resize="smooth"');
  });

  test("new-message scroll trigger and button request smooth scroll", () => {
    const content = readSource(
      "src/apps/chats/components/chat-messages/ChatMessagesContent.tsx"
    );
    const button = readSource(
      "src/apps/chats/components/chat-messages/ScrollToBottomButton.tsx"
    );
    expect(content).toContain('scrollToBottom("smooth")');
    expect(button).toContain('scrollToBottom("smooth")');
  });
});
