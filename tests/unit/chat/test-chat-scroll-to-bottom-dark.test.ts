import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { darkAquaThemeCss } from "../../helpers/theme-css-fixtures";

const scrollButtonSource = readFileSync(
  join(
    import.meta.dir,
    "../../../src/apps/chats/components/chat-messages/ScrollToBottomButton.tsx"
  ),
  "utf8"
);

describe("Chats scroll-to-bottom in macOS Aqua dark mode", () => {
  test("ScrollToBottomButton uses white chevron and dark pill hook class in dark mode", () => {
    expect(scrollButtonSource).toContain("chat-scroll-to-bottom-btn");
    expect(scrollButtonSource).toContain("isDarkMode");
    expect(scrollButtonSource).toContain('"text-white"');
    expect(scrollButtonSource).toContain("text-black/70");
    expect(scrollButtonSource).not.toContain("chat-scroll-to-bottom-glyph");
  });

  test("dark-aqua.css darkens scroll pill and tones gloss; no dark chevron pin", () => {
    expect(darkAquaThemeCss).toContain(
      ':root[data-os-theme="macosx"][data-os-color-scheme="dark"] .chat-scroll-to-bottom-btn'
    );
    expect(darkAquaThemeCss).toMatch(
      /\.chat-scroll-to-bottom-btn\s*\{[^}]*rgba\(88,\s*88,\s*90/i
    );
    expect(darkAquaThemeCss).toContain(".chat-scroll-to-bottom-gloss-top");
    expect(darkAquaThemeCss).toContain(".chat-scroll-to-bottom-gloss-bottom");
    expect(darkAquaThemeCss).not.toContain(".chat-scroll-to-bottom-glyph");
  });
});
