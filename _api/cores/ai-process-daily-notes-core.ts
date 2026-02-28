import type { Redis } from "@upstash/redis";
import { validateAuth } from "../_utils/auth/index.js";
import type { CoreResponse } from "../_runtime/core-types.js";

interface ProcessDailyNotesResult {
  processed: number;
  created: number;
  updated: number;
  dates: string[];
  skippedDates: string[];
}

interface AiProcessDailyNotesCoreInput {
  originAllowed: boolean;
  method: string | undefined;
  authHeader: string | undefined;
  usernameHeader: string | undefined;
  redis: Redis;
  processDailyNotesForUser: (
    redis: Redis,
    username: string,
    log: (...args: unknown[]) => void,
    logError: (...args: unknown[]) => void
  ) => Promise<ProcessDailyNotesResult>;
  log: (...args: unknown[]) => void;
  logError: (...args: unknown[]) => void;
}

export async function executeAiProcessDailyNotesCore(
  input: AiProcessDailyNotesCoreInput
): Promise<CoreResponse> {
  if (!input.originAllowed) {
    return { status: 403, body: { error: "Unauthorized" } };
  }
  if (input.method !== "POST") {
    return { status: 405, body: { error: "Method not allowed" } };
  }

  const token = input.authHeader?.startsWith("Bearer ")
    ? input.authHeader.slice(7)
    : null;
  if (!token || !input.usernameHeader) {
    return { status: 401, body: { error: "Unauthorized - missing credentials" } };
  }

  const authResult = await validateAuth(input.redis, input.usernameHeader, token, {});
  if (!authResult.valid) {
    return { status: 401, body: { error: "Unauthorized - invalid token" } };
  }

  const username = input.usernameHeader.toLowerCase();

  try {
    const result = await input.processDailyNotesForUser(
      input.redis,
      username,
      input.log,
      input.logError
    );

    const totalExtracted = result.created + result.updated;
    const skippedCount = result.skippedDates.length;
    return {
      status: 200,
      body: {
        processed: result.processed,
        extracted: totalExtracted,
        created: result.created,
        updated: result.updated,
        dates: result.dates,
        skippedDates: result.skippedDates,
        message:
          result.processed === 0
            ? "No unprocessed daily notes to process"
            : totalExtracted > 0
              ? `Processed ${result.processed} daily notes → ${result.created} new memories, ${result.updated} updated` +
                (skippedCount > 0 ? ` (${skippedCount} days deferred to next run)` : "")
              : `Processed ${result.processed} daily notes — no new long-term memories extracted` +
                (skippedCount > 0 ? ` (${skippedCount} days deferred to next run)` : ""),
        _meta: {
          username,
          notesProcessed: result.processed,
          memoriesCreated: result.created,
          memoriesUpdated: result.updated,
        },
      },
    };
  } catch {
    return { status: 500, body: { error: "Failed to process daily notes" } };
  }
}
