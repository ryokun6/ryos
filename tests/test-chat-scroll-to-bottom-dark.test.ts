import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const scrollButtonSource = readFileSync(
  join(
    import.meta.dir,
    "../src/apps/chats/components/chat-messages/ScrollToBottomButton.tsx"
  ),
  "utf8"
);
const themesCss = readFileSync(
  join(import.meta.dir, "../src/styles/themes.css"),
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

  test("themes.css darkens scroll pill and tones gloss; no dark chevron pin", () => {
    expect(themesCss).toContain(
      ':root[data-os-theme="macosx"][data-os-color-scheme="dark"] .chat-scroll-to-bottom-btn'
    );
    expect(themesCss).toMatch(
      /\.chat-scroll-to-bottom-btn\s*\{[^}]*rgba\(88,\s*88,\s*90/i
    );
    expect(themesCss).toContain(".chat-scroll-to-bottom-gloss-top");
    expect(themesCss).toContain(".chat-scroll-to-bottom-gloss-bottom");
    expect(themesCss).not.toContain(".chat-scroll-to-bottom-glyph");
  });
});
