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

describe("Chats scroll-to-bottom chevron in macOS Aqua dark mode", () => {
  test("ScrollToBottomButton pins glyph color via shared class", () => {
    expect(scrollButtonSource).toContain("chat-scroll-to-bottom-glyph");
    expect(scrollButtonSource).not.toContain("text-neutral-800");
    expect(scrollButtonSource).not.toContain("text-black/70");
  });

  test("themes.css keeps scroll chevron dark and excludes it from dark remaps", () => {
    expect(themesCss).toContain(".chat-scroll-to-bottom-glyph");
    expect(themesCss).toMatch(
      /\.chat-scroll-to-bottom-glyph\s*\{[^}]*color:\s*rgba\(0,\s*0,\s*0/i
    );
    expect(themesCss).toContain(
      ":not(.chat-scroll-to-bottom-glyph):not(.ipod-force-font"
    );
    expect(themesCss).toContain(
      ":not(.chat-submit-glyph):not(.chat-stop-glyph):not(.chat-scroll-to-bottom-glyph)"
    );
  });
});
