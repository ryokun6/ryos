import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CHAT_MESSAGE_LIST_MIN_CLEARANCE_PX,
  messageListBottomClearance,
} from "../../../src/apps/chats/components/chat-messages/composerClearance";

const readSource = (relativePath: string): string =>
  readFileSync(join(process.cwd(), relativePath), "utf8");

describe("messageListBottomClearance", () => {
  test("keeps the historical 56px floor when the composer is shorter than the label-less layout", () => {
    // Measured on macOS X / aqua: composer without the model label is 52px,
    // and pb-14 (56px) left the last bubble a few pixels clear.
    expect(
      messageListBottomClearance({
        composerTop: 400,
        scrollBottom: 452,
        viewportHeight: 800,
        safeAreaBottom: 0,
      })
    ).toBe(CHAT_MESSAGE_LIST_MIN_CLEARANCE_PX);
  });

  test("grows with the composer when the model label makes it taller than 56px", () => {
    // Label shown: composer overlay measured at 76px (52px field + label),
    // plus the 4px gap the label-less layout already had.
    expect(
      messageListBottomClearance({
        composerTop: 303,
        scrollBottom: 379,
        viewportHeight: 844,
        safeAreaBottom: 0,
      })
    ).toBe(80);
  });

  test("does not add safe-area inset that already sits inside the composer", () => {
    // Home indicator overlaps the bottom 34px of a 76px composer. The list
    // still only needs to clear the composer top (plus the small slack).
    expect(
      messageListBottomClearance({
        composerTop: 700,
        scrollBottom: 776,
        viewportHeight: 844,
        safeAreaBottom: 102,
      })
    ).toBe(80);
  });

  test("clears a safe area that extends above the composer", () => {
    // Scrollport runs into the home indicator farther than the composer covers
    // (and farther than the 56px floor).
    expect(
      messageListBottomClearance({
        composerTop: 800,
        scrollBottom: 830,
        viewportHeight: 844,
        safeAreaBottom: 80,
      })
    ).toBe(70);
  });

  test("ignores a safe area the scrollport does not reach", () => {
    expect(
      messageListBottomClearance({
        composerTop: 200,
        scrollBottom: 280,
        viewportHeight: 844,
        safeAreaBottom: 34,
      })
    ).toBe(84);
  });

  test("ceils subpixel composer overlap so the bubble cannot sit a fraction under the overlay", () => {
    expect(
      messageListBottomClearance({
        composerTop: 100,
        scrollBottom: 176.2,
        viewportHeight: 800,
        safeAreaBottom: 0,
      })
    ).toBe(81);
  });

  test("treats a negative safe area as zero", () => {
    expect(
      messageListBottomClearance({
        composerTop: 100,
        scrollBottom: 140,
        viewportHeight: 800,
        safeAreaBottom: -20,
      })
    ).toBe(CHAT_MESSAGE_LIST_MIN_CLEARANCE_PX);
  });
});

describe("Chats composer clearance wiring", () => {
  test("message list reserves measured clearance instead of a fixed pb-14", () => {
    const messages = readSource(
      "src/apps/chats/components/chat-messages/ChatMessages.tsx"
    );
    const button = readSource(
      "src/apps/chats/components/chat-messages/ScrollToBottomButton.tsx"
    );
    const windowContent = readSource(
      "src/apps/chats/components/chats-app/ChatsWindowContent.tsx"
    );

    expect(messages).not.toContain("pb-14");
    expect(messages).toContain("data-chat-composer-clearance");
    expect(messages).toContain("height: bottomClearance");
    expect(button).not.toContain('bottom: "56px"');
    expect(button).toContain("bottom: bottomClearance");
    expect(windowContent).toContain("useComposerOverlayClearance");
    expect(windowContent).toContain("data-chat-composer");
    expect(windowContent).toContain("bottomClearance={bottomClearance}");
  });
});
