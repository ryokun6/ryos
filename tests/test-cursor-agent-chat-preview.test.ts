import { describe, expect, test } from "bun:test";
import {
  collectCursorAgentCoverageFromParts,
  cursorAgentDashboardUrl,
  formatCursorAgentTimestamp,
  isCursorAgentDashboardUrl,
  isCursorAgentUrlCoveredByMessage,
  parseCursorAgentDashboardUrl,
  parseListCursorCloudAgentRunsOutput,
  partitionMessageUrlsForPreviews,
} from "../src/lib/cursorAgentChatPreview.js";

describe("cursorAgentChatPreview URLs", () => {
  test("parses cursor.com/agents dashboard links", () => {
    expect(parseCursorAgentDashboardUrl("https://cursor.com/agents/bc_abc")).toBe(
      "bc_abc"
    );
    expect(parseCursorAgentDashboardUrl("http://www.cursor.com/agents/x%2Fy")).toBe(
      "x/y"
    );
    expect(isCursorAgentDashboardUrl("https://github.com/foo")).toBe(false);
    expect(cursorAgentDashboardUrl("bc_1")).toBe(
      "https://cursor.com/agents/bc_1"
    );
  });

  test("partitions cursor agent URLs from generic previews", () => {
    const { genericUrls, cursorAgentUrls } = partitionMessageUrlsForPreviews([
      "https://example.com/a",
      "https://cursor.com/agents/bc_1",
      "https://cursor.com/agents/bc_1",
    ]);
    expect(genericUrls).toEqual(["https://example.com/a"]);
    expect(cursorAgentUrls).toEqual(["https://cursor.com/agents/bc_1"]);
  });
});

describe("cursorAgentChatPreview message coverage", () => {
  test("collects dashboard URLs from cursorCloudAgent and list tools", () => {
    const coverage = collectCursorAgentCoverageFromParts([
      {
        type: "tool-cursorCloudAgent",
        toolCallId: "1",
        state: "output-available",
        output: {
          async: true,
          runId: "run-a",
          agentId: "ag-a",
          agentDashboardUrl: "https://cursor.com/agents/ag-a",
        },
      },
      {
        type: "tool-listCursorCloudAgentRuns",
        toolCallId: "2",
        state: "output-available",
        output: {
          success: true,
          runs: [
            {
              runId: "run-b",
              agentId: "ag-b",
              agentDashboardUrl: "https://cursor.com/agents/ag-b",
              status: "finished",
            },
          ],
        },
      },
    ]);
    expect(coverage.runIds.has("run-a")).toBe(true);
    expect(coverage.runIds.has("run-b")).toBe(true);
    expect(
      isCursorAgentUrlCoveredByMessage(
        "https://cursor.com/agents/ag-a",
        coverage
      )
    ).toBe(true);
    expect(
      isCursorAgentUrlCoveredByMessage(
        "https://cursor.com/agents/ag-b",
        coverage
      )
    ).toBe(true);
    expect(
      isCursorAgentUrlCoveredByMessage(
        "https://cursor.com/agents/other",
        coverage
      )
    ).toBe(false);
  });

  test("parseListCursorCloudAgentRunsOutput filters invalid rows", () => {
    const runs = parseListCursorCloudAgentRunsOutput({
      success: true,
      runs: [
        { runId: "r1", agentId: "a1", status: "running" },
        { agentId: "no-run-id" },
        null,
      ],
    });
    expect(runs).toHaveLength(1);
    expect(runs[0]?.runId).toBe("r1");
  });
});

describe("formatCursorAgentTimestamp", () => {
  test("returns empty for invalid input", () => {
    expect(formatCursorAgentTimestamp(null)).toBe("");
    expect(formatCursorAgentTimestamp(Number.NaN)).toBe("");
  });

  test("formats valid epoch ms", () => {
    const label = formatCursorAgentTimestamp(0, "en-US");
    expect(label.length).toBeGreaterThan(0);
  });
});
