import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("Cursor agent API client wiring", () => {
  test("run polling hook uses src/api/cursorAgent wrappers", () => {
    const source = readFileSync(
      "src/components/shared/useCursorAgentRunPoll.ts",
      "utf8"
    );

    expect(source).toContain("@/api/cursorAgent");
    expect(source).toContain("getCursorRunStatus");
    expect(source).toContain("sendCursorRunFollowup");
    expect(source).not.toContain("/api/ai/cursor-run-status");
    expect(source).not.toContain("/api/ai/cursor-run-followup");
  });
});
