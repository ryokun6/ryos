import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const readSource = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), "utf-8");

describe("AI SDK 7 Ryo agent wiring", () => {
  test("ToolLoopAgent uses instructions and toolApproval (not allowSystemInMessages / needsApproval)", () => {
    const source = readSource("api/_utils/ryo-agent.ts");

    expect(source).toContain("instructions: prepared.instructions");
    expect(source).toContain('getPreciseLocation: "user-approval"');
    expect(source).toContain("toolApproval: RYO_TOOL_APPROVAL");
    expect(source).not.toContain("allowSystemInMessages");
    expect(source).not.toContain("needsApproval");
  });

  test("prepareRyoConversationModelInput returns instructions separate from messages", () => {
    const source = readSource("api/_utils/ryo-conversation.ts");

    expect(source).toContain("instructions: Instructions");
    expect(source).toContain("instructions,");
    expect(source).toContain("enrichedMessages: modelMessages");
    expect(source).toMatch(/Three-tier instructions structure/);
  });

  test("chat tools no longer set needsApproval on getPreciseLocation", () => {
    const source = readSource("api/chat/tools/index.ts");
    const toolBlockStart = source.indexOf(
      "// Precise Location Tool (Client-side execution, approval-gated)"
    );
    const toolBlock = source.slice(
      toolBlockStart,
      source.indexOf("mapsSearchPlaces:", toolBlockStart)
    );

    expect(toolBlock).toContain("getPreciseLocation:");
    expect(toolBlock).toContain("toolApproval");
    expect(toolBlock).not.toMatch(/needsApproval\s*:/);
  });
});
