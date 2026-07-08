import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ASSISTANT_CHARACTERS } from "../../../src/components/assistant/characters";

const HEX_RE = /^#[0-9A-F]{6}$/;

function relativeLuminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

describe("assistant character bubble accents", () => {
  test("every character defines valid hex bubble colors", () => {
    for (const character of ASSISTANT_CHARACTERS) {
      expect(character.accent.bubbleBg).toMatch(HEX_RE);
      expect(character.accent.bubbleBorder).toMatch(HEX_RE);
    }
  });

  test("fills stay light pastels and borders stay dark (black text readable)", () => {
    for (const character of ASSISTANT_CHARACTERS) {
      // Light fill keeps the bubble's black text/UI legible.
      expect(relativeLuminance(character.accent.bubbleBg)).toBeGreaterThan(0.6);
      // Dark border preserves the classic 1px tooltip outline.
      expect(relativeLuminance(character.accent.bubbleBorder)).toBeLessThan(
        0.1
      );
    }
  });

  test("clippy keeps the classic MS Agent balloon yellow", () => {
    const clippy = ASSISTANT_CHARACTERS.find((c) => c.id === "clippy")!;
    expect(clippy.accent.bubbleBg).toBe("#FFFFC8");
  });

  test("accents are distinct per character (no single shared bubble color)", () => {
    const fills = new Set(
      ASSISTANT_CHARACTERS.map((c) => c.accent.bubbleBg.toUpperCase())
    );
    expect(fills.size).toBeGreaterThan(1);
  });
});

describe("assistant overlay bubble accent wiring", () => {
  const overlaySource = readFileSync(
    join(import.meta.dir, "../../../src/components/assistant/AssistantOverlay.tsx"),
    "utf8"
  );

  test("bubble and tail read colors from the selected character's accent", () => {
    expect(
      overlaySource.match(/backgroundColor: character\.accent\.bubbleBg/g)
        ?.length
    ).toBe(2);
    expect(
      overlaySource.match(/borderColor: character\.accent\.bubbleBorder/g)
        ?.length
    ).toBe(2);
  });

  test("no hard-coded bubble color remains", () => {
    expect(overlaySource).not.toContain("#FFFFC8");
    expect(overlaySource).not.toContain("border-black bg-");
  });
});
