import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { discoverApiRouteManifest } from "../../../scripts/api-route-manifest";

const ROOT = join(import.meta.dir, "../../..");

function readRepoFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

describe("memory helpers are server-side only", () => {
  test("extract-memories and process-daily-notes are not HTTP routes", async () => {
    const extractSource = readRepoFile("api/ai/extract-memories.ts");
    const processSource = readRepoFile("api/ai/process-daily-notes.ts");

    expect(extractSource).toContain("export async function extractMemoriesFromConversation");
    expect(processSource).toContain("export async function processDailyNotesForUser");
    expect(extractSource).not.toMatch(/\bexport\s+default\b/);
    expect(processSource).not.toMatch(/\bexport\s+default\b/);

    const routes = await discoverApiRouteManifest({ workspaceRoot: ROOT });
    const routePaths = new Set(routes.map((route) => route.routePath));
    expect(routePaths.has("/api/ai/extract-memories")).toBe(false);
    expect(routePaths.has("/api/ai/process-daily-notes")).toBe(false);
  });

  test("chat clear, greeting, telegram heartbeat, and admin still call the helpers", () => {
    const resetRoute = readRepoFile("api/ai/conversations/[channel]/reset.ts");
    const resetMemory = readRepoFile(
      "api/ai/conversations/_helpers/reset-memory.ts",
    );
    const greeting = readRepoFile("api/ai/conversations/[channel]/greeting.ts");
    const heartbeat = readRepoFile("api/cron/telegram-heartbeat.ts");
    const admin = readRepoFile("api/admin.ts");

    expect(resetRoute).toContain("processClearedAIConversationMemory");
    expect(resetMemory).toContain("extractMemoriesFromConversation");
    expect(greeting).toContain("processDailyNotesForUser");
    expect(heartbeat).toContain("extractMemoriesFromConversation");
    expect(heartbeat).toContain("processDailyNotesForUser");
    expect(admin).toContain("processDailyNotesForUser");
  });
});
