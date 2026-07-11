import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const readSource = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), "utf-8");

describe("AI SDK 7 Ryo agent wiring", () => {
  test("ToolLoopAgent uses static instructions and prepareStep for dynamic context", () => {
    const source = readSource("api/_utils/ryo-agent.ts");

    expect(source).toContain("instructions: prepared.instructions");
    expect(source).toContain("prepareStep:");
    expect(source).toContain("dynamicContextMessages");
    expect(source).toContain('getPreciseLocation: "user-approval"');
    expect(source).toContain("toolApproval: RYO_TOOL_APPROVAL");
    expect(source).not.toContain("allowSystemInMessages");
    expect(source).not.toMatch(/needsApproval\s*:/);
    // prepareStep must not override instructions (keeps static prompt cache)
    expect(source).not.toMatch(/prepareStep:[\s\S]*?instructions\s*:/);
  });

  test("prepareRyoConversationModelInput returns static instructions + dynamicContextMessages", () => {
    const source = readSource("api/_utils/ryo-conversation.ts");

    expect(source).toContain("instructions: SystemModelMessage");
    expect(source).toContain("dynamicContextMessages: ModelMessage[]");
    expect(source).toContain("enrichedMessages: modelMessages");
    expect(source).toMatch(/Static instructions stay in the top-level/);
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
