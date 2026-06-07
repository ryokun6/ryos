import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("chat tool registry wiring", () => {
  test("useAiChat routes registered client tools through executeToolHandler", () => {
    const source = readFileSync(
      "src/apps/chats/hooks/useAiChat.ts",
      "utf8"
    );

    expect(source).toContain("executeToolHandler");
    expect(source).not.toContain("case \"settings\"");
    expect(source).not.toContain("case \"ipodControl\"");
    expect(source).not.toContain("case \"tvControl\"");
  });
});
